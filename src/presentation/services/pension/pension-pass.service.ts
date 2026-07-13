import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { PensionMoveEntity } from "../../../domain/entities/pension/pension-move.entity";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";
import { PensionMoveRepository } from "../../../domain/repository/pension/pension-move.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { SocketServerPlugin } from "../../sockets/socket-server";

interface PensionPassCardResponse {
  uid: string;
  name: string;
  pension: {
    _id: string;
    proyecto: {
      _id: string;
      nombre: string;
    };
    nombre: string;
  };
  idPass: string;
  vigent: boolean;
  antiPassback: boolean;
  inParking: boolean;
  created: number;
  from: number;
  to: number;
  estado: boolean;
  usuario: string;
}

interface PensionMoveResponse {
  uid: string;
  modulo: {
    _id: string;
    nombre: string;
  };
  proyecto: string;
  pensionPass: string;
  tipo: string;
  fecha: number;
}

const PRECONTRACT_RELEASE_MS = 60 * 1000;

export class PensionPassService {
  constructor(
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly pensionRepository: PensionRepository,
    private readonly proyectoRepository: ProyectoRepository,
    private readonly moduloRepository: ModuloRepository,
    private readonly pensionMoveRepository: PensionMoveRepository,
  ) {}

  async createPensionPass(
    pensionPass: Omit<PensionPassEntity, "id">,
  ): Promise<PensionPassEntity> {
    const pension = await this.pensionRepository.findById(pensionPass.pension);

    if (!pension) {
      throw CustomError.badRequest("La pension asociada no existe");
    }

    const pensionPassExists = await this.pensionPassRepository.findByIdPass(
      pensionPass.idPass,
    );

    if (pensionPassExists) {
      throw CustomError.badRequest(
        `El pensionPass con idPass '${pensionPass.idPass}' ya existe`,
      );
    }

    return this.pensionPassRepository.create(pensionPass);
  }

  async getPensionPasses(): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getAll();
  }

  async getPensionPassById(id: string): Promise<PensionPassEntity> {
    const pensionPass = await this.pensionPassRepository.findById(id);

    if (!pensionPass) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPass;
  }

  async getPensionPassesByPension(
    pensionId: string,
  ): Promise<PensionPassEntity[]> {
    const pension = await this.pensionRepository.findById(pensionId);

    if (!pension) {
      throw CustomError.notFound("Pension no encontrada");
    }

    return this.pensionPassRepository.getByPension(pensionId);
  }

  async getPensionPassesByUsuario(
    usuarioId: string,
  ): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getByUsuario(usuarioId);
  }

  async getPensionPassCardsByUsuario(
    usuarioId: string,
  ): Promise<PensionPassCardResponse[]> {
    const pensionPasses = await this.getPensionPassesByUsuario(usuarioId);

    return Promise.all(
      pensionPasses.map((pensionPass) =>
        this.toPensionPassCardResponse(pensionPass),
      ),
    );
  }

  async getPensionPassCardById(id: string): Promise<PensionPassCardResponse> {
    const pensionPass = await this.getPensionPassById(id);
    return this.toPensionPassCardResponse(pensionPass);
  }

  async getPensionMovesByPensionPass(
    pensionPassId: string,
  ): Promise<{ total: number; pensionMoves: PensionMoveResponse[] }> {
    await this.getPensionPassById(pensionPassId);

    const pensionMoves =
      await this.pensionMoveRepository.getByPensionPass(pensionPassId);
    const response = await Promise.all(
      pensionMoves.map((pensionMove) => this.toPensionMoveResponse(pensionMove)),
    );

    return {
      total: response.length,
      pensionMoves: response,
    };
  }

  async precontractPensionPass(
    usuarioId: string,
    pensionId: string,
    contractMonths = 1,
  ): Promise<PensionPassCardResponse> {
    const pension = await this.pensionRepository.findById(pensionId);

    if (!pension || !pension.estado) {
      throw CustomError.notFound("Pension no encontrada");
    }

    const userPass = await this.pensionPassRepository.findByUsuarioAndPension(
      usuarioId,
      pensionId,
    );

    if (userPass) {
      throw CustomError.badRequest(
        "El usuario ya tiene una pension pass para esta pension.",
      );
    }

    const pensionPass =
      await this.pensionPassRepository.findAvailableByPension(pensionId);

    if (!pensionPass) {
      throw CustomError.badRequest(
        `No hay pension pass disponibles en la pension ${pensionId}`,
      );
    }

    const now = new Date();
    const newTo = this.addMonths(now, contractMonths);
    const pensionPassUpdated = await this.updatePensionPass(pensionPass.id, {
      usuario: usuarioId,
      from: now.getTime(),
      to: newTo.getTime(),
    });

    this.releasePrecontractIfNotPaid(pensionPassUpdated.id);

    return this.toPensionPassCardResponse(pensionPassUpdated);
  }

  async renewPensionPass(
    usuarioId: string,
    pensionPassId: string,
    contractMonths = 1,
  ): Promise<PensionPassCardResponse> {
    const pensionPass = await this.getPensionPassById(pensionPassId);
    this.ensurePensionPassOwner(pensionPass, usuarioId);

    const now = new Date();
    const startDate =
      pensionPass.vigent && pensionPass.to !== -1
        ? new Date(pensionPass.to)
        : now;
    const fromDate =
      pensionPass.vigent && pensionPass.from !== -1
        ? new Date(pensionPass.from)
        : now;
    const newTo = this.addMonths(startDate, contractMonths);

    const pensionPassUpdated = await this.updatePensionPass(pensionPass.id, {
      from: fromDate.getTime(),
      to: newTo.getTime(),
    });

    return this.toPensionPassCardResponse(pensionPassUpdated);
  }

  async contractPensionPass(
    usuarioId: string,
    pensionPassId: string,
  ): Promise<PensionPassCardResponse> {
    const pensionPass = await this.getPensionPassById(pensionPassId);
    this.ensurePensionPassOwner(pensionPass, usuarioId);

    if (pensionPass.to === -1 || pensionPass.from === -1) {
      throw CustomError.badRequest("Su precontrato expiro, intente de nuevo");
    }

    const pensionPassUpdated = await this.updatePensionPass(pensionPass.id, {
      vigent: true,
    });

    return this.toPensionPassCardResponse(pensionPassUpdated);
  }

  async updatePensionPass(
    id: string,
    pensionPass: Partial<Omit<PensionPassEntity, "id">>,
  ): Promise<PensionPassEntity> {
    const pensionPassUpdated = await this.pensionPassRepository.update(
      id,
      pensionPass,
    );

    if (!pensionPassUpdated) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPassUpdated;
  }

  async updatePensionPassStatus(
    id: string,
    estado: boolean,
  ): Promise<PensionPassEntity> {
    const pensionPassUpdated = await this.pensionPassRepository.update(id, {
      estado,
    });

    if (!pensionPassUpdated) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPassUpdated;
  }

  async deletePensionPass(id: string): Promise<PensionPassEntity> {
    const pensionPassDeleted = await this.pensionPassRepository.delete(id);

    if (!pensionPassDeleted) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPassDeleted;
  }

  async openBarrierWithPensionPass(
    usuarioId: string,
    pensionPassId: string,
    moduleToken: string,
  ): Promise<PensionMoveResponse> {
    const pensionPass = await this.pensionPassRepository.findById(pensionPassId);

    if (!pensionPass) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    if (pensionPass.usuario && pensionPass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension no pertenece al usuario");
    }

    if (!pensionPass.estado || !pensionPass.vigent) {
      throw CustomError.badRequest("La pension no esta vigente");
    }

    if (pensionPass.to !== -1 && Date.now() > pensionPass.to) {
      await this.pensionPassRepository.update(pensionPass.id, {
        vigent: false,
        from: -1,
        to: -1,
      });
      throw CustomError.badRequest(
        "La pension expiro. Renuevala para volver a usarla.",
        { pensionPassId: pensionPass.id },
        "PENSION_PASS_EXPIRED",
      );
    }

    const pension = await this.pensionRepository.findById(pensionPass.pension);

    if (!pension) {
      throw CustomError.badRequest("La pension asociada no existe");
    }

    if (!pension.estado) {
      throw CustomError.badRequest("La pension se encuentra inhabilitada");
    }

    const moduloId = await this.getModuloIdFromToken(moduleToken);
    const modulo = await this.moduloRepository.findById(moduloId);

    if (!modulo) {
      throw CustomError.badRequest("El modulo no existe");
    }

    if (modulo.proyecto !== pension.proyecto) {
      throw CustomError.badRequest("El modulo no pertenece al proyecto de la pension");
    }

    if (modulo.tipo === "POS") {
      throw CustomError.badRequest("El modulo no es de entrada o salida");
    }

    this.validatePensionPassDirection(pensionPass, modulo.tipo);
    this.validatePensionPassSchedule(pension);

    await SocketServerPlugin.openBarrier(modulo.id);

    await this.pensionPassRepository.update(pensionPass.id, {
      inParking: !pensionPass.inParking,
    });

    const pensionMove = await this.pensionMoveRepository.create({
      pensionPass: pensionPass.id,
      modulo: modulo.id,
      tipo: modulo.tipo,
      fecha: Date.now(),
      proyecto: pension.proyecto,
    });

    return this.toPensionMoveResponse(pensionMove, modulo.nombre);
  }

  private async toPensionPassCardResponse(
    pensionPass: PensionPassEntity,
  ): Promise<PensionPassCardResponse> {
    const pension = await this.pensionRepository.findById(pensionPass.pension);
    const proyecto = pension
      ? await this.proyectoRepository.findById(pension.proyecto)
      : null;

    return {
      uid: pensionPass.id,
      name: pensionPass.name,
      pension: {
        _id: pensionPass.pension,
        proyecto: {
          _id: pension?.proyecto ?? "",
          nombre: proyecto?.nombre ?? "",
        },
        nombre: pension?.nombre ?? "",
      },
      idPass: pensionPass.idPass,
      vigent: pensionPass.vigent,
      antiPassback: pensionPass.antiPassback,
      inParking: pensionPass.inParking,
      created: pensionPass.created,
      from: pensionPass.from,
      to: pensionPass.to,
      estado: pensionPass.estado,
      usuario: pensionPass.usuario ?? "",
    };
  }

  private async toPensionMoveResponse(
    pensionMove: PensionMoveEntity,
    moduloNombre?: string,
  ): Promise<PensionMoveResponse> {
    const modulo = moduloNombre
      ? null
      : await this.moduloRepository.findById(pensionMove.modulo);

    return {
      uid: pensionMove.id,
      modulo: {
        _id: pensionMove.modulo,
        nombre: moduloNombre ?? modulo?.nombre ?? "",
      },
      proyecto: pensionMove.proyecto,
      pensionPass: pensionMove.pensionPass,
      tipo: pensionMove.tipo,
      fecha: pensionMove.fecha,
    };
  }

  private async getModuloIdFromToken(moduleToken: string): Promise<string> {
    const payload = await JwtPlugin.validateToken(moduleToken);

    if (!payload || typeof payload !== "object") {
      throw CustomError.badRequest("El token del modulo es invalido");
    }

    const moduloId =
      "id" in payload
        ? String(payload.id)
        : "uid" in payload
          ? String(payload.uid)
          : "";

    if (!moduloId) {
      throw CustomError.badRequest("El token del modulo es invalido");
    }

    return moduloId;
  }

  private addMonths(date: Date, months: number): Date {
    const safeMonths = Number.isFinite(months) && months > 0 ? months : 1;
    return new Date(
      date.getFullYear(),
      date.getMonth() + safeMonths,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    );
  }

  private ensurePensionPassOwner(
    pensionPass: PensionPassEntity,
    usuarioId: string,
  ): void {
    if (pensionPass.usuario && pensionPass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension no pertenece al usuario");
    }
  }

  private validatePensionPassDirection(
    pensionPass: PensionPassEntity,
    moduloTipo: string,
  ): void {
    if (pensionPass.inParking && moduloTipo === "ENTRADA") {
      throw CustomError.badRequest(
        "La ultima vez uso su pension sin marcar salida, consulte al proveedor",
      );
    }

    if (!pensionPass.inParking && moduloTipo === "SALIDA") {
      throw CustomError.badRequest(
        "No ha marcado entrada al estacionamiento, consulte al proveedor",
      );
    }
  }

  private validatePensionPassSchedule(pension: { validez: Array<{ weekDay: number; from: number[]; to: number[] }> }): void {
    const now = new Date();
    const validez = pension.validez.find((item) => item.weekDay === now.getDay());

    if (!validez) {
      throw CustomError.badRequest("No hay horario configurado para este dia");
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const fromMinutes = (validez.from[0] ?? 0) * 60 + (validez.from[1] ?? 0);
    const toMinutes = (validez.to[0] ?? 0) * 60 + (validez.to[1] ?? 0);

    if (currentMinutes < fromMinutes || currentMinutes > toMinutes) {
      throw CustomError.badRequest("Se encuentra fuera del rango de horas");
    }
  }

  private releasePrecontractIfNotPaid(pensionPassId: string): void {
    setTimeout(async () => {
      const pensionPass = await this.pensionPassRepository.findById(pensionPassId);

      if (!pensionPass || pensionPass.vigent) return;

      await this.pensionPassRepository.update(pensionPass.id, {
        usuario: null,
        from: -1,
        to: -1,
      });
    }, PRECONTRACT_RELEASE_MS);
  }
}

import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { PensionMoveEntity } from "../../../domain/entities/pension/pension-move.entity";
import { PensionMoveRepository } from "../../../domain/repository/pension/pension-move.repository";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";

export class PensionMoveService {
  constructor(
    private readonly pensionMoveRepository: PensionMoveRepository,
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly proyectoRepository: ProyectoRepository,
    private readonly moduloRepository: ModuloRepository,
  ) {}

  async createPensionMove(
    pensionMove: Omit<PensionMoveEntity, "id">,
  ): Promise<PensionMoveEntity> {
    const pensionPass = await this.pensionPassRepository.findById(
      pensionMove.pensionPass,
    );

    if (!pensionPass) {
      throw CustomError.badRequest("El pensionPass asociado no existe");
    }

    const proyecto = await this.proyectoRepository.findById(
      pensionMove.proyecto,
    );

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    const modulo = await this.moduloRepository.findById(pensionMove.modulo);

    if (!modulo) {
      throw CustomError.badRequest("El modulo asociado no existe");
    }

    return this.pensionMoveRepository.create(pensionMove);
  }

  async getPensionMoves(): Promise<PensionMoveEntity[]> {
    return this.pensionMoveRepository.getAll();
  }

  async getPensionMoveById(id: string): Promise<PensionMoveEntity> {
    const pensionMove = await this.pensionMoveRepository.findById(id);

    if (!pensionMove) {
      throw CustomError.notFound("PensionMove no encontrado");
    }

    return pensionMove;
  }

  async getPensionMovesByPensionPass(
    pensionPassId: string,
  ): Promise<PensionMoveEntity[]> {
    const pensionPass =
      await this.pensionPassRepository.findById(pensionPassId);

    if (!pensionPass) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return this.pensionMoveRepository.getByPensionPass(pensionPassId);
  }

  async getPensionMovesByProyecto(
    proyectoId: string,
  ): Promise<PensionMoveEntity[]> {
    const proyecto = await this.proyectoRepository.findById(proyectoId);

    if (!proyecto) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return this.pensionMoveRepository.getByProyecto(proyectoId);
  }

  async updatePensionMove(
    id: string,
    pensionMove: Partial<Omit<PensionMoveEntity, "id">>,
  ): Promise<PensionMoveEntity> {
    const pensionMoveUpdated = await this.pensionMoveRepository.update(
      id,
      pensionMove,
    );

    if (!pensionMoveUpdated) {
      throw CustomError.notFound("PensionMove no encontrado");
    }

    return pensionMoveUpdated;
  }

  async deletePensionMove(id: string): Promise<PensionMoveEntity> {
    const pensionMoveDeleted = await this.pensionMoveRepository.delete(id);

    if (!pensionMoveDeleted) {
      throw CustomError.notFound("PensionMove no encontrado");
    }

    return pensionMoveDeleted;
  }
}

import { PensionMoveEntity } from "../../../domain/entities/pension/pension-move.entity";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";

export interface PensionPassCardResponse {
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

export interface PensionMoveResponse {
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

export class PensionPassResponseMapper {
  constructor(
    private readonly pensionRepository: PensionRepository,
    private readonly proyectoRepository: ProyectoRepository,
    private readonly moduloRepository: ModuloRepository,
  ) {}

  async toPensionPassCardResponse(
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

  async toPensionMoveResponse(
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
}

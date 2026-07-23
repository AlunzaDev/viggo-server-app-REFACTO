import { CustomError } from "../../errors/custom.error";

export type ModuloTipo = "ENTRADA" | "SALIDA" | "POS";

export interface ModuloEntityOptions {
  id: string;
  nombre: string;
  proyecto: string;
  tipo: ModuloTipo;
  estado: boolean;
  identificador: string;
  descripcion?: string;
}

export class ModuloEntity {
  public id: string;
  public nombre: string;
  public proyecto: string;
  public tipo: ModuloTipo;
  public estado: boolean;
  public identificador: string;
  public descripcion?: string;

  constructor(options: ModuloEntityOptions) {
    this.id = options.id;
    this.nombre = options.nombre;
    this.proyecto = options.proyecto;
    this.tipo = options.tipo;
    this.estado = options.estado;
    this.identificador = options.identificador;
    this.descripcion = options.descripcion;
  }

  static fromObject(object: Record<string, unknown>): ModuloEntity {
    const id = object.id ?? (object._id ? String(object._id) : undefined);
    const tipo = String(object.tipo ?? "").trim().toUpperCase();

    if (!id) throw CustomError.badRequest("Missing id");
    if (!object.nombre) throw CustomError.badRequest("Missing nombre");
    if (!object.proyecto) throw CustomError.badRequest("Missing proyecto");
    if (tipo !== "ENTRADA" && tipo !== "SALIDA" && tipo !== "POS") {
      throw CustomError.badRequest("Invalid tipo");
    }
    if (!object.identificador) throw CustomError.badRequest("Missing identificador");

    return new ModuloEntity({
      id: String(id),
      nombre: String(object.nombre).trim(),
      proyecto: String(object.proyecto),
      tipo,
      estado: object.estado === undefined ? true : Boolean(object.estado),
      identificador: String(object.identificador).trim(),
      descripcion: String(object.descripcion ?? "").trim() || undefined,
    });
  }
}

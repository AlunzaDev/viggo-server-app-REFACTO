import { CustomError } from "../../errors/custom.error";

export type ModuloTipo = "ENTRADA" | "SALIDA" | "POS";
export const MODULO_SUBMODULO_TIPOS = [
  "QR_SCANNER",
  "PRINTER",
  "BARRIER",
  "CAMERA",
  "CASH_DRAWER",
  "CASH_ACCEPTOR",
  "DISPLAY",
  "KEYPAD",
  "OTHER",
] as const;

export type ModuloSubmoduloTipo = (typeof MODULO_SUBMODULO_TIPOS)[number];

export interface ModuloSubmodulo {
  submoduloId: string;
  nombre: string;
  tipo: ModuloSubmoduloTipo;
  identificador?: string;
  ip?: string;
  mac?: string;
  descripcion?: string;
  estado: boolean;
}

export interface ModuloEntityOptions {
  id: string;
  nombre: string;
  proyecto: string;
  tipo: ModuloTipo;
  estado: boolean;
  identificador: string;
  descripcion?: string;
  submodulos?: ModuloSubmodulo[];
}

export class ModuloEntity {
  public id: string;
  public nombre: string;
  public proyecto: string;
  public tipo: ModuloTipo;
  public estado: boolean;
  public identificador: string;
  public descripcion?: string;
  public submodulos: ModuloSubmodulo[];

  constructor(options: ModuloEntityOptions) {
    this.id = options.id;
    this.nombre = options.nombre;
    this.proyecto = options.proyecto;
    this.tipo = options.tipo;
    this.estado = options.estado;
    this.identificador = options.identificador;
    this.descripcion = options.descripcion;
    this.submodulos = options.submodulos ?? [];
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
      submodulos: parseSubmodulos(object.submodulos),
    });
  }
}

function parseSubmodulos(value: unknown): ModuloSubmodulo[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => parseSubmodulo(item))
    .filter((item): item is ModuloSubmodulo => Boolean(item));
}

function parseSubmodulo(value: unknown): ModuloSubmodulo | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const submoduloId = String(source.submoduloId ?? source.id ?? source._id ?? "").trim();
  const nombre = String(source.nombre ?? source.name ?? "").trim();
  const tipo = String(source.tipo ?? source.type ?? "OTHER").trim().toUpperCase();

  if (!submoduloId || !nombre) return null;

  return {
    submoduloId,
    nombre,
    tipo: MODULO_SUBMODULO_TIPOS.includes(tipo as ModuloSubmoduloTipo)
      ? (tipo as ModuloSubmoduloTipo)
      : "OTHER",
    identificador: String(source.identificador ?? "").trim() || undefined,
    ip: String(source.ip ?? "").trim() || undefined,
    mac: String(source.mac ?? "").trim() || undefined,
    descripcion: String(source.descripcion ?? "").trim() || undefined,
    estado: source.estado === undefined ? true : Boolean(source.estado),
  };
}

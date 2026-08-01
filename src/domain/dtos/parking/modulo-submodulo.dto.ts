import {
  MODULO_SUBMODULO_TIPOS,
  ModuloSubmoduloTipo,
} from "../../entities/parking/modulo.entity";

export interface ModuloSubmoduloDtoValues {
  submoduloId?: string;
  nombre: string;
  tipo: ModuloSubmoduloTipo;
  identificador?: string;
  ip?: string;
  mac?: string;
  ubicacion?: string;
  coordinates?: [number, number];
  descripcion?: string;
  estado?: boolean;
}

type Result<T> = [error?: string, dto?: T];

const parseSubmodulo = (
  body: Record<string, unknown>,
): [string?, ModuloSubmoduloDtoValues?] => {
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const tipo = typeof body.tipo === "string" ? body.tipo.trim().toUpperCase() : "";
  const submoduloId =
    typeof body.submoduloId === "string" ? body.submoduloId.trim() : undefined;
  const identificador =
    typeof body.identificador === "string" ? body.identificador.trim() : undefined;
  const ip = typeof body.ip === "string" ? body.ip.trim() : undefined;
  const mac = typeof body.mac === "string" ? body.mac.trim() : undefined;
  const ubicacion = typeof body.ubicacion === "string" ? body.ubicacion.trim() : undefined;
  const coordinates = parseCoordinates(body.coordinates);
  const descripcion =
    typeof body.descripcion === "string" ? body.descripcion.trim() : undefined;
  const estado = typeof body.estado === "boolean" ? body.estado : undefined;

  if (!nombre) return ["'nombre' es requerido"];
  if (!tipo) return ["'tipo' es requerido"];
  if (!MODULO_SUBMODULO_TIPOS.includes(tipo as ModuloSubmoduloTipo)) {
    return [`'tipo' debe ser uno de: ${MODULO_SUBMODULO_TIPOS.join(", ")}`];
  }

  return [
    undefined,
    {
      submoduloId,
      nombre,
      tipo: tipo as ModuloSubmoduloTipo,
      identificador,
      ip,
      mac,
      ubicacion,
      coordinates,
      descripcion,
      estado,
    },
  ];
};

export class CreateModuloSubmoduloDto {
  private constructor(public readonly values: ModuloSubmoduloDtoValues) {}

  static create(body: Record<string, unknown>): Result<CreateModuloSubmoduloDto> {
    const [error, values] = parseSubmodulo(body);
    if (error || !values) return [error || "Submodulo invalido"];
    return [undefined, new CreateModuloSubmoduloDto(values)];
  }
}

export class UpdateModuloSubmoduloDto {
  private constructor(public readonly values: ModuloSubmoduloDtoValues) {}

  static create(body: Record<string, unknown>): Result<UpdateModuloSubmoduloDto> {
    const [error, values] = parseSubmodulo(body);
    if (error || !values) return [error || "Submodulo invalido"];
    return [undefined, new UpdateModuloSubmoduloDto(values)];
  }
}

function parseCoordinates(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
  return [longitude, latitude];
}

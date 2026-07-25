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

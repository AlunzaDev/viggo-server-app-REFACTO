import { parseModuloTipo, type ModuloTipo } from "../../entities/parking/module-type.entity";

/** Filters of the module list: parking, types (`tipos=ENTRADA,SALIDA`), state and free text. */
export class ModuloListQueryDto {
  private constructor(
    public readonly proyecto: string | undefined,
    public readonly tipos: ModuloTipo[],
    public readonly estado: boolean | undefined,
    public readonly search: string,
  ) {}

  static create(query: Record<string, unknown>): [string?, ModuloListQueryDto?] {
    const proyecto = typeof query.proyecto === "string" ? query.proyecto.trim() : undefined;
    const rawTipos = query.tipos ?? query.tipo;
    const values = rawTipos === undefined ? [] : Array.isArray(rawTipos) ? rawTipos : String(rawTipos).split(",").map((item) => item.trim()).filter(Boolean);
    const tipos = values.map((value) => parseModuloTipo(value));
    if (tipos.some((tipo) => tipo === null)) return ["'tipo' no es valido"];

    let estado: boolean | undefined;
    if (query.estado !== undefined) {
      const normalized = typeof query.estado === "boolean" ? String(query.estado) : String(query.estado).trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") return ["'estado' debe ser boolean"];
      estado = normalized === "true";
    }
    const search = typeof query.search === "string" ? query.search.trim() : "";
    return [undefined, new ModuloListQueryDto(proyecto, tipos.filter((tipo): tipo is ModuloTipo => Boolean(tipo)), estado, search)];
  }
}

/** Filters of the parking list: state (`true/false/1/0/yes/no/on/off`), city and free text. */
export class ProyectoListQueryDto {
  private constructor(
    public readonly estado: boolean | undefined,
    public readonly ciudad: string,
    public readonly search: string,
  ) {}

  static create(query: Record<string, unknown>): [string?, ProyectoListQueryDto?] {
    let estado: boolean | undefined;
    if (query.estado !== undefined) {
      const value = typeof query.estado === "boolean" ? String(query.estado) : typeof query.estado === "string" ? query.estado.trim().toLowerCase() : "";
      if (["true", "1", "yes", "on"].includes(value)) estado = true;
      else if (["false", "0", "no", "off"].includes(value)) estado = false;
      else return ["'estado' debe ser boolean"];
    }
    const ciudad = typeof query.ciudad === "string" ? query.ciudad.trim() : "";
    const search = typeof query.search === "string" ? query.search.trim() : "";
    return [undefined, new ProyectoListQueryDto(estado, ciudad, search)];
  }
}

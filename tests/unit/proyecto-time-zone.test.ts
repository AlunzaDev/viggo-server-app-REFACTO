import { describe, expect, it } from "vitest";
import { CreateProyectoDto } from "../../src/domain/dtos/parking/create-proyecto.dto";
import { UpdateProyectoDto } from "../../src/domain/dtos/parking/update-proyecto.dto";

describe("project time zone", () => {
  const base = { nombre: "Plaza", descripcion: "Estacionamiento" };

  it("defaults to Mexico City and accepts real IANA zones", () => {
    expect(CreateProyectoDto.create(base)[1]?.zonaHoraria).toBe("America/Mexico_City");
    expect(CreateProyectoDto.create({ ...base, zonaHoraria: "America/Tijuana" })[1]?.zonaHoraria).toBe("America/Tijuana");
    expect(UpdateProyectoDto.create({ zonaHoraria: "America/Cancun" })[1]?.zonaHoraria).toBe("America/Cancun");
    // Not sending it leaves the stored one alone.
    expect(UpdateProyectoDto.create({ nombre: "Otra" })[1]?.zonaHoraria).toBeUndefined();
  });

  it("rejects zones the runtime does not know", () => {
    expect(CreateProyectoDto.create({ ...base, zonaHoraria: "Hora del centro" })[0]).toContain("zonaHoraria");
    expect(UpdateProyectoDto.create({ zonaHoraria: "GMT-6 Mexico" })[0]).toContain("zonaHoraria");
  });
});

describe("Proyecto capacity", () => {
  const base = { nombre: "Centro", descripcion: "Principal" };
  it("is optional, a whole number of spaces, and can be cleared", () => {
    expect(CreateProyectoDto.create(base)[1]?.capacidad).toBeNull();
    expect(CreateProyectoDto.create({ ...base, capacidad: "120" })[1]?.capacidad).toBe(120);
    expect(UpdateProyectoDto.create({ nombre: "Otra" })[1]?.capacidad).toBeUndefined();
    expect(UpdateProyectoDto.create({ capacidad: "" })[1]?.capacidad).toBeNull();
    for (const capacidad of ["0", "-5", "12.5", "muchos", 100_001]) {
      expect(CreateProyectoDto.create({ ...base, capacidad })[0]).toContain("capacidad");
    }
  });
});

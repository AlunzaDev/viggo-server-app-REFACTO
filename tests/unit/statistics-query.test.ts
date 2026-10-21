import { describe, expect, it } from "vitest";
import { parseStatisticsQuery, previousRange } from "../../src/domain/statistics/statistics";
import { csvRow } from "../../src/presentation/services/statistics/statistics-csv";

const parse = (raw: Record<string, unknown>) => parseStatisticsQuery({ metricas: "ingresos.netos", desde: "2026-10-01", hasta: "2026-10-15", ...raw });

describe("statistics query", () => {
  it("reads local dates, groupings and comparison", () => {
    expect(parse({ agrupar: "dia", comparar: "true" })).toEqual([null, {
      metricas: ["ingresos.netos"], rango: { kind: "dates", desde: "2026-10-01", hasta: "2026-10-15" },
      agrupar: "dia", comparar: true, proyectosPedidos: null,
    }]);
    expect(parse({ desde: "1792000000000", hasta: "1792086400000" })[1]?.rango).toEqual({ kind: "instants", from: 1792000000000, to: 1792086400000 });
  });

  it("refuses what is not in the catalog or would be unbounded", () => {
    expect(parse({ metricas: "" })[0]).toContain("métrica");
    expect(parse({ metricas: "ingresos.netos,select" })[0]).toContain("desconocida");
    expect(parse({ agrupar: "usuario" })[0]).toContain("Agrupación desconocida");
    expect(parse({ metricas: "tickets.estancia", agrupar: "dia" })[0]).toContain("no se puede agrupar por dia");
    expect(parse({ hasta: "2026-09-30" })[0]).toContain("anterior");
    expect(parse({ desde: "ayer" })[0]).toContain("fechas");
    expect(parse({ metricas: "tickets.salidas", agrupar: "hora", hasta: "2026-11-15" })[0]).toBe("El rango máximo es de 31 días al agrupar por hora");
    expect(parse({ desde: "2025-01-01", hasta: "2026-10-15" })[0]).toContain("400 días");
    expect(parse({ proyectos: "1; DROP TABLE" })[0]).toContain("proyectos");
  });

  it("compares with the previous period of the same length", () => {
    expect(previousRange({ kind: "dates", desde: "2026-10-01", hasta: "2026-10-15" })).toEqual({ kind: "dates", desde: "2026-09-16", hasta: "2026-09-30" });
    expect(previousRange({ kind: "instants", from: 1000, to: 4000 })).toEqual({ kind: "instants", from: -2000, to: 1000 });
  });
});

describe("statistics CSV", () => {
  it("quotes what needs it and keeps formulas as text", () => {
    expect(csvRow(["a", "b,c", 'd"e', -50.5, null])).toBe('a,"b,c","d""e",-50.5,\r\n');
    expect(csvRow(["=HYPERLINK(\"x\")", "+1", "@SUM", "-50.00"])).toBe(`"'=HYPERLINK(""x"")",'+1,'@SUM,-50.00\r\n`);
    expect(csvRow([{ tickets: 1 }])).toBe('"{""tickets"":1}"\r\n');
  });
});

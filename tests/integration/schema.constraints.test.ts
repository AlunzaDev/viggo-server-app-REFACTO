import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { PostgresDatabase } from "../../src/data/postgres";

// Verifies the rules the database enforces on its own (sequence, partial indexes,
// CHECK constraints, foreign keys), independently of the datasources.
let db: PrismaClient;
const suffix = Date.now().toString(36);

const cleanup = async () => {
  await db.pensionPass.deleteMany({ where: { idPass: { startsWith: `t-${suffix}` } } });
  await db.pension.deleteMany({ where: { nombre: { startsWith: `t-${suffix}` } } });
  await db.payment.deleteMany({ where: { concept: { startsWith: `t-${suffix}` } } });
  await db.usuario.deleteMany({ where: { correo: { startsWith: `t-${suffix}` } } });
  await db.proyecto.deleteMany({ where: { identificador: { startsWith: `t-${suffix}` } } });
};

const createProyecto = (name: string) =>
  db.proyecto.create({
    data: { nombre: name, coordinates: [-103.35, 20.67], ciudad: "GDL", identificador: `t-${suffix}-${name}` },
  });

const createUsuario = (name: string, rol = "CLIENT_ROLE") =>
  db.usuario.create({
    data: {
      nombre: name,
      apellido: "Test",
      correo: `t-${suffix}-${name}@example.com`,
      telefono: `t-${suffix}-${name}`,
      password: "hash",
      rol,
    },
  });

beforeAll(async () => {
  db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 2 });
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await PostgresDatabase.disconnect();
});

describe("schema constraints", () => {
  it("seeds the four system roles", async () => {
    const roles = await db.rol.findMany({ where: { sistema: true }, orderBy: { code: "asc" } });
    expect(roles.map((rol) => rol.code)).toEqual(["ADMIN_ROLE", "CLIENT_ROLE", "PENSION_ROLE", "SUPER_ROLE"]);
  });

  it("assigns increasing 4-digit project codes", async () => {
    const first = await createProyecto("a");
    const second = await createProyecto("b");
    expect(first.codigoProyecto).toMatch(/^\d{4}$/);
    expect(Number(second.codigoProyecto)).toBeGreaterThan(Number(first.codigoProyecto));
  });

  it("rejects users with an unknown role or uppercase email", async () => {
    await expect(createUsuario("badrole", "NOPE_ROLE")).rejects.toThrow();
    await expect(
      db.usuario.create({
        data: { nombre: "x", apellido: "x", correo: `T-${suffix}@EXAMPLE.COM`, telefono: `t-${suffix}-upper`, password: "h" },
      }),
    ).rejects.toThrow();
  });

  it("allows only one active pass per user and pension", async () => {
    const proyecto = await createProyecto("pass");
    const usuario = await createUsuario("pass");
    const pension = await db.pension.create({
      data: { proyectoId: proyecto.id, nombre: `t-${suffix}-pension`, precio: "100.00" },
    });
    const first = await db.pensionPass.create({
      data: { pensionId: pension.id, usuarioId: usuario.id, name: "P1", idPass: `t-${suffix}-1` },
    });
    await expect(
      db.pensionPass.create({
        data: { pensionId: pension.id, usuarioId: usuario.id, name: "P2", idPass: `t-${suffix}-2` },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Once the first one is cancelled the user can hold a new one.
    await db.pensionPass.update({ where: { id: first.id }, data: { estado: false } });
    await expect(
      db.pensionPass.create({
        data: { pensionId: pension.id, usuarioId: usuario.id, name: "P3", idPass: `t-${suffix}-3` },
      }),
    ).resolves.toBeTruthy();

    // Free inventory (no user) is not limited.
    await db.pensionPass.createMany({
      data: [
        { pensionId: pension.id, name: "F1", idPass: `t-${suffix}-f1` },
        { pensionId: pension.id, name: "F2", idPass: `t-${suffix}-f2` },
      ],
    });
  });

  it("enforces CHECK constraints", async () => {
    const proyecto = await createProyecto("checks");
    const usuario = await createUsuario("checks");
    const pension = await db.pension.create({
      data: { proyectoId: proyecto.id, nombre: `t-${suffix}-checks`, precio: "50.00" },
    });

    await expect(
      db.pensionHorario.create({ data: { pensionId: pension.id, weekDay: 7, fromMinutes: 0, toMinutes: 60 } }),
    ).rejects.toThrow();
    await expect(
      db.pensionHorario.create({ data: { pensionId: pension.id, weekDay: 1, fromMinutes: 0, toMinutes: 1440 } }),
    ).rejects.toThrow();
    await expect(
      db.pension.create({ data: { proyectoId: proyecto.id, nombre: `t-${suffix}-neg`, precio: "-1.00" } }),
    ).rejects.toThrow();
    await expect(
      db.pensionPass.create({
        data: { pensionId: pension.id, name: "half", idPass: `t-${suffix}-half`, validFrom: new Date() },
      }),
    ).rejects.toThrow();

    const paymentBase = {
      usuarioId: usuario.id,
      type: "ticket" as const,
      concept: `t-${suffix}-pay`,
      status: "pending" as const,
      paidAt: new Date(),
      referenceType: "ticket" as const,
      referenceId: "ticket-1",
    };
    await expect(db.payment.create({ data: { ...paymentBase, amount: "-5.00", currency: "MXN" } })).rejects.toThrow();
    await expect(db.payment.create({ data: { ...paymentBase, amount: "5.00", currency: "mxn" } })).rejects.toThrow();
    const payment = await db.payment.create({ data: { ...paymentBase, amount: "12.50", currency: "MXN" } });
    expect(payment.amount.toString()).toBe("12.5");
  });

  it("keeps history: a project with modules cannot be deleted", async () => {
    const proyecto = await createProyecto("restrict");
    await db.modulo.create({
      data: { proyectoId: proyecto.id, nombre: "Entrada", tipo: "ENTRADA", identificador: `t-${suffix}-mod` },
    });
    await expect(db.proyecto.delete({ where: { id: proyecto.id } })).rejects.toThrow();
    await db.modulo.deleteMany({ where: { identificador: `t-${suffix}-mod` } });
  });
});

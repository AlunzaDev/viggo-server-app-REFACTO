import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { PostgresDatabase } from "../../src/data/postgres";
import { CustomError } from "../../src/domain/errors/custom.error";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";
import type { UsuarioEntity } from "../../src/domain/entities/auth/usuario.entity";
import { AuthPostgresDatasource } from "../../src/infrastructure/datasources/auth/auth.datasource.postgres";
import { PermissionProfilePostgresDatasource } from "../../src/infrastructure/datasources/auth/permission-profile.datasource.postgres";
import { UsuarioPostgresDatasource } from "../../src/infrastructure/datasources/auth/usuario.datasource.postgres";

let db: PrismaClient;
const suffix = Date.now().toString(36);
const tag = (value: string) => `t-${suffix}-${value}`;

const profiles = new PermissionProfilePostgresDatasource();
const usuarios = new UsuarioPostgresDatasource();
const auth = new AuthPostgresDatasource();

let proyectoA = "";
let proyectoB = "";
let adminProfileId = "";
let mobileProfileId = "";

const newUsuario = (name: string, overrides: Partial<Omit<UsuarioEntity, "id">> = {}): Omit<UsuarioEntity, "id"> => ({
  nombre: name,
  apellido: "Prueba",
  correo: `${tag(name)}@example.com`,
  telefono: tag(name),
  password: "hash",
  emailValidated: true,
  rol: "CLIENT_ROLE",
  parkings: [],
  estado: true,
  google: false,
  allowedApps: [],
  appPermissions: [],
  ...overrides,
});

const cleanup = async () => {
  await db.payment.deleteMany({ where: { concept: { startsWith: tag("") } } });
  await db.usuario.deleteMany({ where: { telefono: { startsWith: tag("") } } });
  await db.permissionProfile.deleteMany({ where: { nombre: { startsWith: tag("") } } });
  await db.proyecto.deleteMany({ where: { identificador: { startsWith: tag("") } } });
};

beforeAll(async () => {
  db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 2 });
  await cleanup();
  const create = (name: string) =>
    db.proyecto.create({ data: { nombre: name, coordinates: [0, 0], ciudad: "GDL", identificador: tag(name) } });
  proyectoA = (await create("pa")).id;
  proyectoB = (await create("pb")).id;
});

afterAll(async () => {
  await cleanup();
  await PostgresDatabase.disconnect();
});

describe("PermissionProfilePostgresDatasource", () => {
  it("creates profiles and rejects a duplicate name per app", async () => {
    const admin = await profiles.create({ app: "ADMIN_WEB", nombre: tag("admin"), modules: ["users", "projects"], estado: true });
    const mobile = await profiles.create({ app: "OPERATIVE_MOBILE", nombre: tag("mobile"), modules: ["tickets"], estado: true });
    adminProfileId = admin.id;
    mobileProfileId = mobile.id;
    expect(admin).toMatchObject({ app: "ADMIN_WEB", modules: ["users", "projects"], estado: true, descripcion: undefined });

    const duplicate = profiles.create({ app: "ADMIN_WEB", nombre: tag("admin"), modules: ["users"], estado: true });
    await expect(duplicate).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("lists by app then name, like before", async () => {
    const ours = (await profiles.getAll()).filter((profile) => profile.nombre.startsWith(tag("")));
    expect(ours.map((profile) => profile.app)).toEqual(["ADMIN_WEB", "OPERATIVE_MOBILE"]);
    expect((await profiles.getAll("OPERATIVE_MOBILE")).every((profile) => profile.app === "OPERATIVE_MOBILE")).toBe(true);
  });

  it("finds, updates and returns null for unknown or non-UUID ids", async () => {
    expect((await profiles.findByNombre("ADMIN_WEB", tag("admin")))?.id).toBe(adminProfileId);
    const updated = await profiles.update(adminProfileId, { descripcion: "Administradores", modules: ["users"] });
    expect(updated).toMatchObject({ descripcion: "Administradores", modules: ["users"] });
    expect(await profiles.findById("not-a-uuid")).toBeNull();
    expect(await profiles.update(randomUUID(), { estado: false })).toBeNull();
    expect(await profiles.delete("64b7f0c2e4b0a1a2b3c4d5e6")).toBeNull();
  });
});

describe("UsuarioPostgresDatasource", () => {
  let usuarioId = "";

  it("creates a user with parkings and per-app permissions", async () => {
    const created = await usuarios.create(
      newUsuario("Ana", {
        correo: `${tag("ANA")}@Example.com`,
        coordinates: [-103.35, 20.67, 5],
        nacimiento: Date.UTC(1990, 4, 10, 6, 0, 0),
        parkings: [proyectoA, proyectoA, proyectoB],
        allowedApps: ["ADMIN_WEB", "OPERATIVE_MOBILE"],
        appPermissions: [
          { app: "ADMIN_WEB", permissionProfileId: adminProfileId },
          { app: "OPERATIVE_MOBILE", permissionProfileId: mobileProfileId },
        ],
      }),
    );
    usuarioId = created.id;

    expect(created.correo).toBe(`${tag("ana")}@example.com`);
    expect(created.coordinates).toEqual([-103.35, 20.67, 5]);
    expect(created.nacimiento).toBe(Date.UTC(1990, 4, 10, 6, 0, 0));
    expect([...created.parkings].sort()).toEqual([proyectoA, proyectoB].sort());
    expect(created.appPermissions).toHaveLength(2);
    expect(created.rol).toBe("CLIENT_ROLE");
  });

  it("finds by id, email (any case) and phone; non-UUID ids are not found", async () => {
    expect((await usuarios.findById(usuarioId))?.id).toBe(usuarioId);
    expect((await usuarios.findByCorreo(`${tag("ANA")}@EXAMPLE.com`))?.id).toBe(usuarioId);
    expect((await usuarios.findByTelefono(tag("Ana")))?.id).toBe(usuarioId);
    expect(await usuarios.findById("64b7f0c2e4b0a1a2b3c4d5e6")).toBeNull();
  });

  it("rejects duplicate email or phone with a DUPLICATE_KEY error", async () => {
    const error = await usuarios
      .create(newUsuario("other", { correo: `${tag("ana")}@example.com` }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect((error as UniqueConstraintError).fields).toContain("correo");
    expect(CustomError.fromUnknown(error).code).toBe("DUPLICATE_KEY");

    await expect(usuarios.create(newUsuario("other2", { telefono: tag("Ana") }))).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("rejects parkings or profiles that do not exist", async () => {
    await expect(usuarios.create(newUsuario("badpk", { parkings: ["abc"] }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(usuarios.create(newUsuario("badpk2", { parkings: [randomUUID()] }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      usuarios.update(usuarioId, { appPermissions: [{ app: "ADMIN_WEB", permissionProfileId: randomUUID() }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    // The failed update rolled back: permissions are unchanged.
    expect((await usuarios.findById(usuarioId))?.appPermissions).toHaveLength(2);
  });

  it("replaces parkings only when they are part of the update", async () => {
    const renamed = await usuarios.update(usuarioId, { nombre: "Ana María" });
    expect(renamed?.nombre).toBe("Ana María");
    expect(renamed?.parkings).toHaveLength(2);

    const moved = await usuarios.update(usuarioId, { parkings: [proyectoB] });
    expect(moved?.parkings).toEqual([proyectoB]);

    expect(await usuarios.update(randomUUID(), { nombre: "x" })).toBeNull();
  });

  it("lists users in creation order", async () => {
    const second = await usuarios.create(newUsuario("Beto"));
    const ours = (await usuarios.getAll()).filter((usuario) => usuario.telefono.startsWith(tag("")));
    expect(ours.map((usuario) => usuario.id)).toEqual([usuarioId, second.id]);
  });

  it("refuses to delete a user with payments and deletes one without history", async () => {
    await db.payment.create({
      data: {
        usuarioId,
        type: "ticket",
        concept: tag("pago"),
        amount: "10.00",
        currency: "MXN",
        status: "succeeded",
        paidAt: new Date(),
        referenceType: "ticket",
        referenceId: "t-1",
      },
    });
    await expect(usuarios.delete(usuarioId)).rejects.toMatchObject({ statusCode: 409 });

    const temp = await usuarios.create(newUsuario("Temp", { parkings: [proyectoA] }));
    expect((await usuarios.delete(temp.id))?.id).toBe(temp.id);
    expect(await usuarios.findById(temp.id)).toBeNull();
    expect(await usuarios.delete(temp.id)).toBeNull();
  });
});

describe("AuthPostgresDatasource", () => {
  let userId = "";

  it("registers and updates the password", async () => {
    const registered = await auth.register(newUsuario("Carla", { emailValidated: false }));
    userId = registered.id;
    expect((await auth.findByCorreo(`${tag("carla")}@example.com`))?.id).toBe(userId);
    expect((await auth.updatePassword(userId, "new-hash"))?.password).toBe("new-hash");
    expect(await auth.updatePassword(randomUUID(), "x")).toBeNull();
  });

  it("handles password reset tokens, including expiry", async () => {
    await auth.savePasswordResetToken(userId, "reset-hash", new Date(Date.now() + 60_000));
    expect((await auth.getUserByPasswordResetToken("reset-hash"))?.id).toBe(userId);

    await auth.resetPassword(userId, "reset-password");
    expect(await auth.getUserByPasswordResetToken("reset-hash")).toBeNull();
    expect((await auth.findById(userId))?.password).toBe("reset-password");

    await auth.savePasswordResetToken(userId, "expired-hash", new Date(Date.now() - 1_000));
    expect(await auth.getUserByPasswordResetToken("expired-hash")).toBeNull();

    await expect(auth.savePasswordResetToken(randomUUID(), "x", new Date())).rejects.toMatchObject({ statusCode: 404 });
    await expect(auth.resetPassword("not-a-uuid", "x")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("validates the email only once", async () => {
    await auth.saveEmailValidationToken(userId, "email-hash", new Date(Date.now() + 60_000));
    expect((await auth.getUserByEmailValidationToken("email-hash"))?.id).toBe(userId);

    const validated = await auth.consumeEmailValidationToken(userId);
    expect(validated.emailValidated).toBe(true);
    expect(await auth.getUserByEmailValidationToken("email-hash")).toBeNull();
    await expect(auth.consumeEmailValidationToken(userId)).rejects.toMatchObject({ statusCode: 401 });

    // Saving a new token marks the email as not validated again.
    await auth.saveEmailValidationToken(userId, "email-hash-2", new Date(Date.now() + 60_000));
    expect((await auth.findById(userId))?.emailValidated).toBe(false);
  });
});

describe("profile deletion", () => {
  it("refuses to delete a profile assigned to a user", async () => {
    await expect(profiles.delete(mobileProfileId)).rejects.toMatchObject({ statusCode: 409 });
    const unused = await profiles.create({ app: "OPERATIVE_WEB", nombre: tag("unused"), modules: ["cashPayments"], estado: true });
    expect((await profiles.delete(unused.id))?.id).toBe(unused.id);
  });
});

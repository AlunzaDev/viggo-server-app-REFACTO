// Development seed: `npm run db:seed`. Idempotent (upserts by natural keys), refuses to run in prod.
//
// Creates a super admin, one permission profile per app, two demo parkings with modules,
// a monthly pension plan with free passes, a cashier and a mobile client.
// Passwords come from SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD, or are generated and printed once.
import { config as loadDotenv } from "dotenv";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hashSync } from "bcryptjs";
import { PostgresDatabase } from "../src/data/postgres";
import type { PrismaClient, SubmoduloTipo, UserModule } from "../src/generated/prisma/client";
import {
  ADMIN_WEB_MODULES,
  OPERATIVE_MOBILE_MODULES,
  OPERATIVE_WEB_MODULES,
} from "../src/domain/constants/user-modules";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
if (appEnv === "prod") throw new Error("The seed must not run against production.");
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true });

const generated: string[] = [];
const password = (envName: string, label: string) => {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const value = randomBytes(9).toString("base64url");
  generated.push(`${label}: ${value}`);
  return value;
};

const ALL_DAY = Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, fromMinutes: 0, toMinutes: 23 * 60 + 59 }));

const upsertProfile = (db: PrismaClient, app: "ADMIN_WEB" | "OPERATIVE_WEB" | "OPERATIVE_MOBILE", nombre: string, modules: readonly string[]) =>
  db.permissionProfile.upsert({
    where: { app_nombre: { app, nombre } },
    create: { app, nombre, descripcion: "Perfil de demostración (seed)", modules: [...modules] as UserModule[] },
    update: {},
  });

const upsertUser = async (
  db: PrismaClient,
  data: { nombre: string; apellido: string; correo: string; telefono: string; rol: string; plainPassword: string },
  access: { apps: Array<"ADMIN_WEB" | "OPERATIVE_WEB" | "OPERATIVE_MOBILE">; profiles: Record<string, string>; parkings: string[] },
) => {
  const existing = await db.usuario.findUnique({ where: { correo: data.correo } });
  if (existing) return { usuario: existing, created: false };
  const usuario = await db.usuario.create({
    data: {
      nombre: data.nombre,
      apellido: data.apellido,
      correo: data.correo,
      telefono: data.telefono,
      rol: data.rol,
      password: hashSync(data.plainPassword, 10),
      emailValidated: true,
      allowedApps: access.apps,
      parkings: { create: access.parkings.map((proyectoId) => ({ proyectoId })) },
      appPermissions: {
        create: Object.entries(access.profiles).map(([app, permissionProfileId]) => ({
          app: app as "ADMIN_WEB" | "OPERATIVE_WEB" | "OPERATIVE_MOBILE",
          permissionProfileId,
        })),
      },
    },
  });
  return { usuario, created: true };
};

const upsertProyecto = async (
  db: PrismaClient,
  data: { identificador: string; nombre: string; ciudad: string; direccion: string; coordinates: number[] },
  modulos: Array<{ identificador: string; nombre: string; tipo: "ENTRADA" | "SALIDA" | "POS"; submodulos: Array<[string, string, SubmoduloTipo]> }>,
) => {
  const proyecto = await db.proyecto.upsert({
    where: { identificador: data.identificador },
    create: { ...data, descripcion: "Estacionamiento de demostración (seed)" },
    update: {},
  });
  for (const modulo of modulos) {
    await db.modulo.upsert({
      where: { identificador: modulo.identificador },
      create: {
        proyectoId: proyecto.id,
        nombre: modulo.nombre,
        tipo: modulo.tipo,
        identificador: modulo.identificador,
        submodulos: {
          create: modulo.submodulos.map(([submoduloId, nombre, tipo], position) => ({ submoduloId, nombre, tipo, position })),
        },
      },
      update: {},
    });
  }
  return proyecto;
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const db = await PostgresDatabase.connect({ databaseUrl });

  const adminProfile = await upsertProfile(db, "ADMIN_WEB", "Administrador total", ADMIN_WEB_MODULES);
  const operativeProfile = await upsertProfile(db, "OPERATIVE_WEB", "Operación completa", OPERATIVE_WEB_MODULES);
  await upsertProfile(db, "OPERATIVE_MOBILE", "Operación móvil", OPERATIVE_MOBILE_MODULES);

  const centro = await upsertProyecto(
    db,
    { identificador: "demo-centro", nombre: "Demo Centro", ciudad: "Guadalajara", direccion: "Av. Juárez 100", coordinates: [-103.3496, 20.6767] },
    [
      { identificador: "demo-centro-entrada", nombre: "Entrada principal", tipo: "ENTRADA", submodulos: [["QR-ENT", "Lector QR", "QR_SCANNER"], ["PLUMA-ENT", "Pluma", "BARRIER"], ["IMP-ENT", "Impresora", "PRINTER"]] },
      { identificador: "demo-centro-salida", nombre: "Salida principal", tipo: "SALIDA", submodulos: [["QR-SAL", "Lector QR", "QR_SCANNER"], ["PLUMA-SAL", "Pluma", "BARRIER"]] },
      { identificador: "demo-centro-cajero", nombre: "Cajero automático", tipo: "POS", submodulos: [["MONEDERO", "Aceptador de efectivo", "CASH_ACCEPTOR"], ["PANTALLA", "Pantalla", "DISPLAY"]] },
    ],
  );
  const norte = await upsertProyecto(
    db,
    { identificador: "demo-norte", nombre: "Demo Norte", ciudad: "Zapopan", direccion: "Av. Patria 2000", coordinates: [-103.4106, 20.7144] },
    [
      { identificador: "demo-norte-entrada", nombre: "Entrada", tipo: "ENTRADA", submodulos: [["QR-ENT", "Lector QR", "QR_SCANNER"], ["PLUMA-ENT", "Pluma", "BARRIER"]] },
      { identificador: "demo-norte-salida", nombre: "Salida", tipo: "SALIDA", submodulos: [["QR-SAL", "Lector QR", "QR_SCANNER"], ["PLUMA-SAL", "Pluma", "BARRIER"]] },
    ],
  );

  const pension =
    (await db.pension.findFirst({ where: { proyectoId: centro.id, nombre: "Pensión mensual" } })) ??
    (await db.pension.create({
      data: {
        proyectoId: centro.id,
        nombre: "Pensión mensual",
        precio: "1500.00",
        descripcion: "Acceso todos los días (seed)",
        horarios: { create: ALL_DAY },
      },
    }));
  for (let index = 1; index <= 5; index += 1) {
    const idPass = `DEMO-PM-${String(index).padStart(3, "0")}`;
    await db.pensionPass.upsert({ where: { idPass }, create: { pensionId: pension.id, name: `Pase ${index}`, idPass }, update: {} });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@viggo.local";
  const results = [
    await upsertUser(
      db,
      {
        nombre: "Super",
        apellido: "Admin",
        correo: adminEmail,
        telefono: "0000000000",
        rol: "SUPER_ROLE",
        plainPassword: password("SEED_ADMIN_PASSWORD", adminEmail),
      },
      {
        apps: ["ADMIN_WEB", "OPERATIVE_WEB", "OPERATIVE_MOBILE"],
        profiles: { ADMIN_WEB: adminProfile.id, OPERATIVE_WEB: operativeProfile.id },
        parkings: [centro.id, norte.id],
      },
    ),
    await upsertUser(
      db,
      { nombre: "Caja", apellido: "Centro", correo: "cajero@viggo.local", telefono: "0000000001", rol: "ADMIN_ROLE", plainPassword: password("SEED_USER_PASSWORD", "cajero@viggo.local") },
      { apps: ["OPERATIVE_WEB"], profiles: { OPERATIVE_WEB: operativeProfile.id }, parkings: [centro.id] },
    ),
    await upsertUser(
      db,
      { nombre: "Cliente", apellido: "Demo", correo: "cliente@viggo.local", telefono: "0000000002", rol: "CLIENT_ROLE", plainPassword: password("SEED_USER_PASSWORD", "cliente@viggo.local") },
      { apps: ["OPERATIVE_MOBILE"], profiles: {}, parkings: [] },
    ),
  ];

  const created = results.filter((result) => result.created).length;
  console.log(`[SEED] Parkings: ${centro.codigoProyecto} ${centro.nombre}, ${norte.codigoProyecto} ${norte.nombre}`);
  console.log(`[SEED] Users created: ${created} (existing ones are left unchanged)`);
  const shown = generated.filter((line) => results.some((result) => result.created && line.startsWith(result.usuario.correo)));
  if (shown.length) {
    console.log("[SEED] Generated passwords (shown only once):");
    shown.forEach((line) => console.log(`  ${line}`));
  }
};

main()
  .catch((error) => {
    console.error("[SEED] Failed", error);
    process.exitCode = 1;
  })
  .finally(() => PostgresDatabase.disconnect());

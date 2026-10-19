import { config as loadDotenv } from "dotenv";

import { PostgresDatabase } from "../src/data/postgres";

loadDotenv({ path: ".env.dev", quiet: true });

const projectName = process.argv.slice(2).join(" ").trim() || "PRUEBA OFICINA";

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const db = await PostgresDatabase.connect({ databaseUrl });

  return db.$transaction(async (tx) => {
    const project = await tx.proyecto.findFirst({
      where: { nombre: { contains: projectName, mode: "insensitive" } },
    });
    if (!project) throw new Error(`No se encontro el proyecto: ${projectName}`);

    const provider = await tx.paymentProvider.upsert({
      where: { nombre: "Viggo" },
      create: { nombre: "Viggo" },
      update: {},
    });

    await tx.proyecto.update({
      where: { id: project.id },
      data: {
        paymentProviderId: provider.id,
        paymentProvider: "",
        externalParkingId: "prueba-oficina-viggo",
      },
    });

    const modules = [
      {
        identificador: "prueba-oficina-entrada",
        nombre: "Entrada principal",
        tipo: "ENTRADA" as const,
        submodules: [
          ["QR-ENTRADA", "Lector QR de entrada", "QR_SCANNER"],
          ["PLUMA-ENTRADA", "Pluma de entrada", "BARRIER"],
          ["IMPRESORA-ENTRADA", "Impresora de boletos", "PRINTER"],
        ] as const,
      },
      {
        identificador: "prueba-oficina-salida",
        nombre: "Salida principal",
        tipo: "SALIDA" as const,
        submodules: [
          ["QR-SALIDA", "Lector QR de salida", "QR_SCANNER"],
          ["PLUMA-SALIDA", "Pluma de salida", "BARRIER"],
        ] as const,
      },
    ];

    for (const definition of modules) {
      const module = await tx.modulo.upsert({
        where: { identificador: definition.identificador },
        create: {
          proyectoId: project.id,
          nombre: definition.nombre,
          tipo: definition.tipo,
          identificador: definition.identificador,
          ubicacion: definition.nombre,
          descripcion: "Modulo simulado para pruebas multi-proveedor",
        },
        update: {
          proyectoId: project.id,
          nombre: definition.nombre,
          tipo: definition.tipo,
          estado: true,
        },
      });

      for (const [position, values] of definition.submodules.entries()) {
        const [submoduloId, nombre, tipo] = values;
        await tx.submodulo.upsert({
          where: { moduloId_submoduloId: { moduloId: module.id, submoduloId } },
          create: { moduloId: module.id, submoduloId, nombre, tipo, position, estado: true },
          update: { nombre, tipo, position, estado: true },
        });
      }
    }

    const installation = await tx.localInstallation.upsert({
      where: { installationId: "ticket-lab-prueba-oficina" },
      create: {
        installationId: "ticket-lab-prueba-oficina",
        proyectoId: project.id,
        status: "approved",
        requestedByUserName: "Ticket Lab",
        reviewedByUserName: "Entorno de desarrollo",
        reviewedAt: new Date(),
        reviewNote: "Simulador local para pruebas; no representa una instalacion fisica",
      },
      update: {
        proyectoId: project.id,
        status: "approved",
        reviewedByUserName: "Entorno de desarrollo",
        reviewedAt: new Date(),
        reviewNote: "Simulador local para pruebas; no representa una instalacion fisica",
      },
    });

    return {
      projectId: project.id,
      projectName: project.nombre,
      provider: provider.nombre,
      modules: modules.map(({ nombre, tipo }) => ({ nombre, tipo })),
      installationId: installation.installationId,
    };
  });
};

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

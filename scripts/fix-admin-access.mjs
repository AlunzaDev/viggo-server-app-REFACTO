import mongoose from "mongoose";

const mongoUrl = process.env.MONGO_URL || "mongodb://imasd:jidta2026@localhost:27017/VIGGO?authSource=admin";

async function run() {
  try {
    console.log("Conectando a MongoDB en:", mongoUrl);
    await mongoose.connect(mongoUrl);
    console.log("Conectado con éxito.");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("usuarios");
    const profilesCollection = db.collection("permissionprofiles");

    console.log("\n--- REVISANDO PERFILES DE PERMISOS ---");
    const profiles = await profilesCollection.find({}).toArray();
    console.log(`Encontrados ${profiles.length} perfiles en la BD.`);

    let adminProfile = profiles.find((p) => p.app === "ADMIN_WEB" && p.estado === true);

    if (!adminProfile) {
      console.log("Creando perfil por defecto para ADMIN_WEB...");
      const newProfile = {
        app: "ADMIN_WEB",
        nombre: "Perfil Administrador Global",
        descripcion: "Perfil con acceso a todos los módulos administrativos",
        modules: [
          "users",
          "permissionProfiles",
          "projects",
          "payments",
          "tickets",
          "pensions",
          "cashPayments",
          "modules",
          "installations",
          "submodules"
        ],
        estado: true,
      };
      const result = await profilesCollection.insertOne(newProfile);
      adminProfile = { _id: result.insertedId, ...newProfile };
      console.log("Perfil creado con ID:", adminProfile._id.toString());
    } else {
      console.log("Perfil ADMIN_WEB existente encontrado con ID:", adminProfile._id.toString());
    }

    const adminProfileId = adminProfile._id.toString();

    console.log("\n--- REVISANDO USUARIOS EN LA BASE DE DATOS ---");
    const users = await usersCollection.find({}).toArray();
    console.log(`Encontrados ${users.length} usuarios:`);

    for (const u of users) {
      console.log(`\nUsuario: ${u.correo} (Rol: ${u.rol})`);
      console.log(` - Estado actual: emailValidated=${u.emailValidated}, estado=${u.estado}`);
      console.log(` - Apps actuales: ${JSON.stringify(u.allowedApps)}`);

      const allowedApps = Array.from(new Set([...(u.allowedApps || []), "ADMIN_WEB", "OPERATIVE_WEB", "OPERATIVE_MOBILE"]));
      const existingPermissions = u.appPermissions || [];
      const hasAdminPerm = existingPermissions.some((p) => p.app === "ADMIN_WEB");

      const updatedPermissions = hasAdminPerm
        ? existingPermissions.map((p) => (p.app === "ADMIN_WEB" ? { ...p, permissionProfileId: adminProfileId } : p))
        : [...existingPermissions, { app: "ADMIN_WEB", permissionProfileId: adminProfileId }];

      await usersCollection.updateOne(
        { _id: u._id },
        {
          $set: {
            emailValidated: true,
            estado: true,
            allowedApps: allowedApps,
            appPermissions: updatedPermissions,
          },
        }
      );
      console.log(` -> ¡ACTUALIZADO EXITOSAMENTE! Habilitado emailValidated=true, estado=true, allowedApps=["ADMIN_WEB", ...] y perfil asignado.`);
    }

    console.log("\n=======================================================");
    console.log(" TODOS LOS USUARIOS TIENEN PERMISOS COMPLETOS AHORA ");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("Error al ejecutar actualización de permisos:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();

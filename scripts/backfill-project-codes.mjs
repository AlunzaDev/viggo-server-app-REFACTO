import { config as loadDotenv } from "dotenv";
import mongoose from "mongoose";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
} else {
  loadDotenv();
}

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) {
  throw new Error("MONGO_URL is required.");
}

const PROJECT_CODE_LIMIT = 9999;
const PROJECT_COUNTER_NAME = "proyecto_codigo";

const formatProjectCode = (sequence) => String(sequence).padStart(4, "0");

await mongoose.connect(mongoUrl, {
  dbName: process.env.MONGO_DB_NAME,
});

const db = mongoose.connection.db;
if (!db) {
  throw new Error("Mongo connection was not initialized.");
}

const proyectos = db.collection("proyectos");
const counters = db.collection("counters");

const existingCodes = await proyectos
  .find({ codigoProyecto: { $regex: /^\d{4}$/ } })
  .project({ codigoProyecto: 1 })
  .toArray();
let nextSequence = existingCodes.reduce((max, proyecto) => {
  const sequence = Number(proyecto.codigoProyecto);
  return Number.isFinite(sequence) && sequence > max ? sequence : max;
}, 0);

const projectsWithoutCode = await proyectos
  .find({
    $or: [
      { codigoProyecto: { $exists: false } },
      { codigoProyecto: null },
      { codigoProyecto: "" },
    ],
  })
  .sort({ _id: 1 })
  .toArray();

for (const proyecto of projectsWithoutCode) {
  nextSequence += 1;
  if (nextSequence > PROJECT_CODE_LIMIT) {
    throw new Error("Se alcanzo el limite de 9999 codigos de proyecto.");
  }

  await proyectos.updateOne(
    { _id: proyecto._id },
    { $set: { codigoProyecto: formatProjectCode(nextSequence) } },
  );
}

await counters.updateOne(
  { name: PROJECT_COUNTER_NAME },
  { $set: { seq: nextSequence } },
  { upsert: true },
);

console.log(
  `Project code backfill completed. Updated ${projectsWithoutCode.length} project(s). Last sequence: ${nextSequence}.`,
);

await mongoose.disconnect();


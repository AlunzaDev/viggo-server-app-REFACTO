import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { NextFunction, Request, Response } from "express";

const directory = path.join(process.cwd(), "public", "uploads", "providers");
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => { fs.mkdirSync(directory, { recursive: true }); callback(null, directory); },
  filename: (_req, file, callback) => callback(null, `provider-${Date.now()}-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({ storage, limits: { fileSize: 1_500_000, files: 1 }, fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith("image/")) });
export const uploadProviderLogo = (req: Request, res: Response, next: NextFunction) => upload.single("logo")(req, res, (error) => error ? res.status(400).json({ error: "Logo inválido o mayor a 1.5 MB" }) : next());

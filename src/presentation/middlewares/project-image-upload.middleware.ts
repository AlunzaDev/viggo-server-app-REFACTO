import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { NextFunction, Request, Response } from "express";

const PROJECT_UPLOADS_DIRECTORY = path.join(
  process.cwd(),
  "public",
  "uploads",
  "projects",
);

const ensureProjectUploadsDirectory = () => {
  if (!fs.existsSync(PROJECT_UPLOADS_DIRECTORY)) {
    fs.mkdirSync(PROJECT_UPLOADS_DIRECTORY, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureProjectUploadsDirectory();
    callback(null, PROJECT_UPLOADS_DIRECTORY);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    callback(null, `project-${Date.now()}-${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1_500_000,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Solo se permiten archivos de imagen"));
      return;
    }

    callback(null, true);
  },
});

const handleUploadResult =
  (handler: ReturnType<typeof upload.single>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const message =
        error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
          ? "La imagen debe pesar menos de 1.5 MB"
          : error instanceof Error
            ? error.message
            : "No se pudo subir la imagen del proyecto";

      res.status(400).json({ error: message });
    });
  };

export const uploadProjectImage = handleUploadResult(upload.single("image"));

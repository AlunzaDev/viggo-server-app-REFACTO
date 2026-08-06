import { Request, Response } from "express";
import { CreateUsuarioDto } from "../../../domain/dtos/auth/create-usuario.dto";
import { UpdateUsuarioDto } from "../../../domain/dtos/auth/update-usuario.dto";
import { ErrorService } from "../../services/error.service";
import { UsuarioService } from "../../services/auth/usuario.service";
import { deleteManagedUserImage } from "../../utils/user-image.util";

const parseArrayField = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
};

const parseBooleanField = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
};

const parseCoordinatesField = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim();
  if (!normalized) return undefined;

  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
};

const normalizeUsuarioRequestBody = (body: Record<string, unknown>) => {
  const normalizedBody: Record<string, unknown> = {
    ...body,
    coordinates: parseCoordinatesField(body.coordinates),
    allowedApps: parseArrayField(body.allowedApps),
    parkings: parseArrayField(body.parkings),
    modules: parseArrayField(body.modules),
  };

  const google = parseBooleanField(body.google);
  if (google !== undefined) normalizedBody.google = google;

  const emailValidated = parseBooleanField(body.emailValidated);
  if (emailValidated !== undefined) {
    normalizedBody.emailValidated = emailValidated;
  }

  return normalizedBody;
};

export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  createUsuario = async (req: Request, res: Response) => {
    try {
      const body = normalizeUsuarioRequestBody(
        req.body as Record<string, unknown>,
      );
      if (req.file?.filename) {
        body.img = `/uploads/users/${req.file.filename}`;
      }

      const [error, createUsuarioDto] = CreateUsuarioDto.create(body);
      if (error) return res.status(400).json({ error });

      const usuario = await this.usuarioService.createUsuario(
        createUsuarioDto!,
      );
      return res.status(201).json({ usuario });
    } catch (error) {
      if (req.file?.filename) {
        deleteManagedUserImage(`/uploads/users/${req.file.filename}`);
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  getUsuarios = async (_req: Request, res: Response) => {
    try {
      const usuarios = await this.usuarioService.getUsuarios();
      return res.status(200).json({ usuarios });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getUsuarioById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const usuario = await this.usuarioService.getUsuarioById(id);
      return res.status(200).json({ usuario });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateUsuario = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const body = normalizeUsuarioRequestBody(
        req.body as Record<string, unknown>,
      );
      const clearImage = parseBooleanField(body.clearImage) === true;

      if (req.file?.filename) {
        body.img = `/uploads/users/${req.file.filename}`;
      } else if (clearImage) {
        body.img = "";
      }

      const [error, updateUsuarioDto] = UpdateUsuarioDto.create(body);
      if (error) return res.status(400).json({ error });

      const usuario = await this.usuarioService.updateUsuario(
        id,
        updateUsuarioDto!,
      );
      return res.status(200).json({ usuario });
    } catch (error) {
      if (req.file?.filename) {
        deleteManagedUserImage(`/uploads/users/${req.file.filename}`);
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  updateUsuarioStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { estado } = req.body as { estado?: unknown };

      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const usuario = await this.usuarioService.updateUsuarioStatus(id, estado);
      return res.status(200).json({ usuario });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteUsuario = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const usuario = await this.usuarioService.deleteUsuario(id);
      return res.status(200).json({ usuario });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

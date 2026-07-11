import { Request, Response } from "express";
import { UpdateUsuarioDto } from "../../../domain/dtos/auth/update-usuario.dto";
import { ErrorService } from "../../services/error.service";
import { UsuarioService } from "../../services/auth/usuario.service";

export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

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
      const [error, updateUsuarioDto] = UpdateUsuarioDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const usuario = await this.usuarioService.updateUsuario(
        id,
        updateUsuarioDto!,
      );
      return res.status(200).json({ usuario });
    } catch (error) {
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

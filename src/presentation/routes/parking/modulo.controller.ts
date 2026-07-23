import { Request, Response } from "express";
import { CreateModuloDto } from "../../../domain/dtos/parking/create-modulo.dto";
import { UpdateModuloDto } from "../../../domain/dtos/parking/update-modulo.dto";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { ModuloCrudService } from "../../services/parking/modulo-crud.service";

export class ModuloController {
  constructor(private readonly moduloService: ModuloCrudService) {}

  private sanitizeModulo(modulo: ModuloEntity) {
    return {
      id: modulo.id,
      nombre: modulo.nombre,
      proyecto: modulo.proyecto,
      tipo: modulo.tipo,
      estado: modulo.estado,
      identificador: modulo.identificador,
      descripcion: modulo.descripcion,
    };
  }

  private parseEstado(value: unknown): boolean | undefined | null {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return null;
  }

  private parseTipo(value: unknown): ModuloEntity["tipo"] | undefined | null {
    if (value === undefined) return undefined;
    const normalized = String(value).trim().toUpperCase();
    if (normalized === "ENTRADA" || normalized === "SALIDA" || normalized === "POS") {
      return normalized;
    }
    return null;
  }

  createModulo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreateModuloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      if (!canAccessProjectFromRequest(req, dto.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const modulo = await this.moduloService.createModulo(dto);
      return res.status(201).json({ modulo: this.sanitizeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulos = async (req: Request, res: Response) => {
    try {
      const proyecto = typeof req.query.proyecto === "string" ? req.query.proyecto.trim() : undefined;
      const tipo = this.parseTipo(req.query.tipo);
      const estado = this.parseEstado(req.query.estado);
      if (tipo === null) return res.status(400).json({ error: "'tipo' no es valido" });
      if (estado === null) return res.status(400).json({ error: "'estado' debe ser boolean" });
      if (proyecto && !canAccessProjectFromRequest(req, proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      let modulos = await this.moduloService.getModulosFiltered({ proyecto, tipo, estado });
      if (!isSuperAdminRequest(req)) {
        const allowed = new Set(getAllowedProjectIdsFromRequest(req));
        modulos = modulos.filter((modulo) => allowed.has(modulo.proyecto));
      }

      return res.status(200).json({ modulos: modulos.map((item) => this.sanitizeModulo(item)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulosByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      if (!canAccessProjectFromRequest(req, proyectoId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const modulos = await this.moduloService.getModulosByProyecto(proyectoId);
      return res.status(200).json({ modulos: modulos.map((item) => this.sanitizeModulo(item)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloByIdentificador = async (req: Request, res: Response) => {
    try {
      const modulo = await this.moduloService.getModuloByIdentificador(String(req.params.identificador));
      if (!canAccessProjectFromRequest(req, modulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ modulo: this.sanitizeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloById = async (req: Request, res: Response) => {
    try {
      const modulo = await this.moduloService.getModuloById(String(req.params.id));
      if (!canAccessProjectFromRequest(req, modulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ modulo: this.sanitizeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, dto] = UpdateModuloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      if (dto.proyecto && !canAccessProjectFromRequest(req, dto.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const modulo = await this.moduloService.updateModulo(id, dto);
      return res.status(200).json({ modulo: this.sanitizeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModuloStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { estado } = req.body as { estado?: unknown };
      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }
      const modulo = await this.moduloService.updateModuloStatus(id, estado);
      return res.status(200).json({ modulo: this.sanitizeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteModulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const modulo = await this.moduloService.deleteModulo(id);
      return res.status(200).json({ modulo: this.sanitizeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

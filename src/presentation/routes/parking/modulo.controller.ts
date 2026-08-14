import { Request, Response } from "express";
import { CreateModuloDto } from "../../../domain/dtos/parking/create-modulo.dto";
import {
  CreateModuloSubmoduloDto,
  UpdateModuloSubmoduloDto,
} from "../../../domain/dtos/parking/modulo-submodulo.dto";
import { UpdateModuloDto } from "../../../domain/dtos/parking/update-modulo.dto";
import {
  ModuloEntity,
  ModuloSubmodulo,
} from "../../../domain/entities/parking/modulo.entity";
import {
  ModuloTipo,
  parseModuloTipo,
} from "../../../domain/entities/parking/module-type.entity";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { ModuloCrudService } from "../../services/parking/modulo-crud.service";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
} from "../../services/shared/pagination-query";

export class ModuloController {
  constructor(private readonly moduloService: ModuloCrudService) {}

  private normalizeText(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  private sanitizeModulo(modulo: ModuloEntity) {
    return {
      id: modulo.id,
      nombre: modulo.nombre,
      proyecto: modulo.proyecto,
      tipo: modulo.tipo,
      capabilities: modulo.capabilities,
      estado: modulo.estado,
      identificador: modulo.identificador,
      ip: modulo.ip,
      mac: modulo.mac,
      ubicacion: modulo.ubicacion,
      coordinates: modulo.coordinates,
      descripcion: modulo.descripcion,
      deviceBinding: modulo.deviceBinding,
      deviceBindingRequests: modulo.deviceBindingRequests,
      deviceRuntimeSnapshot: modulo.deviceRuntimeSnapshot,
      remoteSupport: modulo.remoteSupport,
      submodulos: modulo.submodulos,
    };
  }

  private sanitizeSubmodulo(submodulo: ModuloSubmodulo) {
    return {
      submoduloId: submodulo.submoduloId,
      nombre: submodulo.nombre,
      tipo: submodulo.tipo,
      identificador: submodulo.identificador,
      ip: submodulo.ip,
      mac: submodulo.mac,
      ubicacion: submodulo.ubicacion,
      coordinates: submodulo.coordinates,
      descripcion: submodulo.descripcion,
      estado: submodulo.estado,
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

  private parseTipo(value: unknown): ModuloTipo | undefined | null {
    if (value === undefined) return undefined;
    return parseModuloTipo(value);
  }

  private parseTipos(value: unknown): ModuloTipo[] | null {
    if (value === undefined) return [];

    const rawValues = Array.isArray(value)
      ? value
      : String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

    const parsedValues = rawValues.map((item) => this.parseTipo(item));
    if (parsedValues.some((item) => item === null)) return null;

    return parsedValues.filter((item): item is ModuloTipo => Boolean(item));
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
      const proyecto =
        typeof req.query.proyecto === "string"
          ? req.query.proyecto.trim()
          : undefined;
      const tipos = this.parseTipos(req.query.tipos ?? req.query.tipo);
      const estado = this.parseEstado(req.query.estado);
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);

      if (tipos === null)
        return res.status(400).json({ error: "'tipo' no es valido" });
      if (estado === null)
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      if (proyecto && !canAccessProjectFromRequest(req, proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      let modulos = await this.moduloService.getModulosFiltered({
        proyecto,
        tipo: tipos[0],
        estado,
      });
      if (!isSuperAdminRequest(req)) {
        const allowed = new Set(getAllowedProjectIdsFromRequest(req));
        modulos = modulos.filter((modulo) => allowed.has(modulo.proyecto));
      }

      if (tipos.length > 1) {
        modulos = modulos.filter((modulo) => tipos.includes(modulo.tipo));
      }

      if (search) {
        const normalizedSearch = this.normalizeText(search);
        modulos = modulos.filter((modulo) =>
          [
            modulo.nombre,
            modulo.identificador,
            modulo.ip ?? "",
            modulo.mac ?? "",
            modulo.ubicacion ?? "",
            modulo.descripcion ?? "",
            modulo.tipo,
          ].some((value) =>
            this.normalizeText(String(value ?? "")).includes(normalizedSearch),
          ),
        );
      }

      const sanitized = modulos.map((item) => this.sanitizeModulo(item));
      if (!shouldPaginate) {
        return res.status(200).json({ modulos: sanitized });
      }

      return res
        .status(200)
        .json(
          buildPaginatedResponse(
            "modulos",
            paginateArray(sanitized, page, limit),
            sanitized.length,
            page,
            limit,
          ),
        );
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
      return res
        .status(200)
        .json({ modulos: modulos.map((item) => this.sanitizeModulo(item)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloByIdentificador = async (req: Request, res: Response) => {
    try {
      const modulo = await this.moduloService.getModuloByIdentificador(
        String(req.params.identificador),
      );
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
      const modulo = await this.moduloService.getModuloById(
        String(req.params.id),
      );
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

  getSubmodulos = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const submodulos = await this.moduloService.getSubmodulos(id);
      return res.status(200).json({
        submodulos: submodulos.map((item) => this.sanitizeSubmodulo(item)),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createSubmodulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, dto] = CreateModuloSubmoduloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const submodulo = await this.moduloService.addSubmodulo(id, dto.values);
      return res
        .status(201)
        .json({ submodulo: this.sanitizeSubmodulo(submodulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateSubmodulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const submoduloId = String(req.params.submoduloId);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, dto] = UpdateModuloSubmoduloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const submodulo = await this.moduloService.updateSubmodulo(
        id,
        submoduloId,
        dto.values,
      );
      return res
        .status(200)
        .json({ submodulo: this.sanitizeSubmodulo(submodulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteSubmodulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const submoduloId = String(req.params.submoduloId);
      const current = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, current.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const modulo = await this.moduloService.deleteSubmodulo(id, submoduloId);
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

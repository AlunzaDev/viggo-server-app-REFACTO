import type { Request, Response } from "express";
import { CreateModuloDto } from "../../../domain/dtos/parking/create-modulo.dto";
import { ModuloListQueryDto } from "../../../domain/dtos/parking/modulo-list-query.dto";
import { CreateModuloSubmoduloDto, UpdateModuloSubmoduloDto } from "../../../domain/dtos/parking/modulo-submodulo.dto";
import { UpdateModuloDto } from "../../../domain/dtos/parking/update-modulo.dto";
import type { ModuloEntity, ModuloSubmodulo } from "../../../domain/entities/parking/modulo.entity";
import { projectAccessFromRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import type { ModuloCrudService } from "../../services/parking/modulo-crud.service";
import { buildPaginatedResponse, paginateArray, parsePaginationDateQuery } from "../../services/shared/pagination-query";

const serializeModulo = (modulo: ModuloEntity) => ({
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
});

const serializeSubmodulo = (submodulo: ModuloSubmodulo) => ({
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
});

/** HTTP for the device catalog; the rules and the user's scope live in ModuloCrudService. */
export class ModuloController {
  constructor(private readonly modulos: ModuloCrudService) {}

  createModulo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreateModuloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const modulo = await this.modulos.createModulo(dto, projectAccessFromRequest(req));
      return res.status(201).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Without `page`/`limit` the whole list; with them, a page. */
  getModulos = async (req: Request, res: Response) => {
    try {
      const [error, query] = ModuloListQueryDto.create(req.query as Record<string, unknown>);
      if (error || !query) return res.status(400).json({ error });
      const { page, limit } = parsePaginationDateQuery(req.query);
      const modulos = (await this.modulos.listModulos(query, projectAccessFromRequest(req))).map(serializeModulo);
      if (req.query.page === undefined && req.query.limit === undefined) return res.status(200).json({ modulos });
      return res.status(200).json(buildPaginatedResponse("modulos", paginateArray(modulos, page, limit), modulos.length, page, limit));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulosByProyecto = async (req: Request, res: Response) => {
    try {
      const modulos = await this.modulos.getModulosByProyecto(String(req.params.proyectoId), projectAccessFromRequest(req));
      return res.status(200).json({ modulos: modulos.map(serializeModulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloByIdentificador = async (req: Request, res: Response) => {
    try {
      const modulo = await this.modulos.getModuloByIdentificador(String(req.params.identificador), projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloById = async (req: Request, res: Response) => {
    try {
      const modulo = await this.modulos.getModuloById(String(req.params.id), projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModulo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = UpdateModuloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const modulo = await this.modulos.updateModulo(String(req.params.id), dto, projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModuloStatus = async (req: Request, res: Response) => {
    try {
      const { estado } = req.body as { estado?: unknown };
      if (typeof estado !== "boolean") return res.status(400).json({ error: "'estado' debe ser boolean" });
      const modulo = await this.modulos.updateModuloStatus(String(req.params.id), estado, projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getSubmodulos = async (req: Request, res: Response) => {
    try {
      const submodulos = await this.modulos.getSubmodulos(String(req.params.id), projectAccessFromRequest(req));
      return res.status(200).json({ submodulos: submodulos.map(serializeSubmodulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createSubmodulo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreateModuloSubmoduloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const submodulo = await this.modulos.addSubmodulo(String(req.params.id), dto.values, projectAccessFromRequest(req));
      return res.status(201).json({ submodulo: serializeSubmodulo(submodulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateSubmodulo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = UpdateModuloSubmoduloDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const submodulo = await this.modulos.updateSubmodulo(String(req.params.id), String(req.params.submoduloId), dto.values, projectAccessFromRequest(req));
      return res.status(200).json({ submodulo: serializeSubmodulo(submodulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteSubmodulo = async (req: Request, res: Response) => {
    try {
      const modulo = await this.modulos.deleteSubmodulo(String(req.params.id), String(req.params.submoduloId), projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteModulo = async (req: Request, res: Response) => {
    try {
      const modulo = await this.modulos.deleteModulo(String(req.params.id), projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

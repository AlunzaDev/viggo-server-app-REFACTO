import { Request, Response } from "express";
import { CreateModuloDto } from "../../../domain/dtos/parking/create-modulo.dto";
import { UpdateModuloDto } from "../../../domain/dtos/parking/update-modulo.dto";
import { ErrorService } from "../../services/error.service";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ModuloService } from "../../services/parking/modulo.service";
import { SocketServerPlugin } from "../../sockets/socket-server";

export class ModuloController {
  constructor(private readonly moduloService: ModuloService) {}

  private readonly moduloTipos = ["ENTRADA", "SALIDA", "POS"] as const;

  private parseResolveDeviceBindingRequestBody(body: Record<string, unknown>): {
    fingerprint?: string;
    notes?: string;
  } {
    return {
      fingerprint:
        typeof body.fingerprint === "string" ? body.fingerprint.trim() : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
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

  private parseTipoList(value: unknown): Array<"ENTRADA" | "SALIDA" | "POS"> | null {
    if (value === undefined) return [];

    const rawValues = Array.isArray(value)
      ? value
      : String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

    const normalized = rawValues.map((item) => String(item).trim().toUpperCase());

    if (
      normalized.some(
        (item) =>
          !this.moduloTipos.includes(
            item as (typeof this.moduloTipos)[number],
          ),
      )
    ) {
      return null;
    }

    return normalized as Array<"ENTRADA" | "SALIDA" | "POS">;
  }

  createModulo = async (req: Request, res: Response) => {
    try {
      const [error, createModuloDto] = CreateModuloDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (!canAccessProjectFromRequest(req, createModuloDto!.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const modulo = await this.moduloService.createModulo({
        ...createModuloDto!,
        deviceBinding: null,
        deviceBindingRequests: [],
      });
      return res.status(201).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulos = async (req: Request, res: Response) => {
    try {
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      const proyecto =
        typeof req.query.proyecto === "string" ? req.query.proyecto.trim() : "";
      const tipos = this.parseTipoList(req.query.tipos ?? req.query.tipo);
      const estado = this.parseEstado(req.query.estado);

      if (estado === null) {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      if (tipos === null) {
        return res.status(400).json({ error: "'tipo' o 'tipos' no es valido" });
      }

      if (proyecto && !canAccessProjectFromRequest(req, proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const effectiveProject =
        proyecto ||
        (!isSuperAdminRequest(req) && allowedProjectIds.length === 1
          ? allowedProjectIds[0]
          : "");

      const hasBaseFilters = Boolean(
        effectiveProject || tipos.length > 0 || estado !== undefined,
      );

      let modulos = hasBaseFilters
        ? await this.moduloService.getModulosFiltered({
            proyecto: effectiveProject || undefined,
            tipo: tipos[0],
            estado,
          })
        : await this.moduloService.getModulos();

      if (tipos.length > 1) {
        modulos = modulos.filter((modulo) => tipos.includes(modulo.tipo));
      }

      return res.status(200).json({ modulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulosWithPendingDeviceBindingRequests = async (
    _req: Request,
    res: Response,
  ) => {
    try {
      const modulos =
        await this.moduloService.getModulosWithPendingDeviceBindingRequests();
      return res.status(200).json({ modulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const modulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, modulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulosByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      const tipos = this.parseTipoList(req.query.tipos ?? req.query.tipo);

      if (tipos === null) {
        return res.status(400).json({ error: "'tipo' o 'tipos' no es valido" });
      }

      if (!canAccessProjectFromRequest(req, proyectoId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const effectiveTipos =
        tipos.length > 0
          ? tipos
          : (["ENTRADA", "SALIDA", "POS"] as Array<"ENTRADA" | "SALIDA" | "POS">);

      const modulos = await this.moduloService.getModulosFiltered({
        proyecto: proyectoId,
        tipo: effectiveTipos[0],
      });

      const filteredModules =
        effectiveTipos.length > 1
          ? modulos.filter((modulo) => effectiveTipos.includes(modulo.tipo))
          : modulos;

      return res.status(200).json({ modulos: filteredModules });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, updateModuloDto] = UpdateModuloDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (
        updateModuloDto?.proyecto &&
        !canAccessProjectFromRequest(req, updateModuloDto.proyecto)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const modulo = await this.moduloService.updateModulo(id, updateModuloDto!);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloByIdentificador = async (req: Request, res: Response) => {
    try {
      const identificador = String(req.params.identificador).trim();
      const modulo =
        await this.moduloService.getModuloByIdentificador(identificador);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModuloStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { estado } = req.body as { estado?: unknown };

      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const modulo = await this.moduloService.updateModuloStatus(id, estado);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  resetDeviceBinding = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const modulo = await this.moduloService.resetDeviceBinding(id);
      SocketServerPlugin.emitDeviceBindingUpdated({
        moduleId: modulo.id,
        status: "RESET",
        reason: "RESET_DEVICE_BINDING",
        timestamp: new Date().toISOString(),
      });
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  approveDeviceBindingRequest = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const payload = this.parseResolveDeviceBindingRequestBody(
        req.body as Record<string, unknown>,
      );
      const modulo = await this.moduloService.approveDeviceBindingRequest(
        id,
        payload,
      );
      SocketServerPlugin.emitDeviceBindingUpdated({
        moduleId: modulo.id,
        fingerprint: payload.fingerprint,
        status: "APPROVED",
        reason: "APPROVE_DEVICE_BINDING_REQUEST",
        timestamp: new Date().toISOString(),
      });
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  rejectDeviceBindingRequest = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const payload = this.parseResolveDeviceBindingRequestBody(
        req.body as Record<string, unknown>,
      );
      const modulo = await this.moduloService.rejectDeviceBindingRequest(
        id,
        payload,
      );
      SocketServerPlugin.emitDeviceBindingUpdated({
        moduleId: modulo.id,
        fingerprint: payload.fingerprint,
        status: "REJECTED",
        reason: "REJECT_DEVICE_BINDING_REQUEST",
        timestamp: new Date().toISOString(),
      });
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  reopenDeviceBindingRequest = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const payload = this.parseResolveDeviceBindingRequestBody(
        req.body as Record<string, unknown>,
      );
      const modulo = await this.moduloService.reopenDeviceBindingRequest(
        id,
        payload,
      );
      SocketServerPlugin.emitDeviceBindingUpdated({
        moduleId: modulo.id,
        fingerprint: payload.fingerprint,
        status: "PENDING",
        reason: "REOPEN_DEVICE_BINDING_REQUEST",
        timestamp: new Date().toISOString(),
      });
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteModulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentModulo = await this.moduloService.getModuloById(id);
      if (!canAccessProjectFromRequest(req, currentModulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const modulo = await this.moduloService.deleteModulo(id);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

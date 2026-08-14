import { ModuloTipo } from "./module-type.entity";

export type ModuloTypeCapabilities = {
  canIssueTickets: boolean;
  canValidateExit: boolean;
  canChargePayments: boolean;
  requiresDeviceBinding: boolean;
  supportsRemoteSupport: boolean;
};

export const MODULO_TYPE_CAPABILITIES: Record<
  ModuloTipo,
  ModuloTypeCapabilities
> = {
  ENTRADA: {
    canIssueTickets: true,
    canValidateExit: false,
    canChargePayments: false,
    requiresDeviceBinding: true,
    supportsRemoteSupport: true,
  },
  SALIDA: {
    canIssueTickets: false,
    canValidateExit: true,
    canChargePayments: false,
    requiresDeviceBinding: true,
    supportsRemoteSupport: true,
  },
  POS: {
    canIssueTickets: false,
    canValidateExit: false,
    canChargePayments: true,
    requiresDeviceBinding: false,
    supportsRemoteSupport: true,
  },
};

export const getModuloTypeCapabilities = (
  tipo: ModuloTipo,
): ModuloTypeCapabilities => MODULO_TYPE_CAPABILITIES[tipo];

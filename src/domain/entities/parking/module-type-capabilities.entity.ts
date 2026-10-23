import { MODULE_TYPE_CAPABILITIES, type ModuleTypeCapabilities } from "@alunzadev/viggo-contracts";
import type { ModuloTipo } from "./module-type.entity";

export type ModuloTypeCapabilities = ModuleTypeCapabilities;

export const MODULO_TYPE_CAPABILITIES = MODULE_TYPE_CAPABILITIES;

export const getModuloTypeCapabilities = (
  tipo: ModuloTipo,
): ModuloTypeCapabilities => MODULO_TYPE_CAPABILITIES[tipo];

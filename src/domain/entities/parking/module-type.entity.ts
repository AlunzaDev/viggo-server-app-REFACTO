import { MODULE_TYPES, parseModuleType, type ModuleType } from "@alunzadev/viggo-contracts";

// The module types and their rules live in @alunzadev/viggo-contracts, shared with OPERATIVO.
export const MODULO_TIPOS = MODULE_TYPES;

export type ModuloTipo = ModuleType;

/** Accepts the type in any case and with spaces ("entrada "), as the requests send it. */
export const parseModuloTipo = (value: unknown): ModuloTipo | null => parseModuleType(value);

export const isModuloTipo = (value: unknown): value is ModuloTipo =>
  typeof value === "string" && parseModuloTipo(value) !== null;

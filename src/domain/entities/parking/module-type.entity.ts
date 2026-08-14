export const MODULO_TIPOS = ["ENTRADA", "SALIDA", "POS"] as const;

export type ModuloTipo = (typeof MODULO_TIPOS)[number];

export const isModuloTipo = (value: unknown): value is ModuloTipo =>
  typeof value === "string" &&
  MODULO_TIPOS.includes(value.trim().toUpperCase() as ModuloTipo);

export const parseModuloTipo = (value: unknown): ModuloTipo | null => {
  if (!isModuloTipo(value)) return null;
  return value.trim().toUpperCase() as ModuloTipo;
};

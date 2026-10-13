import { Prisma } from "../../../generated/prisma/client";
import { CustomError } from "../../../domain/errors/custom.error";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids that are not UUIDs can never exist; datasources treat them as "not found". */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

const uniqueFields = (error: Prisma.PrismaClientKnownRequestError): string[] => {
  const meta = (error.meta ?? {}) as Record<string, any>;
  const cause = meta.driverAdapterError?.cause ?? {};
  const target = meta.target ?? cause.constraint?.fields;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];

  // With the pg driver adapter Prisma 7 only reports the index, e.g. "usuarios_correo_key":
  // strip the table prefix and the suffix to get the column(s).
  const index = String(cause.constraint?.index ?? "");
  const table = String(cause.table ?? "");
  if (index && table && index.startsWith(`${table}_`)) {
    const columns = index.slice(table.length + 1).replace(/_(key|pkey)$/, "");
    return columns ? [columns] : [];
  }
  return index ? [index] : [];
};

export interface PrismaErrorContext {
  /** Error to raise when a foreign key is violated (invalid reference or record still in use). */
  foreignKey?: CustomError;
}

/**
 * Translates Prisma errors into domain errors so callers never depend on Prisma codes:
 * P2002 -> UniqueConstraintError, P2003 -> the given CustomError (409 by default).
 */
export const translatePrismaError = (error: unknown, context: PrismaErrorContext = {}): unknown => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;

  if (error.code === "P2002") return new UniqueConstraintError(uniqueFields(error));
  if (error.code === "P2003") {
    return context.foreignKey ?? CustomError.conflict("El registro está relacionado con otros datos");
  }
  return error;
};

/** Runs a Prisma call and rethrows its errors as domain errors. */
export const withPrismaErrors = async <T>(run: () => Promise<T>, context?: PrismaErrorContext): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw translatePrismaError(error, context);
  }
};

export const toEpochMs = (value: Date | null | undefined): number | undefined =>
  value ? value.getTime() : undefined;

export const fromEpochMs = (value: number | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(value);

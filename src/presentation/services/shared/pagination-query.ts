import { CustomError } from "../../../domain/errors/custom.error";

export interface PaginationDateQuery {
  page?: unknown;
  limit?: unknown;
  from?: unknown;
  to?: unknown;
}

export interface ParsedPaginationDateQuery {
  page: number;
  limit: number;
  from?: number;
  to?: number;
}

export interface PaginatedResult<TItemsKey extends string, TItem> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  [itemsKey: string]: number | TItem[];
}

export const parsePaginationDateQuery = (
  query: PaginationDateQuery,
): ParsedPaginationDateQuery => ({
  page: parsePositiveInteger(query.page, "page", 1, 1, 500),
  limit: parsePositiveInteger(query.limit, "limit", 20, 1, 100),
  from: parseDateOrMillis(query.from, "from", false),
  to: parseDateOrMillis(query.to, "to", true),
});

export const buildPaginatedResponse = <TItemsKey extends string, TItem>(
  itemsKey: TItemsKey,
  items: TItem[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<TItemsKey, TItem> => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  [itemsKey]: items,
});

export const paginateArray = <TItem>(
  items: TItem[],
  page: number,
  limit: number,
): TItem[] => items.slice((page - 1) * limit, page * limit);

const parsePositiveInteger = (
  value: unknown,
  field: string,
  fallback: number,
  min: number,
  max: number,
) => {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw CustomError.badRequest(
      `'${field}' debe ser un entero entre ${min} y ${max}`,
    );
  }

  return parsed;
};

const parseDateOrMillis = (
  value: unknown,
  field: string,
  endOfDay: boolean,
): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw CustomError.badRequest(
      `'${field}' debe ser epoch millis o fecha YYYY-MM-DD`,
    );
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    const timestamp = Date.parse(`${trimmed}${suffix}`);
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  throw CustomError.badRequest(
    `'${field}' debe ser epoch millis o fecha YYYY-MM-DD`,
  );
};

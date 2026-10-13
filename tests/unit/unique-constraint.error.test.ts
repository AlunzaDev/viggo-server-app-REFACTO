import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { CustomError } from "../../src/domain/errors/custom.error";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";
import { isUuid, translatePrismaError } from "../../src/infrastructure/datasources/postgres/prisma-errors";

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("db error", { code, clientVersion: "test", meta });

describe("translatePrismaError", () => {
  it("maps a unique violation reported by the pg driver adapter to its column", () => {
    // Shape Prisma 7 + @prisma/adapter-pg actually produces (only the index name).
    const error = translatePrismaError(
      prismaError("P2002", {
        modelName: "Usuario",
        driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "usuarios_correo_key" }, table: "usuarios" } },
      }),
    );
    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect((error as UniqueConstraintError).fields).toEqual(["correo"]);
  });

  it("uses meta.target when Prisma provides it", () => {
    const error = translatePrismaError(prismaError("P2002", { target: ["app", "nombre"] }));
    expect((error as UniqueConstraintError).fields).toEqual(["app", "nombre"]);
  });

  it("maps a foreign key violation to the given error, 409 by default", () => {
    const custom = CustomError.badRequest("referencia invalida");
    expect(translatePrismaError(prismaError("P2003"), { foreignKey: custom })).toBe(custom);
    expect((translatePrismaError(prismaError("P2003")) as CustomError).statusCode).toBe(409);
  });

  it("leaves other errors untouched", () => {
    const other = prismaError("P2025");
    expect(translatePrismaError(other)).toBe(other);
    const plain = new Error("boom");
    expect(translatePrismaError(plain)).toBe(plain);
  });
});

describe("UniqueConstraintError in the API", () => {
  it("becomes a DUPLICATE_KEY bad request", () => {
    const apiError = CustomError.fromUnknown(new UniqueConstraintError(["correo"], { correo: "a@x.com" }));
    expect(apiError.statusCode).toBe(400);
    expect(apiError.code).toBe("DUPLICATE_KEY");
    expect(apiError.details).toEqual({ fields: ["correo"], values: { correo: "a@x.com" } });
  });
});

describe("isUuid", () => {
  it("accepts UUIDs and rejects Mongo ObjectIds and garbage", () => {
    expect(isUuid("0199f1e2-7c3a-7b4e-9d2f-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("64b7f0c2e4b0a1a2b3c4d5e6")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

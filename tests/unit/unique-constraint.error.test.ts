import { describe, expect, it } from "vitest";
import { CustomError } from "../../src/domain/errors/custom.error";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";

describe("UniqueConstraintError", () => {
  it("maps a Mongo duplicate key error", () => {
    const error = UniqueConstraintError.fromMongo({
      code: 11000,
      keyPattern: { idempotencyKey: 1 },
      keyValue: { idempotencyKey: "k-1" },
    });
    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect(error?.fields).toEqual(["idempotencyKey"]);
    expect(error?.values).toEqual({ idempotencyKey: "k-1" });
  });

  it("ignores other errors", () => {
    expect(UniqueConstraintError.fromMongo(new Error("boom"))).toBeNull();
    expect(UniqueConstraintError.fromMongo({ code: 121 })).toBeNull();
    expect(UniqueConstraintError.fromMongo(undefined)).toBeNull();
  });

  it("becomes a DUPLICATE_KEY bad request in the API", () => {
    const apiError = CustomError.fromUnknown(new UniqueConstraintError(["correo"], { correo: "a@x.com" }));
    expect(apiError.statusCode).toBe(400);
    expect(apiError.code).toBe("DUPLICATE_KEY");
    expect(apiError.details).toEqual({ fields: ["correo"], values: { correo: "a@x.com" } });
  });

  it("keeps handling raw Mongo duplicate key errors the same way", () => {
    const apiError = CustomError.fromUnknown({ code: 11000, keyValue: { telefono: "1" } });
    expect(apiError.code).toBe("DUPLICATE_KEY");
    expect(apiError.details).toEqual({ fields: ["telefono"], values: { telefono: "1" } });
  });
});

import { UniqueConstraintError } from "./unique-constraint.error";

export class CustomError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly message: string,
        public readonly code: string = "INTERNAL_ERROR",
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "CustomError";
    }

    static badRequest(message: string, details?: unknown, code = "BAD_REQUEST") {
        return new CustomError(400, message, code, details);
    }

    static unauthorized(message: string, details?: unknown, code = "UNAUTHORIZED") {
        return new CustomError(401, message, code, details);
    }

    static forbidden(message: string, details?: unknown, code = "FORBIDDEN") {
        return new CustomError(403, message, code, details);
    }

    static notFound(message: string, details?: unknown, code = "NOT_FOUND") {
        return new CustomError(404, message, code, details);
    }

    static conflict(message: string, details?: unknown, code = "CONFLICT") {
        return new CustomError(409, message, code, details);
    }

    static internalServer(message: string, details?: unknown, code = "INTERNAL_ERROR") {
        return new CustomError(500, message, code, details);
    }

    static fromUnknown(error: unknown, fallbackMessage = "Ocurrio un error inesperado"): CustomError {
        if (error instanceof CustomError) return error;

        if (error && typeof error === "object") {
            const candidate = error as Record<string, any>;

            if (error instanceof UniqueConstraintError) {
                const duplicateFields = error.fields;
                const duplicateValues = error.values;
                const fieldLabel = duplicateFields.join(", ") || "el valor";

                return CustomError.badRequest(
                    `Ya existe un registro con ${fieldLabel}`,
                    {
                        fields: duplicateFields,
                        values: duplicateValues,
                    },
                    "DUPLICATE_KEY",
                );
            }

            if (candidate.name === "TokenExpiredError") {
                return CustomError.unauthorized(
                    "El token ha expirado",
                    undefined,
                    "TOKEN_EXPIRED",
                );
            }

            if (candidate.name === "JsonWebTokenError") {
                return CustomError.unauthorized(
                    "El token no es válido",
                    undefined,
                    "INVALID_TOKEN",
                );
            }
        }

        if (error instanceof Error) {
            return CustomError.internalServer(
                fallbackMessage,
                { reason: error.message },
                "UNHANDLED_ERROR",
            );
        }

        return CustomError.internalServer(fallbackMessage);
    }
}

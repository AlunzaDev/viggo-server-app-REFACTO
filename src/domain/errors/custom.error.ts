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

    static internalServer(message: string, details?: unknown, code = "INTERNAL_ERROR") {
        return new CustomError(500, message, code, details);
    }

    static fromUnknown(error: unknown, fallbackMessage = "Ocurrio un error inesperado"): CustomError {
        if (error instanceof CustomError) return error;

        if (error && typeof error === "object") {
            const candidate = error as Record<string, any>;

            if (candidate.name === "ValidationError" && candidate.errors) {
                const details = Object.values(candidate.errors).map((item: any) => ({
                    field: item.path,
                    message: item.message,
                    value: item.value,
                }));

                return CustomError.badRequest(
                    "Hay datos inválidos en la solicitud",
                    details,
                    "VALIDATION_ERROR",
                );
            }

            if (candidate.name === "CastError") {
                return CustomError.badRequest(
                    `El valor enviado para '${candidate.path}' no es válido`,
                    {
                        field: candidate.path,
                        value: candidate.value,
                        expectedType: candidate.kind,
                    },
                    "INVALID_VALUE",
                );
            }

            if (candidate.code === 11000) {
                const duplicateFields = Object.keys(candidate.keyPattern ?? candidate.keyValue ?? {});
                const duplicateValues = candidate.keyValue ?? {};
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

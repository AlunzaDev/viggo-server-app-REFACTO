// Raised by datasources when a write violates a unique index, so callers do not
// depend on database-specific error codes (Mongo 11000, Prisma P2002, ...).
export class UniqueConstraintError extends Error {
    constructor(
        public readonly fields: string[] = [],
        public readonly values: Record<string, unknown> = {},
    ) {
        super("Unique constraint violation");
        this.name = "UniqueConstraintError";
    }

    static fromMongo(error: unknown): UniqueConstraintError | null {
        const candidate = error as {
            code?: number;
            keyPattern?: Record<string, unknown>;
            keyValue?: Record<string, unknown>;
        };
        if (candidate?.code !== 11000) return null;
        return new UniqueConstraintError(
            Object.keys(candidate.keyPattern ?? candidate.keyValue ?? {}),
            candidate.keyValue ?? {},
        );
    }
}

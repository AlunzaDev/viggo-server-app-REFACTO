// Raised by datasources when a write violates a unique index, so callers do not
// depend on database-specific error codes (Prisma P2002).
export class UniqueConstraintError extends Error {
    constructor(
        public readonly fields: string[] = [],
        public readonly values: Record<string, unknown> = {},
    ) {
        super("Unique constraint violation");
        this.name = "UniqueConstraintError";
    }
}

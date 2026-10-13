import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

export interface PostgresConnectionOptions {
  databaseUrl: string;
  /** Max connections per API instance. Keep (instances x poolMax) under Postgres max_connections. */
  poolMax?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface PostgresHealthSnapshot {
  status: "ok" | "down";
  latencyMs: number | null;
  database: string | null;
  host: string | null;
  error?: string;
}

const describeUrl = (databaseUrl: string) => {
  try {
    const url = new URL(databaseUrl);
    return { database: url.pathname.replace(/^\//, "") || null, host: url.hostname || null };
  } catch {
    return { database: null, host: null };
  }
};

export class PostgresDatabase {
  private static prisma: PrismaClient | null = null;
  private static databaseUrl = "";

  static get client(): PrismaClient {
    if (!this.prisma) {
      throw new Error("PostgresDatabase.connect() must be called before using the client.");
    }
    return this.prisma;
  }

  static async connect(options: PostgresConnectionOptions): Promise<PrismaClient> {
    if (this.prisma) return this.prisma;

    const adapter = new PrismaPg({
      connectionString: options.databaseUrl,
      max: options.poolMax ?? 10,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
      idleTimeoutMillis: options.idleTimeoutMs ?? 30_000,
    });
    const prisma = new PrismaClient({ adapter });

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      await prisma.$disconnect().catch(() => undefined);
      throw error;
    }

    this.prisma = prisma;
    this.databaseUrl = options.databaseUrl;
    console.log("Postgres connected");
    return prisma;
  }

  static async disconnect(): Promise<void> {
    if (!this.prisma) return;
    const prisma = this.prisma;
    this.prisma = null;
    await prisma.$disconnect();
  }

  static async getHealthSnapshot(): Promise<PostgresHealthSnapshot> {
    const target = describeUrl(this.databaseUrl);
    if (!this.prisma) {
      return { status: "down", latencyMs: null, ...target, error: "not connected" };
    }

    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", latencyMs: Date.now() - startedAt, ...target };
    } catch (error) {
      // Keep the public health payload short; the full error goes to the logs.
      console.error("[POSTGRES] Health check failed", error);
      return { status: "down", latencyMs: null, ...target, error: "query failed" };
    }
  }
}

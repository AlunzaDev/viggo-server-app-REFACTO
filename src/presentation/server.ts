import { OperationalInboxScheduler } from "./services/sync/operational-inbox.scheduler";
import { HourlyTotalsScheduler } from "./services/statistics/hourly-totals.scheduler";
import { buildDataRetentionJob, buildInstallationPresenceMonitor } from "./dependencies/system.dependencies";
import { buildHourlyTotalsStore } from "./dependencies/repositories.dependencies";
import { ExternalPaymentWorker } from "./services/payments/external-payment.worker";
import { buildExternalPaymentService } from "./dependencies/external-payments.dependencies";
import cors, { CorsOptions } from "cors";
import express, { Router } from "express";
import type { Server as HttpServer } from "node:http";
import { envs } from "../config/plugins/envs.plugin";
import { PostgresDatabase } from "../data/postgres";
import { requestLoggingMiddleware } from "./middlewares/request-logging.middleware";
import { buildFinancialReconciliationService } from "./dependencies";
import { buildJobLockRepository, buildMobileOperationRepository } from "./dependencies/repositories.dependencies";
import { INSTANCE_ID } from "./services/system/instance-id";

interface ServerOptions {
  host?: string;
  port: number;
  publicPath?: string;
  routes: Router;
}

const isDevelopmentLoopbackOrigin = (origin: string): boolean => {
  if (envs.PROD) return false;

  try {
    const { protocol, hostname } = new URL(origin);
    return (
      (protocol === "http:" || protocol === "https:") &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    );
  } catch {
    return false;
  }
};

export class Server {
  private readonly app = express();
  private readonly host: string;
  private readonly port: number;
  private readonly publicPath: string;
  private readonly routes: Router;
  private httpServer?: HttpServer;
  private shuttingDown = false;
  private readonly inbox = new OperationalInboxScheduler();
  private readonly statistics = new HourlyTotalsScheduler(buildHourlyTotalsStore());
  private readonly installationPresence = buildInstallationPresenceMonitor();
  private readonly dataRetention = buildDataRetentionJob();
  private readonly externalPayments = new ExternalPaymentWorker(buildExternalPaymentService());

  constructor({ host = "0.0.0.0", port, publicPath = "public", routes }: ServerOptions) {
    this.host = host;
    this.port = port;
    this.publicPath = publicPath;
    this.routes = routes;
  }

  async start(): Promise<void> {
    await PostgresDatabase.connect({
      databaseUrl: envs.DATABASE_URL,
      poolMax: envs.DATABASE_POOL_MAX,
    });
    await this.recoverMobileOperations();

    const corsOptions: CorsOptions = {
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (envs.CORS_ALLOWED_ORIGINS.length === 0) {
          return callback(null, !envs.PROD);
        }
        return callback(
          null,
          envs.CORS_ALLOWED_ORIGINS.includes(origin) ||
            isDevelopmentLoopbackOrigin(origin),
        );
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "X-Viggo-Installation-Id",
        "X-Idempotency-Key",
        "Idempotency-Key",
      ],
    };

    this.app.disable("x-powered-by");
    this.app.set("trust proxy", envs.TRUST_PROXY);
    this.app.use(cors(corsOptions));
    this.app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
    this.app.use(express.json({ limit: "2mb" }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(this.publicPath));
    this.app.use(requestLoggingMiddleware);
    this.app.use(this.routes);

    this.app.use((_req, res) => {
      res.status(404).json({ error: "Ruta no encontrada" });
    });

    this.httpServer = this.app.listen(this.port, this.host, () => {
      console.log(`[ADMINISTRATIVO] Server running on ${this.host}:${this.port}`);
    });

    buildFinancialReconciliationService().start();
    this.externalPayments.start();
    this.inbox.start();
    this.statistics.start();
    this.installationPresence.start();
    this.dataRetention.start();

    process.once("SIGTERM", () => void this.shutdown("SIGTERM"));
    process.once("SIGINT", () => void this.shutdown("SIGINT"));
  }

  /** Stops accepting requests, lets in-flight ones finish, then closes the database pools. */
  private async shutdown(signal: string): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    console.log(`[ADMINISTRATIVO] ${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
      console.error("[ADMINISTRATIVO] Shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await new Promise<void>((resolve) => {
        if (!this.httpServer) return resolve();
        this.httpServer.close(() => resolve());
        this.httpServer.closeIdleConnections();
      });
      await this.inbox.stop();
      await this.statistics.stop();
      await this.installationPresence.stop();
      await this.dataRetention.stop();
      await this.externalPayments.stop();
      await PostgresDatabase.disconnect();
      process.exit(0);
    } catch (error) {
      console.error("[ADMINISTRATIVO] Error during shutdown", error);
      process.exit(1);
    }
  }

  private async recoverMobileOperations(): Promise<void> {
    // If several instances start together, one recovery is enough.
    const locks = buildJobLockRepository();
    if (!(await locks.tryAcquire("mobile-operations-recovery", INSTANCE_ID, 60_000))) return;
    try {
      const operations = buildMobileOperationRepository();
      const now = Date.now();
      await operations.backfillRetryPolicy();
      await operations.recoverStaleProcessing(now, now - 60_000);
    } finally {
      await locks.release("mobile-operations-recovery", INSTANCE_ID);
    }
  }
}

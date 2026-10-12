import cors, { CorsOptions } from "cors";
import express, { Router } from "express";
import { envs } from "../config/plugins/envs.plugin";
import { MobileOperationModel, MongoDatabase } from "../data/mongo";
import { requestLoggingMiddleware } from "./middlewares/request-logging.middleware";
import { FinancialReconciliationService } from "./services/payments/financial-reconciliation.service";

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

  constructor({ host = "0.0.0.0", port, publicPath = "public", routes }: ServerOptions) {
    this.host = host;
    this.port = port;
    this.publicPath = publicPath;
    this.routes = routes;
  }

  async start(): Promise<void> {
    await MongoDatabase.connect({
      mongoUrl: envs.MONGO_URL,
      dbName: envs.MONGO_DB_NAME,
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

    this.app.listen(this.port, this.host, () => {
      console.log(`[ADMINISTRATIVO] Server running on ${this.host}:${this.port}`);
    });

    new FinancialReconciliationService().start();
  }

  private async recoverMobileOperations(): Promise<void> {
    const now = Date.now();
    const staleBefore = now - 60_000;
    await MobileOperationModel.updateMany(
      { maxAttempts: { $exists: false } },
      [
        {
          $set: {
            maxAttempts: {
              $cond: [{ $eq: ["$type", "APPLY_TICKET_PAYMENT"] }, 12, 3],
            },
            nextRetryAt: { $ifNull: ["$nextRetryAt", "$createdAt"] },
          },
        },
      ],
    );
    await MobileOperationModel.updateMany(
      {
        status: "processing",
        $or: [
          { processingDeadlineAt: { $lte: now } },
          { claimedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          status: "pending",
          error: "Operacion recuperada al reiniciar Admin API",
          nextRetryAt: now,
          processingDeadlineAt: undefined,
          updatedAt: now,
        },
      },
    );
  }
}

import type { Request, Response, NextFunction } from "express";
import { CsvRequestLogWriter } from "../../infrastructure/logging/csv-request-log.writer";

const LOGGABLE_ENDPOINTS = new Set([
  "/api/consultaBoletoRequest",
  "/api/notiBoletoPagadoRequest",
  "/api/boletos/consultaBoletoRequest",
  "/api/boletos/notiBoletoPagadoRequest",
]);

const getTdaFromRequest = (req: Request): string => {
  if (req.originalUrl === "/api/consultaBoletoRequest") {
    const payload = req.body as { consultaBoletoRequest?: { tda?: unknown } };
    return typeof payload.consultaBoletoRequest?.tda === "string"
      ? payload.consultaBoletoRequest.tda
      : "0";
  }

  const payload = req.body as {
    notiBoletoPagadoRequest?: { tda?: unknown };
    consultaBoletoRequest?: { tda?: unknown };
  };

  const tda =
    payload.notiBoletoPagadoRequest?.tda ?? payload.consultaBoletoRequest?.tda;

  return typeof tda === "string" ? tda : "0";
};

export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!LOGGABLE_ENDPOINTS.has(req.originalUrl)) {
    return next();
  }

  const start = process.hrtime();
  const logWriter = CsvRequestLogWriter.getInstance();

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const responseTimeMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(3);
    const timestamp = Date.now();
    const tda = getTdaFromRequest(req);

    logWriter.append(
      `${req.originalUrl},${timestamp},${tda},${responseTimeMs},${res.statusCode}\n`,
    );
  });

  next();
};

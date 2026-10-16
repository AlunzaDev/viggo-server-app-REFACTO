import type { ExternalPaymentProvider, ExternalQuote } from "../../domain/external-payments/external-payment";
import { CustomError } from "../../domain/errors/custom.error";

type Confirmation = Parameters<ExternalPaymentProvider["confirmPayment"]>[0];
/** Implement this codec from the supplier's actual documentation, not guessed endpoints/QRs. */
export interface SeguripassProtocol {
  quoteRequest(qr: string): { path: string; body: unknown };
  readQuote(body: unknown): ExternalQuote;
  confirmationRequest(input: Confirmation): { path: string; body: unknown };
  readConfirmation(body: unknown): { confirmationReference: string };
}

export interface SeguripassConnection {
  baseUrl: string;
  headers: Record<string, string>;
  protocol: SeguripassProtocol;
  /** Only for a local fake HTTP server in tests. Real connections require HTTPS. */
  allowLocalHttp?: boolean;
  timeoutMs?: number;
}

export class SeguripassClient implements ExternalPaymentProvider {
  readonly code = "seguripass";
  constructor(private readonly connection?: SeguripassConnection) {
    if (connection) {
      const url = new URL(connection.baseUrl);
      if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== "https:" && !(connection.allowLocalHttp && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
        throw new Error("SeguriPass requires a trusted HTTPS base URL");
      }
    }
  }

  async resolveOrder(qr: string) {
    const config = this.config();
    const request = config.protocol.quoteRequest(qr);
    // Read-only quotation can be retried; confirmation retries belong to the durable worker.
    for (let attempt = 0; ; attempt++) {
      try { return this.parse(config.protocol.readQuote.bind(config.protocol), await this.post(request)); }
      catch (error) {
        if (attempt >= 2 || !(error instanceof CustomError) || error.code !== "EXTERNAL_PROVIDER_UNAVAILABLE") throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }

  async confirmPayment(input: Confirmation) {
    const config = this.config();
    return this.parse(config.protocol.readConfirmation.bind(config.protocol), await this.post(config.protocol.confirmationRequest(input), input.idempotencyKey));
  }

  private config() {
    if (!this.connection) throw new CustomError(503,
      "SeguriPass pendiente de contrato de API y credenciales", "EXTERNAL_PROVIDER_NOT_CONFIGURED");
    return this.connection;
  }

  private parse<T>(read: (value: unknown) => T, value: unknown): T {
    try { return read(value); }
    catch { throw new CustomError(502, "Respuesta invalida del proveedor", "INVALID_EXTERNAL_RESPONSE"); }
  }

  private async post(request: { path: string; body: unknown }, idempotencyKey?: string): Promise<unknown> {
    const config = this.config();
    const base = new URL(config.baseUrl);
    const url = new URL(request.path, base);
    if (url.origin !== base.origin || url.username || url.password) throw new Error("Invalid SeguriPass endpoint");
    try {
      const response = await fetch(url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(config.timeoutMs ?? 8000),
        headers: { ...config.headers, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
        body: JSON.stringify(request.body),
      });
      if (response.status === 404 || response.status === 410) throw CustomError.conflict("Ticket externo inexistente o expirado");
      if (response.status === 429 || response.status >= 500) throw new CustomError(503, "Proveedor externo no disponible", "EXTERNAL_PROVIDER_UNAVAILABLE");
      if (!response.ok) throw new CustomError(502, "Solicitud rechazada por el proveedor", "EXTERNAL_PROVIDER_REJECTED");
      try { return await response.json(); }
      catch { throw new CustomError(502, "Respuesta invalida del proveedor", "INVALID_EXTERNAL_RESPONSE"); }
    } catch (error) {
      if (error instanceof CustomError) throw error;
      throw new CustomError(503, "Proveedor externo no disponible", "EXTERNAL_PROVIDER_UNAVAILABLE");
    }
  }
}

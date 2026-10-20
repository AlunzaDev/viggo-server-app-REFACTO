import { envs } from "../../../config";
import {
  validatePaymentProviderConfig,
  type PaymentProviderEntity,
  type PaymentProviderInput,
} from "../../../domain/entities/parking/payment-provider.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import type { ExternalProviderDirectory, ExternalQuote } from "../../../domain/external-payments/external-payment";
import { invalidQuoteReason } from "../../../domain/external-payments/external-payment.service";
import { PaymentProviderRepository } from "../../../domain/repositories/parking/payment-provider.repository";

/** Fields that define how Viggo talks to the provider: changing one requires a new test. */
const CONNECTION_FIELDS = ["integration", "adapter", "baseUrl", "credential", "authHeader", "apiMapping"] as const;

/** JSON with sorted keys: Postgres JSONB does not keep the order the mapping was sent in. */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : item);

export type ProviderConnectionTest =
  | { ok: true; quote: Omit<ExternalQuote, "expiresAt"> & { expiresAt: string }; warnings: string[]; durationMs: number }
  | { ok: false; error: string; code?: string; durationMs: number };

export class PaymentProviderService {
  constructor(
    private readonly repository: PaymentProviderRepository,
    private readonly directory?: ExternalProviderDirectory,
    // Plain http to this machine is only for trying the reference provider outside production.
    private readonly allowLocalHttp = !envs.PROD,
    private readonly now = Date.now,
  ) {}

  getAll() { return this.repository.getAll(); }

  /** An external provider is born inactive: it is activated after a successful connection test. */
  async create(data: PaymentProviderInput) {
    this.validate({ ...data, hasCredential: Boolean(data.credential) });
    return this.repository.create({ ...data, active: data.integration === "viggo" ? data.active : false });
  }

  async update(id: string, data: Partial<PaymentProviderInput>) {
    const current = await this.repository.findById(id);
    if (!current) throw CustomError.notFound("Proveedor no encontrado");
    const merged = { ...this.toInput(current), ...data };
    // The configuration is valid as a whole, e.g. switching to "standard" needs a URL and a credential.
    this.validate({ ...merged, hasCredential: current.hasCredential || Boolean(data.credential) });

    const connectionChanged = CONNECTION_FIELDS.some((field) =>
      data[field] !== undefined && (field === "credential" || canonical(data[field] ?? null) !== canonical(current[field] ?? null)));
    const verified = Boolean(current.verifiedAt) && !connectionChanged;
    if (merged.integration !== "viggo" && merged.active && !verified) {
      // An untested connection never charges: a changed one is deactivated until tested again.
      if (data.active && !current.active) {
        throw CustomError.conflict("Prueba la conexion del proveedor antes de activarlo", undefined, "PROVIDER_NOT_VERIFIED");
      }
      data = { ...data, active: false };
    }
    const result = await this.repository.update(id, data);
    if (!result) throw CustomError.notFound("Proveedor no encontrado");
    return connectionChanged && current.verifiedAt ? (await this.repository.setVerifiedAt(id, null)) ?? result : result;
  }

  /**
   * Quotes a test ticket against the provider's API and returns what Viggo understood, without
   * creating orders. A usable answer marks the connection as tested.
   */
  async testConnection(id: string, body: Record<string, unknown>): Promise<ProviderConnectionTest> {
    const qr = typeof body.qr === "string" ? body.qr.trim() : "";
    const parkingId = typeof body.parkingId === "string" ? body.parkingId.trim() : "";
    if (!qr || qr.length > 4096) throw CustomError.badRequest("Indica el QR de un ticket de prueba");
    if (!parkingId || parkingId.length > 256) throw CustomError.badRequest("Indica el ID del estacionamiento en el proveedor");
    if (!this.directory) throw new CustomError(503, "Prueba de conexion no disponible", "PROVIDER_TEST_UNAVAILABLE");
    if (!(await this.repository.findById(id))) throw CustomError.notFound("Proveedor no encontrado");

    const started = this.now();
    try {
      const provider = await this.directory.forProvider(id, { includeInactive: true });
      const quote = await provider.resolveOrder(qr, parkingId);
      const durationMs = this.now() - started;
      const invalid = invalidQuoteReason(quote);
      if (invalid) return { ok: false, error: `Viggo no podria cobrar este ticket: ${invalid}`, code: "INVALID_EXTERNAL_QUOTE", durationMs };

      const warnings: string[] = [];
      if (quote.status !== "payable") warnings.push(`El ticket esta ${quote.status === "paid" ? "pagado" : "expirado"}: la conexion funciona, pero no se podria cobrar.`);
      else if (quote.expiresAt <= this.now()) warnings.push("La vigencia ya paso: revisa el formato de la vigencia.");
      await this.repository.setVerifiedAt(id, new Date(this.now()));
      return { ok: true, quote: { ...quote, expiresAt: new Date(quote.expiresAt).toISOString() }, warnings, durationMs };
    } catch (error) {
      if (!(error instanceof CustomError)) throw error;
      return { ok: false, error: error.message, code: error.code, durationMs: this.now() - started };
    }
  }

  async delete(id: string) {
    const result = await this.repository.delete(id);
    if (!result) throw CustomError.notFound("Proveedor no encontrado");
    return result;
  }

  private toInput(provider: PaymentProviderEntity): PaymentProviderInput {
    const { nombre, integration, adapter, baseUrl, active, timeoutMs, authHeader, apiMapping } = provider;
    return { nombre, integration, adapter, baseUrl, active, timeoutMs, authHeader, apiMapping };
  }

  private validate(config: PaymentProviderInput & { hasCredential: boolean }) {
    const error = validatePaymentProviderConfig(config, { allowLocalHttp: this.allowLocalHttp });
    if (error) throw CustomError.badRequest(error);
  }
}

import { envs } from "../../config";
import { PostgresDatabase } from "../../data/postgres";
import type { PaymentProvider as ProviderRow } from "../../generated/prisma/client";
import type { ProviderApiMapping } from "../../domain/entities/parking/provider-api-mapping";
import { CustomError } from "../../domain/errors/custom.error";
import {
  ExternalProviderDirectory,
  type ExternalPaymentProvider,
  type ProjectPaymentProvider,
} from "../../domain/external-payments/external-payment";
import { decryptInstallationLinkToken } from "../../config/plugins/installation-link-token-crypto.plugin";
import { isUuid } from "../datasources/postgres/prisma-errors";
import { HttpProviderClient, type ProviderProtocol } from "./http-provider.client";
import { mappedProviderProtocol } from "./mapped-provider.protocol";
import { standardProviderProtocol } from "./standard-provider.protocol";

/**
 * Coded protocols for what a mapping cannot express (signatures, OAuth, XML), by the name in
 * `adapter`. Each one must also be listed in PAYMENT_PROVIDER_EXTENSIONS. None yet.
 */
const EXTENSIONS: Record<string, (mapping: ProviderApiMapping | null) => ProviderProtocol> = {};

/** Integrations built from the payment provider catalog (configuration read on each call). */
export class PostgresExternalProviderDirectory extends ExternalProviderDirectory {
  constructor(
    // Plain http to this machine only outside production (the reference provider).
    private readonly allowLocalHttp = !envs.PROD,
  ) {
    super();
  }

  private get db() { return PostgresDatabase.client; }

  async forProject(proyectoId: string): Promise<ProjectPaymentProvider> {
    const project = isUuid(proyectoId)
      ? await this.db.proyecto.findUnique({
          where: { id: proyectoId },
          select: { estado: true, externalParkingId: true, paymentProviderRelation: true },
        })
      : null;
    if (!project?.estado) throw CustomError.notFound("Estacionamiento no encontrado");

    const provider = project.paymentProviderRelation;
    if (!provider) {
      throw CustomError.conflict("El estacionamiento no tiene proveedor de pago", undefined, "PARKING_WITHOUT_PROVIDER");
    }
    if (provider.integration === "viggo") {
      // Viggo's own parkings charge through the ticket flow (OPERATIVO), not external orders.
      throw CustomError.conflict("Este estacionamiento cobra con tickets de Viggo", undefined, "VIGGO_TICKET_FLOW");
    }
    const parkingId = project.externalParkingId.trim();
    if (!parkingId) {
      throw CustomError.conflict("Falta el ID del estacionamiento en el proveedor", undefined, "PARKING_WITHOUT_EXTERNAL_ID");
    }
    return { providerId: provider.id, parkingId, provider: this.client(provider) };
  }

  async forProvider(providerId: string, options: { includeInactive?: boolean } = {}): Promise<ExternalPaymentProvider> {
    const provider = isUuid(providerId) ? await this.db.paymentProvider.findUnique({ where: { id: providerId } }) : null;
    if (!provider) throw CustomError.notFound("Proveedor de pago no encontrado");
    if (provider.integration === "viggo") throw CustomError.conflict("Este proveedor cobra con tickets de Viggo", undefined, "VIGGO_TICKET_FLOW");
    return this.client(provider, options.includeInactive);
  }

  private client(provider: ProviderRow, includeInactive = false): ExternalPaymentProvider {
    if (!provider.active && !includeInactive) throw new CustomError(503, "El proveedor de pago esta inactivo", "PROVIDER_INACTIVE");
    const credential = decryptInstallationLinkToken(provider.credentialEncrypted);
    const connection = {
      baseUrl: provider.baseUrl,
      // Bearer by default; some APIs want the key in their own header (X-API-Key, Basic...).
      headers: provider.authHeader ? { [provider.authHeader]: credential } : { Authorization: `Bearer ${credential}` },
      timeoutMs: provider.timeoutMs,
      allowLocalHttp: this.allowLocalHttp,
    };
    if (provider.integration === "standard") {
      return new HttpProviderClient(provider.id, { ...connection, protocol: standardProviderProtocol });
    }
    if (provider.integration === "adapter") {
      const mapping = provider.apiMapping as ProviderApiMapping | null;
      const extension = provider.adapter ? EXTENSIONS[provider.adapter] : undefined;
      if (extension) return new HttpProviderClient(provider.id, { ...connection, protocol: extension(mapping) });
      if (!provider.adapter && mapping) return new HttpProviderClient(provider.id, { ...connection, protocol: mappedProviderProtocol(mapping) });
      return new HttpProviderClient(provider.id, undefined, "El proveedor no tiene configurado el mapeo de su API");
    }
    throw new CustomError(503, "La integracion del proveedor no esta disponible", "PROVIDER_INTEGRATION_UNAVAILABLE");
  }
}

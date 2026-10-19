import { envs } from "../../config";
import { PostgresDatabase } from "../../data/postgres";
import type { PaymentProvider as ProviderRow } from "../../generated/prisma/client";
import { CustomError } from "../../domain/errors/custom.error";
import {
  ExternalProviderDirectory,
  type ExternalPaymentProvider,
  type ProjectPaymentProvider,
} from "../../domain/external-payments/external-payment";
import { decryptInstallationLinkToken } from "../../presentation/utils/installation-link-token-crypto.util";
import { isUuid } from "../datasources/postgres/prisma-errors";
import { HttpProviderClient } from "./http-provider.client";
import { SeguripassClient } from "./seguripass.client";
import { standardProviderProtocol } from "./standard-provider.protocol";

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

  async forProvider(providerId: string): Promise<ExternalPaymentProvider> {
    const provider = isUuid(providerId) ? await this.db.paymentProvider.findUnique({ where: { id: providerId } }) : null;
    if (!provider) throw CustomError.notFound("Proveedor de pago no encontrado");
    return this.client(provider);
  }

  private client(provider: ProviderRow): ExternalPaymentProvider {
    if (!provider.active) throw new CustomError(503, "El proveedor de pago esta inactivo", "PROVIDER_INACTIVE");
    const connection = {
      baseUrl: provider.baseUrl,
      headers: { Authorization: `Bearer ${decryptInstallationLinkToken(provider.credentialEncrypted)}` },
      timeoutMs: provider.timeoutMs,
      allowLocalHttp: this.allowLocalHttp,
    };
    if (provider.integration === "standard") {
      return new HttpProviderClient(provider.id, { ...connection, protocol: standardProviderProtocol });
    }
    if (provider.integration === "adapter" && provider.adapter === "seguripass") {
      // Its protocol depends on SeguriPass's actual API (#18); until then it is "not configured".
      return new SeguripassClient(undefined, provider.id);
    }
    throw new CustomError(503, "La integracion del proveedor no esta disponible", "PROVIDER_INTEGRATION_UNAVAILABLE");
  }
}

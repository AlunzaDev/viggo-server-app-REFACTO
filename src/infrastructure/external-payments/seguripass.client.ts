import { HttpProviderClient, type ProviderConnection, type ProviderProtocol } from "./http-provider.client";

/** Implement this codec from the supplier's actual documentation, not guessed endpoints/QRs. */
export type SeguripassProtocol = ProviderProtocol;
export type SeguripassConnection = ProviderConnection;

/**
 * Adapter for SeguriPass, only needed if it does not adopt the Viggo provider standard
 * (#18). Without a protocol it answers "not configured".
 */
export class SeguripassClient extends HttpProviderClient {
  constructor(connection?: SeguripassConnection, code = "seguripass") {
    super(code, connection, "SeguriPass pendiente de contrato de API y credenciales");
  }
}

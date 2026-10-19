/** Child-process harness: real repository/service, fake remote provider and Stripe HTTP ports. */
import { PostgresDatabase } from "../../src/data/postgres";
import { ExternalPaymentService } from "../../src/domain/external-payments/external-payment.service";
import type { ExternalIntent, ExternalPaymentGateway, ExternalPaymentProvider, ExternalProviderDirectory } from "../../src/domain/external-payments/external-payment";
import { ExternalOrderPostgresRepository } from "../../src/infrastructure/repositories/payments/external-order.repository.postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test database required");
  const remote = process.env.EXTERNAL_PROCESS_TEST_REMOTE!;
  if (new URL(remote).hostname !== "127.0.0.1") throw new Error("Local test remote required");
  const gateway: ExternalPaymentGateway = {
    create: async () => { throw new Error("A restart must never create another charge in these cases"); },
    retrieve: async id => {
      const response = await fetch(`${remote}/stripe/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Fake Stripe lookup failed");
      return await response.json() as ExternalIntent;
    },
    cancel: async () => { throw new Error("Unexpected cancellation"); },
  };
  const provider: ExternalPaymentProvider = {
    code: "seguripass",
    resolveOrder: async () => { throw new Error("Unexpected quotation"); },
    confirmPayment: async input => {
      const response = await fetch(`${remote}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error("Fake provider failed");
      const result = await response.json() as { confirmationReference: string };
      if (process.env.EXTERNAL_PROCESS_TEST_PAUSE === "1") {
        process.send?.({ state: "remote_confirmed_before_commit" });
        await new Promise<void>(() => {});
      }
      return result;
    },
  };
  await PostgresDatabase.connect({ databaseUrl: url, poolMax: 2 });
  try {
    const directory = {
      forProject: async () => { throw new Error("Unexpected quotation"); },
      forProvider: async () => provider,
    } as unknown as ExternalProviderDirectory;
    await new ExternalPaymentService(new ExternalOrderPostgresRepository(), directory, gateway).runOnce();
    process.send?.({ state: "finished" });
  } finally { await PostgresDatabase.disconnect(); }
}
main().catch(() => { process.send?.({ state: "failed" }); process.exitCode = 1; });

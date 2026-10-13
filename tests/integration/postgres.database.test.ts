import { afterAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";

const databaseUrl = process.env.DATABASE_URL!;

describe("PostgresDatabase", () => {
  afterAll(async () => {
    await PostgresDatabase.disconnect();
  });

  it("reports down before connecting", async () => {
    const health = await PostgresDatabase.getHealthSnapshot();
    expect(health.status).toBe("down");
    expect(() => PostgresDatabase.client).toThrow();
  });

  it("connects and runs queries", async () => {
    const client = await PostgresDatabase.connect({ databaseUrl, poolMax: 2 });
    const [row] = await client.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;
    expect(row.value).toBe(1);
    expect(PostgresDatabase.client).toBe(client);
  });

  it("returns the same client on repeated connect", async () => {
    const first = PostgresDatabase.client;
    const second = await PostgresDatabase.connect({ databaseUrl });
    expect(second).toBe(first);
  });

  it("reports ok with latency and target, without credentials", async () => {
    const health = await PostgresDatabase.getHealthSnapshot();
    expect(health.status).toBe("ok");
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.database).toMatch(/_test$/);
    expect(JSON.stringify(health)).not.toContain(new URL(databaseUrl).password);
  });

  it("rolls back interactive transactions on error and commits on success", async () => {
    const client = PostgresDatabase.client;
    await client.$executeRawUnsafe("DROP TABLE IF EXISTS tx_probe");
    await client.$executeRawUnsafe("CREATE TABLE tx_probe (id int PRIMARY KEY)");
    const countRows = async () =>
      (await client.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM tx_probe`)[0].count;

    await expect(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("INSERT INTO tx_probe (id) VALUES (1)");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await countRows()).toBe(0);

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("INSERT INTO tx_probe (id) VALUES (1)");
    });
    expect(await countRows()).toBe(1);

    await client.$executeRawUnsafe("DROP TABLE tx_probe");
  });

  it("reports down after disconnecting", async () => {
    await PostgresDatabase.disconnect();
    const health = await PostgresDatabase.getHealthSnapshot();
    expect(health.status).toBe("down");
  });

  it("rejects a connection to an unreachable server", async () => {
    await expect(
      PostgresDatabase.connect({
        databaseUrl: "postgresql://nobody:nothing@127.0.0.1:1/none_test",
        connectionTimeoutMs: 1_000,
      }),
    ).rejects.toThrow();
    expect(() => PostgresDatabase.client).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import type { RetentionTarget } from "../../src/domain/datasources/system/data-retention.datasource";
import { DataRetentionRepository } from "../../src/domain/repositories/system/data-retention.repository";
import { JobLockRepository } from "../../src/domain/repositories/system/job-lock.repository";
import { DataRetentionJob, retentionPlan } from "../../src/presentation/services/system/data-retention.job";

class Locks extends JobLockRepository {
  async tryAcquire() { return true; }
  async release() {}
}

class Retention extends DataRetentionRepository {
  calls: Array<{ target: RetentionTarget; scope: string | null | undefined }> = [];
  constructor(private readonly rows: number, private readonly onBatch: () => void = () => undefined) { super(); }
  async listProjectIds() { return ["p1", "p2"]; }
  async purgeBatch(target: RetentionTarget, _before: number, limit: number, scope?: string | null) {
    this.onBatch();
    this.calls.push({ target, scope });
    return Math.min(limit, this.rows);
  }
}

const days = { financial: 1825, operational: 1825, inbox: 30, mobileOperations: 90, incidents: 365, connectionEvents: 365, pushSubscriptions: 180 };

describe("retentionPlan", () => {
  it("skips the kinds set to 0 days", () => {
    const plan = retentionPlan({ ...days, financial: 0, inbox: 0 });
    expect(plan.map((rule) => rule.target)).not.toContain("payments");
    expect(plan.map((rule) => rule.target)).not.toContain("inbox_events");
    expect(plan.map((rule) => rule.target)).toContain("operational_tickets");
  });
});

describe("DataRetentionJob", () => {
  it("goes parking by parking for the big tables, and once for the rest", async () => {
    const retention = new Retention(0);
    await new DataRetentionJob(retention, new Locks(), retentionPlan(days)).runOnce();
    expect(retention.calls.filter((call) => call.target === "operational_tickets").map((call) => call.scope)).toEqual(["p1", "p2"]);
    expect(retention.calls.filter((call) => call.target === "external_payments").map((call) => call.scope)).toEqual(["p1", "p2", null]);
    expect(retention.calls.filter((call) => call.target === "payments").map((call) => call.scope)).toEqual([undefined]);
  });

  it("stops when the time budget runs out and says the run is not complete", async () => {
    let batches = 0;
    // Always a full batch: without the budget it would never end.
    const retention = new Retention(10, () => { batches += 1; });
    const run = await new DataRetentionJob(retention, new Locks(), retentionPlan(days), { batchSize: 10, budgetMs: 30 }).runOnce();
    expect(run?.complete).toBe(false);
    expect(batches).toBeGreaterThan(0);
  });
});

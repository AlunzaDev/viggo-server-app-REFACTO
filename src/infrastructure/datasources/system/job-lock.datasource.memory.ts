import { JobLockDatasource } from "../../../domain/datasources/system/job-lock.datasource";

/**
 * In-process lock used while the API runs on MongoDB with a single instance.
 * Not shared between instances; the Postgres lease replaces it at the cutover.
 */
export class JobLockMemoryDatasource extends JobLockDatasource {
  private readonly leases = new Map<string, { owner: string; expiresAt: number }>();

  async tryAcquire(name: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const current = this.leases.get(name);
    if (current && current.owner !== owner && current.expiresAt > now) return false;
    this.leases.set(name, { owner, expiresAt: now + ttlMs });
    return true;
  }

  async release(name: string, owner: string): Promise<void> {
    if (this.leases.get(name)?.owner === owner) this.leases.delete(name);
  }
}

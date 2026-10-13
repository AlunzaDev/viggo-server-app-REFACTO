/**
 * Cross-instance lock for background jobs (reconciliation worker, startup recovery).
 * A lock is a lease: it expires after ttlMs, so a crashed instance never blocks a job.
 */
export abstract class JobLockDatasource {
  /** True if this owner now holds the lock (or already held it). */
  abstract tryAcquire(name: string, owner: string, ttlMs: number): Promise<boolean>;
  /** Releases the lock if this owner holds it. */
  abstract release(name: string, owner: string): Promise<void>;
}

import { PostgresDatabase } from "../../../data/postgres";
import { JobLockDatasource } from "../../../domain/datasources/system/job-lock.datasource";

/**
 * Lease row per job instead of pg_advisory_lock: advisory locks belong to one connection,
 * and with a connection pool the acquire and the release may not run on the same one.
 */
export class JobLockPostgresDatasource extends JobLockDatasource {
  async tryAcquire(name: string, owner: string, ttlMs: number): Promise<boolean> {
    // Takes the lease if it is free, expired, or already ours; otherwise matches nothing.
    const rows = await PostgresDatabase.client.$queryRaw<Array<{ name: string }>>`
      INSERT INTO job_leases (name, owner, acquired_at, expires_at)
      VALUES (${name}, ${owner}, now(), now() + make_interval(secs => ${ttlMs / 1000}))
      ON CONFLICT (name) DO UPDATE
        SET owner = EXCLUDED.owner, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at
        WHERE job_leases.expires_at < now() OR job_leases.owner = EXCLUDED.owner
      RETURNING name`;
    return rows.length > 0;
  }

  async release(name: string, owner: string): Promise<void> {
    await PostgresDatabase.client.jobLease.deleteMany({ where: { name, owner } });
  }
}

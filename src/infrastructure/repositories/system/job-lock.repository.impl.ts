import type { JobLockDatasource } from "../../../domain/datasources/system/job-lock.datasource";
import { JobLockRepository } from "../../../domain/repositories/system/job-lock.repository";

export class JobLockRepositoryImpl implements JobLockRepository {
  constructor(private readonly datasource: JobLockDatasource) {}

  tryAcquire(name: string, owner: string, ttlMs: number) {
    return this.datasource.tryAcquire(name, owner, ttlMs);
  }

  release(name: string, owner: string) {
    return this.datasource.release(name, owner);
  }
}

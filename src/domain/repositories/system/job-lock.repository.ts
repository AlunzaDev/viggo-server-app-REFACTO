export abstract class JobLockRepository {
  abstract tryAcquire(name: string, owner: string, ttlMs: number): Promise<boolean>;
  abstract release(name: string, owner: string): Promise<void>;
}

import { getRedis } from './client';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire a distributed lock using Redis SET NX PX.
 * Returns the lock token (instanceId) on success, or null if already held.
 */
export async function acquireLock(key: string, ttlMs: number, instanceId: string): Promise<string | null> {
  const redis = getRedis();
  const result = await redis.set(key, instanceId, 'PX', ttlMs, 'NX');
  return result === 'OK' ? instanceId : null;
}

/**
 * Release a lock only if the caller is the owner.
 * Returns true if released, false if lock is not owned by this instance.
 */
export async function releaseLock(key: string, instanceId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.eval(RELEASE_SCRIPT, 1, key, instanceId);
  return result === 1;
}

import { createClient, RedisClientType } from 'redis';
import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL_MS = 10_000;
const RENEWAL_INTERVAL_MS = 5_000;

export interface LockHandle {
  key: string;
  token: string;
  stopRenewal: () => void;
}

export class DistributedLockService {
  private client: RedisClientType;
  private connected = false;

  constructor() {
    this.client = createClient({ url: REDIS_URL }) as RedisClientType;
    this.client.on('error', (err) => logger.error('DistributedLockService Redis error:', err));
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  /**
   * Acquire a distributed lock.
   * Returns a LockHandle on success, or null if the lock is already held.
   *
   * @param key      - Unique resource identifier
   * @param ttlMs    - Lock TTL in milliseconds (auto-expires to prevent deadlocks)
   * @param renewalMs - How often to renew the lock while held (0 = no renewal)
   */
  async acquire(
    key: string,
    ttlMs = DEFAULT_TTL_MS,
    renewalMs = RENEWAL_INTERVAL_MS
  ): Promise<LockHandle | null> {
    await this.ensureConnected();

    const token = randomUUID();
    const lockKey = `lock:${key}`;

    // SET key token NX PX ttl — atomic acquire
    const result = await this.client.set(lockKey, token, { NX: true, PX: ttlMs });
    if (result !== 'OK') {
      logger.debug(`Lock "${key}" already held, acquire failed`);
      return null;
    }

    logger.info(`Lock "${key}" acquired (token: ${token}, ttl: ${ttlMs}ms)`);

    let renewalTimer: NodeJS.Timeout | null = null;

    if (renewalMs > 0) {
      renewalTimer = setInterval(async () => {
        try {
          await this.renew(lockKey, token, ttlMs);
        } catch (err) {
          logger.error(`Lock renewal failed for "${key}":`, err);
        }
      }, renewalMs);
    }

    const stopRenewal = () => {
      if (renewalTimer) {
        clearInterval(renewalTimer);
        renewalTimer = null;
      }
    };

    return { key: lockKey, token, stopRenewal };
  }

  /**
   * Release a lock. Only the owner (matching token) can release it.
   */
  async release(handle: LockHandle): Promise<boolean> {
    await this.ensureConnected();
    handle.stopRenewal();

    // Lua script ensures atomic check-and-delete
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, { keys: [handle.key], arguments: [handle.token] });
    const released = result === 1;
    if (released) {
      logger.info(`Lock "${handle.key}" released`);
    } else {
      logger.warn(`Lock "${handle.key}" release failed — token mismatch or already expired`);
    }
    return released;
  }

  /**
   * Renew the TTL of a held lock (only if the token still matches).
   */
  private async renew(lockKey: string, token: string, ttlMs: number): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, {
      keys: [lockKey],
      arguments: [token, String(ttlMs)],
    });
    const renewed = result === 1;
    if (renewed) {
      logger.debug(`Lock "${lockKey}" renewed for ${ttlMs}ms`);
    } else {
      logger.warn(`Lock "${lockKey}" renewal failed — lock may have expired`);
    }
    return renewed;
  }

  /**
   * Convenience wrapper: acquire → run → release.
   * Throws if the lock cannot be acquired.
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<T> {
    const handle = await this.acquire(key, ttlMs);
    if (!handle) {
      throw new Error(`Could not acquire lock for "${key}" — resource is busy`);
    }
    try {
      return await fn();
    } finally {
      await this.release(handle);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }
}

export const distributedLockService = new DistributedLockService();

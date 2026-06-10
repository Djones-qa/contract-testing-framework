import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redisClient;
}

/**
 * Check if Redis is responsive within the given timeout (ms).
 * Returns true if PING succeeds within the timeout, false otherwise.
 */
export async function isRedisReady(timeoutMs: number = 5000): Promise<boolean> {
  const client = getRedisClient();
  try {
    const result = await Promise.race([
      client.ping(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs)
      ),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnect the Redis client.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

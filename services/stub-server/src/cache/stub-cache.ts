import { getRedisClient } from '../redis/client';

const STUB_CACHE_PREFIX = 'stub:config:';
const STUB_CACHE_TTL_SECONDS = 300; // 5 minutes

export interface StubCache {
  get(contractId: string): Promise<unknown | null>;
  set(contractId: string, contract: unknown): Promise<void>;
  invalidate(contractId: string): Promise<void>;
}

export function createStubCache(): StubCache {
  const redis = getRedisClient();

  return {
    async get(contractId: string): Promise<unknown | null> {
      const data = await redis.get(`${STUB_CACHE_PREFIX}${contractId}`);
      if (data === null) {
        return null;
      }
      return JSON.parse(data);
    },

    async set(contractId: string, contract: unknown): Promise<void> {
      const data = JSON.stringify(contract);
      await redis.set(
        `${STUB_CACHE_PREFIX}${contractId}`,
        data,
        'EX',
        STUB_CACHE_TTL_SECONDS
      );
    },

    async invalidate(contractId: string): Promise<void> {
      await redis.del(`${STUB_CACHE_PREFIX}${contractId}`);
    },
  };
}

/**
 * Deduplication filter for webhook events.
 * Uses Redis keys with TTL to detect duplicate contract-published events.
 */

import Redis from 'ioredis';

const DEDUP_KEY_PREFIX = 'webhook:processed:';
const DEDUP_TTL_SECONDS = 3600; // 1 hour

export interface DedupFilter {
  /** Returns true if the contract ID has already been processed (is a duplicate). */
  isDuplicate(contractId: string): Promise<boolean>;
  /** Marks a contract ID as processed. */
  markProcessed(contractId: string): Promise<void>;
}

export function createDedupFilter(redis: Redis): DedupFilter {
  return {
    async isDuplicate(contractId: string): Promise<boolean> {
      const key = `${DEDUP_KEY_PREFIX}${contractId}`;
      const exists = await redis.exists(key);
      return exists === 1;
    },

    async markProcessed(contractId: string): Promise<void> {
      const key = `${DEDUP_KEY_PREFIX}${contractId}`;
      await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS);
    },
  };
}

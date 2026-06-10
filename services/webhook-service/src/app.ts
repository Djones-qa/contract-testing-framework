/**
 * Webhook Service entry point.
 * Consumes contract-published events from Redis Stream and triggers
 * automatic provider verification via the Verification Runner.
 */

import Redis from 'ioredis';
import { createStreamConsumer, StreamConsumer } from './consumer/stream-consumer';
import { createVerificationTrigger } from './consumer/verification-trigger';
import { createDedupFilter } from './dedup/dedup-filter';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const VERIFICATION_RUNNER_URL = process.env['VERIFICATION_RUNNER_URL'] ?? 'http://localhost:4002';
const CONSUMER_NAME = process.env['CONSUMER_NAME'] ?? `webhook-worker-${process.pid}`;

let redis: Redis | null = null;
let consumer: StreamConsumer | null = null;

async function start(): Promise<void> {
  console.log('[Webhook] Starting webhook service...');
  console.log(`[Webhook] Redis URL: ${REDIS_URL}`);
  console.log(`[Webhook] Verification Runner URL: ${VERIFICATION_RUNNER_URL}`);
  console.log(`[Webhook] Consumer name: ${CONSUMER_NAME}`);

  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  redis.on('error', (err) => {
    console.error('[Webhook] Redis connection error:', err.message);
  });

  redis.on('connect', () => {
    console.log('[Webhook] Connected to Redis');
  });

  const dedupFilter = createDedupFilter(redis);
  const verificationTrigger = createVerificationTrigger(VERIFICATION_RUNNER_URL);

  consumer = createStreamConsumer({
    redis,
    consumerName: CONSUMER_NAME,
    dedupFilter,
    verificationTrigger,
    retryConfig: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      multiplier: 2,
    },
  });

  await consumer.start();
  console.log('[Webhook] Service started, consuming events from contract-events stream');
}

async function shutdown(): Promise<void> {
  console.log('[Webhook] Shutting down...');

  if (consumer) {
    await consumer.stop();
    consumer = null;
  }

  if (redis) {
    await redis.quit();
    redis = null;
  }

  console.log('[Webhook] Shutdown complete');
}

// Graceful shutdown on SIGTERM and SIGINT
process.on('SIGTERM', () => {
  shutdown().then(() => process.exit(0)).catch((err) => {
    console.error('[Webhook] Error during shutdown:', err);
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  shutdown().then(() => process.exit(0)).catch((err) => {
    console.error('[Webhook] Error during shutdown:', err);
    process.exit(1);
  });
});

// Start the service
start().catch((err) => {
  console.error('[Webhook] Failed to start:', err);
  process.exit(1);
});

export { start, shutdown };

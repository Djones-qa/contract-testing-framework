/**
 * Redis Stream consumer for contract-published events.
 * Processes events in order per consumer-provider pair.
 * Acknowledges events only after successful processing or DLQ routing.
 */

import Redis from 'ioredis';
import { executeWithRetry, RetriesExhaustedError, RetryConfig } from '../retry/retry-policy';
import { DedupFilter } from '../dedup/dedup-filter';

/** Event emitted when a contract is published to the broker. */
export interface ContractPublishedEvent {
  contractId: string;
  consumer: string;
  provider: string;
  version: string;
  timestamp: Date;
}

const STREAM_KEY = 'contract-events';
const GROUP_NAME = 'webhook-workers';
const DLQ_STREAM_KEY = 'contract-events-dlq';
const BLOCK_TIMEOUT_MS = 5000;

export interface VerificationTrigger {
  triggerVerification(providerName: string, providerBaseUrl: string): Promise<void>;
}

export interface StreamConsumerConfig {
  redis: Redis;
  consumerName: string;
  dedupFilter: DedupFilter;
  verificationTrigger: VerificationTrigger;
  retryConfig?: RetryConfig;
}

export interface StreamConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Parses a Redis Stream message into a ContractPublishedEvent.
 */
function parseEvent(fields: string[]): ContractPublishedEvent {
  const data: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    data[fields[i]] = fields[i + 1];
  }
  return {
    contractId: data['contractId'],
    consumer: data['consumer'],
    provider: data['provider'],
    version: data['version'],
    timestamp: new Date(data['timestamp']),
  };
}

/**
 * Creates a Redis Stream consumer that reads from contract-events stream,
 * processes events with retry + dedup, and routes failures to DLQ.
 */
export function createStreamConsumer(config: StreamConsumerConfig): StreamConsumer {
  const { redis, consumerName, dedupFilter, verificationTrigger, retryConfig } = config;
  let running = false;
  /** Tracks in-flight events per consumer-provider pair for ordering. */
  const processingLocks = new Map<string, Promise<void>>();

  async function ensureConsumerGroup(): Promise<void> {
    try {
      await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '0', 'MKSTREAM');
    } catch (error: unknown) {
      // Group already exists — that's fine
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        return;
      }
      throw error;
    }
  }

  async function moveToDLQ(
    messageId: string,
    event: ContractPublishedEvent,
    error: Error
  ): Promise<void> {
    await redis.xadd(
      DLQ_STREAM_KEY,
      '*',
      'contractId', event.contractId,
      'consumer', event.consumer,
      'provider', event.provider,
      'version', event.version,
      'timestamp', event.timestamp.toISOString(),
      'error', error.message,
      'originalMessageId', messageId
    );
  }

  async function processEvent(
    messageId: string,
    event: ContractPublishedEvent
  ): Promise<void> {
    // Check for duplicates (Requirement 9.5)
    const isDuplicate = await dedupFilter.isDuplicate(event.contractId);
    if (isDuplicate) {
      // Skip processing, acknowledge the event
      await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
      return;
    }

    try {
      // Trigger verification with retry (Requirements 9.1, 9.2)
      await executeWithRetry(
        () => verificationTrigger.triggerVerification(event.provider, `http://${event.provider}`),
        retryConfig
      );

      // Mark as processed for dedup
      await dedupFilter.markProcessed(event.contractId);

      // Acknowledge only after successful processing (Requirement 9.1)
      await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (error instanceof RetriesExhaustedError) {
        // All retries exhausted — log and move to DLQ (Requirement 9.3)
        console.error(
          `[Webhook] All retries exhausted for contract ${event.contractId}, ` +
          `provider ${event.provider}: ${err.message}`
        );
        await moveToDLQ(messageId, event, err);
        // Acknowledge after DLQ routing
        await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
      } else {
        // Non-retryable error — log and move to DLQ
        console.error(
          `[Webhook] Non-retryable error for contract ${event.contractId}, ` +
          `provider ${event.provider}: ${err.message}`
        );
        await moveToDLQ(messageId, event, err);
        await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
      }
    }
  }

  /**
   * Ensures ordering per consumer-provider pair (Requirement 9.4).
   * Events for the same pair are processed sequentially.
   */
  async function processEventInOrder(
    messageId: string,
    event: ContractPublishedEvent
  ): Promise<void> {
    const pairKey = `${event.consumer}:${event.provider}`;

    // Wait for the previous event for the same pair to complete
    const previousTask = processingLocks.get(pairKey) ?? Promise.resolve();
    const currentTask = previousTask.then(() => processEvent(messageId, event));
    processingLocks.set(pairKey, currentTask);

    await currentTask;
  }

  async function poll(): Promise<void> {
    while (running) {
      try {
        const results = await redis.xreadgroup(
          'GROUP', GROUP_NAME, consumerName,
          'COUNT', '10',
          'BLOCK', BLOCK_TIMEOUT_MS,
          'STREAMS', STREAM_KEY, '>'
        ) as [string, [string, string[]][]][] | null;

        if (!results || results.length === 0) {
          continue;
        }

        for (const [, messages] of results) {
          const processingPromises: Promise<void>[] = [];

          for (const [messageId, fields] of messages) {
            const event = parseEvent(fields);
            processingPromises.push(processEventInOrder(messageId, event));
          }

          // Wait for all messages in this batch to be processed
          await Promise.all(processingPromises);
        }
      } catch (error: unknown) {
        if (!running) break;
        console.error('[Webhook] Error reading from stream:', error);
        // Brief pause before retrying the read loop
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  return {
    async start(): Promise<void> {
      running = true;
      await ensureConsumerGroup();
      // Start polling in background — don't await
      poll().catch((err) => {
        if (running) {
          console.error('[Webhook] Fatal polling error:', err);
        }
      });
    },

    async stop(): Promise<void> {
      running = false;
    },
  };
}

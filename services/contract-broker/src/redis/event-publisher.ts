import { ContractPublishedEvent } from '@contract-testing/shared';
import { redis } from './client';

const STREAM_KEY = 'contract-events';

/**
 * Publish a contract-published event to the Redis Stream.
 * Returns true if the event was published successfully, false otherwise.
 * On failure, logs a warning but does not throw — callers can still proceed.
 */
export async function publishContractEvent(event: ContractPublishedEvent): Promise<boolean> {
  try {
    await redis.xadd(
      STREAM_KEY,
      '*',
      'contractId', event.contractId,
      'consumer', event.consumer,
      'provider', event.provider,
      'version', event.version,
      'timestamp', event.timestamp.toISOString()
    );
    return true;
  } catch (error) {
    console.warn(
      `[event-publisher] Failed to publish contract event for contractId=${event.contractId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

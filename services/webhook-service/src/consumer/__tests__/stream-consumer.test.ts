import { createStreamConsumer, StreamConsumer, VerificationTrigger } from '../stream-consumer';
import { DedupFilter } from '../../dedup/dedup-filter';

describe('StreamConsumer', () => {
  let mockRedis: {
    xgroup: jest.Mock;
    xreadgroup: jest.Mock;
    xack: jest.Mock;
    xadd: jest.Mock;
  };
  let mockDedupFilter: jest.Mocked<DedupFilter>;
  let mockVerificationTrigger: jest.Mocked<VerificationTrigger>;
  let consumer: StreamConsumer;

  beforeEach(() => {
    jest.useFakeTimers();

    mockRedis = {
      xgroup: jest.fn().mockResolvedValue('OK'),
      xreadgroup: jest.fn().mockResolvedValue(null),
      xack: jest.fn().mockResolvedValue(1),
      xadd: jest.fn().mockResolvedValue('id-1'),
    };

    mockDedupFilter = {
      isDuplicate: jest.fn().mockResolvedValue(false),
      markProcessed: jest.fn().mockResolvedValue(undefined),
    };

    mockVerificationTrigger = {
      triggerVerification: jest.fn().mockResolvedValue(undefined),
    };

    consumer = createStreamConsumer({
      redis: mockRedis as any,
      consumerName: 'test-consumer',
      dedupFilter: mockDedupFilter,
      verificationTrigger: mockVerificationTrigger,
      retryConfig: {
        maxAttempts: 3,
        initialDelayMs: 1,
        multiplier: 2,
      },
    });
  });

  afterEach(async () => {
    await consumer.stop();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should create consumer group on start', async () => {
      await consumer.start();
      expect(mockRedis.xgroup).toHaveBeenCalledWith(
        'CREATE', 'contract-events', 'webhook-workers', '0', 'MKSTREAM'
      );
    });

    it('should handle BUSYGROUP error when group already exists', async () => {
      mockRedis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));
      await expect(consumer.start()).resolves.not.toThrow();
    });
  });

  describe('event processing', () => {
    it('should skip duplicate events', async () => {
      mockDedupFilter.isDuplicate.mockResolvedValue(true);

      const fields = ['contractId', 'c-123', 'consumer', 'svc-a', 'provider', 'svc-b', 'version', '1.0.0', 'timestamp', '2024-01-01T00:00:00.000Z'];
      let callCount = 0;
      mockRedis.xreadgroup.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return [['contract-events', [['msg-1', fields]]]];
        }
        // Stop consumer on next poll to avoid hanging
        await consumer.stop();
        return null;
      });

      await consumer.start();
      // Flush all microtasks
      await jest.advanceTimersByTimeAsync(100);

      expect(mockDedupFilter.isDuplicate).toHaveBeenCalledWith('c-123');
      expect(mockVerificationTrigger.triggerVerification).not.toHaveBeenCalled();
      expect(mockRedis.xack).toHaveBeenCalledWith('contract-events', 'webhook-workers', 'msg-1');
    });

    it('should trigger verification for new events', async () => {
      const fields = ['contractId', 'c-456', 'consumer', 'svc-a', 'provider', 'svc-b', 'version', '1.0.0', 'timestamp', '2024-01-01T00:00:00.000Z'];
      let callCount = 0;
      mockRedis.xreadgroup.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return [['contract-events', [['msg-2', fields]]]];
        }
        await consumer.stop();
        return null;
      });

      await consumer.start();
      await jest.advanceTimersByTimeAsync(100);

      expect(mockVerificationTrigger.triggerVerification).toHaveBeenCalledWith('svc-b', 'http://svc-b');
      expect(mockDedupFilter.markProcessed).toHaveBeenCalledWith('c-456');
      expect(mockRedis.xack).toHaveBeenCalledWith('contract-events', 'webhook-workers', 'msg-2');
    });

    it('should move to DLQ after all retries exhausted', async () => {
      mockVerificationTrigger.triggerVerification.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const fields = ['contractId', 'c-789', 'consumer', 'svc-a', 'provider', 'svc-b', 'version', '1.0.0', 'timestamp', '2024-01-01T00:00:00.000Z'];
      let callCount = 0;
      mockRedis.xreadgroup.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return [['contract-events', [['msg-3', fields]]]];
        }
        await consumer.stop();
        return null;
      });

      await consumer.start();
      // Advance timers to allow retry delays (1ms + 2ms + processing)
      await jest.advanceTimersByTimeAsync(500);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'contract-events-dlq',
        '*',
        'contractId', 'c-789',
        'consumer', 'svc-a',
        'provider', 'svc-b',
        'version', '1.0.0',
        'timestamp', expect.any(String),
        'error', expect.stringContaining('retry attempts exhausted'),
        'originalMessageId', 'msg-3'
      );
      expect(mockRedis.xack).toHaveBeenCalledWith('contract-events', 'webhook-workers', 'msg-3');
    });

    it('should process events in order per consumer-provider pair', async () => {
      const callOrder: string[] = [];
      mockVerificationTrigger.triggerVerification.mockImplementation(async (_provider: string) => {
        callOrder.push(_provider);
      });

      const fields1 = ['contractId', 'c-1', 'consumer', 'svc-a', 'provider', 'svc-b', 'version', '1.0.0', 'timestamp', '2024-01-01T00:00:00.000Z'];
      const fields2 = ['contractId', 'c-2', 'consumer', 'svc-a', 'provider', 'svc-b', 'version', '2.0.0', 'timestamp', '2024-01-01T00:01:00.000Z'];

      let callCount = 0;
      mockRedis.xreadgroup.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return [['contract-events', [['msg-1', fields1], ['msg-2', fields2]]]];
        }
        await consumer.stop();
        return null;
      });

      await consumer.start();
      await jest.advanceTimersByTimeAsync(200);

      // Both should be processed sequentially (same consumer-provider pair)
      expect(callOrder).toEqual(['svc-b', 'svc-b']);
      expect(mockVerificationTrigger.triggerVerification).toHaveBeenCalledTimes(2);
    });
  });
});

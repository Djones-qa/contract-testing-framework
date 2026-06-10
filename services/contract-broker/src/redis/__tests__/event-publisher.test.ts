import { ContractPublishedEvent } from '@contract-testing/shared';

// Mock the Redis client before importing the module under test
const mockXadd = jest.fn();
jest.mock('../client', () => ({
  redis: {
    xadd: (...args: unknown[]) => mockXadd(...args),
  },
}));

import { publishContractEvent } from '../event-publisher';

describe('publishContractEvent', () => {
  const event: ContractPublishedEvent = {
    contractId: '123e4567-e89b-12d3-a456-426614174000',
    consumer: 'order-service',
    provider: 'payment-service',
    version: '1.0.0',
    timestamp: new Date('2024-01-15T10:30:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should XADD to contract-events stream with auto-generated ID and event fields', async () => {
    mockXadd.mockResolvedValue('1705312200000-0');

    const result = await publishContractEvent(event);

    expect(result).toBe(true);
    expect(mockXadd).toHaveBeenCalledWith(
      'contract-events',
      '*',
      'contractId', event.contractId,
      'consumer', event.consumer,
      'provider', event.provider,
      'version', event.version,
      'timestamp', event.timestamp.toISOString()
    );
  });

  it('should return false and log a warning when Redis is unavailable', async () => {
    mockXadd.mockRejectedValue(new Error('Connection refused'));
    const warnSpy = jest.spyOn(console, 'warn');

    const result = await publishContractEvent(event);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to publish contract event')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Connection refused')
    );
  });

  it('should not throw when Redis throws an error', async () => {
    mockXadd.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(publishContractEvent(event)).resolves.toBe(false);
  });

  it('should handle non-Error thrown values gracefully', async () => {
    mockXadd.mockRejectedValue('unexpected string error');
    const warnSpy = jest.spyOn(console, 'warn');

    const result = await publishContractEvent(event);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unexpected string error')
    );
  });
});

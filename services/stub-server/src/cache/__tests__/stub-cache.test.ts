import { createStubCache } from '../stub-cache';

// Mock the redis client
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('../../redis/client', () => ({
  getRedisClient: () => mockRedis,
}));

describe('StubCache', () => {
  const cache = createStubCache();
  const contractId = 'test-contract-123';
  const stubConfig = {
    id: contractId,
    consumer: 'consumer-a',
    provider: 'provider-b',
    interactions: [{ description: 'get user' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns parsed JSON when key exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(stubConfig));

      const result = await cache.get(contractId);

      expect(result).toEqual(stubConfig);
      expect(mockRedis.get).toHaveBeenCalledWith(`stub:config:${contractId}`);
    });

    it('returns null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get(contractId);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores JSON-serialized config with 5-minute TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await cache.set(contractId, stubConfig);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `stub:config:${contractId}`,
        JSON.stringify(stubConfig),
        'EX',
        300
      );
    });
  });

  describe('invalidate', () => {
    it('deletes the cached key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cache.invalidate(contractId);

      expect(mockRedis.del).toHaveBeenCalledWith(`stub:config:${contractId}`);
    });
  });
});

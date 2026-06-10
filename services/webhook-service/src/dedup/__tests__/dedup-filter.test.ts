import { createDedupFilter, DedupFilter } from '../dedup-filter';

describe('DedupFilter', () => {
  let mockRedis: {
    exists: jest.Mock;
    set: jest.Mock;
  };
  let filter: DedupFilter;

  beforeEach(() => {
    mockRedis = {
      exists: jest.fn(),
      set: jest.fn(),
    };
    filter = createDedupFilter(mockRedis as any);
  });

  describe('isDuplicate', () => {
    it('should return true when the key exists in Redis', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await filter.isDuplicate('contract-123');
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('webhook:processed:contract-123');
    });

    it('should return false when the key does not exist in Redis', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await filter.isDuplicate('contract-456');
      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('webhook:processed:contract-456');
    });
  });

  describe('markProcessed', () => {
    it('should set the key in Redis with 1-hour TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await filter.markProcessed('contract-789');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'webhook:processed:contract-789',
        '1',
        'EX',
        3600
      );
    });
  });
});

import {
  executeWithRetry,
  isRetryableError,
  RetriesExhaustedError,
  RetryConfig,
} from '../retry-policy';

describe('RetryPolicy', () => {
  const fastConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1, // 1ms for fast tests
    multiplier: 2,
  };

  describe('isRetryableError', () => {
    it('should return true for ECONNREFUSED errors', () => {
      expect(isRetryableError(new Error('connect ECONNREFUSED 127.0.0.1:4002'))).toBe(true);
    });

    it('should return true for ECONNRESET errors', () => {
      expect(isRetryableError(new Error('socket hang up ECONNRESET'))).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(isRetryableError(new Error('Request timeout exceeded 30s'))).toBe(true);
    });

    it('should return true for 5xx status codes', () => {
      expect(isRetryableError({ statusCode: 500 })).toBe(true);
      expect(isRetryableError({ statusCode: 502 })).toBe(true);
      expect(isRetryableError({ statusCode: 503 })).toBe(true);
    });

    it('should return false for 4xx status codes', () => {
      expect(isRetryableError({ statusCode: 400 })).toBe(false);
      expect(isRetryableError({ statusCode: 404 })).toBe(false);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new Error('Validation failed'))).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn, fastConfig);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors and succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await executeWithRetry(fn, fastConfig);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw RetriesExhaustedError after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(executeWithRetry(fn, fastConfig)).rejects.toThrow(RetriesExhaustedError);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on non-retryable error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Validation failed'));

      await expect(executeWithRetry(fn, fastConfig)).rejects.toThrow('Validation failed');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx status code errors', async () => {
      const error5xx = Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
      const fn = jest.fn()
        .mockRejectedValueOnce(error5xx)
        .mockRejectedValueOnce(error5xx)
        .mockResolvedValue('success');

      const result = await executeWithRetry(fn, fastConfig);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should include attempt count in RetriesExhaustedError', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('timeout'));

      try {
        await executeWithRetry(fn, fastConfig);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetriesExhaustedError);
        expect((error as RetriesExhaustedError).attempts).toBe(3);
      }
    });
  });
});

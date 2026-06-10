import request from 'supertest';
import app from '../app';

// Mock the redis client module
jest.mock('../redis/client', () => ({
  isRedisReady: jest.fn(),
}));

import { isRedisReady } from '../redis/client';

const mockedIsRedisReady = isRedisReady as jest.MockedFunction<typeof isRedisReady>;

describe('Stub Server App', () => {
  describe('GET /health', () => {
    it('returns 200 with {"status": "ok"}', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready', () => {
    it('returns 200 with {"status": "ready"} when Redis is responsive', async () => {
      mockedIsRedisReady.mockResolvedValue(true);

      const response = await request(app).get('/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ready' });
    });

    it('returns 503 when Redis is unavailable', async () => {
      mockedIsRedisReady.mockResolvedValue(false);

      const response = await request(app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        dependencies: {
          redis: 'unavailable',
        },
      });
    });

    it('calls isRedisReady with 5000ms timeout', async () => {
      mockedIsRedisReady.mockResolvedValue(true);

      await request(app).get('/ready');

      expect(mockedIsRedisReady).toHaveBeenCalledWith(5000);
    });
  });
});

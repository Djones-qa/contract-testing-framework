import request from 'supertest';
import app from '../app';

// Mock the db pool
jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock the redis client
jest.mock('../redis/client', () => ({
  redis: {},
  pingRedis: jest.fn(),
}));

import { pool } from '../db/pool';
import { pingRedis } from '../redis/client';

const mockPool = pool as jest.Mocked<typeof pool>;
const mockPingRedis = pingRedis as jest.MockedFunction<typeof pingRedis>;

describe('Contract Broker App', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready', () => {
    it('should return 200 with status ready when both PostgreSQL and Redis are available', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockPingRedis.mockResolvedValue(true);

      const response = await request(app).get('/ready');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ready' });
    });

    it('should return 503 when PostgreSQL is unavailable', async () => {
      (mockPool.query as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      mockPingRedis.mockResolvedValue(true);

      const response = await request(app).get('/ready');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        unavailable: ['postgresql'],
      });
    });

    it('should return 503 when Redis is unavailable', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockPingRedis.mockResolvedValue(false);

      const response = await request(app).get('/ready');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        unavailable: ['redis'],
      });
    });

    it('should return 503 listing both when PostgreSQL and Redis are unavailable', async () => {
      (mockPool.query as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      mockPingRedis.mockResolvedValue(false);

      const response = await request(app).get('/ready');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        unavailable: ['postgresql', 'redis'],
      });
    });

    it('should return 503 when PostgreSQL times out', async () => {
      (mockPool.query as jest.Mock).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      );
      mockPingRedis.mockResolvedValue(true);

      const response = await request(app).get('/ready');
      expect(response.status).toBe(503);
      expect(response.body.unavailable).toContain('postgresql');
    }, 10000);
  });
});

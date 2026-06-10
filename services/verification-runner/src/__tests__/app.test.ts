import request from 'supertest';
import http from 'http';
import { app } from '../app';

describe('Verification Runner App', () => {
  const originalBrokerUrl = process.env.BROKER_URL;

  afterEach(() => {
    process.env.BROKER_URL = originalBrokerUrl;
  });

  describe('GET /health', () => {
    it('should return 200 with {"status": "ok"}', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when Contract Broker is reachable', async () => {
      const mockBroker = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });

      await new Promise<void>((resolve) => {
        mockBroker.listen(0, () => resolve());
      });

      const address = mockBroker.address() as { port: number };
      process.env.BROKER_URL = `http://localhost:${address.port}`;

      try {
        const res = await request(app).get('/ready');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ready' });
      } finally {
        await new Promise<void>((resolve) => mockBroker.close(() => resolve()));
      }
    });

    it('should return 503 when Contract Broker is unreachable', async () => {
      // Point to a port that is not listening
      process.env.BROKER_URL = 'http://localhost:19999';

      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('status', 'unavailable');
      expect(res.body).toHaveProperty('reason', 'Contract Broker is unreachable');
    });

    it('should return 503 when Contract Broker returns non-2xx status', async () => {
      const mockBroker = http.createServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error' }));
      });

      await new Promise<void>((resolve) => {
        mockBroker.listen(0, () => resolve());
      });

      const address = mockBroker.address() as { port: number };
      process.env.BROKER_URL = `http://localhost:${address.port}`;

      try {
        const res = await request(app).get('/ready');
        expect(res.status).toBe(503);
        expect(res.body).toHaveProperty('status', 'unavailable');
      } finally {
        await new Promise<void>((resolve) => mockBroker.close(() => resolve()));
      }
    });
  });
});

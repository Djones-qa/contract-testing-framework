import request from 'supertest';
import app from '../app';
import * as stubManager from '../stub-manager/stub-manager';

// Mock the redis client module
jest.mock('../redis/client', () => ({
  isRedisReady: jest.fn(),
  getRedisClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  })),
}));

// Mock global fetch for broker requests
const mockFetch = jest.fn();
global.fetch = mockFetch;

const sampleContract = {
  id: 'contract-123',
  consumer: 'consumer-service',
  provider: 'provider-service',
  version: '1.0.0',
  status: 'active',
  interactions: [
    {
      id: 'interaction-1',
      description: 'Get users list',
      providerStates: [],
      request: {
        method: 'GET',
        path: '/users',
      },
      response: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: [{ id: 1, name: 'Alice' }],
      },
      matchingRules: [],
    },
    {
      id: 'interaction-2',
      description: 'Create a user',
      providerStates: [],
      request: {
        method: 'POST',
        path: '/users',
        headers: { 'content-type': 'application/json' },
      },
      response: {
        status: 201,
        body: { id: 2, name: 'Bob' },
      },
      matchingRules: [],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Stub Management Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Clean up any stubs that may still be running
    const stubs = stubManager.list();
    for (const stub of stubs) {
      await stubManager.destroy(stub.id);
    }
  });

  describe('POST /stubs', () => {
    it('returns 201 with stub ID and port when contract is found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleContract),
      });

      const response = await request(app)
        .post('/stubs')
        .send({ contractId: 'contract-123' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('port');
      expect(typeof response.body.port).toBe('number');
      expect(response.body.contractId).toBe('contract-123');
      expect(response.body.consumer).toBe('consumer-service');
      expect(response.body.provider).toBe('provider-service');
    });

    it('returns 404 when contract is not found at broker', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const response = await request(app)
        .post('/stubs')
        .send({ contractId: 'non-existent' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Contract not found' });
    });

    it('returns 400 when contractId is missing from request body', async () => {
      const response = await request(app)
        .post('/stubs')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'contractId is required' });
    });
  });

  describe('GET /stubs', () => {
    it('returns list of active stubs', async () => {
      // First create a stub
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleContract),
      });

      await request(app)
        .post('/stubs')
        .send({ contractId: 'contract-123' });

      const response = await request(app).get('/stubs');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('port');
      expect(response.body[0]).toHaveProperty('contractId');
      expect(response.body[0]).toHaveProperty('consumer');
      expect(response.body[0]).toHaveProperty('provider');
    });
  });

  describe('DELETE /stubs/:id', () => {
    it('returns 200 when stub is found and destroyed', async () => {
      // Create a stub first
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleContract),
      });

      const createResponse = await request(app)
        .post('/stubs')
        .send({ contractId: 'contract-123' });

      const stubId = createResponse.body.id;

      const response = await request(app).delete(`/stubs/${stubId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Stub destroyed' });
    });

    it('returns 404 when stub is not found', async () => {
      const response = await request(app).delete('/stubs/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Stub not found' });
    });
  });

  describe('Dynamic stub server', () => {
    it('responds with matching interaction response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleContract),
      });

      const createResponse = await request(app)
        .post('/stubs')
        .send({ contractId: 'contract-123' });

      const { port } = createResponse.body;

      // Make a request to the dynamic stub server
      const stubResponse = await request(`http://localhost:${port}`)
        .get('/users');

      expect(stubResponse.status).toBe(200);
      expect(stubResponse.body).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('returns 404 with available interactions when no match found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleContract),
      });

      const createResponse = await request(app)
        .post('/stubs')
        .send({ contractId: 'contract-123' });

      const { port } = createResponse.body;

      // Make a request that does NOT match any interaction
      const stubResponse = await request(`http://localhost:${port}`)
        .get('/unknown-route');

      expect(stubResponse.status).toBe(404);
      expect(stubResponse.body).toEqual({
        availableInteractions: [
          { method: 'GET', path: '/users' },
          { method: 'POST', path: '/users' },
        ],
      });
    });
  });
});

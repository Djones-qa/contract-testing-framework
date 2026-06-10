import request from 'supertest';
import express from 'express';

// Mock db pool before any imports that use it
jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

// Mock Redis
jest.mock('../../redis/client', () => ({
  redis: { xadd: jest.fn() },
  pingRedis: jest.fn(),
}));

// Mock contract repository
const mockFindById = jest.fn();
jest.mock('../../db/contract-repository', () => ({
  contractRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

// Mock verification repository
const mockStore = jest.fn();
jest.mock('../../db/verification-repository', () => ({
  verificationRepository: {
    store: (...args: unknown[]) => mockStore(...args),
  },
}));

import verificationRouter from '../verification';

const app = express();
app.use(express.json());
app.use('/', verificationRouter);

describe('POST /contracts/:id/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 404 if contract does not exist', async () => {
    mockFindById.mockResolvedValue(null);

    const res = await request(app)
      .post('/contracts/non-existent-id/verify')
      .send({
        providerVersion: '1.0.0',
        interactions: [],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Contract not found');
  });

  it('should return 400 if providerVersion is missing', async () => {
    mockFindById.mockResolvedValue({
      id: 'contract-123',
      consumer: 'frontend',
      provider: 'backend',
      version: '1.0.0',
      status: 'active',
      interactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/contracts/contract-123/verify')
      .send({
        interactions: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('Missing required field: providerVersion');
  });

  it('should return 400 if interactions is missing', async () => {
    mockFindById.mockResolvedValue({
      id: 'contract-123',
      consumer: 'frontend',
      provider: 'backend',
      version: '1.0.0',
      status: 'active',
      interactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/contracts/contract-123/verify')
      .send({
        providerVersion: '1.0.0',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('Missing required field: interactions');
  });

  it('should return 400 if both providerVersion and interactions are missing', async () => {
    mockFindById.mockResolvedValue({
      id: 'contract-123',
      consumer: 'frontend',
      provider: 'backend',
      version: '1.0.0',
      status: 'active',
      interactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/contracts/contract-123/verify')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toHaveLength(2);
  });

  it('should store verification result and return 201 on success', async () => {
    mockFindById.mockResolvedValue({
      id: 'contract-123',
      consumer: 'frontend',
      provider: 'backend',
      version: '1.0.0',
      status: 'active',
      interactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockStore.mockResolvedValue('vr-id-456');

    const res = await request(app)
      .post('/contracts/contract-123/verify')
      .send({
        providerVersion: '2.0.0',
        success: true,
        interactions: [
          {
            interactionDescription: 'Get user by ID',
            success: true,
            mismatches: [],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('vr-id-456');
    expect(res.body.contractId).toBe('contract-123');
    expect(res.body.success).toBe(true);

    expect(mockStore).toHaveBeenCalledWith(
      'contract-123',
      'backend',
      expect.objectContaining({
        providerVersion: '2.0.0',
        success: true,
        interactions: expect.any(Array),
      })
    );
  });

  it('should derive success from interactions if not explicitly provided', async () => {
    mockFindById.mockResolvedValue({
      id: 'contract-123',
      consumer: 'frontend',
      provider: 'backend',
      version: '1.0.0',
      status: 'active',
      interactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockStore.mockResolvedValue('vr-id-789');

    const res = await request(app)
      .post('/contracts/contract-123/verify')
      .send({
        providerVersion: '2.0.0',
        interactions: [
          { interactionDescription: 'Test 1', success: true, mismatches: [] },
          { interactionDescription: 'Test 2', success: false, mismatches: [{ path: '$.status', expected: 200, actual: 500, type: 'status' }] },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(false);
  });

  it('should handle internal server errors gracefully', async () => {
    mockFindById.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app)
      .post('/contracts/contract-123/verify')
      .send({
        providerVersion: '1.0.0',
        interactions: [],
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

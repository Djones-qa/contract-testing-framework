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

// Mock matrix service
const mockGetMatrix = jest.fn();
const mockCanIDeploy = jest.fn();
jest.mock('../../matrix/matrix-service', () => ({
  getMatrix: (...args: unknown[]) => mockGetMatrix(...args),
  canIDeploy: (...args: unknown[]) => mockCanIDeploy(...args),
}));

import matrixRouter from '../matrix';

const app = express();
app.use(express.json());
app.use('/matrix', matrixRouter);

describe('GET /matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return all matrix entries', async () => {
    const entries = [
      {
        consumerName: 'frontend',
        consumerVersion: '1.0.0',
        providerName: 'backend',
        providerVersion: '2.0.0',
        status: 'success',
        verifiedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ];
    mockGetMatrix.mockResolvedValue(entries);

    const res = await request(app).get('/matrix');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].consumerName).toBe('frontend');
    expect(mockGetMatrix).toHaveBeenCalledWith(undefined);
  });

  it('should pass service filter to getMatrix', async () => {
    mockGetMatrix.mockResolvedValue([]);

    const res = await request(app).get('/matrix?service=frontend');

    expect(res.status).toBe(200);
    expect(mockGetMatrix).toHaveBeenCalledWith('frontend');
  });

  it('should handle internal server errors gracefully', async () => {
    mockGetMatrix.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/matrix');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('GET /matrix/can-i-deploy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if service param is missing', async () => {
    const res = await request(app).get('/matrix/can-i-deploy?version=1.0.0');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required query parameters');
    expect(res.body.details).toContain('Missing required parameter: service');
  });

  it('should return 400 if version param is missing', async () => {
    const res = await request(app).get('/matrix/can-i-deploy?service=frontend');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required query parameters');
    expect(res.body.details).toContain('Missing required parameter: version');
  });

  it('should return 400 if both params are missing', async () => {
    const res = await request(app).get('/matrix/can-i-deploy');

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(2);
  });

  it('should return deployable result when all verifications pass', async () => {
    mockCanIDeploy.mockResolvedValue({
      deployable: true,
      message: 'All contracts have successful verifications',
      failingContracts: [],
    });

    const res = await request(app).get('/matrix/can-i-deploy?service=frontend&version=1.0.0');

    expect(res.status).toBe(200);
    expect(res.body.deployable).toBe(true);
    expect(mockCanIDeploy).toHaveBeenCalledWith('frontend', '1.0.0');
  });

  it('should return non-deployable result with failing contracts', async () => {
    mockCanIDeploy.mockResolvedValue({
      deployable: false,
      message: '1 contract(s) are failing or unverified',
      failingContracts: [
        { consumer: 'frontend', provider: 'backend', consumerVersion: '1.0.0', status: 'unverified' },
      ],
    });

    const res = await request(app).get('/matrix/can-i-deploy?service=frontend&version=1.0.0');

    expect(res.status).toBe(200);
    expect(res.body.deployable).toBe(false);
    expect(res.body.failingContracts).toHaveLength(1);
  });

  it('should return deployable with no contracts message', async () => {
    mockCanIDeploy.mockResolvedValue({
      deployable: true,
      message: 'No contracts found for this service',
      failingContracts: [],
    });

    const res = await request(app).get('/matrix/can-i-deploy?service=unknown&version=1.0.0');

    expect(res.status).toBe(200);
    expect(res.body.deployable).toBe(true);
    expect(res.body.message).toBe('No contracts found for this service');
  });

  it('should handle internal server errors gracefully', async () => {
    mockCanIDeploy.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/matrix/can-i-deploy?service=frontend&version=1.0.0');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

/**
 * Unit tests for the verification routes.
 *
 * Requirements tested:
 * - 4.2: Return 400 if missing provider name, version, or base URL
 * - 4.8: Return verification job status (pending, running, completed, failed)
 * - 12.3: Paginated results with default page size 20, max 100, filter by provider name
 */

import request from 'supertest';
import { app } from '../../app';
import { clearJobs, createJob, updateJobStatus, setJobResult, getAllJobs } from '../../store/job-store';
import type { VerificationJob, VerificationResult } from '@contract-testing/shared';

// Mock the executor and reporter to avoid actual HTTP calls
jest.mock('../../runner/executor', () => ({
  executeVerification: jest.fn().mockResolvedValue({
    id: 'result-1',
    contractId: 'contract-1',
    provider: 'test-provider',
    providerVersion: '1.0.0',
    success: true,
    interactions: [],
    executedAt: new Date('2024-01-01T00:00:00Z'),
  }),
  loadContractIdsForProvider: jest.fn().mockResolvedValue(['contract-1']),
}));

jest.mock('../../reporter/result-reporter', () => ({
  submitVerificationResult: jest.fn().mockResolvedValue(undefined),
}));

describe('Verification Routes', () => {
  beforeEach(() => {
    clearJobs();
  });

  describe('POST /verify', () => {
    it('should return 400 if provider is missing', async () => {
      const res = await request(app)
        .post('/verify')
        .send({ providerVersion: '1.0.0', providerBaseUrl: 'http://localhost:3000' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('provider');
      expect(res.body.missingFields).toContain('provider');
    });

    it('should return 400 if providerVersion is missing', async () => {
      const res = await request(app)
        .post('/verify')
        .send({ provider: 'my-service', providerBaseUrl: 'http://localhost:3000' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('providerVersion');
      expect(res.body.missingFields).toContain('providerVersion');
    });

    it('should return 400 if providerBaseUrl is missing', async () => {
      const res = await request(app)
        .post('/verify')
        .send({ provider: 'my-service', providerVersion: '1.0.0' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('providerBaseUrl');
      expect(res.body.missingFields).toContain('providerBaseUrl');
    });

    it('should return 400 with all missing fields listed', async () => {
      const res = await request(app)
        .post('/verify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.missingFields).toEqual(['provider', 'providerVersion', 'providerBaseUrl']);
    });

    it('should return 202 with job ID when valid input provided', async () => {
      const res = await request(app)
        .post('/verify')
        .send({
          provider: 'my-service',
          providerVersion: '1.0.0',
          providerBaseUrl: 'http://localhost:3000',
        });

      expect(res.status).toBe(202);
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('string');
    });

    it('should accept optional stateCallbackUrl', async () => {
      const res = await request(app)
        .post('/verify')
        .send({
          provider: 'my-service',
          providerVersion: '1.0.0',
          providerBaseUrl: 'http://localhost:3000',
          stateCallbackUrl: 'http://localhost:3000/state',
        });

      expect(res.status).toBe(202);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('GET /verify/:id/status', () => {
    it('should return 404 for non-existent job', async () => {
      const res = await request(app).get('/verify/non-existent-id/status');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found');
    });

    it('should return job status for existing job', async () => {
      const job: VerificationJob = {
        id: 'test-job-1',
        provider: 'my-service',
        providerVersion: '1.0.0',
        providerBaseUrl: 'http://localhost:3000',
        status: 'pending',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      createJob(job);

      const res = await request(app).get('/verify/test-job-1/status');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('test-job-1');
      expect(res.body.provider).toBe('my-service');
      expect(res.body.providerVersion).toBe('1.0.0');
      expect(res.body.status).toBe('pending');
    });

    it('should reflect updated status', async () => {
      const job: VerificationJob = {
        id: 'test-job-2',
        provider: 'my-service',
        providerVersion: '1.0.0',
        providerBaseUrl: 'http://localhost:3000',
        status: 'pending',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      createJob(job);
      updateJobStatus('test-job-2', 'running');

      const res = await request(app).get('/verify/test-job-2/status');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
    });
  });

  describe('GET /results', () => {
    function seedResults(count: number, provider = 'test-provider') {
      for (let i = 0; i < count; i++) {
        const jobId = `job-${provider}-${i}`;
        const job: VerificationJob = {
          id: jobId,
          provider,
          providerVersion: `1.0.${i}`,
          providerBaseUrl: 'http://localhost:3000',
          status: 'completed',
          createdAt: new Date('2024-01-01T00:00:00Z'),
        };
        createJob(job);
        updateJobStatus(jobId, 'completed');
        setJobResult(jobId, {
          id: `result-${provider}-${i}`,
          contractId: `contract-${i}`,
          provider,
          providerVersion: `1.0.${i}`,
          success: true,
          interactions: [],
          executedAt: new Date('2024-01-01T00:00:00Z'),
        });
      }
    }

    it('should return empty results when no jobs exist', async () => {
      const res = await request(app).get('/results');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(1);
    });

    it('should return paginated results with default page size of 20', async () => {
      seedResults(25);

      const res = await request(app).get('/results');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(20);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.total).toBe(25);
      expect(res.body.totalPages).toBe(2);
    });

    it('should respect page parameter', async () => {
      seedResults(25);

      const res = await request(app).get('/results?page=2');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(5);
      expect(res.body.page).toBe(2);
    });

    it('should cap page size at 100', async () => {
      const res = await request(app).get('/results?pageSize=200');

      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(100);
    });

    it('should filter by provider name', async () => {
      seedResults(5, 'provider-a');
      seedResults(3, 'provider-b');

      const res = await request(app).get('/results?provider=provider-a');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5);
      expect(res.body.data.every((r: VerificationResult) => r.provider === 'provider-a')).toBe(true);
    });

    it('should use custom page size', async () => {
      seedResults(10);

      const res = await request(app).get('/results?pageSize=5');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(5);
      expect(res.body.pageSize).toBe(5);
      expect(res.body.totalPages).toBe(2);
    });
  });
});

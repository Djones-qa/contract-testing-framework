/**
 * Verification routes for the Verification Runner.
 *
 * Requirements:
 * - 4.1: Load all active contracts for the provider
 * - 4.2: Return 400 if missing provider name, version, or base URL
 * - 4.8: Return verification job status (pending, running, completed, failed)
 * - 12.3: Paginated results with default page size 20, max 100, filter by provider name
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import type { VerificationJob, PaginatedResult, VerificationResult } from '@contract-testing/shared';
import {
  createJob,
  getJob,
  updateJobStatus,
  setJobResult,
  setJobError,
  getAllJobs,
} from '../store/job-store';
import { executeVerification, loadContractIdsForProvider } from '../runner/executor';
import { submitVerificationResult } from '../reporter/result-reporter';

const router = Router();

/**
 * POST /verify
 *
 * Triggers a provider verification run.
 * Required fields: provider, providerVersion, providerBaseUrl
 * Optional fields: stateCallbackUrl
 *
 * Returns 202 with { id: jobId } immediately; verification runs asynchronously.
 * Returns 400 if required fields are missing.
 *
 * Requirement 4.1, 4.2
 */
router.post('/verify', (req: Request, res: Response) => {
  const { provider, providerVersion, providerBaseUrl, stateCallbackUrl } = req.body;

  // Validate required fields
  const missingFields: string[] = [];
  if (!provider) missingFields.push('provider');
  if (!providerVersion) missingFields.push('providerVersion');
  if (!providerBaseUrl) missingFields.push('providerBaseUrl');

  if (missingFields.length > 0) {
    res.status(400).json({
      error: `Missing required fields: ${missingFields.join(', ')}`,
      missingFields,
    });
    return;
  }

  // Create job with pending status
  const jobId = uuid();
  const job: VerificationJob = {
    id: jobId,
    provider,
    providerVersion,
    providerBaseUrl,
    status: 'pending',
    createdAt: new Date(),
  };

  createJob(job);

  // Return 202 immediately
  res.status(202).json({ id: jobId });

  // Execute verification asynchronously
  runVerificationAsync(jobId, provider, providerVersion, providerBaseUrl, stateCallbackUrl);
});

/**
 * Runs the verification process in the background.
 * Updates job status through the lifecycle: pending → running → completed/failed.
 */
async function runVerificationAsync(
  jobId: string,
  provider: string,
  providerVersion: string,
  providerBaseUrl: string,
  stateCallbackUrl?: string
): Promise<void> {
  try {
    // Update to running
    updateJobStatus(jobId, 'running');

    // Load contract IDs for the provider from the broker
    const contractIds = await loadContractIdsForProvider(provider);

    // Execute verification
    const result = await executeVerification({
      id: jobId,
      provider,
      providerVersion,
      providerBaseUrl,
      stateCallbackUrl,
      contractIds,
    });

    // Submit results to broker
    await submitVerificationResult(result);

    // Mark as completed
    setJobResult(jobId, result);
    updateJobStatus(jobId, 'completed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setJobError(jobId, message);
    updateJobStatus(jobId, 'failed');
  }
}

/**
 * GET /verify/:id/status
 *
 * Returns the current status of a verification job.
 * Requirement 4.8
 */
router.get('/verify/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const entry = getJob(id);

  if (!entry) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const response: Record<string, unknown> = {
    id: entry.job.id,
    provider: entry.job.provider,
    providerVersion: entry.job.providerVersion,
    status: entry.job.status,
    createdAt: entry.job.createdAt.toISOString(),
  };

  if (entry.result) {
    response.result = entry.result;
  }

  if (entry.error) {
    response.error = entry.error;
  }

  res.status(200).json(response);
});

/**
 * GET /results
 *
 * Returns paginated verification results with optional provider name filter.
 * Query params: ?provider=x&page=1&pageSize=20
 * Default page size: 20, max: 100
 *
 * Requirement 12.3
 */
router.get('/results', (req: Request, res: Response) => {
  const providerFilter = req.query.provider as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const requestedPageSize = parseInt(req.query.pageSize as string, 10) || 20;
  const pageSize = Math.min(Math.max(1, requestedPageSize), 100);

  // Get all completed jobs with results
  let entries = getAllJobs().filter((entry) => entry.result !== undefined);

  // Filter by provider name if specified
  if (providerFilter) {
    entries = entries.filter((entry) => entry.job.provider === providerFilter);
  }

  const total = entries.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const paginatedEntries = entries.slice(start, start + pageSize);

  const data: VerificationResult[] = paginatedEntries.map((entry) => entry.result!);

  const result: PaginatedResult<VerificationResult> = {
    data,
    page,
    pageSize,
    total,
    totalPages,
  };

  res.status(200).json(result);
});

export { router as verifyRouter };

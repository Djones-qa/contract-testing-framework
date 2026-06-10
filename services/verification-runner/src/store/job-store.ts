/**
 * In-memory job store for tracking verification jobs.
 *
 * Requirement 4.8: Return verification job status (pending, running, completed, failed).
 */

import type { VerificationJob, VerificationResult } from '@contract-testing/shared';

/** Extended job entry with optional result and error. */
export interface JobEntry {
  job: VerificationJob;
  result?: VerificationResult;
  error?: string;
}

/** In-memory store mapping job IDs to their entries. */
const jobs = new Map<string, JobEntry>();

/**
 * Creates a new job entry with status 'pending'.
 */
export function createJob(job: VerificationJob): void {
  jobs.set(job.id, { job });
}

/**
 * Retrieves a job entry by ID.
 */
export function getJob(id: string): JobEntry | undefined {
  return jobs.get(id);
}

/**
 * Updates the status of an existing job.
 */
export function updateJobStatus(
  id: string,
  status: VerificationJob['status']
): void {
  const entry = jobs.get(id);
  if (entry) {
    entry.job.status = status;
  }
}

/**
 * Sets the verification result on a completed job.
 */
export function setJobResult(id: string, result: VerificationResult): void {
  const entry = jobs.get(id);
  if (entry) {
    entry.result = result;
  }
}

/**
 * Sets an error message on a failed job.
 */
export function setJobError(id: string, error: string): void {
  const entry = jobs.get(id);
  if (entry) {
    entry.error = error;
  }
}

/**
 * Returns all job entries (for results listing).
 */
export function getAllJobs(): JobEntry[] {
  return Array.from(jobs.values());
}

/**
 * Clears all jobs (useful for testing).
 */
export function clearJobs(): void {
  jobs.clear();
}

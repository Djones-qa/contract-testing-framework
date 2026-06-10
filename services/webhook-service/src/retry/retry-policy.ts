/**
 * Exponential backoff retry policy for webhook delivery.
 * Retries on connection errors, timeouts (>30s), and 5xx responses.
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  multiplier: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  multiplier: 2,
};

/** Error thrown when all retry attempts are exhausted. */
export class RetriesExhaustedError extends Error {
  public readonly lastError: Error;
  public readonly attempts: number;

  constructor(lastError: Error, attempts: number) {
    super(`All ${attempts} retry attempts exhausted: ${lastError.message}`);
    this.name = 'RetriesExhaustedError';
    this.lastError = lastError;
    this.attempts = attempts;
  }
}

/** Determines if an error is retryable (connection error, timeout, or 5xx). */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Connection errors
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('connection')
    ) {
      return true;
    }
    // Timeout errors
    if (message.includes('timeout') || message.includes('aborted')) {
      return true;
    }
  }
  // 5xx response errors
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    const statusCode = (error as { statusCode: number }).statusCode;
    return statusCode >= 500 && statusCode <= 599;
  }
  return false;
}

/** Sleeps for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a function with exponential backoff retry.
 * Retries only on retryable errors (connection, timeout, 5xx).
 * Throws RetriesExhaustedError if all attempts fail.
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_CONFIG
): Promise<T> {
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      if (!isRetryableError(error)) {
        throw err;
      }

      if (attempt < config.maxAttempts) {
        const delayMs = config.initialDelayMs * Math.pow(config.multiplier, attempt - 1);
        await sleep(delayMs);
      }
    }
  }

  throw new RetriesExhaustedError(lastError, config.maxAttempts);
}

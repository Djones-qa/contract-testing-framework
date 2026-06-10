/**
 * Verification execution logic.
 *
 * Loads contracts from the broker, iterates interactions, sets up provider states,
 * replays requests, and compares responses using the matching rules engine.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.9
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { v4 as uuid } from 'uuid';
import type {
  Contract,
  Interaction,
  ProviderState,
  RequestSpec,
  ResponseSpec,
  MatchingRule,
  Mismatch,
  InteractionResult,
  VerificationResult,
  VerificationJob,
} from '@contract-testing/shared';
import { evaluateResponse, deepEqual } from '@contract-testing/shared';

/** Provider response shape after replaying a request. */
interface ProviderResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Extended job info used internally during verification execution. */
export interface ExecutionJob {
  id: string;
  provider: string;
  providerVersion: string;
  providerBaseUrl: string;
  stateCallbackUrl?: string;
  contractIds: string[];
}

/**
 * Gets the broker URL, reading from environment at call time.
 */
function getBrokerUrl(): string {
  return process.env.BROKER_URL || 'http://localhost:4000';
}

/**
 * Executes a full verification run for the given job.
 *
 * Loads contracts from the broker, iterates through each interaction,
 * sets up provider states, replays the request, and compares responses.
 *
 * Requirement 4.1: Load all active contracts for the provider from the broker.
 */
export async function executeVerification(job: ExecutionJob): Promise<VerificationResult> {
  const interactionResults: InteractionResult[] = [];

  for (const contractId of job.contractIds) {
    const contract = await loadContract(contractId);

    for (const interaction of contract.interactions) {
      const result = await verifyInteraction(job, interaction);
      interactionResults.push(result);
    }
  }

  const success = interactionResults.every((r) => r.success);

  return {
    id: uuid(),
    contractId: job.contractIds[0] || '',
    provider: job.provider,
    providerVersion: job.providerVersion,
    success,
    interactions: interactionResults,
    executedAt: new Date(),
  };
}

/**
 * Loads a contract from the broker by ID.
 * Requirement 4.1
 */
async function loadContract(contractId: string): Promise<Contract> {
  const url = `${getBrokerUrl()}/contracts/${contractId}`;
  const response = await httpGet(url, 30_000);

  if (response.status !== 200) {
    throw new Error(`Failed to load contract ${contractId}: HTTP ${response.status}`);
  }

  return response.body as Contract;
}

/**
 * Verifies a single interaction against the provider.
 */
async function verifyInteraction(
  job: ExecutionJob,
  interaction: Interaction
): Promise<InteractionResult> {
  // 1. Setup provider states (Requirement 4.3, 4.4)
  if (interaction.providerStates.length > 0 && job.stateCallbackUrl) {
    for (const state of interaction.providerStates) {
      try {
        await setupProviderState(job.stateCallbackUrl, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          interactionId: interaction.id,
          interactionDescription: interaction.description,
          success: false,
          mismatches: [
            {
              path: '',
              expected: 'provider state setup success',
              actual: `provider state setup failed: ${message}`,
              type: 'missing',
            },
          ],
        };
      }
    }
  }

  // 2. Replay request (Requirement 4.5, 4.9)
  let response: ProviderResponse;
  try {
    response = await replayRequest(job.providerBaseUrl, interaction.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      interactionId: interaction.id,
      interactionDescription: interaction.description,
      success: false,
      mismatches: [
        {
          path: '',
          expected: 'successful connection to provider',
          actual: `connectivity error: ${message}`,
          type: 'missing',
        },
      ],
    };
  }

  // 3. Compare response (Requirement 4.6)
  const mismatches = compareResponse(response, interaction.response, interaction.matchingRules);

  return {
    interactionId: interaction.id,
    interactionDescription: interaction.description,
    success: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Invokes the provider state setup callback.
 *
 * Requirement 4.3: POST to callback URL with state name and params.
 * Requirement 4.4: 10-second timeout; non-2xx marks interaction as failed.
 */
async function setupProviderState(callbackUrl: string, state: ProviderState): Promise<void> {
  const payload = JSON.stringify({
    name: state.name,
    params: state.params || {},
  });

  const response = await httpPost(callbackUrl, payload, {
    'Content-Type': 'application/json',
  }, 10_000);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Provider state callback returned HTTP ${response.status} for state "${state.name}"`
    );
  }
}

/**
 * Constructs and sends an HTTP request from the interaction spec.
 *
 * Requirement 4.5: Construct HTTP request from interaction's method, path, headers, query, body.
 * Requirement 4.9: 30-second timeout; connection refused marks as failed.
 */
async function replayRequest(
  providerBaseUrl: string,
  requestSpec: RequestSpec
): Promise<ProviderResponse> {
  const url = new URL(requestSpec.path, providerBaseUrl);

  // Add query parameters
  if (requestSpec.query) {
    for (const [key, value] of Object.entries(requestSpec.query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    ...(requestSpec.headers || {}),
  };

  let bodyStr: string | undefined;
  if (requestSpec.body !== undefined) {
    bodyStr = JSON.stringify(requestSpec.body);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await httpRequest(
    url.toString(),
    requestSpec.method,
    headers,
    bodyStr,
    30_000
  );

  return response;
}

/**
 * Compares the actual provider response against the expected response.
 *
 * Requirement 4.6: Compare using matching rules (status, headers, body).
 */
function compareResponse(
  actual: ProviderResponse,
  expected: ResponseSpec,
  matchingRules: MatchingRule[]
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  // Status check
  if (actual.status !== expected.status) {
    mismatches.push({
      path: '$.status',
      expected: expected.status,
      actual: actual.status,
      type: 'status',
    });
  }

  // Header checks
  if (expected.headers) {
    for (const [key, value] of Object.entries(expected.headers)) {
      const actualValue = actual.headers[key.toLowerCase()];
      if (actualValue !== value) {
        mismatches.push({
          path: `$.headers.${key}`,
          expected: value,
          actual: actualValue ?? null,
          type: 'header',
        });
      }
    }
  }

  // Body checks via matching rules engine
  const bodyMismatches = evaluateResponse(actual.body, expected.body, matchingRules);
  mismatches.push(...bodyMismatches);

  return mismatches;
}

// ─── HTTP utility functions using native Node.js http/https modules ───────────

function httpGet(url: string, timeoutMs: number): Promise<ProviderResponse> {
  return httpRequest(url, 'GET', {}, undefined, timeoutMs);
}

function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<ProviderResponse> {
  return httpRequest(url, 'POST', headers, body, timeoutMs);
}

function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number
): Promise<ProviderResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        ...headers,
      },
      timeout: timeoutMs,
    };

    if (body && !options.headers!['Content-Length' as keyof typeof options.headers]) {
      (options.headers as Record<string, string>)['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        let parsedBody: unknown;

        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = rawBody;
        }

        // Normalize headers to lowercase keys
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value !== undefined) {
            responseHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
          }
        }

        resolve({
          status: res.statusCode || 0,
          headers: responseHeaders,
          body: parsedBody,
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Connection error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Loads all active contracts for a provider from the broker.
 * Returns the list of contract IDs.
 *
 * Requirement 4.1
 */
export async function loadContractIdsForProvider(providerName: string): Promise<string[]> {
  const url = `${getBrokerUrl()}/contracts/provider/${encodeURIComponent(providerName)}`;
  const response = await httpGet(url, 30_000);

  if (response.status !== 200) {
    throw new Error(`Failed to load contracts for provider "${providerName}": HTTP ${response.status}`);
  }

  const contracts = response.body as Array<{ id: string }>;
  return contracts.map((c) => c.id);
}

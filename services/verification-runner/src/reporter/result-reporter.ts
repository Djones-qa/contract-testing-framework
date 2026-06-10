/**
 * Result reporter for submitting verification results back to the broker.
 *
 * Requirement 4.7: Submit verification result to broker via POST /contracts/:id/verify.
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import type { VerificationResult } from '@contract-testing/shared';

/**
 * Gets the broker URL, reading from environment at call time.
 */
function getBrokerUrl(): string {
  return process.env.BROKER_URL || 'http://localhost:4000';
}

/**
 * Submits a verification result to the Contract Broker.
 *
 * Sends a POST request to /contracts/:id/verify with the full verification result
 * payload including provider version, success status, per-interaction results,
 * and execution timestamp.
 *
 * Requirement 4.7
 */
export async function submitVerificationResult(result: VerificationResult): Promise<void> {
  const url = `${getBrokerUrl()}/contracts/${result.contractId}/verify`;
  const payload = JSON.stringify({
    providerVersion: result.providerVersion,
    provider: result.provider,
    success: result.success,
    interactions: result.interactions,
    executedAt: result.executedAt.toISOString(),
  });

  const response = await httpPost(url, payload, {
    'Content-Type': 'application/json',
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Failed to submit verification result for contract ${result.contractId}: HTTP ${response.status}`
    );
  }
}

// ─── HTTP utility ─────────────────────────────────────────────────────────────

interface HttpResponse {
  status: number;
  body: unknown;
}

function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body).toString(),
      },
      timeout: 30_000,
    };

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

        resolve({
          status: res.statusCode || 0,
          body: parsedBody,
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Failed to submit result to broker: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Broker request timed out while submitting verification result'));
    });

    req.end(body);
  });
}

/**
 * HTTP client that triggers verification on the Verification Runner.
 * Posts to POST /verify with provider name and provider base URL.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { VerificationTrigger } from './stream-consumer';

const REQUEST_TIMEOUT_MS = 30_000;

/** Error with HTTP status code information. */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

/**
 * Creates a verification trigger that POSTs to the Verification Runner.
 */
export function createVerificationTrigger(verificationRunnerUrl: string): VerificationTrigger {
  return {
    async triggerVerification(providerName: string, providerBaseUrl: string): Promise<void> {
      const url = new URL('/verify', verificationRunnerUrl);
      const body = JSON.stringify({
        provider: providerName,
        providerVersion: 'latest',
        providerBaseUrl: providerBaseUrl,
      });

      return new Promise<void>((resolve, reject) => {
        const protocol = url.protocol === 'https:' ? https : http;

        const req = protocol.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body).toString(),
            },
            timeout: REQUEST_TIMEOUT_MS,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else if (res.statusCode && res.statusCode >= 500) {
                reject(new HttpError(`Verification Runner returned ${res.statusCode}: ${data}`, res.statusCode));
              } else {
                reject(new HttpError(`Verification Runner returned ${res.statusCode}: ${data}`, res.statusCode ?? 0));
              }
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout exceeded 30s'));
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.write(body);
        req.end();
      });
    },
  };
}

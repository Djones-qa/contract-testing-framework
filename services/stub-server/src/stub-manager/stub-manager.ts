import express, { Request, Response } from 'express';
import http from 'http';
import crypto from 'crypto';
import type { Contract, Interaction, StubInfo } from '@contract-testing/shared';
import { findBestMatch, IncomingRequest } from '../matcher';
import { createStubCache } from '../cache/stub-cache';

const BROKER_URL = process.env.BROKER_URL || 'http://localhost:4000';

interface ActiveStub {
  info: StubInfo;
  server: http.Server;
}

const activeStubs = new Map<string, ActiveStub>();

let stubCacheInstance: ReturnType<typeof createStubCache> | null = null;

function getStubCache() {
  if (!stubCacheInstance) {
    stubCacheInstance = createStubCache();
  }
  return stubCacheInstance;
}

/**
 * Fetches a contract from the broker service by ID.
 * Returns the contract or null if not found.
 */
async function fetchContractFromBroker(contractId: string): Promise<Contract | null> {
  const url = `${BROKER_URL}/contracts/${contractId}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Broker returned status ${response.status}`);
  }

  return response.json() as Promise<Contract>;
}

/**
 * Creates a dynamic Express server that serves interactions from a contract.
 */
function createDynamicStubServer(interactions: Interaction[]): express.Express {
  const app = express();
  app.use(express.json());

  // Use middleware to catch all requests and match against contract interactions
  app.use((req: Request, res: Response) => {
    const incomingRequest: IncomingRequest = {
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      query: (req.query as Record<string, string>) || {},
      body: req.body,
    };

    const matchedInteraction = findBestMatch(incomingRequest, interactions);

    if (!matchedInteraction) {
      const availableInteractions = interactions.map((interaction) => ({
        method: interaction.request.method,
        path: interaction.request.path,
      }));

      res.status(404).json({ availableInteractions });
      return;
    }

    // Respond with the matched interaction's response
    const { status, headers, body } = matchedInteraction.response;

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
    }

    res.status(status).json(body !== undefined ? body : null);
  });

  return app;
}

/**
 * Creates a new stub server from a contract ID.
 * Fetches the contract from the broker, creates a dynamic Express server,
 * and caches the configuration in Redis.
 */
export async function create(contractId: string): Promise<StubInfo | null> {
  const contract = await fetchContractFromBroker(contractId);

  if (!contract) {
    return null;
  }

  const stubId = crypto.randomUUID();
  const stubApp = createDynamicStubServer(contract.interactions);

  // Start the server on an available port (port 0 lets the OS assign one)
  const server = await new Promise<http.Server>((resolve, reject) => {
    const srv = stubApp.listen(0, () => {
      resolve(srv);
    });
    srv.on('error', reject);
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  const stubInfo: StubInfo = {
    id: stubId,
    contractId: contract.id,
    port,
    consumer: contract.consumer,
    provider: contract.provider,
    createdAt: new Date(),
  };

  // Cache the stub configuration in Redis
  await getStubCache().set(contractId, contract);

  // Store in active stubs map
  activeStubs.set(stubId, { info: stubInfo, server });

  return stubInfo;
}

/**
 * Returns all active stubs with their ports and contract references.
 */
export function list(): StubInfo[] {
  return Array.from(activeStubs.values()).map((stub) => stub.info);
}

/**
 * Destroys an active stub server by ID.
 * Shuts down the Express server, releases the port, and removes from cache.
 * Returns true if the stub was found and destroyed, false otherwise.
 */
export async function destroy(stubId: string): Promise<boolean> {
  const stub = activeStubs.get(stubId);

  if (!stub) {
    return false;
  }

  // Shut down the server
  await new Promise<void>((resolve, reject) => {
    stub.server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  // Invalidate the cache for this contract
  await getStubCache().invalidate(stub.info.contractId);

  // Remove from active stubs
  activeStubs.delete(stubId);

  return true;
}

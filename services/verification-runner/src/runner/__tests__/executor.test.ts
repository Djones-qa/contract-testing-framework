/**
 * Unit tests for the verification executor.
 *
 * Uses local HTTP mock servers to simulate broker and provider behavior.
 */

import http from 'http';
import { executeVerification, loadContractIdsForProvider } from '../executor';
import type { ExecutionJob } from '../executor';
import type { Contract, Interaction } from '@contract-testing/shared';

function createMockServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const address = server.address() as { port: number };
      resolve({ server, port: address.port });
    });
  });
}

function closeMockServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

describe('executeVerification', () => {
  let brokerServer: http.Server;
  let providerServer: http.Server;
  let stateCallbackServer: http.Server;
  let brokerPort: number;
  let providerPort: number;
  let stateCallbackPort: number;

  const sampleInteraction: Interaction = {
    id: 'interaction-1',
    description: 'Get a user by ID',
    providerStates: [],
    request: {
      method: 'GET',
      path: '/users/1',
      headers: { 'Accept': 'application/json' },
    },
    response: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { id: 1, name: 'Alice' },
    },
    matchingRules: [],
  };

  const sampleContract: Contract = {
    id: 'contract-1',
    consumer: 'frontend',
    provider: 'user-service',
    version: '1.0.0',
    status: 'active',
    interactions: [sampleInteraction],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  afterEach(async () => {
    if (brokerServer) await closeMockServer(brokerServer);
    if (providerServer) await closeMockServer(providerServer);
    if (stateCallbackServer) await closeMockServer(stateCallbackServer);
  });

  it('should verify a successful interaction', async () => {
    // Mock broker returning the contract
    const brokerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sampleContract));
    });
    brokerServer = brokerMock.server;
    brokerPort = brokerMock.port;

    // Mock provider responding correctly
    const providerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 1, name: 'Alice' }));
    });
    providerServer = providerMock.server;
    providerPort = providerMock.port;

    process.env.BROKER_URL = `http://localhost:${brokerPort}`;

    const job: ExecutionJob = {
      id: 'job-1',
      provider: 'user-service',
      providerVersion: '2.0.0',
      providerBaseUrl: `http://localhost:${providerPort}`,
      contractIds: ['contract-1'],
    };

    const result = await executeVerification(job);

    expect(result.success).toBe(true);
    expect(result.interactions).toHaveLength(1);
    expect(result.interactions[0].success).toBe(true);
    expect(result.interactions[0].mismatches).toHaveLength(0);
    expect(result.provider).toBe('user-service');
    expect(result.providerVersion).toBe('2.0.0');
  });

  it('should detect status mismatch', async () => {
    const brokerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sampleContract));
    });
    brokerServer = brokerMock.server;
    brokerPort = brokerMock.port;

    // Provider returns 404 instead of expected 200
    const providerMock = await createMockServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    providerServer = providerMock.server;
    providerPort = providerMock.port;

    process.env.BROKER_URL = `http://localhost:${brokerPort}`;

    const job: ExecutionJob = {
      id: 'job-2',
      provider: 'user-service',
      providerVersion: '2.0.0',
      providerBaseUrl: `http://localhost:${providerPort}`,
      contractIds: ['contract-1'],
    };

    const result = await executeVerification(job);

    expect(result.success).toBe(false);
    expect(result.interactions[0].success).toBe(false);
    expect(result.interactions[0].mismatches).toContainEqual(
      expect.objectContaining({ type: 'status', expected: 200, actual: 404 })
    );
  });

  it('should handle provider state setup', async () => {
    const interactionWithState: Interaction = {
      ...sampleInteraction,
      providerStates: [{ name: 'user exists', params: { userId: 1 } }],
    };

    const contractWithState = {
      ...sampleContract,
      interactions: [interactionWithState],
    };

    const brokerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contractWithState));
    });
    brokerServer = brokerMock.server;
    brokerPort = brokerMock.port;

    // Track state callback invocations
    let stateCallbackInvoked = false;
    let stateCallbackBody: string = '';

    const stateMock = await createMockServer(async (req, res) => {
      stateCallbackInvoked = true;
      stateCallbackBody = await collectBody(req);
      res.writeHead(200);
      res.end();
    });
    stateCallbackServer = stateMock.server;
    stateCallbackPort = stateMock.port;

    const providerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 1, name: 'Alice' }));
    });
    providerServer = providerMock.server;
    providerPort = providerMock.port;

    process.env.BROKER_URL = `http://localhost:${brokerPort}`;

    const job: ExecutionJob = {
      id: 'job-3',
      provider: 'user-service',
      providerVersion: '2.0.0',
      providerBaseUrl: `http://localhost:${providerPort}`,
      stateCallbackUrl: `http://localhost:${stateCallbackPort}/state`,
      contractIds: ['contract-1'],
    };

    const result = await executeVerification(job);

    expect(stateCallbackInvoked).toBe(true);
    const parsedBody = JSON.parse(stateCallbackBody);
    expect(parsedBody).toEqual({ name: 'user exists', params: { userId: 1 } });
    expect(result.success).toBe(true);
  });

  it('should fail interaction when provider state callback returns non-2xx', async () => {
    const interactionWithState: Interaction = {
      ...sampleInteraction,
      providerStates: [{ name: 'user exists', params: { userId: 1 } }],
    };

    const contractWithState = {
      ...sampleContract,
      interactions: [interactionWithState],
    };

    const brokerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contractWithState));
    });
    brokerServer = brokerMock.server;
    brokerPort = brokerMock.port;

    // State callback returns 500
    const stateMock = await createMockServer((_req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
    stateCallbackServer = stateMock.server;
    stateCallbackPort = stateMock.port;

    const providerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 1, name: 'Alice' }));
    });
    providerServer = providerMock.server;
    providerPort = providerMock.port;

    process.env.BROKER_URL = `http://localhost:${brokerPort}`;

    const job: ExecutionJob = {
      id: 'job-4',
      provider: 'user-service',
      providerVersion: '2.0.0',
      providerBaseUrl: `http://localhost:${providerPort}`,
      stateCallbackUrl: `http://localhost:${stateCallbackPort}/state`,
      contractIds: ['contract-1'],
    };

    const result = await executeVerification(job);

    expect(result.success).toBe(false);
    expect(result.interactions[0].success).toBe(false);
    expect(result.interactions[0].mismatches[0].actual).toContain('provider state setup failed');
  });

  it('should handle connectivity error when provider is unreachable', async () => {
    const brokerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sampleContract));
    });
    brokerServer = brokerMock.server;
    brokerPort = brokerMock.port;

    process.env.BROKER_URL = `http://localhost:${brokerPort}`;

    const job: ExecutionJob = {
      id: 'job-5',
      provider: 'user-service',
      providerVersion: '2.0.0',
      providerBaseUrl: 'http://localhost:19999', // unreachable port
      contractIds: ['contract-1'],
    };

    const result = await executeVerification(job);

    expect(result.success).toBe(false);
    expect(result.interactions[0].success).toBe(false);
    expect(result.interactions[0].mismatches[0].actual).toContain('connectivity error');
  });

  it('should construct request with query parameters and body', async () => {
    const interactionWithBody: Interaction = {
      id: 'interaction-2',
      description: 'Create a user',
      providerStates: [],
      request: {
        method: 'POST',
        path: '/users',
        headers: { 'Content-Type': 'application/json' },
        query: { notify: 'true' },
        body: { name: 'Bob', email: 'bob@example.com' },
      },
      response: {
        status: 201,
        body: { id: 2, name: 'Bob' },
      },
      matchingRules: [],
    };

    const contractWithBody = {
      ...sampleContract,
      interactions: [interactionWithBody],
    };

    const brokerMock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contractWithBody));
    });
    brokerServer = brokerMock.server;
    brokerPort = brokerMock.port;

    let receivedMethod = '';
    let receivedUrl = '';
    let receivedBody = '';

    const providerMock = await createMockServer(async (req, res) => {
      receivedMethod = req.method || '';
      receivedUrl = req.url || '';
      receivedBody = await collectBody(req);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 2, name: 'Bob' }));
    });
    providerServer = providerMock.server;
    providerPort = providerMock.port;

    process.env.BROKER_URL = `http://localhost:${brokerPort}`;

    const job: ExecutionJob = {
      id: 'job-6',
      provider: 'user-service',
      providerVersion: '2.0.0',
      providerBaseUrl: `http://localhost:${providerPort}`,
      contractIds: ['contract-1'],
    };

    const result = await executeVerification(job);

    expect(receivedMethod).toBe('POST');
    expect(receivedUrl).toContain('/users');
    expect(receivedUrl).toContain('notify=true');
    expect(JSON.parse(receivedBody)).toEqual({ name: 'Bob', email: 'bob@example.com' });
    expect(result.success).toBe(true);
  });
});

describe('loadContractIdsForProvider', () => {
  let brokerServer: http.Server;

  afterEach(async () => {
    if (brokerServer) await closeMockServer(brokerServer);
  });

  it('should load contract IDs for a provider', async () => {
    const contracts = [
      { id: 'c1', consumer: 'frontend', provider: 'user-service', version: '1.0.0' },
      { id: 'c2', consumer: 'mobile', provider: 'user-service', version: '1.0.0' },
    ];

    const mock = await createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contracts));
    });
    brokerServer = mock.server;

    process.env.BROKER_URL = `http://localhost:${mock.port}`;

    const ids = await loadContractIdsForProvider('user-service');
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('should throw when broker returns non-200', async () => {
    const mock = await createMockServer((_req, res) => {
      res.writeHead(500);
      res.end('error');
    });
    brokerServer = mock.server;

    process.env.BROKER_URL = `http://localhost:${mock.port}`;

    await expect(loadContractIdsForProvider('user-service')).rejects.toThrow(
      /Failed to load contracts/
    );
  });
});

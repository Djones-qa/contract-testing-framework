# Contract Testing Framework

![CI](https://github.com/Djones-qa/contract-testing-framework/actions/workflows/ci.yaml/badge.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)
![Redis](https://img.shields.io/badge/Redis-latest-red?logo=redis)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-latest-blue?logo=postgresql)
![Kubernetes](https://img.shields.io/badge/Kubernetes-1.28-blue?logo=kubernetes)
![Docker](https://img.shields.io/badge/Docker-latest-blue?logo=docker)
![License](https://img.shields.io/badge/License-MIT-yellow)

Production-grade consumer-driven contract testing framework — API contract verification, stub generation, compatibility matrix, webhook triggers. TypeScript/Node.js + Redis + PostgreSQL + Docker + GitHub Actions CI.

## Architecture Overview

| Service | Port | Description |
|---------|------|-------------|
| contract-broker | 4000 | Central registry for contracts, verification results, and the compatibility matrix |
| stub-server | 4001 | Mock server generation from contracts for consumer isolation testing |
| verification-runner | 4002 | Provider verification against stored contracts |
| webhook-service | — | Background verification trigger via Redis Stream events |

## Quick Start

```bash
docker compose up -d
```

This starts all services along with PostgreSQL and Redis. The broker is available at `http://localhost:4000`, stub server at `http://localhost:4001`, and verification runner at `http://localhost:4002`.

## API Endpoints

### Contract Broker (port 4000)

| Method | Path | Description |
|--------|------|-------------|
| POST | /contracts | Publish a new contract |
| GET | /contracts | List all active contracts (metadata only) |
| GET | /contracts/:id | Get full contract by ID |
| GET | /contracts/consumer/:name | Get contracts by consumer name |
| GET | /contracts/provider/:name | Get contracts by provider name |
| DELETE | /contracts/:id | Archive a contract |
| POST | /contracts/:id/verify | Submit verification result |
| GET | /matrix | Get compatibility matrix |
| GET | /matrix/can-i-deploy | Check deploy safety |
| GET | /health | Liveness probe |
| GET | /ready | Readiness probe |

### Stub Server (port 4001)

| Method | Path | Description |
|--------|------|-------------|
| POST | /stubs | Create a stub from a contract |
| GET | /stubs | List active stubs |
| DELETE | /stubs/:id | Destroy a stub |
| GET | /health | Liveness probe |
| GET | /ready | Readiness probe |

### Verification Runner (port 4002)

| Method | Path | Description |
|--------|------|-------------|
| POST | /verify | Trigger provider verification |
| GET | /verify/:id/status | Get verification job status |
| GET | /results | List verification results (paginated) |
| GET | /health | Liveness probe |
| GET | /ready | Readiness probe |

## Contract Format

```json
{
  "consumer": "order-service",
  "provider": "inventory-service",
  "version": "1.0.0",
  "interactions": [
    {
      "description": "Get product stock level",
      "providerStates": [
        {
          "name": "product exists",
          "params": { "productId": "abc-123" }
        }
      ],
      "request": {
        "method": "GET",
        "path": "/products/abc-123/stock",
        "headers": {
          "Accept": "application/json"
        }
      },
      "response": {
        "status": 200,
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "productId": "abc-123",
          "quantity": 42,
          "warehouse": "us-east-1"
        }
      },
      "matchingRules": [
        {
          "path": "$.body.productId",
          "type": "exact",
          "value": "abc-123"
        },
        {
          "path": "$.body.quantity",
          "type": "type",
          "value": 0
        },
        {
          "path": "$.body.warehouse",
          "type": "regex",
          "value": "^[a-z]{2}-[a-z]+-\\d+$"
        }
      ]
    }
  ]
}
```

## Can-I-Deploy

Use the compatibility matrix to gate deployments in CI/CD pipelines:

```bash
# Check if a service version is safe to deploy
curl "http://localhost:4000/matrix/can-i-deploy?service=order-service&version=1.0.0"
```

Response when safe to deploy:

```json
{
  "deployable": true
}
```

Response when deployment is blocked:

```json
{
  "deployable": false,
  "failingContracts": [
    {
      "consumerName": "order-service",
      "providerName": "inventory-service",
      "consumerVersion": "1.0.0"
    }
  ]
}
```

## Development Setup

```bash
# Install dependencies
pnpm install

# Build all packages and services
pnpm -r run build

# Run all tests
pnpm -r run test

# Type check all packages
pnpm -r run typecheck
```

## Author

**Darrius Jones**

- GitHub: [Djones-qa](https://github.com/Djones-qa)
- LinkedIn: [darrius-jones-28226b350](https://www.linkedin.com/in/darrius-jones-28226b350)

## License

MIT © 2024 Darrius Jones

---

**Topics:** `contract-testing` `consumer-driven-contracts` `api-testing` `microservices` `typescript` `nodejs` `redis` `postgresql` `rest-api` `docker` `kubernetes` `github-actions` `testing-tools` `developer-tools` `pact` `stub-server` `verification` `ci-cd` `service-mesh` `platform-engineering`

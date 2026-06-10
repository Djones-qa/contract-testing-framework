# Implementation Plan: Contract Testing Framework

## Overview

This plan implements a production-grade consumer-driven contract testing framework as a TypeScript monorepo. The implementation proceeds from foundational infrastructure (monorepo setup, shared types) through core services (broker, stub server, verification runner, webhook) to deployment artifacts (Docker, Kubernetes, CI/CD). Each task is self-contained and builds incrementally on prior work.

## Tasks

- [x] 1. Project setup and monorepo infrastructure
  - [x] 1.1 Initialize pnpm workspace monorepo with TypeScript configuration
    - Create root `package.json` with pnpm workspace configuration
    - Create `pnpm-workspace.yaml` referencing `packages/*` and `services/*`
    - Create `tsconfig.base.json` with strict TypeScript settings (ES2022 target, ESM modules, strict: true, composite project references)
    - Create `jest.config.base.ts` with TypeScript preset and coverage thresholds
    - Initialize `packages/shared/package.json` with name `@contract-testing/shared`
    - Initialize `services/contract-broker/package.json`, `services/stub-server/package.json`, `services/verification-runner/package.json`, `services/webhook-service/package.json`
    - Create per-package `tsconfig.json` files extending the base config
    - Add root scripts: `build`, `test`, `typecheck`, `lint`
    - _Requirements: 14.1_

- [x] 2. Shared package — types and interfaces
  - [x] 2.1 Implement shared TypeScript type definitions
    - Create `packages/shared/src/types/contract.ts` with `Contract`, `ContractSummary`, `Interaction`, `RequestSpec`, `ResponseSpec`, `MatchingRule`, `MatchingRuleType`, `HttpMethod`, `ProviderState` interfaces
    - Create `packages/shared/src/types/verification.ts` with `VerificationResult`, `InteractionResult`, `Mismatch`, `MismatchType` interfaces
    - Create `packages/shared/src/types/matrix.ts` with `MatrixEntry`, `CanIDeployResult`, `FailingContract` interfaces
    - Create `packages/shared/src/types/events.ts` with `ContractPublishedEvent`, `StubInfo`, `VerificationJob`, `PaginatedResult` interfaces
    - Create `packages/shared/src/types/index.ts` re-exporting all types
    - Create `packages/shared/src/index.ts` barrel export
    - _Requirements: 1.1, 1.4, 4.8, 6.1, 8.1, 11.1, 11.2, 11.3, 12.1_

- [x] 3. Shared package — matching rules engine
  - [x] 3.1 Implement matching rules engine
    - Create `packages/shared/src/matching/engine.ts` with the `evaluateMatchingRule` function
    - Implement `exact` rule type using deep equality (recursive comparison of primitives, arrays, objects)
    - Implement `type` rule type comparing type categories: string, number, boolean, null, array, object
    - Implement `regex` rule type with full-string anchoring (`^(?:pattern)$`)
    - Implement `include` rule type with case-sensitive substring check
    - Implement `toStringRepresentation` for non-string coercion (JSON.stringify for non-strings)
    - Implement `deepEqual` utility function
    - Handle missing JSON path (jsonpath query returning empty array → mismatch type "missing")
    - Handle invalid regex pattern gracefully (return mismatch, don't throw)
    - Install and use `jsonpath` library for JSON path resolution
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [ ]* 3.2 Write property tests for exact matching (Property 4)
    - **Property 4: Exact Matching Deep Equality**
    - Create `packages/shared/src/matching/__tests__/matching-engine.property.test.ts`
    - Use fast-check to generate arbitrary JSON values and verify that exact matching passes iff values are deeply equal
    - **Validates: Requirements 5.1**

  - [ ]* 3.3 Write property tests for type matching (Property 5)
    - **Property 5: Type Matching Category Check**
    - Verify that type matching passes iff both values share the same type category
    - **Validates: Requirements 5.2**

  - [ ]* 3.4 Write property tests for regex matching (Property 6)
    - **Property 6: Regex Matching with Full-String Anchoring**
    - Generate string values and valid regex patterns, verify that matching agrees with `new RegExp("^(?:" + p + ")$").test(s)`
    - **Validates: Requirements 5.3**

  - [ ]* 3.5 Write property tests for include matching (Property 7)
    - **Property 7: Include Matching Substring Check**
    - Generate strings and substrings, verify include matching agrees with `String.prototype.includes`
    - **Validates: Requirements 5.4**

  - [ ]* 3.6 Write property tests for missing JSON path (Property 8)
    - **Property 8: Missing JSON Path Produces Missing Mismatch**
    - Generate objects and paths that don't exist in the object, verify mismatch type is "missing"
    - **Validates: Requirements 5.6**

  - [ ]* 3.7 Write property tests for matching determinism (Property 9)
    - **Property 9: Matching Rules Determinism**
    - Evaluate the same rule against the same value twice, verify identical results
    - **Validates: Requirements 5.7**

  - [ ]* 3.8 Write property tests for non-string coercion (Property 10)
    - **Property 10: Non-String Coercion for Regex and Include**
    - Generate non-string values, verify regex/include matching uses JSON.stringify representation
    - **Validates: Requirements 5.9**

- [x] 4. Shared package — contract validation
  - [x] 4.1 Implement contract validation logic
    - Create `packages/shared/src/validation/contract-validator.ts`
    - Validate consumer/provider name: non-empty, max 128 chars
    - Validate version: semver format (major.minor.patch)
    - Validate each interaction: description with ≥1 non-whitespace char, request spec, response spec
    - Validate request spec: valid HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, case-insensitive), path starting with "/"
    - Validate response spec: status integer in [100, 599]
    - Validate matching rules: JSON path starting with "$", supported type, non-null value
    - Return structured validation errors listing all failed fields
    - _Requirements: 1.2, 1.7, 11.1, 11.2, 11.3, 11.4, 11.6_

  - [ ]* 4.2 Write property tests for contract validation (Property 3)
    - **Property 3: Contract Validation Correctness**
    - Create `packages/shared/src/validation/__tests__/contract-validator.property.test.ts`
    - Generate valid and invalid contracts, verify validation passes iff all criteria are met
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 1.7**

  - [ ]* 4.3 Write property tests for serialization round-trip (Property 1)
    - **Property 1: Contract Serialization Round-Trip**
    - Create `packages/shared/src/serialization/__tests__/serialization.property.test.ts`
    - Generate valid Contract objects, verify JSON.stringify → JSON.parse produces deeply equal objects
    - **Validates: Requirements 16.1, 16.2, 16.3**

- [x] 5. Checkpoint — Shared package complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Database setup — PostgreSQL schema and migrations
  - [x] 6.1 Create PostgreSQL database schema and migration files
    - Create `services/contract-broker/src/db/migrations/001_initial_schema.sql`
    - Define `contracts` table with UUID PK, consumer, provider, version, status, timestamps, unique constraint on (consumer, provider, version)
    - Define `interactions` table with FK to contracts, request/response columns, JSONB fields
    - Define `matching_rules` table with FK to interactions, json_path, rule_type, value
    - Define `provider_states` table with FK to interactions, name, params
    - Define `verification_results` table with FK to contracts, provider info, success, timestamp
    - Define `interaction_results` table with FK to verification_results
    - Define `mismatches` table with FK to interaction_results
    - Define `matrix_entries` table with unique constraint on (consumer_name, consumer_version, provider_name, provider_version)
    - Create all indexes as specified in the design
    - Create `services/contract-broker/src/db/pool.ts` with connection pool setup (using `pg` library)
    - Create `services/contract-broker/src/db/migrate.ts` migration runner
    - _Requirements: 1.1, 6.1, 12.1, 12.2_

- [x] 7. Contract Broker service — core implementation
  - [x] 7.1 Implement Contract Broker Express app and health routes
    - Create `services/contract-broker/src/app.ts` with Express application setup, JSON body parsing, error handling middleware
    - Implement `GET /health` returning `{"status": "ok"}` with 200
    - Implement `GET /ready` checking PostgreSQL and Redis connectivity with 5-second timeout
    - Return 503 with unavailable dependency info if either is unreachable
    - Create `services/contract-broker/src/redis/client.ts` for Redis connection management
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 7.2 Implement contract repository (database operations)
    - Create `services/contract-broker/src/db/contract-repository.ts`
    - Implement `create(contract)`: insert contract + interactions + matching_rules + provider_states in a transaction
    - Implement `findById(id)`: join contracts with interactions, matching_rules, and provider_states
    - Implement `findActive()`: return contract summaries where status = 'active'
    - Implement `findByConsumer(name)`: case-sensitive exact match, active only
    - Implement `findByProvider(name)`: case-sensitive exact match, active only
    - Implement `archive(id)`: update status to 'archived'
    - Implement `upsert(contract)`: replace interactions on (consumer, provider, version) conflict
    - _Requirements: 1.1, 1.5, 2.1, 2.2, 2.4, 2.5, 3.1, 3.3, 3.4, 11.5_

  - [x] 7.3 Implement contract publish and retrieve routes
    - Create `services/contract-broker/src/routes/contracts.ts`
    - Implement `POST /contracts`: validate using shared contract-validator, store via repository, emit event to Redis Stream, return 201 with ID
    - Handle validation errors → 400 with structured error response
    - Handle duplicate (consumer, provider, version) → upsert and emit event
    - Handle Redis Stream unavailability → still store, log warning, return 201
    - Implement `GET /contracts`: list active contracts (metadata only)
    - Implement `GET /contracts/:id`: return full contract or 404
    - Implement `GET /contracts/consumer/:name`: filter by consumer
    - Implement `GET /contracts/provider/:name`: filter by provider
    - Implement `DELETE /contracts/:id`: archive contract, return 200 or 404
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 7.4 Implement Redis Stream event publishing
    - Create `services/contract-broker/src/redis/event-publisher.ts`
    - Implement `publishContractEvent(event)`: XADD to `contract-events` stream
    - Include contractId, consumer, provider, version, timestamp in event payload
    - Handle Redis connection errors gracefully (log warning, do not throw)
    - _Requirements: 1.3, 1.6, 9.1_

  - [x] 7.5 Implement verification result storage and matrix routes
    - Create `services/contract-broker/src/db/verification-repository.ts` with `store` and `findByProvider` methods
    - Create `services/contract-broker/src/routes/verification.ts`
    - Implement `POST /contracts/:id/verify`: validate result payload, store verification result + interaction results + mismatches in transaction, update matrix entry
    - Return 404 if contract ID doesn't exist, 400 if missing provider version or interaction results
    - Create `services/contract-broker/src/matrix/matrix-service.ts`
    - Implement `GET /matrix`: return all matrix entries (with optional service filter)
    - Implement `GET /matrix/can-i-deploy`: validate service/version query params, check all active contracts for the service, return deployable status
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 12.1, 12.2, 12.4, 12.5, 12.6_

  - [ ]* 7.6 Write property tests for can-i-deploy logic (Property 11)
    - **Property 11: Can-I-Deploy Correctness**
    - Create `services/contract-broker/src/matrix/__tests__/matrix-service.property.test.ts`
    - Generate sets of contracts and verification results, verify can-i-deploy returns true iff all have successful verifications
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 7.7 Write property tests for matrix most-recent-verification (Property 16)
    - **Property 16: Most Recent Verification Retained**
    - Verify that after multiple verification submissions, only the latest timestamp entry is retained
    - **Validates: Requirements 6.4**

  - [ ]* 7.8 Write property tests for archived contracts exclusion (Property 17)
    - **Property 17: Archived Contracts Exclusion**
    - Generate mixed active/archived contracts, verify list endpoints and matrix only include active ones
    - **Validates: Requirements 3.3**

  - [ ]* 7.9 Write property tests for pagination invariants (Property 18)
    - **Property 18: Pagination Invariants**
    - Create `services/contract-broker/src/matrix/__tests__/pagination.property.test.ts`
    - Generate result sets of varying sizes, verify pagination math (total, totalPages, slice boundaries)
    - **Validates: Requirements 12.3**

- [x] 8. Checkpoint — Contract Broker complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Stub Server service
  - [x] 9.1 Implement Stub Server Express app, health routes, and Redis cache
    - Create `services/stub-server/src/app.ts` with Express setup, JSON body parsing, error middleware
    - Implement `GET /health` returning `{"status": "ok"}` with 200
    - Implement `GET /ready` checking Redis connectivity with 5-second timeout, returning 503 if unavailable
    - Create `services/stub-server/src/cache/stub-cache.ts` implementing Redis-backed cache with 5-minute TTL for stub configurations
    - _Requirements: 10.4, 10.6, 8.6_

  - [x] 9.2 Implement stub request matching logic
    - Create `services/stub-server/src/matcher/request-matcher.ts`
    - Implement `findBestMatch(request, interactions)` using scored matching
    - Implement `pathMatches`: segment comparison with `:param` wildcard support
    - Implement `headersMatch`: case-insensitive header name comparison, subset matching
    - Implement `queryMatches`: case-sensitive value comparison, subset matching
    - Implement `computeMatchScore`: method (required) + path (required) + headers + query + body rules
    - Select highest-scoring interaction when multiple match
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 9.3 Write property tests for stub path matching (Property 12)
    - **Property 12: Stub Path Matching with Wildcards**
    - Create `services/stub-server/src/matcher/__tests__/request-matcher.property.test.ts`
    - Generate path patterns and request paths, verify matching rules for segment count, literal matching, and wildcard behavior
    - **Validates: Requirements 13.2**

  - [ ]* 9.4 Write property tests for header matching (Property 13)
    - **Property 13: Stub Header Matching Case-Insensitivity**
    - Verify case-insensitive name comparison and subset semantics
    - **Validates: Requirements 13.3**

  - [ ]* 9.5 Write property tests for query matching (Property 14)
    - **Property 14: Stub Query Parameter Subset Matching**
    - Verify case-sensitive value comparison and subset semantics
    - **Validates: Requirements 13.4**

  - [ ]* 9.6 Write property tests for specificity selection (Property 15)
    - **Property 15: Stub Specificity Selection**
    - Generate multiple matching interactions, verify highest-score selection
    - **Validates: Requirements 13.6**

  - [x] 9.7 Implement stub management routes (create, list, destroy)
    - Create `services/stub-server/src/stub-manager/stub-manager.ts`
    - Implement `create(contractId)`: fetch contract from broker, create dynamic Express server on an available port, register interactions as routes, cache config in Redis
    - Implement `list()`: return all active stubs with ports and contract references
    - Implement `destroy(stubId)`: shut down Express server, release port, remove from cache
    - Create `services/stub-server/src/routes/stubs.ts`
    - Implement `POST /stubs`: create stub from contract ID, return 201 with stub ID and port; return 404 if contract not found
    - Implement `GET /stubs`: list active stubs
    - Implement `DELETE /stubs/:id`: destroy stub; return 404 if not found
    - Dynamic stub returns 404 with available interactions list when no match found
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.9_

- [x] 10. Checkpoint — Stub Server complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Verification Runner service
  - [x] 11.1 Implement Verification Runner Express app and health routes
    - Create `services/verification-runner/src/app.ts` with Express setup
    - Implement `GET /health` returning `{"status": "ok"}` with 200
    - Implement `GET /ready` checking Contract Broker reachability, returning 503 if unreachable
    - _Requirements: 10.5, 10.7_

  - [x] 11.2 Implement verification execution logic
    - Create `services/verification-runner/src/runner/executor.ts`
    - Implement `executeVerification(job)`: load contracts from broker, iterate interactions
    - Implement provider state setup: POST to callback URL with state name/params, 10-second timeout
    - Implement request replay: construct HTTP request from interaction spec, 30-second timeout
    - Implement response comparison: status check, header check, body check via matching rules
    - Handle connectivity errors gracefully (mark as failed with descriptive message)
    - Create `services/verification-runner/src/reporter/result-reporter.ts` for submitting results back to broker
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9_

  - [ ]* 11.3 Write property tests for request construction (Property 19)
    - **Property 19: Request Construction from Interaction**
    - Create `services/verification-runner/src/runner/__tests__/executor.property.test.ts`
    - Generate valid Interaction objects, verify request construction matches the spec exactly
    - **Validates: Requirements 4.5**

  - [x] 11.4 Implement verification routes
    - Create `services/verification-runner/src/routes/verify.ts`
    - Implement `POST /verify`: validate input (provider name, version, base URL required), create verification job, execute asynchronously, return job ID
    - Return 400 if required fields are missing
    - Implement `GET /verify/:id/status`: return job status (pending, running, completed, failed)
    - Implement `GET /results`: paginated verification results with provider name filter, default page size 20, max 100
    - _Requirements: 4.1, 4.2, 4.8, 12.3_

  - [ ]* 11.5 Write property tests for contract storage round-trip (Property 2)
    - **Property 2: Contract Storage Round-Trip**
    - Create `services/contract-broker/src/db/__tests__/contract-repository.property.test.ts`
    - Generate valid contracts, store and retrieve by ID, verify deep equality of all fields
    - **Validates: Requirements 11.5**

- [x] 12. Checkpoint — Verification Runner complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Webhook Service
  - [x] 13.1 Implement Redis Stream consumer and event processing
    - Create `services/webhook-service/src/app.ts` with service startup and graceful shutdown
    - Create `services/webhook-service/src/consumer/stream-consumer.ts`
    - Implement Redis Stream consumer using XREADGROUP on `contract-events` stream with consumer group `webhook-workers`
    - Process events in order per consumer-provider pair
    - Acknowledge events (XACK) only after successful processing or DLQ routing
    - _Requirements: 9.1, 9.4_

  - [x] 13.2 Implement retry policy and dead-letter queue
    - Create `services/webhook-service/src/retry/retry-policy.ts`
    - Implement exponential backoff: 1s initial delay, 2x multiplier, max 3 attempts
    - Retry on connection errors, timeouts (>30s), and 5xx responses
    - Create `services/webhook-service/src/dedup/dedup-filter.ts`
    - Implement deduplication using Redis `webhook:processed:{contractId}` keys with 1-hour TTL
    - On all retries exhausted: log failure (contract ID, provider name, error), move event to `contract-events-dlq` stream
    - _Requirements: 9.2, 9.3, 9.5_

  - [x] 13.3 Wire webhook service to trigger verification
    - Implement HTTP POST to Verification Runner `/verify` endpoint when a contract-published event is received
    - Include provider name and provider base URL in the verification trigger
    - Skip processing if dedup filter detects duplicate contract ID
    - _Requirements: 9.1, 9.2, 9.5_

- [x] 14. Checkpoint — All services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Docker setup
  - [x] 15.1 Create Dockerfiles for all services
    - Create `services/contract-broker/Dockerfile` using multi-stage build (node:20-alpine builder → production)
    - Create `services/stub-server/Dockerfile` with same pattern
    - Create `services/verification-runner/Dockerfile` with same pattern
    - Create `services/webhook-service/Dockerfile` with same pattern
    - Each Dockerfile: install pnpm, copy workspace files, build shared package first, then service, create non-root user (appuser:1001), expose correct port
    - _Requirements: 15.6_

  - [x] 15.2 Create docker-compose.yaml for local development
    - Create `docker-compose.yaml` with services: contract-broker, stub-server, verification-runner, webhook-service, postgres, redis
    - Configure PostgreSQL with volume persistence and initialization script
    - Configure Redis with persistence
    - Set up service dependencies (depends_on with health checks)
    - Map ports: 4000 (broker), 4001 (stub), 4002 (verification)
    - Define environment variables for database URLs, Redis URLs, and inter-service communication
    - _Requirements: 15.6, 15.7_

- [x] 16. Kubernetes manifests
  - [x] 16.1 Create namespace, RBAC, and network policies
    - Create `k8s/namespace.yaml` defining `contract-testing` namespace
    - Create `k8s/rbac.yaml` with per-service ServiceAccounts and minimal-permission Roles/RoleBindings
    - Create `k8s/network-policies.yaml` with default-deny ingress and explicit allow rules: Broker↔PostgreSQL/Redis, Verification Runner→Broker, Stub Server→Broker/Redis, Webhook→Redis/Verification Runner
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 16.2 Create resource quotas and pod disruption budgets
    - Create `k8s/resource-quotas.yaml` with namespace-level CPU and memory limits
    - Create `k8s/pdb.yaml` with PodDisruptionBudgets (minAvailable: 1) for each stateless service
    - _Requirements: 15.4, 15.5_

  - [x] 16.3 Create deployments and services for all components
    - Create `k8s/contract-broker/deployment.yaml` (2 replicas, resource requests/limits, liveness probe → /health, readiness probe → /ready with 5s timeout)
    - Create `k8s/contract-broker/service.yaml` (ClusterIP, port 4000)
    - Create `k8s/stub-server/deployment.yaml` and `k8s/stub-server/service.yaml` (2 replicas, port 4001)
    - Create `k8s/verification-runner/deployment.yaml` and `k8s/verification-runner/service.yaml` (2 replicas, port 4002)
    - Create `k8s/webhook-service/deployment.yaml` (2 replicas, no service needed — background worker)
    - Create `k8s/postgres/deployment.yaml`, `k8s/postgres/service.yaml`, `k8s/postgres/pvc.yaml` (1 replica, PVC for data)
    - Create `k8s/redis/deployment.yaml`, `k8s/redis/service.yaml`, `k8s/redis/pvc.yaml` (1 replica, PVC for data)
    - All deployments reference appropriate ServiceAccounts
    - _Requirements: 15.5, 15.6, 15.7_

- [x] 17. CI/CD pipeline
  - [x] 17.1 Create GitHub Actions CI workflow
    - Create `.github/workflows/ci.yaml`
    - Define trigger: push to any branch, pull_request to main
    - Job `typecheck-build`: checkout, setup node 20, pnpm install, `pnpm -r run typecheck`, `pnpm -r run build`
    - Job `unit-tests` (needs typecheck-build): pnpm install, `pnpm -r run test -- --coverage`, upload coverage artifacts
    - Job `trivy-scan`: use aquasecurity/trivy-action with scan-type config, severity HIGH/CRITICAL, exit-code 1
    - Job `kubeconform`: download kubeconform binary, validate `k8s/` directory against Kubernetes 1.28 schema with strict mode
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 18. README and documentation
  - [x] 18.1 Create README.md with badges and usage documentation
    - Create root `README.md` with project title and description
    - Add CI badge (GitHub Actions workflow status)
    - Document architecture overview with service descriptions and ports
    - Document quick start with docker-compose
    - Document API endpoints for each service
    - Document contract format with example
    - Document can-i-deploy usage for CI/CD integration
    - Document development setup (pnpm install, running tests, building)
    - _Requirements: 14.1_

- [x] 19. Final checkpoint — All artifacts complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The shared package must be built before any service that depends on it
- Database migrations must run before broker integration tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["7.1", "9.1", "11.1"] },
    { "id": 5, "tasks": ["7.2", "7.4", "9.2"] },
    { "id": 6, "tasks": ["7.3", "9.7", "11.2"] },
    { "id": 7, "tasks": ["7.5", "9.3", "9.4", "9.5", "9.6", "11.3", "11.4"] },
    { "id": 8, "tasks": ["7.6", "7.7", "7.8", "7.9", "11.5"] },
    { "id": 9, "tasks": ["13.1"] },
    { "id": 10, "tasks": ["13.2"] },
    { "id": 11, "tasks": ["13.3"] },
    { "id": 12, "tasks": ["15.1", "15.2"] },
    { "id": 13, "tasks": ["16.1", "16.2"] },
    { "id": 14, "tasks": ["16.3"] },
    { "id": 15, "tasks": ["17.1"] },
    { "id": 16, "tasks": ["18.1"] }
  ]
}
```

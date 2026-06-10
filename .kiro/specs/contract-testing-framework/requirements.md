# Requirements Document

## Introduction

This document defines the requirements for a production-grade consumer-driven contract testing framework. The framework enables teams to define API contracts (REST and event-driven), verify providers against those contracts, generate stubs for consumer isolation, and track contract compatibility across service versions. It includes a central broker for contract storage, a compatibility matrix, stub generation, automated verification, and CI/CD integration.

## Glossary

- **Contract_Broker**: The central registry service (port 4000) that stores contracts, tracks provider verification results, and computes the compatibility matrix.
- **Stub_Server**: The service (port 4001) that generates mock HTTP servers from contracts so consumers can test in isolation.
- **Verification_Runner**: The service (port 4002) that runs provider verification against stored contracts and reports results.
- **Webhook_Service**: A background worker that consumes contract publish events from Redis Stream and triggers provider verification automatically.
- **Contract**: A versioned specification defining interactions between a consumer and a provider, including request/response expectations and matching rules.
- **Interaction**: A single request-response pair within a contract, including provider states, request specification, and expected response specification.
- **Matching_Rule**: A rule applied to a specific JSON path during verification, supporting exact, type, regex, and include match types.
- **Provider_State**: A named precondition with optional parameters that a provider must set up before an interaction can be verified.
- **Verification_Result**: The outcome of running a contract's interactions against a live provider, including per-interaction success status and mismatches.
- **Mismatch**: A specific discrepancy found during verification, categorized by type (status, header, body, or missing).
- **Compatibility_Matrix**: A cross-reference of consumer versions against provider versions, showing verification status and success for each pair.
- **Can_I_Deploy_Check**: A query against the compatibility matrix that determines whether a specific service version is safe to deploy based on all related contract verifications.
- **Stub**: A dynamically generated Express HTTP server that responds to requests matching a contract's interactions, enabling consumer isolation testing.
- **Redis_Stream**: A Redis data structure used as a message queue for publishing contract events consumed by the Webhook_Service.

## Requirements

### Requirement 1: Publish Contract

**User Story:** As a consumer team, I want to publish a contract to the broker, so that providers can verify their implementations against the contract.

#### Acceptance Criteria

1. WHEN a valid contract is submitted via POST /contracts, THE Contract_Broker SHALL store the contract in PostgreSQL and return a 201 response with the contract ID.
2. IF a contract is submitted with a missing required field (consumer, provider, version, or interactions), THEN THE Contract_Broker SHALL return a 400 response with a descriptive validation error indicating which fields are missing.
3. WHEN a contract is published successfully, THE Contract_Broker SHALL emit a contract-published event to the Redis_Stream containing the contract ID, consumer name, provider name, and version.
4. THE Contract_Broker SHALL assign a UUID v4 identifier to each published contract.
5. WHEN a contract is published with the same consumer, provider, and version as an existing active contract, THE Contract_Broker SHALL overwrite the existing contract interactions and metadata, preserve the original contract ID, and emit a contract-published event.
6. IF the Redis_Stream is unavailable when publishing a contract, THEN THE Contract_Broker SHALL still store the contract in PostgreSQL, return a 201 response, and log a warning indicating the event was not emitted.
7. THE Contract_Broker SHALL enforce a maximum length of 128 characters for consumer and provider names, and version SHALL conform to semantic versioning format (major.minor.patch).

### Requirement 2: Retrieve Contracts

**User Story:** As a developer, I want to query contracts from the broker, so that I can inspect existing contracts for my services.

#### Acceptance Criteria

1. WHEN a GET /contracts request is received, THE Contract_Broker SHALL return a list of all active (non-archived) contracts with metadata (id, consumer, provider, version, status, createdAt, updatedAt) without including full interaction details.
2. WHEN a GET /contracts/:id request is received with a valid contract ID, THE Contract_Broker SHALL return the full contract including all interactions, matching rules, and provider states.
3. IF a GET /contracts/:id request is received with a non-existent contract ID, THEN THE Contract_Broker SHALL return a 404 response.
4. WHEN a GET /contracts/consumer/:name request is received, THE Contract_Broker SHALL return all active contracts where the consumer field matches the specified name using case-sensitive exact matching, or an empty list if no matches are found.
5. WHEN a GET /contracts/provider/:name request is received, THE Contract_Broker SHALL return all active contracts where the provider field matches the specified name using case-sensitive exact matching, or an empty list if no matches are found.

### Requirement 3: Archive Contract

**User Story:** As a service owner, I want to archive contracts that are no longer relevant, so that the compatibility matrix reflects only active service relationships.

#### Acceptance Criteria

1. WHEN a DELETE /contracts/:id request is received with a valid contract ID for an active contract, THE Contract_Broker SHALL mark the contract status as archived and return a 200 response containing the updated contract with its archived status.
2. IF a DELETE /contracts/:id request is received with a non-existent contract ID, THEN THE Contract_Broker SHALL return a 404 response.
3. WHILE a contract status is archived, THE Contract_Broker SHALL exclude the contract from compatibility matrix calculations and from list endpoints (GET /contracts, GET /contracts/consumer/:name, GET /contracts/provider/:name), but SHALL still return the contract when requested directly via GET /contracts/:id.
4. IF a DELETE /contracts/:id request is received for a contract that is already archived, THEN THE Contract_Broker SHALL return a 200 response with the existing archived contract (idempotent operation).

### Requirement 4: Contract Verification

**User Story:** As a provider team, I want to verify my service against consumer contracts, so that I can ensure my changes do not break consumers.

#### Acceptance Criteria

1. WHEN a POST /verify request is received with a provider name, provider version, and provider base URL, THE Verification_Runner SHALL load all active contracts for that provider from the Contract_Broker.
2. IF a POST /verify request is missing the provider name, provider version, or provider base URL, THEN THE Verification_Runner SHALL return a 400 response indicating which required fields are absent.
3. WHEN verifying an interaction that defines provider states, THE Verification_Runner SHALL invoke the provider state setup callback URL with an HTTP POST containing the provider state name and parameters before replaying the request.
4. IF the provider state setup callback returns a non-2xx response or times out after 10 seconds, THEN THE Verification_Runner SHALL mark the interaction as failed with a provider state setup error.
5. WHEN replaying an interaction request against the provider, THE Verification_Runner SHALL construct the HTTP request using the interaction's method, path, headers, query parameters, and body.
6. WHEN a provider response is received, THE Verification_Runner SHALL compare the response against the expected response specification using the defined matching rules.
7. WHEN verification completes for all interactions, THE Verification_Runner SHALL submit the verification result to the Contract_Broker via POST /contracts/:id/verify.
8. WHEN a GET /verify/:id/status request is received, THE Verification_Runner SHALL return the current status of the verification job (pending, running, completed, or failed).
9. IF the provider base URL is unreachable (connection refused or response not received within 30 seconds) during verification, THEN THE Verification_Runner SHALL mark the verification as failed with a connectivity error.

### Requirement 5: Matching Rules Engine

**User Story:** As a contract author, I want to define flexible matching rules, so that I can specify contracts that tolerate acceptable variations in provider responses.

#### Acceptance Criteria

1. WHEN a matching rule of type "exact" is applied to a JSON path, THE Matching_Rules_Engine SHALL pass only if the actual value is deeply equal to the expected value, where deep equality requires identical types, identical primitive values, identical array lengths with element-wise deep equality in order, and identical object keys with deep equality of corresponding values regardless of key order.
2. WHEN a matching rule of type "type" is applied to a JSON path, THE Matching_Rules_Engine SHALL pass only if the actual value has the same type category as the expected value, where supported type categories are: "string", "number", "boolean", "null", "array", and "object" (arrays and objects are treated as distinct categories).
3. WHEN a matching rule of type "regex" is applied to a JSON path, THE Matching_Rules_Engine SHALL pass only if the string representation of the actual value produces a full match against the specified regular expression pattern (the pattern is implicitly anchored to match the entire string).
4. WHEN a matching rule of type "include" is applied to a JSON path, THE Matching_Rules_Engine SHALL pass only if the string representation of the actual value contains the specified substring using case-sensitive comparison.
5. WHEN no matching rule is defined for a JSON path, THE Matching_Rules_Engine SHALL default to exact matching for that path.
6. WHEN a matching rule references a JSON path that does not exist in the actual response, THE Matching_Rules_Engine SHALL report a mismatch of type "missing".
7. FOR ALL valid response values, applying a matching rule and then applying the same rule to an identical value SHALL produce the same pass/fail result (deterministic evaluation).
8. IF a matching rule of type "regex" specifies an invalid regular expression pattern, THEN THE Matching_Rules_Engine SHALL report a mismatch indicating an invalid pattern rather than passing or throwing an unhandled error.
9. WHEN a matching rule of type "regex" or "include" is applied to a non-string value, THE Matching_Rules_Engine SHALL convert the value to its JSON-serialized string representation before applying the match.

### Requirement 6: Compatibility Matrix

**User Story:** As a release manager, I want to view a compatibility matrix of all service versions, so that I can understand which versions are verified to work together.

#### Acceptance Criteria

1. WHEN a GET /matrix request is received, THE Contract_Broker SHALL return a list of matrix entries, where each entry contains the consumer name, consumer version, provider name, provider version, verification status (one of: success, failure, or unverified), and the verification timestamp if verified.
2. WHEN a verification result is submitted via POST /contracts/:id/verify, THE Contract_Broker SHALL update the corresponding matrix entry with the verification success status and the timestamp of the verification.
3. WHEN the GET /matrix response includes a consumer-provider version pair that has no recorded verification result, THE Contract_Broker SHALL report the entry with a status of unverified and no verification timestamp.
4. THE Contract_Broker SHALL retain only the most recently submitted verification result per consumer-version and provider-version pair, determined by the verification execution timestamp.
5. WHEN a GET /matrix request is received with a service query parameter, THE Contract_Broker SHALL return only matrix entries where the consumer name or provider name matches the specified service name.

### Requirement 7: Can I Deploy Check

**User Story:** As a CI/CD pipeline, I want to check whether a specific service version is safe to deploy, so that I can gate deployments on contract compatibility.

#### Acceptance Criteria

1. WHEN a GET /matrix/can-i-deploy request is received with query parameters "service" (service name) and "version" (service version), THE Contract_Broker SHALL identify all active contracts involving that service as either consumer or provider.
2. WHEN all relevant contracts have successful verification results for the specified version, THE Contract_Broker SHALL return a deployable status of true.
3. WHEN any relevant contract lacks a verification result or has a failed verification for the specified version, THE Contract_Broker SHALL return a deployable status of false with a list identifying each failing or unverified contract by consumer name, provider name, and consumer version.
4. IF no contracts exist for the specified service, THEN THE Contract_Broker SHALL return a deployable status of true with an indication that no contracts were found.
5. IF the "service" or "version" query parameter is missing from a GET /matrix/can-i-deploy request, THEN THE Contract_Broker SHALL return a 400 response with an error message indicating which required parameter is absent.

### Requirement 8: Stub Generation

**User Story:** As a consumer developer, I want to generate a stub server from a contract, so that I can test my service in isolation without depending on the real provider.

#### Acceptance Criteria

1. WHEN a POST /stubs request is received with a valid contract ID, THE Stub_Server SHALL create a dynamic Express HTTP server that responds to requests matching the contract's interactions and return a 201 response containing the stub ID and assigned port number.
2. WHEN a request matches an interaction's request specification (method, path, headers, query, body), THE Stub SHALL respond with the interaction's defined response (status, headers, body).
3. WHEN a request does not match any interaction in the stub's contract, THE Stub SHALL return a 404 response with a body listing the method and path of each available interaction in the contract.
4. WHEN a GET /stubs request is received, THE Stub_Server SHALL return a list of all active stubs with their assigned ports and contract references.
5. WHEN a DELETE /stubs/:id request is received with a valid stub ID, THE Stub_Server SHALL shut down the corresponding stub server, release the allocated port, and return a 200 response.
6. THE Stub_Server SHALL cache stub configurations in Redis with a TTL of 5 minutes.
7. WHEN a contract is updated in the Contract_Broker, THE Stub_Server SHALL invalidate the cached stub configuration for that contract.
8. IF a POST /stubs request is received with a contract ID that does not exist in the Contract_Broker, THEN THE Stub_Server SHALL return a 404 response indicating that the contract was not found.
9. IF a DELETE /stubs/:id request is received with a stub ID that does not correspond to an active stub, THEN THE Stub_Server SHALL return a 404 response.

### Requirement 9: Webhook-Driven Verification

**User Story:** As a platform team, I want provider verification to trigger automatically when a contract is published, so that verification feedback is immediate without manual intervention.

#### Acceptance Criteria

1. WHEN a contract-published event is received from the Redis_Stream, THE Webhook_Service SHALL submit a POST /verify request to the Verification_Runner with the contract's provider name and provider base URL, and SHALL acknowledge the event only after receiving a success response from the Verification_Runner.
2. IF the Verification_Runner returns a connection error, a response timeout exceeding 30 seconds, or an HTTP 5xx response when processing a webhook event, THEN THE Webhook_Service SHALL retry the request with exponential backoff starting at a 1-second delay with a 2x multiplier, up to a maximum of 3 attempts.
3. IF all 3 retry attempts fail, THEN THE Webhook_Service SHALL log the failure including the contract ID, provider name, and error reason, and move the event to a dead-letter queue.
4. THE Webhook_Service SHALL process events from the Redis_Stream in order per consumer-provider pair, ensuring that a subsequent event for the same pair is not processed until the current event is acknowledged or moved to the dead-letter queue.
5. IF a duplicate contract-published event is received for the same contract ID, THEN THE Webhook_Service SHALL skip processing and acknowledge the event without triggering verification.

### Requirement 10: Health and Readiness Probes

**User Story:** As a platform operator, I want health and readiness endpoints on all services, so that Kubernetes can manage service lifecycle correctly.

#### Acceptance Criteria

1. THE Contract_Broker SHALL respond to GET /health with a 200 status and a JSON body containing {"status": "ok"} when the service process is running.
2. THE Contract_Broker SHALL respond to GET /ready with a 200 status and a JSON body containing {"status": "ready"} only when both PostgreSQL and Redis connections are established and respond to a ping within 5 seconds.
3. IF PostgreSQL or Redis is unreachable or does not respond to a ping within 5 seconds, THEN THE Contract_Broker SHALL respond to GET /ready with a 503 status and a JSON body indicating which dependency is unavailable.
4. THE Stub_Server SHALL respond to GET /health with a 200 status and a JSON body containing {"status": "ok"} when the service process is running.
5. THE Verification_Runner SHALL respond to GET /health with a 200 status and a JSON body containing {"status": "ok"} when the service process is running.
6. THE Stub_Server SHALL respond to GET /ready with a 200 status only when the Redis connection is established and responsive within 5 seconds, and SHALL return a 503 status otherwise.
7. THE Verification_Runner SHALL respond to GET /ready with a 200 status only when the Contract_Broker is reachable, and SHALL return a 503 status otherwise.

### Requirement 11: Contract Data Integrity

**User Story:** As a developer, I want contracts to maintain structural integrity, so that verification and stub generation operate on well-formed data.

#### Acceptance Criteria

1. THE Contract_Broker SHALL validate that each interaction contains a description (at least 1 non-whitespace character), a request specification, and a response specification before storing a contract.
2. THE Contract_Broker SHALL validate that each request specification contains at minimum a method (one of GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS, case-insensitive) and a path (a non-empty string starting with "/").
3. THE Contract_Broker SHALL validate that each response specification contains at minimum a status code that is an integer between 100 and 599 inclusive.
4. WHEN a matching rule is defined, THE Contract_Broker SHALL validate that the rule includes a syntactically parseable JSON path expression starting with "$", a supported type (exact, type, regex, or include), and a non-null value.
5. FOR ALL contracts stored and retrieved, THE Contract_Broker SHALL preserve the exact structure of interactions, matching rules, and provider states (round-trip integrity).
6. IF a contract fails any structural validation defined in criteria 1 through 4, THEN THE Contract_Broker SHALL reject the contract, return a 400 response, and include an error message indicating which field or rule failed validation.

### Requirement 12: Verification Result Recording

**User Story:** As a provider team, I want verification results stored with detailed mismatch information, so that I can diagnose exactly what broke.

#### Acceptance Criteria

1. WHEN a POST /contracts/:id/verify request is received with a verification result, THE Contract_Broker SHALL store the result with the provider version, success status, per-interaction results, and execution timestamp.
2. WHEN a verification result is stored, THE Contract_Broker SHALL store each mismatch with its JSON path, expected value, actual value, and mismatch type (status, header, body, or missing).
3. WHEN a GET /results request is received, THE Verification_Runner SHALL return a paginated list of verification results with a default page size of 20 and a maximum page size of 100, with filtering by provider name.
4. WHEN a verification result is stored, THE Contract_Broker SHALL associate the verification result with the corresponding compatibility matrix entry.
5. IF a POST /contracts/:id/verify request references a non-existent contract ID, THEN THE Contract_Broker SHALL return a 404 response.
6. IF a POST /contracts/:id/verify request is received without a provider version or per-interaction results, THEN THE Contract_Broker SHALL return a 400 response with a validation error indicating the missing fields.

### Requirement 13: Stub Request Matching

**User Story:** As a consumer developer, I want stub request matching to be flexible, so that my tests work even when requests contain dynamic values.

#### Acceptance Criteria

1. WHEN matching an incoming request to a stub interaction, THE Stub SHALL compare the HTTP method as case-insensitive exact match.
2. WHEN matching an incoming request path, THE Stub SHALL match the path segments exactly, treating path parameters (segments prefixed with ":") as wildcards that match any non-empty value when defined in the interaction.
3. WHEN the interaction defines required headers, THE Stub SHALL verify those headers are present in the incoming request using case-insensitive header name comparison (additional headers are ignored).
4. WHEN the interaction defines query parameters, THE Stub SHALL verify those parameters are present with matching values using case-sensitive comparison (additional parameters are ignored).
5. WHEN the interaction defines a request body with matching rules, THE Stub SHALL apply the matching rules to the incoming request body using the Matching_Rules_Engine.
6. WHEN multiple interactions could match an incoming request, THE Stub SHALL select the interaction with the most specific match (most matching criteria satisfied).

### Requirement 14: CI/CD Integration

**User Story:** As a DevOps engineer, I want the framework to integrate with CI/CD pipelines via GitHub Actions, so that contract testing is automated on every change.

#### Acceptance Criteria

1. WHEN a pull request is opened or a commit is pushed to any branch, THE CI_Pipeline SHALL trigger and run TypeScript type checking (tsc --noEmit) and build for all services (Contract_Broker, Stub_Server, Verification_Runner, Webhook_Service) in the typecheck-build job.
2. THE CI_Pipeline SHALL run Jest test suites across all services (Contract_Broker, Stub_Server, Verification_Runner, Webhook_Service) with coverage reporting in the unit-tests job.
3. THE CI_Pipeline SHALL scan Dockerfiles and Kubernetes manifests for security vulnerabilities using Trivy in the trivy-scan job and SHALL fail the job if any vulnerability of severity HIGH or CRITICAL is detected.
4. THE CI_Pipeline SHALL validate Kubernetes manifests against the Kubernetes 1.28 schema using kubeconform in the kubeconform job.
5. IF any job in the CI_Pipeline fails, THEN THE CI_Pipeline SHALL block the pull request from merging by reporting a failed status check.

### Requirement 15: Kubernetes Deployment

**User Story:** As a platform operator, I want all services deployed to Kubernetes with proper resource management, so that the framework runs reliably in production.

#### Acceptance Criteria

1. THE Kubernetes_Manifests SHALL define a dedicated namespace for the contract testing framework.
2. THE Kubernetes_Manifests SHALL include RBAC rules that grant each service account only the API permissions required by that service's functionality, with no cluster-wide roles assigned.
3. THE Kubernetes_Manifests SHALL include a default-deny ingress network policy for the namespace and explicit allow rules permitting only the following communication paths: Contract_Broker to PostgreSQL and Redis, Verification_Runner to Contract_Broker, Stub_Server to Contract_Broker and Redis, and Webhook_Service to Redis and Verification_Runner.
4. THE Kubernetes_Manifests SHALL define resource quotas for the namespace specifying maximum total CPU and maximum total memory allocations.
5. THE Kubernetes_Manifests SHALL include pod disruption budgets ensuring at least one replica remains available during voluntary disruptions for each stateless service deployment.
6. THE Kubernetes_Manifests SHALL include deployment configurations for the Contract_Broker, Stub_Server, Verification_Runner, Webhook_Service, PostgreSQL, and Redis, where each deployment specifies a replica count of at least 2 for stateless services, container resource requests and limits for CPU and memory, and liveness and readiness probe configurations referencing the service health endpoints.
7. WHEN a deployment is defined for a service, THE Kubernetes_Manifests SHALL include a corresponding Kubernetes Service resource exposing that service for internal cluster communication.

### Requirement 16: Contract Serialization Round-Trip

**User Story:** As a developer, I want contracts to survive serialization and deserialization without data loss, so that stored contracts are identical to published contracts.

#### Acceptance Criteria

1. FOR ALL valid Contract objects, serializing to JSON and deserializing back SHALL produce an object that is deeply equal to the original in all fields (consumer, provider, version, interactions, and matching rules), disregarding property ordering.
2. FOR ALL valid Interaction objects containing matching rules, serializing and deserializing SHALL preserve the matching rule type, path, and value as strictly equal (same JavaScript type and value) to the original.
3. FOR ALL valid MatchingRule objects, the JSON path string after serialization and deserialization SHALL be character-for-character identical to the original JSON path string.
4. IF deserialization of a stored contract produces a JSON parsing error or fails schema validation, THEN THE Contract_Broker SHALL return an error response indicating the contract data is corrupted and SHALL NOT return a partially constructed Contract object.

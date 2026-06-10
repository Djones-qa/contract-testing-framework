/**
 * Shared contract type definitions for the contract testing framework.
 */

/** Supported HTTP methods for contract interactions. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Supported matching rule types for response verification. */
export type MatchingRuleType = 'exact' | 'type' | 'regex' | 'include';

/** A matching rule applied to a specific JSON path during verification. */
export interface MatchingRule {
  /** JSON path expression starting with "$" */
  path: string;
  /** The type of matching to apply */
  type: MatchingRuleType;
  /** The expected value (non-null) used for comparison */
  value: unknown;
}

/** A named precondition with optional parameters for provider state setup. */
export interface ProviderState {
  /** Name of the provider state */
  name: string;
  /** Optional parameters for the provider state */
  params?: Record<string, unknown>;
}

/** Request specification for an interaction. */
export interface RequestSpec {
  /** HTTP method */
  method: HttpMethod;
  /** Request path (must start with "/") */
  path: string;
  /** Optional HTTP headers */
  headers?: Record<string, string>;
  /** Optional query parameters */
  query?: Record<string, string>;
  /** Optional request body */
  body?: unknown;
  /** Optional matching rules for request body validation */
  matchingRules?: MatchingRule[];
}

/** Response specification for an interaction. */
export interface ResponseSpec {
  /** HTTP status code (100-599) */
  status: number;
  /** Optional HTTP headers */
  headers?: Record<string, string>;
  /** Optional response body */
  body?: unknown;
  /** Optional matching rules for response validation */
  matchingRules?: MatchingRule[];
}

/** A single request-response pair within a contract. */
export interface Interaction {
  /** Unique identifier */
  id: string;
  /** Description of the interaction (at least 1 non-whitespace character) */
  description: string;
  /** Provider states that must be set up before verification */
  providerStates: ProviderState[];
  /** The expected request specification */
  request: RequestSpec;
  /** The expected response specification */
  response: ResponseSpec;
  /** Matching rules applied during verification */
  matchingRules: MatchingRule[];
}

/** A versioned contract between a consumer and a provider. */
export interface Contract {
  /** UUID v4 identifier */
  id: string;
  /** Consumer service name (max 128 characters) */
  consumer: string;
  /** Provider service name (max 128 characters) */
  provider: string;
  /** Semantic version (major.minor.patch) */
  version: string;
  /** Contract status */
  status: 'active' | 'archived';
  /** List of interactions in this contract */
  interactions: Interaction[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp when the contract was created */
  createdAt: Date;
  /** Timestamp when the contract was last updated */
  updatedAt: Date;
}

/** Summary view of a contract (without full interaction details). */
export interface ContractSummary {
  /** UUID v4 identifier */
  id: string;
  /** Consumer service name */
  consumer: string;
  /** Provider service name */
  provider: string;
  /** Semantic version */
  version: string;
  /** Contract status */
  status: 'active' | 'archived';
  /** Timestamp when the contract was created */
  createdAt: Date;
  /** Timestamp when the contract was last updated */
  updatedAt: Date;
}

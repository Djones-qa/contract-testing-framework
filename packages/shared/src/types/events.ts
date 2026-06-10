/**
 * Event and operational type definitions for the contract testing framework.
 */

/** Event emitted when a contract is published to the broker. */
export interface ContractPublishedEvent {
  /** The ID of the published contract */
  contractId: string;
  /** Consumer service name */
  consumer: string;
  /** Provider service name */
  provider: string;
  /** Contract version */
  version: string;
  /** Timestamp when the event was emitted */
  timestamp: Date;
}

/** Information about an active stub server instance. */
export interface StubInfo {
  /** Unique stub identifier */
  id: string;
  /** The contract ID this stub is based on */
  contractId: string;
  /** The port the stub server is listening on */
  port: number;
  /** Consumer service name from the contract */
  consumer: string;
  /** Provider service name from the contract */
  provider: string;
  /** Timestamp when the stub was created */
  createdAt: Date;
}

/** A verification job tracked by the verification runner. */
export interface VerificationJob {
  /** Unique job identifier */
  id: string;
  /** Provider service name to verify */
  provider: string;
  /** Provider version being verified */
  providerVersion: string;
  /** Base URL of the provider service */
  providerBaseUrl: string;
  /** Current job status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Timestamp when the job was created */
  createdAt: Date;
}

/** A paginated response containing a subset of results. */
export interface PaginatedResult<T> {
  /** The data items for the current page */
  data: T[];
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  total: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Compatibility matrix type definitions for the contract testing framework.
 */

/** A single entry in the compatibility matrix. */
export interface MatrixEntry {
  /** Consumer service name */
  consumer: string;
  /** Consumer service version */
  consumerVersion: string;
  /** Provider service name */
  provider: string;
  /** Provider service version */
  providerVersion: string;
  /** Whether the entry has been verified */
  verified: boolean;
  /** Whether verification was successful (undefined if not verified) */
  success: boolean | null;
  /** Timestamp of verification (null if not verified) */
  verifiedAt: Date | null;
}

/** Result of a can-i-deploy check. */
export interface CanIDeployResult {
  /** Whether the service version is safe to deploy */
  deployable: boolean;
  /** Human-readable message explaining the result */
  message: string;
  /** List of contracts that are failing or unverified */
  failingContracts: FailingContract[];
}

/** A contract that is blocking deployment. */
export interface FailingContract {
  /** Consumer service name */
  consumer: string;
  /** Provider service name */
  provider: string;
  /** Consumer version associated with the failing contract */
  consumerVersion: string;
  /** Status description (e.g., "unverified", "failed") */
  status: string;
}

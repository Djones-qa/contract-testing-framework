/**
 * Verification result type definitions for the contract testing framework.
 */

/** Types of mismatches that can occur during verification. */
export type MismatchType = 'status' | 'header' | 'body' | 'missing';

/** A specific discrepancy found during verification. */
export interface Mismatch {
  /** JSON path or descriptor indicating where the mismatch occurred */
  path: string;
  /** The expected value */
  expected: unknown;
  /** The actual value received */
  actual: unknown;
  /** The category of mismatch */
  type: MismatchType;
}

/** Result of verifying a single interaction against the provider. */
export interface InteractionResult {
  /** Identifier of the interaction that was verified */
  interactionId: string;
  /** Description of the interaction */
  interactionDescription: string;
  /** Whether the interaction verification succeeded */
  success: boolean;
  /** List of mismatches found (empty if success is true) */
  mismatches: Mismatch[];
}

/** The outcome of running a full contract verification against a provider. */
export interface VerificationResult {
  /** UUID v4 identifier */
  id: string;
  /** The contract that was verified */
  contractId: string;
  /** The provider service name */
  provider: string;
  /** The provider version that was verified */
  providerVersion: string;
  /** Whether all interactions passed verification */
  success: boolean;
  /** Per-interaction verification results */
  interactions: InteractionResult[];
  /** Timestamp when the verification was executed */
  executedAt: Date;
}

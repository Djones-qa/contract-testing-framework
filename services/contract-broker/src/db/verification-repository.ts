import { pool } from './pool';
import type { PoolClient } from 'pg';

/**
 * Represents a mismatch in the verification result payload.
 */
interface MismatchPayload {
  path: string;
  expected: unknown;
  actual: unknown;
  type: 'status' | 'header' | 'body' | 'missing';
}

/**
 * Represents a single interaction result in the verification payload.
 */
interface InteractionResultPayload {
  interactionDescription: string;
  success: boolean;
  mismatches: MismatchPayload[];
}

/**
 * Represents the verification result payload submitted via POST /contracts/:id/verify.
 */
export interface VerificationResultPayload {
  providerVersion: string;
  success: boolean;
  interactions: InteractionResultPayload[];
  executedAt?: string;
}

/**
 * A stored verification result row.
 */
export interface StoredVerificationResult {
  id: string;
  contractId: string;
  providerName: string;
  providerVersion: string;
  success: boolean;
  executedAt: Date;
  interactions: StoredInteractionResult[];
}

/**
 * A stored interaction result with mismatches.
 */
export interface StoredInteractionResult {
  interactionDescription: string;
  success: boolean;
  mismatches: MismatchPayload[];
}

/**
 * Paginated result structure.
 */
export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Verification result repository for storing and querying verification results.
 */
export const verificationRepository = {
  /**
   * Store a verification result with interaction results and mismatches in a transaction.
   * Also creates/updates the corresponding matrix entry.
   */
  async store(
    contractId: string,
    providerName: string,
    result: VerificationResultPayload
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const executedAt = result.executedAt ? new Date(result.executedAt) : new Date();

      // Insert verification_result
      const vrResult = await client.query(
        `INSERT INTO verification_results (contract_id, provider_name, provider_version, success, executed_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [contractId, providerName, result.providerVersion, result.success, executedAt]
      );
      const verificationResultId = vrResult.rows[0].id as string;

      // Insert interaction_results and mismatches
      for (const interaction of result.interactions) {
        const irResult = await client.query(
          `INSERT INTO interaction_results (verification_result_id, interaction_description, success)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [verificationResultId, interaction.interactionDescription, interaction.success]
        );
        const interactionResultId = irResult.rows[0].id as string;

        for (const mismatch of interaction.mismatches) {
          await client.query(
            `INSERT INTO mismatches (interaction_result_id, json_path, expected, actual, mismatch_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              interactionResultId,
              mismatch.path,
              mismatch.expected !== undefined ? JSON.stringify(mismatch.expected) : null,
              mismatch.actual !== undefined ? JSON.stringify(mismatch.actual) : null,
              mismatch.type,
            ]
          );
        }
      }

      // Update or create matrix entry
      await updateMatrixEntry(client, contractId, providerName, result, verificationResultId, executedAt);

      await client.query('COMMIT');
      return verificationResultId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Find verification results filtered by provider name with pagination.
   */
  async findByProvider(
    provider: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResult<StoredVerificationResult>> {
    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM verification_results WHERE provider_name = $1`,
      [provider]
    );
    const total = parseInt(countResult.rows[0].total as string, 10);
    const totalPages = Math.ceil(total / pageSize);

    const offset = (page - 1) * pageSize;

    // Get paginated verification results
    const vrResult = await pool.query(
      `SELECT id, contract_id, provider_name, provider_version, success, executed_at
       FROM verification_results
       WHERE provider_name = $1
       ORDER BY executed_at DESC
       LIMIT $2 OFFSET $3`,
      [provider, pageSize, offset]
    );

    const data: StoredVerificationResult[] = [];

    for (const row of vrResult.rows) {
      const verificationResultId = row.id as string;

      // Load interaction results
      const irResult = await pool.query(
        `SELECT id, interaction_description, success
         FROM interaction_results
         WHERE verification_result_id = $1`,
        [verificationResultId]
      );

      const interactions: StoredInteractionResult[] = [];

      for (const ir of irResult.rows) {
        const interactionResultId = ir.id as string;

        // Load mismatches
        const mmResult = await pool.query(
          `SELECT json_path, expected, actual, mismatch_type
           FROM mismatches
           WHERE interaction_result_id = $1`,
          [interactionResultId]
        );

        const mismatches: MismatchPayload[] = mmResult.rows.map((m: Record<string, unknown>) => ({
          path: m.json_path as string,
          expected: m.expected,
          actual: m.actual,
          type: m.mismatch_type as 'status' | 'header' | 'body' | 'missing',
        }));

        interactions.push({
          interactionDescription: ir.interaction_description as string,
          success: ir.success as boolean,
          mismatches,
        });
      }

      data.push({
        id: verificationResultId,
        contractId: row.contract_id as string,
        providerName: row.provider_name as string,
        providerVersion: row.provider_version as string,
        success: row.success as boolean,
        executedAt: new Date(row.executed_at as string),
        interactions,
      });
    }

    return { data, page, pageSize, total, totalPages };
  },
};

/**
 * Update or create a matrix entry for the given verification result.
 * Uses UPSERT to handle both new and existing entries.
 */
async function updateMatrixEntry(
  client: PoolClient,
  contractId: string,
  providerName: string,
  result: VerificationResultPayload,
  verificationResultId: string,
  executedAt: Date
): Promise<void> {
  // Look up the contract to get consumer info
  const contractResult = await client.query(
    `SELECT consumer, version FROM contracts WHERE id = $1`,
    [contractId]
  );

  if (contractResult.rows.length === 0) {
    return;
  }

  const consumerName = contractResult.rows[0].consumer as string;
  const consumerVersion = contractResult.rows[0].version as string;
  const status = result.success ? 'success' : 'failure';

  await client.query(
    `INSERT INTO matrix_entries (consumer_name, consumer_version, provider_name, provider_version, status, verified_at, verification_result_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (consumer_name, consumer_version, provider_name, provider_version)
     DO UPDATE SET status = EXCLUDED.status, verified_at = EXCLUDED.verified_at, verification_result_id = EXCLUDED.verification_result_id`,
    [consumerName, consumerVersion, providerName, result.providerVersion, status, executedAt, verificationResultId]
  );
}

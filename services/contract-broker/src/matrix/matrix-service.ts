import { pool } from '../db/pool';

/**
 * Represents a matrix entry returned from the database.
 */
export interface MatrixEntryRow {
  consumerName: string;
  consumerVersion: string;
  providerName: string;
  providerVersion: string;
  status: 'success' | 'failure' | 'unverified';
  verifiedAt: Date | null;
}

/**
 * Represents a contract that is blocking deployment.
 */
export interface FailingContract {
  consumer: string;
  provider: string;
  consumerVersion: string;
  status: string;
}

/**
 * Result of a can-i-deploy check.
 */
export interface CanIDeployResult {
  deployable: boolean;
  message: string;
  failingContracts: FailingContract[];
}

/**
 * Get all matrix entries, optionally filtered by service name (consumer or provider).
 */
export async function getMatrix(service?: string): Promise<MatrixEntryRow[]> {
  let query = `SELECT consumer_name, consumer_version, provider_name, provider_version, status, verified_at
               FROM matrix_entries`;
  const params: string[] = [];

  if (service) {
    query += ` WHERE consumer_name = $1 OR provider_name = $1`;
    params.push(service);
  }

  query += ` ORDER BY consumer_name, provider_name`;

  const result = await pool.query(query, params);

  return result.rows.map((row: Record<string, unknown>) => ({
    consumerName: row.consumer_name as string,
    consumerVersion: row.consumer_version as string,
    providerName: row.provider_name as string,
    providerVersion: row.provider_version as string,
    status: row.status as 'success' | 'failure' | 'unverified',
    verifiedAt: row.verified_at ? new Date(row.verified_at as string) : null,
  }));
}

/**
 * Check whether a specific service version is safe to deploy.
 *
 * Logic:
 * 1. Find all active contracts where service is consumer OR provider
 * 2. For each contract, check if there's a matrix entry with status = 'success' for the specified version
 * 3. If all have success → deployable: true
 * 4. If any missing or failed → deployable: false with failing contracts list
 * 5. If no contracts found → deployable: true with "no contracts found" message
 */
export async function canIDeploy(service: string, version: string): Promise<CanIDeployResult> {
  // Find all active contracts where the service is either consumer or provider
  const contractsResult = await pool.query(
    `SELECT id, consumer, provider, version
     FROM contracts
     WHERE status = 'active' AND (consumer = $1 OR provider = $1)`,
    [service]
  );

  if (contractsResult.rows.length === 0) {
    return {
      deployable: true,
      message: 'No contracts found for this service',
      failingContracts: [],
    };
  }

  const failingContracts: FailingContract[] = [];

  for (const contract of contractsResult.rows) {
    const consumerName = contract.consumer as string;
    const providerName = contract.provider as string;
    const consumerVersion = contract.version as string;

    // Determine which side the service is on and check accordingly
    if (consumerName === service) {
      // Service is the consumer — check if there's a successful matrix entry
      // for this consumer version against the provider
      const matrixResult = await pool.query(
        `SELECT status FROM matrix_entries
         WHERE consumer_name = $1 AND consumer_version = $2 AND provider_name = $3
         AND status = 'success'`,
        [consumerName, version, providerName]
      );

      if (matrixResult.rows.length === 0) {
        failingContracts.push({
          consumer: consumerName,
          provider: providerName,
          consumerVersion: version,
          status: 'unverified',
        });
      }
    } else {
      // Service is the provider — check if there's a successful matrix entry
      // for this provider version against the consumer
      const matrixResult = await pool.query(
        `SELECT status FROM matrix_entries
         WHERE consumer_name = $1 AND consumer_version = $2 AND provider_name = $3 AND provider_version = $4
         AND status = 'success'`,
        [consumerName, consumerVersion, providerName, version]
      );

      if (matrixResult.rows.length === 0) {
        failingContracts.push({
          consumer: consumerName,
          provider: providerName,
          consumerVersion,
          status: 'unverified',
        });
      }
    }
  }

  if (failingContracts.length === 0) {
    return {
      deployable: true,
      message: 'All contracts have successful verifications',
      failingContracts: [],
    };
  }

  return {
    deployable: false,
    message: `${failingContracts.length} contract(s) are failing or unverified`,
    failingContracts,
  };
}

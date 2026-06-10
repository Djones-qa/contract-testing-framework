import { pool } from './pool';
import type {
  Contract,
  ContractSummary,
  Interaction,
  MatchingRule,
  ProviderState,
  HttpMethod,
  MatchingRuleType,
} from '@contract-testing/shared';
import { PoolClient } from 'pg';

/**
 * Maps a database row from the contracts table to a ContractSummary.
 */
function rowToSummary(row: Record<string, unknown>): ContractSummary {
  return {
    id: row.id as string,
    consumer: row.consumer as string,
    provider: row.provider as string,
    version: row.version as string,
    status: row.status as 'active' | 'archived',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Inserts interactions (with matching rules and provider states) for a contract.
 * Must be called within an active transaction.
 */
async function insertInteractions(
  client: PoolClient,
  contractId: string,
  interactions: Interaction[]
): Promise<void> {
  for (let i = 0; i < interactions.length; i++) {
    const interaction = interactions[i];

    const interactionResult = await client.query(
      `INSERT INTO interactions (contract_id, description, request_method, request_path,
        request_headers, request_query, request_body, response_status, response_headers,
        response_body, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        contractId,
        interaction.description,
        interaction.request.method,
        interaction.request.path,
        interaction.request.headers ? JSON.stringify(interaction.request.headers) : null,
        interaction.request.query ? JSON.stringify(interaction.request.query) : null,
        interaction.request.body !== undefined ? JSON.stringify(interaction.request.body) : null,
        interaction.response.status,
        interaction.response.headers ? JSON.stringify(interaction.response.headers) : null,
        interaction.response.body !== undefined ? JSON.stringify(interaction.response.body) : null,
        i,
      ]
    );

    const interactionId = interactionResult.rows[0].id as string;

    // Insert matching rules
    for (const rule of interaction.matchingRules) {
      await client.query(
        `INSERT INTO matching_rules (interaction_id, json_path, rule_type, value)
         VALUES ($1, $2, $3, $4)`,
        [interactionId, rule.path, rule.type, JSON.stringify(rule.value)]
      );
    }

    // Insert provider states
    for (const state of interaction.providerStates) {
      await client.query(
        `INSERT INTO provider_states (interaction_id, name, params)
         VALUES ($1, $2, $3)`,
        [interactionId, state.name, state.params ? JSON.stringify(state.params) : null]
      );
    }
  }
}

/**
 * Loads all interactions (with matching rules and provider states) for a contract.
 */
async function loadInteractions(
  client: PoolClient,
  contractId: string
): Promise<Interaction[]> {
  const interactionsResult = await client.query(
    `SELECT id, description, request_method, request_path, request_headers,
            request_query, request_body, response_status, response_headers,
            response_body, sort_order
     FROM interactions
     WHERE contract_id = $1
     ORDER BY sort_order ASC`,
    [contractId]
  );

  const interactions: Interaction[] = [];

  for (const row of interactionsResult.rows) {
    const interactionId = row.id as string;

    // Load matching rules
    const rulesResult = await client.query(
      `SELECT json_path, rule_type, value FROM matching_rules WHERE interaction_id = $1`,
      [interactionId]
    );
    const matchingRules: MatchingRule[] = rulesResult.rows.map((r: Record<string, unknown>) => ({
      path: r.json_path as string,
      type: r.rule_type as MatchingRuleType,
      value: r.value,
    }));

    // Load provider states
    const statesResult = await client.query(
      `SELECT name, params FROM provider_states WHERE interaction_id = $1`,
      [interactionId]
    );
    const providerStates: ProviderState[] = statesResult.rows.map((s: Record<string, unknown>) => {
      const state: ProviderState = { name: s.name as string };
      if (s.params !== null && s.params !== undefined) {
        state.params = s.params as Record<string, unknown>;
      }
      return state;
    });

    const interaction: Interaction = {
      id: interactionId,
      description: row.description as string,
      providerStates,
      request: {
        method: row.request_method as HttpMethod,
        path: row.request_path as string,
        ...(row.request_headers && { headers: row.request_headers as Record<string, string> }),
        ...(row.request_query && { query: row.request_query as Record<string, string> }),
        ...(row.request_body !== null && row.request_body !== undefined && { body: row.request_body }),
      },
      response: {
        status: row.response_status as number,
        ...(row.response_headers && { headers: row.response_headers as Record<string, string> }),
        ...(row.response_body !== null && row.response_body !== undefined && { body: row.response_body }),
      },
      matchingRules,
    };

    interactions.push(interaction);
  }

  return interactions;
}

/**
 * Contract repository implementing all database operations for contracts.
 */
export const contractRepository = {
  /**
   * Insert a new contract with its interactions, matching rules, and provider states.
   * Returns the contract with the assigned UUID.
   */
  async create(contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contract> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const contractResult = await client.query(
        `INSERT INTO contracts (consumer, provider, version, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, consumer, provider, version, status, created_at, updated_at`,
        [contract.consumer, contract.provider, contract.version, contract.status || 'active']
      );

      const row = contractResult.rows[0];
      const contractId = row.id as string;

      await insertInteractions(client, contractId, contract.interactions);

      await client.query('COMMIT');

      const interactions = await loadInteractions(client, contractId);

      return {
        id: contractId,
        consumer: row.consumer as string,
        provider: row.provider as string,
        version: row.version as string,
        status: row.status as 'active' | 'archived',
        interactions,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Find a contract by ID, returning the full contract with all interactions,
   * matching rules, and provider states. Returns null if not found.
   */
  async findById(id: string): Promise<Contract | null> {
    const client = await pool.connect();
    try {
      const contractResult = await client.query(
        `SELECT id, consumer, provider, version, status, created_at, updated_at
         FROM contracts WHERE id = $1`,
        [id]
      );

      if (contractResult.rows.length === 0) {
        return null;
      }

      const row = contractResult.rows[0];
      const interactions = await loadInteractions(client, row.id as string);

      return {
        id: row.id as string,
        consumer: row.consumer as string,
        provider: row.provider as string,
        version: row.version as string,
        status: row.status as 'active' | 'archived',
        interactions,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      };
    } finally {
      client.release();
    }
  },

  /**
   * Return all active contract summaries (metadata only, no interactions).
   */
  async findActive(): Promise<ContractSummary[]> {
    const result = await pool.query(
      `SELECT id, consumer, provider, version, status, created_at, updated_at
       FROM contracts WHERE status = 'active'
       ORDER BY updated_at DESC`
    );
    return result.rows.map(rowToSummary);
  },

  /**
   * Return active contract summaries filtered by consumer name (case-sensitive exact match).
   */
  async findByConsumer(name: string): Promise<ContractSummary[]> {
    const result = await pool.query(
      `SELECT id, consumer, provider, version, status, created_at, updated_at
       FROM contracts WHERE consumer = $1 AND status = 'active'
       ORDER BY updated_at DESC`,
      [name]
    );
    return result.rows.map(rowToSummary);
  },

  /**
   * Return active contract summaries filtered by provider name (case-sensitive exact match).
   */
  async findByProvider(name: string): Promise<ContractSummary[]> {
    const result = await pool.query(
      `SELECT id, consumer, provider, version, status, created_at, updated_at
       FROM contracts WHERE provider = $1 AND status = 'active'
       ORDER BY updated_at DESC`,
      [name]
    );
    return result.rows.map(rowToSummary);
  },

  /**
   * Archive a contract by setting its status to 'archived'.
   * Returns the updated contract or null if not found.
   * Idempotent: archiving an already-archived contract returns it unchanged.
   */
  async archive(id: string): Promise<Contract | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateResult = await client.query(
        `UPDATE contracts
         SET status = 'archived', updated_at = NOW()
         WHERE id = $1
         RETURNING id, consumer, provider, version, status, created_at, updated_at`,
        [id]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query('COMMIT');

      const row = updateResult.rows[0];
      const interactions = await loadInteractions(client, row.id as string);

      return {
        id: row.id as string,
        consumer: row.consumer as string,
        provider: row.provider as string,
        version: row.version as string,
        status: row.status as 'active' | 'archived',
        interactions,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Upsert a contract: if a row with the same (consumer, provider, version) exists and is active,
   * replace its interactions; otherwise insert a new contract.
   * Preserves the original contract ID on conflict (Requirement 1.5).
   */
  async upsert(contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contract> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for existing active contract with same (consumer, provider, version)
      const existingResult = await client.query(
        `SELECT id FROM contracts
         WHERE consumer = $1 AND provider = $2 AND version = $3 AND status = 'active'`,
        [contract.consumer, contract.provider, contract.version]
      );

      let contractId: string;

      if (existingResult.rows.length > 0) {
        // Existing contract found: replace interactions, preserve ID
        contractId = existingResult.rows[0].id as string;

        // Delete existing interactions (cascading deletes matching_rules and provider_states)
        await client.query('DELETE FROM interactions WHERE contract_id = $1', [contractId]);

        // Update timestamp
        await client.query(
          `UPDATE contracts SET updated_at = NOW() WHERE id = $1`,
          [contractId]
        );
      } else {
        // No existing active contract: insert new
        const insertResult = await client.query(
          `INSERT INTO contracts (consumer, provider, version, status)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [contract.consumer, contract.provider, contract.version, contract.status || 'active']
        );
        contractId = insertResult.rows[0].id as string;
      }

      // Insert new interactions
      await insertInteractions(client, contractId, contract.interactions);

      await client.query('COMMIT');

      // Reload the full contract to return
      const contractResult = await client.query(
        `SELECT id, consumer, provider, version, status, created_at, updated_at
         FROM contracts WHERE id = $1`,
        [contractId]
      );

      const row = contractResult.rows[0];
      const interactions = await loadInteractions(client, contractId);

      return {
        id: row.id as string,
        consumer: row.consumer as string,
        provider: row.provider as string,
        version: row.version as string,
        status: row.status as 'active' | 'archived',
        interactions,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

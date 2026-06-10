-- 001_initial_schema.sql
-- Initial database schema for the Contract Broker service.

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer VARCHAR(128) NOT NULL,
    provider VARCHAR(128) NOT NULL,
    version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (consumer, provider, version)
);

CREATE INDEX IF NOT EXISTS idx_contracts_consumer ON contracts(consumer) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contracts_provider ON contracts(provider) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- Interactions table
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    request_method VARCHAR(8) NOT NULL,
    request_path TEXT NOT NULL,
    request_headers JSONB,
    request_query JSONB,
    request_body JSONB,
    response_status INTEGER NOT NULL CHECK (response_status BETWEEN 100 AND 599),
    response_headers JSONB,
    response_body JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_interactions_contract ON interactions(contract_id);

-- Matching rules table
CREATE TABLE IF NOT EXISTS matching_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
    json_path TEXT NOT NULL,
    rule_type VARCHAR(16) NOT NULL CHECK (rule_type IN ('exact', 'type', 'regex', 'include')),
    value JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matching_rules_interaction ON matching_rules(interaction_id);

-- Provider states table
CREATE TABLE IF NOT EXISTS provider_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    params JSONB
);

CREATE INDEX IF NOT EXISTS idx_provider_states_interaction ON provider_states(interaction_id);

-- Verification results table
CREATE TABLE IF NOT EXISTS verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    provider_name VARCHAR(128) NOT NULL,
    provider_version VARCHAR(64) NOT NULL,
    success BOOLEAN NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_results_contract ON verification_results(contract_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_provider ON verification_results(provider_name);

-- Interaction results table
CREATE TABLE IF NOT EXISTS interaction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_result_id UUID NOT NULL REFERENCES verification_results(id) ON DELETE CASCADE,
    interaction_description TEXT NOT NULL,
    success BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interaction_results_verification ON interaction_results(verification_result_id);

-- Mismatches table
CREATE TABLE IF NOT EXISTS mismatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_result_id UUID NOT NULL REFERENCES interaction_results(id) ON DELETE CASCADE,
    json_path TEXT NOT NULL,
    expected JSONB,
    actual JSONB,
    mismatch_type VARCHAR(16) NOT NULL CHECK (mismatch_type IN ('status', 'header', 'body', 'missing'))
);

CREATE INDEX IF NOT EXISTS idx_mismatches_interaction_result ON mismatches(interaction_result_id);

-- Matrix entries table
CREATE TABLE IF NOT EXISTS matrix_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_name VARCHAR(128) NOT NULL,
    consumer_version VARCHAR(64) NOT NULL,
    provider_name VARCHAR(128) NOT NULL,
    provider_version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'unverified' CHECK (status IN ('success', 'failure', 'unverified')),
    verified_at TIMESTAMPTZ,
    verification_result_id UUID REFERENCES verification_results(id),
    UNIQUE (consumer_name, consumer_version, provider_name, provider_version)
);

CREATE INDEX IF NOT EXISTS idx_matrix_consumer ON matrix_entries(consumer_name);
CREATE INDEX IF NOT EXISTS idx_matrix_provider ON matrix_entries(provider_name);

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

import * as fs from 'fs';
import * as path from 'path';
import { pool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Ensures the schema_migrations tracking table exists.
 */
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Returns the list of already-applied migration filenames.
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY id'
  );
  return new Set(result.rows.map((row) => row.filename));
}

/**
 * Reads all .sql files from the migrations directory, sorted alphabetically.
 */
function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Runs all pending migrations in order.
 * Each migration is executed within a transaction.
 * Returns the list of newly applied migration filenames.
 */
export async function runMigrations(): Promise<string[]> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();
  const pending = files.filter((file) => !applied.has(file));

  const newlyApplied: string[] = [];

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      newlyApplied.push(file);
      console.log(`Migration applied: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Migration failed: ${file}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  if (newlyApplied.length === 0) {
    console.log('No pending migrations.');
  }

  return newlyApplied;
}

// Allow running migrations directly via: npx ts-node src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then((applied) => {
      console.log(`Done. Applied ${applied.length} migration(s).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration runner failed:', err);
      process.exit(1);
    });
}

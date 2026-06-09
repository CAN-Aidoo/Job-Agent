import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://jobagent:jobagent@localhost:5432/jobagent';

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Ensure schema_migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Get already applied migrations
    const { rows: applied } = await pool.query('SELECT filename FROM schema_migrations ORDER BY id');
    const appliedSet = new Set(applied.map((r: { filename: string }) => r.filename));

    // Find migration files
    const migrationsDir = path.resolve(__dirname);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let migrationsRan = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  [skip] ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`  [apply] ${file}...`);

      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        migrationsRan++;
        console.log(`  [done] ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(`  [FAILED] ${file}:`, err);
        throw err;
      }
    }

    if (migrationsRan === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied ${migrationsRan} migration(s) successfully.`);
    }
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

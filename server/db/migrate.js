/**
 * Simple migration runner.
 *
 * Reads all *.sql files from the migrations/ directory in filename order,
 * skips any already recorded in schema_migrations, and applies the rest
 * in a single transaction each.
 */

const fs   = require('fs')
const path = require('path')
const pool = require('./pool')

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

async function migrate() {
  const client = await pool.connect()
  try {
    // Ensure the tracking table exists before anything else
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Discover migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const version = file.replace('.sql', '')

      // Skip if already applied
      const { rowCount } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version]
      )
      if (rowCount > 0) {
        console.log(`[migrate] ✔ ${version} (already applied)`)
        continue
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations(version) VALUES($1)',
          [version]
        )
        await client.query('COMMIT')
        console.log(`[migrate] ✔ Applied ${version}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${version} failed: ${err.message}`)
      }
    }

    console.log('[migrate] All migrations up to date.')
  } finally {
    client.release()
  }
}

module.exports = { migrate }

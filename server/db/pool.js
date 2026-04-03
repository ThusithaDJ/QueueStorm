/**
 * PostgreSQL connection pool — shared singleton across the server.
 * Config is read from environment variables (set via .env / process.env).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     Number(process.env.PGPORT)  || 5432,
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'queuestorm',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message)
})

module.exports = pool

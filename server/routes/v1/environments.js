/**
 * QS-2 · QS-3 — Environment Profiles
 *
 * CRUD for named broker connection profiles.
 * Sensitive credentials are encrypted at rest with AES-256-GCM (vault.js).
 *
 * Routes:
 *   GET    /api/v1/environments          — list all
 *   POST   /api/v1/environments          — create
 *   GET    /api/v1/environments/:id      — get one (credentials masked)
 *   PUT    /api/v1/environments/:id      — update
 *   DELETE /api/v1/environments/:id      — delete
 */

const { Router } = require('express')
const pool   = require('../../db/pool')
const vault  = require('../../crypto/vault')
const { asyncRoute, httpError } = require('../../middleware/errorHandler')

const router = Router()

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fields that should be encrypted (password and any secret-like keys) */
const SENSITIVE_KEYS = ['password', 'connectionString', 'accessKey', 'secretKey']

/**
 * Split a flat connection config into:
 *  - credentials: object containing only sensitive fields (will be encrypted)
 *  - extra:       everything else (vhost, groupId, channel, bootstrapServers …)
 */
function splitConfig(config = {}) {
  const credentials = {}
  const extra = {}
  for (const [k, v] of Object.entries(config)) {
    if (SENSITIVE_KEYS.includes(k)) credentials[k] = v
    else extra[k] = v
  }
  return { credentials, extra }
}

/**
 * Build the safe public representation of an environment row.
 * Passwords are masked; other credentials are omitted.
 */
function toPublic(row) {
  let decrypted = {}
  try {
    decrypted = vault.decrypt(row.credentials_enc)
  } catch {
    // encrypted blob unreadable — return empty rather than crashing
  }

  // Mask sensitive values
  const maskedCreds = Object.fromEntries(
    Object.keys(decrypted).map(k => [k, '••••••••'])
  )

  return {
    id:         row.id,
    name:       row.name,
    brokerType: row.broker_type,
    protocol:   row.protocol,
    host:       row.host,
    port:       row.port,
    extra:      row.extra_config,
    // Expose key names so the UI knows which cred fields exist
    credentialFields: Object.keys(decrypted),
    maskedCredentials: maskedCreds,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/v1/environments */
router.get('/', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM environments ORDER BY created_at DESC'
  )
  res.json(rows.map(toPublic))
}))

/** POST /api/v1/environments */
router.post('/', asyncRoute(async (req, res) => {
  const { name, brokerType, protocol, connection } = req.body

  if (!name?.trim())       throw httpError(400, 'name is required')
  if (!brokerType?.trim()) throw httpError(400, 'brokerType is required')
  if (!protocol?.trim())   throw httpError(400, 'protocol is required')
  if (!connection || typeof connection !== 'object')
    throw httpError(400, 'connection object is required')

  const { credentials, extra } = splitConfig(connection)

  const { rows } = await pool.query(
    `INSERT INTO environments (name, broker_type, protocol, host, port, credentials_enc, extra_config)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      name.trim(),
      brokerType,
      protocol,
      connection.host   || null,
      connection.port   ? Number(connection.port) : null,
      vault.encrypt(credentials),
      JSON.stringify(extra),
    ]
  )

  res.status(201).json(toPublic(rows[0]))
}))

/** GET /api/v1/environments/:id */
router.get('/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM environments WHERE id = $1',
    [req.params.id]
  )
  if (!rows.length) throw httpError(404, `Environment not found: ${req.params.id}`)
  res.json(toPublic(rows[0]))
}))

/**
 * GET /api/v1/environments/:id/decrypted
 * Returns the decrypted credentials — used when loading a profile to pre-fill
 * the connection form. Should be protected by auth in production.
 */
router.get('/:id/decrypted', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM environments WHERE id = $1',
    [req.params.id]
  )
  if (!rows.length) throw httpError(404, `Environment not found: ${req.params.id}`)

  const row = rows[0]
  let credentials = {}
  try { credentials = vault.decrypt(row.credentials_enc) } catch {}

  res.json({
    id:         row.id,
    name:       row.name,
    brokerType: row.broker_type,
    protocol:   row.protocol,
    connection: {
      host:     row.host,
      port:     row.port,
      ...row.extra_config,
      ...credentials,     // password etc. in plain text — only call this when needed
    },
  })
}))

/** PUT /api/v1/environments/:id */
router.put('/:id', asyncRoute(async (req, res) => {
  const { rows: existing } = await pool.query(
    'SELECT * FROM environments WHERE id = $1', [req.params.id]
  )
  if (!existing.length) throw httpError(404, `Environment not found: ${req.params.id}`)

  const { name, brokerType, protocol, connection } = req.body
  const old = existing[0]

  // Merge: only update fields that were provided
  const newName     = name?.trim()     || old.name
  const newBroker   = brokerType       || old.broker_type
  const newProtocol = protocol         || old.protocol

  let newEnc   = old.credentials_enc
  let newExtra = old.extra_config
  let newHost  = old.host
  let newPort  = old.port

  if (connection && typeof connection === 'object') {
    const { credentials, extra } = splitConfig(connection)

    // Merge new credentials on top of existing decrypted ones (so partial updates work)
    let existingCreds = {}
    try { existingCreds = vault.decrypt(old.credentials_enc) } catch {}
    const mergedCreds = { ...existingCreds, ...credentials }
    // Remove blank password if caller didn't provide one (keep existing)
    for (const k of SENSITIVE_KEYS) {
      if (mergedCreds[k] === '' || mergedCreds[k] === undefined) delete mergedCreds[k]
    }
    newEnc   = vault.encrypt(mergedCreds)
    newExtra = JSON.stringify({ ...old.extra_config, ...extra })
    newHost  = connection.host  !== undefined ? connection.host  : old.host
    newPort  = connection.port  !== undefined ? Number(connection.port) : old.port
  }

  const { rows } = await pool.query(
    `UPDATE environments
     SET name=$1, broker_type=$2, protocol=$3, host=$4, port=$5,
         credentials_enc=$6, extra_config=$7, updated_at=NOW()
     WHERE id=$8
     RETURNING *`,
    [newName, newBroker, newProtocol, newHost, newPort, newEnc, newExtra, req.params.id]
  )

  res.json(toPublic(rows[0]))
}))

/** DELETE /api/v1/environments/:id */
router.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM environments WHERE id = $1', [req.params.id]
  )
  if (!rowCount) throw httpError(404, `Environment not found: ${req.params.id}`)
  res.json({ deleted: true, id: req.params.id })
}))

module.exports = router

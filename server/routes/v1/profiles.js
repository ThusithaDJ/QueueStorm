/**
 * QS-10 — Test Configuration Profiles
 *
 * Save and reload named test configurations (rate, count, ramp-up, order mode,
 * linked environment, destination).
 *
 * Routes:
 *   GET    /api/v1/profiles         — list all
 *   POST   /api/v1/profiles         — create
 *   GET    /api/v1/profiles/:id     — get one
 *   PUT    /api/v1/profiles/:id     — update
 *   DELETE /api/v1/profiles/:id     — delete
 */

const { Router } = require('express')
const pool = require('../../db/pool')
const { asyncRoute, httpError } = require('../../middleware/errorHandler')

const router = Router()

function toPublic(row) {
  return {
    id:            row.id,
    name:          row.name,
    environmentId: row.environment_id,
    config:        row.config,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  }
}

/** GET /api/v1/profiles */
router.get('/', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM test_profiles ORDER BY updated_at DESC'
  )
  res.json(rows.map(toPublic))
}))

/** POST /api/v1/profiles */
router.post('/', asyncRoute(async (req, res) => {
  const { name, environmentId, config } = req.body

  if (!name?.trim()) throw httpError(400, 'name is required')
  if (!config || typeof config !== 'object') throw httpError(400, 'config object is required')

  const { rows } = await pool.query(
    `INSERT INTO test_profiles (name, environment_id, config)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name.trim(), environmentId || null, JSON.stringify(config)]
  )
  res.status(201).json(toPublic(rows[0]))
}))

/** GET /api/v1/profiles/:id */
router.get('/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM test_profiles WHERE id = $1', [req.params.id]
  )
  if (!rows.length) throw httpError(404, `Profile not found: ${req.params.id}`)
  res.json(toPublic(rows[0]))
}))

/** PUT /api/v1/profiles/:id */
router.put('/:id', asyncRoute(async (req, res) => {
  const { rows: existing } = await pool.query(
    'SELECT * FROM test_profiles WHERE id = $1', [req.params.id]
  )
  if (!existing.length) throw httpError(404, `Profile not found: ${req.params.id}`)

  const old = existing[0]
  const newName   = req.body.name?.trim()   || old.name
  const newEnvId  = req.body.environmentId !== undefined ? (req.body.environmentId || null) : old.environment_id
  const newConfig = req.body.config ? { ...old.config, ...req.body.config } : old.config

  const { rows } = await pool.query(
    `UPDATE test_profiles
     SET name=$1, environment_id=$2, config=$3, updated_at=NOW()
     WHERE id=$4
     RETURNING *`,
    [newName, newEnvId, JSON.stringify(newConfig), req.params.id]
  )
  res.json(toPublic(rows[0]))
}))

/** DELETE /api/v1/profiles/:id */
router.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM test_profiles WHERE id = $1', [req.params.id]
  )
  if (!rowCount) throw httpError(404, `Profile not found: ${req.params.id}`)
  res.json({ deleted: true, id: req.params.id })
}))

module.exports = router

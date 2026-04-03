/**
 * /api/v1/messages — CRUD for saved message templates.
 *
 * Tables: message_templates (id, name, format, template, created_at)
 * (created in migration 002)
 *
 * Also: POST /api/v1/messages/preview — render a template and return samples
 */

const { Router } = require('express')
const { asyncRoute, httpError } = require('../../middleware/errorHandler')
const pool = require('../../db/pool')
const TemplateEngine = require('../../jobs/TemplateEngine')

const router = Router()

// GET /api/v1/messages
router.get('/', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, format, template, created_at FROM message_templates ORDER BY created_at DESC'
  )
  res.json(rows)
}))

// POST /api/v1/messages
router.post('/', asyncRoute(async (req, res) => {
  const { name, format = 'json', template } = req.body
  if (!name?.trim())     throw httpError(400, 'name is required')
  if (!template?.trim()) throw httpError(400, 'template is required')
  if (!['json', 'xml', 'text'].includes(format)) throw httpError(400, 'format must be json|xml|text')

  const { rows } = await pool.query(
    `INSERT INTO message_templates (name, format, template)
     VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), format, template.trim()]
  )
  res.status(201).json(rows[0])
}))

// GET /api/v1/messages/:id
router.get('/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM message_templates WHERE id=$1', [req.params.id])
  if (!rows.length) throw httpError(404, 'Template not found')
  res.json(rows[0])
}))

// PUT /api/v1/messages/:id
router.put('/:id', asyncRoute(async (req, res) => {
  const { name, format, template } = req.body
  const { rows } = await pool.query(
    `UPDATE message_templates
     SET name=COALESCE($2,name), format=COALESCE($3,format), template=COALESCE($4,template)
     WHERE id=$1 RETURNING *`,
    [req.params.id, name, format, template]
  )
  if (!rows.length) throw httpError(404, 'Template not found')
  res.json(rows[0])
}))

// DELETE /api/v1/messages/:id
router.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM message_templates WHERE id=$1', [req.params.id])
  if (!rowCount) throw httpError(404, 'Template not found')
  res.status(204).end()
}))

// POST /api/v1/messages/preview — render N samples without saving
router.post('/preview', asyncRoute(async (req, res) => {
  const { template, count = 3 } = req.body
  if (!template) throw httpError(400, 'template is required')

  const engine  = new TemplateEngine()
  const samples = []

  for (let i = 0; i < Math.min(Number(count), 10); i++) {
    samples.push(engine.render(template))
  }

  res.json({ samples })
}))

module.exports = router

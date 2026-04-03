/**
 * Auth routes
 *
 * POST /api/v1/auth/register  — create account
 * POST /api/v1/auth/login     — get JWT
 * GET  /api/v1/auth/me        — validate token + return profile
 */

const { Router }  = require('express')
const bcrypt      = require('bcryptjs')
const jwt         = require('jsonwebtoken')
const pool        = require('../../db/pool')
const { asyncRoute, httpError } = require('../../middleware/errorHandler')

const router    = Router()
const JWT_SECRET = process.env.QUEUESTORM_SECRET || 'change-me'
const SALT_ROUNDS = 12
const TOKEN_TTL   = '7d'

// ── Middleware: authenticate JWT ──────────────────────────────────────────────

function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' })
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/register', asyncRoute(async (req, res) => {
  const { email, displayName, password } = req.body
  if (!email?.trim())       throw httpError(400, 'email is required')
  if (!displayName?.trim()) throw httpError(400, 'displayName is required')
  if (!password || password.length < 8) throw httpError(400, 'password must be at least 8 characters')

  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()])
  if (existing.rows.length) throw httpError(409, 'Email already registered')

  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3) RETURNING id, email, display_name, role, created_at`,
    [email.toLowerCase().trim(), displayName.trim(), hash]
  )

  const user  = rows[0]
  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL })

  res.status(201).json({ token, user: toPublic(user) })
}))

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) throw httpError(400, 'email and password are required')

  const { rows } = await pool.query(
    'SELECT id, email, display_name, role, password_hash, created_at FROM users WHERE email=$1',
    [email.toLowerCase().trim()]
  )
  const user = rows[0]
  if (!user) throw httpError(401, 'Invalid email or password')

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) throw httpError(401, 'Invalid email or password')

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL })

  res.json({ token, user: toPublic(user) })
}))

// ── Me ────────────────────────────────────────────────────────────────────────

router.get('/me', authenticate, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, display_name, role, team_id, created_at FROM users WHERE id=$1',
    [req.user.sub]
  )
  if (!rows.length) throw httpError(404, 'User not found')
  res.json(toPublic(rows[0]))
}))

function toPublic(u) {
  return {
    id:          u.id,
    email:       u.email,
    displayName: u.display_name,
    role:        u.role,
    createdAt:   u.created_at,
  }
}

module.exports = router
module.exports.authenticate = authenticate

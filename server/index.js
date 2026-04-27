require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const http    = require('http')
const express = require('express')

const { migrate }      = require('./db/migrate')
const { attachWss }    = require('./ws/wsBroadcast')
const { errorHandler } = require('./middleware/errorHandler')

// ── Route imports ─────────────────────────────────────────────────────────────
const brokersRouter      = require('./routes/brokers')
const jobsRouter         = require('./routes/jobs')
const environmentsRouter = require('./routes/v1/environments')
const profilesRouter     = require('./routes/v1/profiles')
const uploadsRouter      = require('./routes/v1/uploads')
const messagesRouter     = require('./routes/v1/messages')
const logAnalyserRouter  = require('./routes/v1/logAnalyser')
const authRouter         = require('./routes/v1/auth')
const sslCertsRouter     = require('./routes/v1/sslCerts')

const app    = express()
const server = http.createServer(app)
const PORT   = Number(process.env.PORT) || 3001

app.use(express.json())

// ── CORS (dev convenience) ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

// ── Legacy routes (kept for backward compatibility) ───────────────────────────
app.use('/api/brokers', brokersRouter)
app.use('/api/jobs',    jobsRouter)

// ── v1 routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1/environments', environmentsRouter)
app.use('/api/v1/profiles',     profilesRouter)
app.use('/api/v1/uploads',      uploadsRouter)
app.use('/api/v1/messages',     messagesRouter)
app.use('/api/v1/log-analyser', logAnalyserRouter)
app.use('/api/v1/auth',         authRouter)
app.use('/api/v1/ssl-certs',    sslCertsRouter)

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler)

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    await migrate()
  } catch (err) {
    console.error('[boot] Migration failed:', err.message)
    // Don't crash — the app can still serve requests without DB if needed
  }

  // Attach WebSocket server
  attachWss(server)

  server.listen(PORT, () => {
    console.log(`[QueueStorm server] http://localhost:${PORT}`)
    console.log(`[QueueStorm server] WebSocket ws://localhost:${PORT}/ws`)
  })
}

boot()

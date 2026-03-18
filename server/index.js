const express = require('express')

const brokersRouter = require('./routes/brokers')
const jobsRouter = require('./routes/jobs')

const app = express()
const PORT = 3001

app.use(express.json())

// ── API routes ──────────────────────────────────────────────────────────────
app.use('/api/brokers', brokersRouter)
app.use('/api/jobs', jobsRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[QueueStorm server] http://localhost:${PORT}`)
})

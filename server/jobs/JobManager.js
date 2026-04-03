/**
 * JobManager — tracks all test jobs (in-memory + persisted to PostgreSQL).
 *
 * Each in-memory job record:
 * {
 *   id:         string (uuid)
 *   brokerType: string
 *   config:     object  (stored with real password; sanitised before client response)
 *   createdAt:  string  (ISO)
 *   runner:     TestRunner
 * }
 */

const { randomUUID } = require('crypto')
const TestRunner = require('./TestRunner')
const { getBrokerClass } = require('../brokers/registry')
const pool = require('../db/pool')
const { broadcast } = require('../ws/wsBroadcast')
const { uploadStore } = require('../routes/v1/uploads')

/** @type {Map<string, object>} */
const jobs = new Map()

// ── DB helpers ────────────────────────────────────────────────────────────────

async function persistRunStart(id, config) {
  try {
    await pool.query(
      `INSERT INTO test_runs
         (id, broker_type, config, status, started_at)
       VALUES ($1,$2,$3,'running',NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, config.broker, JSON.stringify(sanitiseConfig(config))]
    )
  } catch (err) {
    console.warn('[JobManager] persistRunStart failed:', err.message)
  }
}

async function persistRunUpdate(id, stats, status) {
  try {
    const setClause = status
      ? `status=$2, total_sent=$3, total_acked=$4, total_dropped=$5, avg_latency_ms=$6,
         stopped_at = CASE WHEN $2 IN ('completed','stopped','error') THEN NOW() ELSE NULL END`
      : `total_sent=$2, total_acked=$3, total_dropped=$4, avg_latency_ms=$5`

    if (status) {
      await pool.query(
        `UPDATE test_runs SET ${setClause} WHERE id=$1`,
        [id, status, stats.sent, stats.acked, stats.dropped, stats.avgLatency]
      )
    } else {
      await pool.query(
        `UPDATE test_runs SET total_sent=$2, total_acked=$3, total_dropped=$4, avg_latency_ms=$5 WHERE id=$1`,
        [id, stats.sent, stats.acked, stats.dropped, stats.avgLatency]
      )
    }
  } catch (err) {
    console.warn('[JobManager] persistRunUpdate failed:', err.message)
  }
}

async function persistLogEntries(runId, entries) {
  if (!entries || entries.length === 0) return
  try {
    const values = entries.map((e, i) => {
      const base = i * 4
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`
    })
    const params = entries.flatMap(e => [runId, e.msgId, e.latency, e.status, e.notes])
    // Rebuild with 5 params per row
    const vals = entries.map((e, i) => {
      const b = i * 5
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5})`
    })
    await pool.query(
      `INSERT INTO message_logs (run_id, msg_id, latency_ms, status, notes)
       VALUES ${vals.join(',')}`,
      entries.flatMap(e => [runId, e.msgId, e.latency, e.status, e.notes])
    )
  } catch (err) {
    console.warn('[JobManager] persistLogEntries failed:', err.message)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new job, connect to the broker, and start the test runner.
 * @param {object} params
 * @returns {Promise<string>} jobId
 */
async function createJob(params) {
  const id = randomUUID()

  // Resolve CSV rows if an uploadId was provided
  let csvRows = null
  if (params.uploadId) {
    const upload = uploadStore.get(params.uploadId)
    if (upload) csvRows = upload.rows
  }

  const config = {
    broker:         params.broker,
    connection:     params.connection,
    destination:    params.destination || 'queue/queuestorm',
    protocol:       params.protocol || 'AMQP',
    messagesPerSec: Math.max(1, Number(params.messagesPerSec) || 50),
    totalMessages:  Math.max(0, Number(params.totalMessages) || 1000),
    rampUp:         Math.max(0, Number(params.rampUp) || 0),
    orderMode:      params.orderMode || 'Sequential',
    csvRows,
    columnMapping:   params.columnMapping  || null,
    messageTemplate: params.messageTemplate || null,
  }

  const runner = new TestRunner(id, config)

  // Connect + start — throws on connection failure
  await runner.start()

  jobs.set(id, { id, config, createdAt: new Date().toISOString(), runner })

  // Persist run record to DB
  await persistRunStart(id, config)

  // Wire up runner events for WS broadcasting + DB persistence
  let pendingLogBuffer = []
  const LOG_FLUSH_INTERVAL = 2000  // flush log entries to DB every 2 s

  const logFlushTimer = setInterval(async () => {
    if (pendingLogBuffer.length === 0) return
    const batch = pendingLogBuffer.splice(0)
    await persistLogEntries(id, batch)
  }, LOG_FLUSH_INTERVAL)

  runner.on('update', (stats) => {
    broadcast(id, buildSnapshot(id))
    // Persist stats periodically (every ~5 s via runner tick rate is fine)
    persistRunUpdate(id, stats, null)
  })

  runner.on('log', (entry) => {
    pendingLogBuffer.push(entry)
  })

  runner.on('done', async (finalStats) => {
    clearInterval(logFlushTimer)
    if (pendingLogBuffer.length > 0) {
      await persistLogEntries(id, pendingLogBuffer.splice(0))
    }
    await persistRunUpdate(id, finalStats, finalStats.status || 'completed')
    broadcast(id, buildSnapshot(id))
  })

  return id
}

/**
 * Get the serialisable status of a job (password redacted).
 * @param {string} id
 * @returns {object|null}
 */
function getJob(id) {
  const job = jobs.get(id)
  if (!job) return null
  return buildSnapshot(id)
}

function buildSnapshot(id) {
  const job = jobs.get(id)
  if (!job) return null

  const stats = job.runner.getStats()
  const safeConnection = { ...job.config.connection, password: '***' }

  return {
    id: job.id,
    brokerType: job.config.broker,
    config: { ...job.config, connection: safeConnection },
    createdAt: job.createdAt,
    ...stats,
  }
}

/**
 * Stop a running job.
 * @param {string} id
 */
function stopJob(id) {
  const job = jobs.get(id)
  if (!job) throw new Error(`Job not found: ${id}`)
  job.runner.stop()
}

/**
 * Pause a running job.
 */
function pauseJob(id) {
  const job = jobs.get(id)
  if (!job) throw new Error(`Job not found: ${id}`)
  job.runner.pause()
  broadcast(id, buildSnapshot(id))
}

/**
 * Resume a paused job.
 */
function resumeJob(id) {
  const job = jobs.get(id)
  if (!job) throw new Error(`Job not found: ${id}`)
  job.runner.resume()
  broadcast(id, buildSnapshot(id))
}

/**
 * List all jobs (sanitised).
 * @returns {object[]}
 */
function listJobs() {
  return [...jobs.values()].map(j => getJob(j.id)).filter(Boolean)
}

// ── Internal ──────────────────────────────────────────────────────────────────

function sanitiseConfig(config) {
  const conn = config.connection ? { ...config.connection, password: '***' } : {}
  return { ...config, connection: conn }
}

module.exports = { createJob, getJob, stopJob, pauseJob, resumeJob, listJobs }

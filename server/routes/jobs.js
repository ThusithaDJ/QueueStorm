const { Router } = require('express')
const { getBrokerClass } = require('../brokers/registry')
const { createJob, getJob, stopJob, listJobs } = require('../jobs/JobManager')

const router = Router()

/**
 * POST /api/jobs/start
 *
 * Body:
 * {
 *   broker:         string   e.g. "rabbitmq"
 *   connection:     object   host, port, username, password, vhost
 *   destination:    string   e.g. "queue/orders"
 *   protocol:       string
 *   messagesPerSec: number
 *   totalMessages:  number
 *   rampUp:         number   (seconds)
 *   orderMode:      string
 * }
 *
 * Response 201: { jobId: string }
 * Response 400: { error: string }  — validation or unknown broker
 * Response 500: { error: string }  — broker connection failed
 */
router.post('/start', async (req, res) => {
  const { broker, connection } = req.body

  // Validate broker type
  try {
    getBrokerClass(broker)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  // Validate required connection fields presence
  if (!connection || typeof connection !== 'object') {
    return res.status(400).json({ error: 'Missing "connection" object in request body' })
  }

  const required = ['host', 'port', 'username', 'password']
  const missing = required.filter(k => connection[k] === undefined || connection[k] === '')
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required connection fields: ${missing.join(', ')}` })
  }

  try {
    const jobId = await createJob(req.body)
    return res.status(201).json({ jobId })
  } catch (err) {
    // Most likely a broker connection failure
    return res.status(500).json({ error: `Failed to start job: ${err.message}` })
  }
})

/**
 * GET /api/jobs/:id
 *
 * Response 200: full job status + stats snapshot
 * Response 404: { error: string }
 */
router.get('/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: `Job not found: ${req.params.id}` })
  return res.json(job)
})

/**
 * POST /api/jobs/:id/stop
 *
 * Response 200: { status: 'stopped' }
 * Response 404: { error: string }
 */
router.post('/:id/stop', (req, res) => {
  try {
    stopJob(req.params.id)
    return res.json({ status: 'stopped' })
  } catch (err) {
    return res.status(404).json({ error: err.message })
  }
})

/**
 * GET /api/jobs  — optional, useful for debugging
 */
router.get('/', (req, res) => {
  return res.json(listJobs())
})

module.exports = router

/**
 * JobManager — in-memory singleton that tracks all test jobs.
 *
 * Each job record:
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

/** @type {Map<string, object>} */
const jobs = new Map()

/**
 * Create a new job, connect to the broker, and start the test runner.
 *
 * @param {object} params
 * @param {string} params.broker          Broker type key, e.g. "rabbitmq"
 * @param {object} params.connection      Broker-specific connection config
 * @param {string} params.destination     e.g. "queue/orders"
 * @param {string} params.protocol        e.g. "AMQP"
 * @param {number} params.messagesPerSec
 * @param {number} params.totalMessages   0 = unlimited
 * @param {number} params.rampUp          seconds; 0 = no ramp
 * @param {string} params.orderMode       "Sequential" | "Random" | "Burst"
 * @returns {Promise<string>} jobId
 * @throws if broker connection fails
 */
async function createJob(params) {
  const id = randomUUID()

  const config = {
    broker:         params.broker,
    connection:     params.connection,
    destination:    params.destination || 'queue/queuestorm',
    protocol:       params.protocol || 'AMQP',
    messagesPerSec: Math.max(1, Number(params.messagesPerSec) || 50),
    totalMessages:  Math.max(0, Number(params.totalMessages) || 1000),
    rampUp:         Math.max(0, Number(params.rampUp) || 0),
    orderMode:      params.orderMode || 'Sequential',
  }

  const runner = new TestRunner(id, config)

  // Connect + start — throws on connection failure so the route returns 500
  await runner.start()

  jobs.set(id, { id, config, createdAt: new Date().toISOString(), runner })

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

  const stats = job.runner.getStats()

  // Sanitise — never return the real password to the client
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
 * @throws if job not found
 */
function stopJob(id) {
  const job = jobs.get(id)
  if (!job) throw new Error(`Job not found: ${id}`)
  job.runner.stop()
}

/**
 * List all jobs (sanitised).
 * @returns {object[]}
 */
function listJobs() {
  return [...jobs.values()].map(job => getJob(job.id))
}

module.exports = { createJob, getJob, stopJob, listJobs }

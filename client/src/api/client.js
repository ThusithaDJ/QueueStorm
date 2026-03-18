/**
 * API client — thin fetch wrapper for all QueueStorm backend calls.
 * All functions throw on non-OK HTTP responses with a descriptive Error.
 */

const BASE = '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)

  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }

  return data
}

// ── Broker routes ────────────────────────────────────────────────────────────

/**
 * Test a broker connection without starting a job.
 * @param {string} brokerType  e.g. "rabbitmq"
 * @param {object} config      Connection params (host, port, username, password, vhost …)
 * @returns {Promise<{ success: boolean, message: string, latencyMs: number }>}
 */
export async function testConnection(brokerType, config) {
  return request('POST', `/brokers/${brokerType}/test-connection`, config)
}

// ── Job routes ───────────────────────────────────────────────────────────────

/**
 * Start a new load-test job.
 * @param {object} params
 * @returns {Promise<{ jobId: string }>}
 */
export async function startJob(params) {
  return request('POST', '/jobs/start', params)
}

/**
 * Poll job status + stats.
 * @param {string} jobId
 * @returns {Promise<object>}
 */
export async function getJob(jobId) {
  return request('GET', `/jobs/${jobId}`)
}

/**
 * Stop a running job.
 * @param {string} jobId
 * @returns {Promise<{ status: string }>}
 */
export async function stopJob(jobId) {
  return request('POST', `/jobs/${jobId}/stop`)
}

// ── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck() {
  return request('GET', '/health')
}

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
  try { data = await res.json() } catch { data = null }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }

  return data
}

// ── Broker routes ─────────────────────────────────────────────────────────────

export async function testConnection(brokerType, config) {
  return request('POST', `/brokers/${brokerType}/test-connection`, config)
}

// ── Job routes ────────────────────────────────────────────────────────────────

export async function startJob(params) {
  return request('POST', '/jobs/start', params)
}

export async function getJob(jobId) {
  return request('GET', `/jobs/${jobId}`)
}

export async function stopJob(jobId) {
  return request('POST', `/jobs/${jobId}/stop`)
}

export async function pauseJob(jobId) {
  return request('POST', `/jobs/${jobId}/pause`)
}

export async function resumeJob(jobId) {
  return request('POST', `/jobs/${jobId}/resume`)
}

// ── Environment profiles (v1) ─────────────────────────────────────────────────

export async function listEnvironments() {
  return request('GET', '/v1/environments')
}

export async function createEnvironment(data) {
  return request('POST', '/v1/environments', data)
}

export async function getEnvironment(id) {
  return request('GET', `/v1/environments/${id}`)
}

export async function getEnvironmentDecrypted(id) {
  return request('GET', `/v1/environments/${id}/decrypted`)
}

export async function updateEnvironment(id, data) {
  return request('PUT', `/v1/environments/${id}`, data)
}

export async function deleteEnvironment(id) {
  return request('DELETE', `/v1/environments/${id}`)
}

// ── Test config profiles (v1) ─────────────────────────────────────────────────

export async function listProfiles() {
  return request('GET', '/v1/profiles')
}

export async function createProfile(data) {
  return request('POST', '/v1/profiles', data)
}

export async function getProfile(id) {
  return request('GET', `/v1/profiles/${id}`)
}

export async function updateProfile(id, data) {
  return request('PUT', `/v1/profiles/${id}`, data)
}

export async function deleteProfile(id) {
  return request('DELETE', `/v1/profiles/${id}`)
}

// ── Message templates (v1) ────────────────────────────────────────────────────

export async function listMessageTemplates() {
  return request('GET', '/v1/messages')
}

export async function createMessageTemplate(data) {
  return request('POST', '/v1/messages', data)
}

export async function updateMessageTemplate(id, data) {
  return request('PUT', `/v1/messages/${id}`, data)
}

export async function deleteMessageTemplate(id) {
  return request('DELETE', `/v1/messages/${id}`)
}

export async function previewMessageTemplate(template, count = 3) {
  return request('POST', '/v1/messages/preview', { template, count })
}

// ── Log Analyser (v1) ─────────────────────────────────────────────────────────

export async function analyseLogFile(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/v1/log-analyser/upload`, { method: 'POST', body: form })
  let data
  try { data = await res.json() } catch { data = null }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// ── CSV uploads (v1) ──────────────────────────────────────────────────────────

export async function uploadCsv(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/v1/uploads/csv`, { method: 'POST', body: form })
  let data
  try { data = await res.json() } catch { data = null }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// ── Auth (v1) ─────────────────────────────────────────────────────────────────

export async function register(data) {
  return request('POST', '/v1/auth/register', data)
}

export async function login(data) {
  return request('POST', '/v1/auth/login', data)
}

export async function getMe(token) {
  const res = await fetch(`${BASE}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  let data
  try { data = await res.json() } catch { data = null }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function healthCheck() {
  return request('GET', '/health')
}

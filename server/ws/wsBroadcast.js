/**
 * QS-24 — WebSocket broadcaster
 *
 * Attaches a `ws` WebSocket server to the existing HTTP server.
 * Clients subscribe to a specific jobId by sending:
 *   { type: 'subscribe', jobId: '<uuid>' }
 *
 * The server broadcasts job snapshots keyed by jobId whenever the TestRunner
 * emits an 'update' event.
 *
 * Message types (server → client):
 *   { type: 'snapshot', jobId, data }   — full job status object
 *   { type: 'error',    message }       — protocol-level error
 *   { type: 'pong' }                    — response to { type: 'ping' }
 */

const { WebSocketServer, OPEN } = require('ws')

/** @type {Map<string, Set<import('ws').WebSocket>>} jobId → connected sockets */
const subscribers = new Map()

/** @type {WebSocketServer|null} */
let wss = null

/**
 * Attach WebSocket server to an existing http.Server instance.
 * @param {import('http').Server} httpServer
 */
function attachWss(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (socket) => {
    let subscribedJobId = null

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (msg.type === 'ping') {
        safeSend(socket, { type: 'pong' })
        return
      }

      if (msg.type === 'subscribe' && msg.jobId) {
        // Unsubscribe from previous job if any
        if (subscribedJobId) unsubscribe(socket, subscribedJobId)

        subscribedJobId = msg.jobId
        if (!subscribers.has(subscribedJobId)) {
          subscribers.set(subscribedJobId, new Set())
        }
        subscribers.get(subscribedJobId).add(socket)
        return
      }

      if (msg.type === 'unsubscribe') {
        if (subscribedJobId) {
          unsubscribe(socket, subscribedJobId)
          subscribedJobId = null
        }
        return
      }
    })

    socket.on('close', () => {
      if (subscribedJobId) unsubscribe(socket, subscribedJobId)
    })

    socket.on('error', (err) => {
      console.warn('[WS] socket error:', err.message)
    })
  })

  console.log('[WS] WebSocket server attached at /ws')
  return wss
}

function unsubscribe(socket, jobId) {
  const set = subscribers.get(jobId)
  if (!set) return
  set.delete(socket)
  if (set.size === 0) subscribers.delete(jobId)
}

/**
 * Broadcast a job snapshot to all subscribers of that jobId.
 * Called by JobManager whenever a job update is available.
 * @param {string} jobId
 * @param {object} data  — serialisable job snapshot
 */
function broadcast(jobId, data) {
  const set = subscribers.get(jobId)
  if (!set || set.size === 0) return

  const payload = JSON.stringify({ type: 'snapshot', jobId, data })
  for (const socket of set) {
    if (socket.readyState === OPEN) {
      socket.send(payload)
    }
  }
}

function safeSend(socket, obj) {
  if (socket.readyState === OPEN) {
    socket.send(JSON.stringify(obj))
  }
}

module.exports = { attachWss, broadcast }

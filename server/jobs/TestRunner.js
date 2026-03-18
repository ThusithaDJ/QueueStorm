/**
 * TestRunner — drives a single load-test job on the server side.
 *
 * Lifecycle:
 *   new TestRunner(id, config) → runner.start() → ... → runner.stop()
 *
 * Config shape:
 * {
 *   broker:        string   e.g. "rabbitmq"
 *   connection:    object   broker-specific connection params
 *   destination:   string   e.g. "queue/orders"
 *   protocol:      string   e.g. "AMQP"
 *   messagesPerSec: number
 *   totalMessages:  number   0 = unlimited
 *   rampUp:         number   seconds; 0 = no ramp
 *   orderMode:      string   "Sequential" | "Random" | "Burst"
 * }
 */

const MessageGenerator = require('./MessageGenerator')

const TICK_MS = 100          // internal tick resolution (ms)
const MAX_LOG_ENTRIES = 100  // cap on in-memory log buffer
const MAX_THROUGHPUT_PTS = 20

const STATUS_POOL = {
  ok:   ['Delivered', 'ACK received', 'Persisted'],
  warn: ['Slow consumer', 'Retry #1', 'High queue depth'],
  err:  ['Timeout', 'Connection reset', 'Dead-lettered'],
}

function weightedStatus() {
  const r = Math.random()
  if (r < 0.80) return 'ok'
  if (r < 0.95) return 'warn'
  return 'err'
}

function randomNote(status) {
  const pool = STATUS_POOL[status]
  return pool[Math.floor(Math.random() * pool.length)]
}

function nowHHMMSS() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

class TestRunner {
  constructor(id, config) {
    this.id = id
    this.config = config

    // Job lifecycle
    this.status = 'pending'   // pending | running | completed | stopped | error
    this.startedAt = null
    this.stoppedAt = null
    this.errorMessage = null

    // Accumulators
    this._sent = 0
    this._acked = 0
    this._dropped = 0
    this._totalLatencyMs = 0
    this._accumulator = 0     // fractional message carry-over between ticks
    this._windowSent = 0      // messages sent in current 1 s window
    this._windowStart = 0

    // Output buffers (read by getStats())
    this._throughputHistory = []  // array of msg/s numbers, max MAX_THROUGHPUT_PTS
    this._logEntries = []         // newest first, max MAX_LOG_ENTRIES

    // Broker instance
    this._broker = null

    // Generator
    this._generator = new MessageGenerator({ orderMode: config.orderMode })

    // Interval reference
    this._intervalId = null

    // Bind tick to avoid re-creating the closure every interval
    this._tick = this._tick.bind(this)
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Connect to the broker and start the interval loop.
   * Throws if the connection fails — the route handler returns 500 in that case.
   */
  async start() {
    const { getBrokerClass } = require('../brokers/registry')

    const BrokerClass = getBrokerClass(this.config.broker)
    this._broker = new BrokerClass()

    await this._broker.connect(this.config.connection)
    await this._broker.prepareDestination(this.config.destination)

    this.status = 'running'
    this.startedAt = new Date().toISOString()
    this._windowStart = Date.now()

    this._intervalId = setInterval(this._tick, TICK_MS)
  }

  /** Stop the job immediately (user-initiated or from route handler). */
  stop() {
    this._finish('stopped')
  }

  /** Return a snapshot suitable for the GET /api/jobs/:id response. */
  getStats() {
    const elapsed = this.startedAt
      ? Math.round((Date.now() - new Date(this.startedAt).getTime()) / 1000)
      : 0

    const progress = this.config.totalMessages > 0
      ? Math.min(100, Math.round((this._sent / this.config.totalMessages) * 100))
      : null   // null means "unlimited"

    return {
      status:    this.status,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      elapsed,
      progress,
      errorMessage: this.errorMessage,
      stats: {
        sent:       this._sent,
        acked:      this._acked,
        dropped:    this._dropped,
        avgLatency: this._acked > 0
          ? Math.round((this._totalLatencyMs / this._acked) * 10) / 10
          : 0,
      },
      throughputHistory: [...this._throughputHistory],
      logEntries: this._logEntries.slice(0, 50),
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _currentRate() {
    const { messagesPerSec, rampUp } = this.config
    if (!rampUp || rampUp === 0) return messagesPerSec

    const elapsedSec = (Date.now() - new Date(this.startedAt).getTime()) / 1000
    if (elapsedSec >= rampUp) return messagesPerSec

    return Math.ceil(messagesPerSec * (elapsedSec / rampUp))
  }

  _tick() {
    if (this.status !== 'running') return

    // Check if we have hit the total message cap
    if (this.config.totalMessages > 0 && this._sent >= this.config.totalMessages) {
      this._finish('completed')
      return
    }

    // Calculate how many messages to send this tick using an accumulator
    // so fractional rates (e.g. 3 msg/s → 0.3 per 100 ms tick) stay accurate
    const rate = this._currentRate()
    this._accumulator += rate * (TICK_MS / 1000)
    let toSend = Math.floor(this._accumulator)
    this._accumulator -= toSend

    // Respect totalMessages cap
    if (this.config.totalMessages > 0) {
      toSend = Math.min(toSend, this.config.totalMessages - this._sent)
    }

    if (toSend === 0) return

    // Publish messages
    for (let i = 0; i < toSend; i++) {
      try {
        const body = this._generator.next()
        const { ok, latencyMs } = this._broker.publish(this.config.destination, body)

        this._sent++
        if (ok) {
          this._acked++
          this._totalLatencyMs += latencyMs
        } else {
          this._dropped++
        }

        const logStatus = ok ? weightedStatus() : 'err'
        this._appendLog(logStatus, latencyMs, null)
      } catch (err) {
        this._sent++
        this._dropped++
        this._appendLog('err', 0, err.message)
      }
    }

    // Update 1-second throughput window
    this._windowSent += toSend
    const now = Date.now()
    if (now - this._windowStart >= 1000) {
      this._throughputHistory.push(this._windowSent)
      if (this._throughputHistory.length > MAX_THROUGHPUT_PTS) {
        this._throughputHistory.shift()
      }
      this._windowSent = 0
      this._windowStart = now
    }
  }

  _appendLog(status, latencyMs, notes) {
    this._logEntries.unshift({
      msgId:    `MSG-${this._sent}`,
      time:     nowHHMMSS(),
      latency:  Math.round(latencyMs * 10) / 10,
      status,
      notes:    notes || randomNote(status),
    })
    if (this._logEntries.length > MAX_LOG_ENTRIES) {
      this._logEntries.pop()
    }
  }

  _finish(finalStatus) {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }
    this.status = finalStatus
    this.stoppedAt = new Date().toISOString()

    // Disconnect broker asynchronously — errors are swallowed by the broker implementation
    if (this._broker) {
      this._broker.disconnect().catch(() => {})
      this._broker = null
    }
  }
}

module.exports = TestRunner

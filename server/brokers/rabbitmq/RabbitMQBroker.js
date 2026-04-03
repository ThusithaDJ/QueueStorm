/**
 * RabbitMQBroker — AMQP 0-9-1 implementation using amqplib.
 *
 * Connection config shape expected:
 * {
 *   host:     string   e.g. "localhost"
 *   port:     number   e.g. 5672
 *   username: string   e.g. "guest"
 *   password: string
 *   vhost:    string   e.g. "/"
 * }
 */

const amqp = require('amqplib')
const BaseBroker = require('../BaseBroker')

const CONNECTION_TIMEOUT_MS = 5000

class RabbitMQBroker extends BaseBroker {
  constructor() {
    super()
    this._conn = null
    this._channel = null
    this._assertedQueues = new Set()
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the amqp:// URL from a connection config object.
   * vhost "/" must be percent-encoded as "%2F" in the URL path.
   */
  _buildUrl(config) {
    const { host, port, username, password, vhost = '/' } = config
    const encodedVhost = encodeURIComponent(vhost)
    const encodedPassword = encodeURIComponent(password)
    return `amqp://${username}:${encodedPassword}@${host}:${port}/${encodedVhost}`
  }

  /** Extract the bare queue name from destination strings like "queue/orders" */
  _queueName(destination) {
    return (destination || 'queuestorm.default').replace(/^(queue|topic)\//, '')
  }

  // ---------------------------------------------------------------------------
  // BaseBroker interface
  // ---------------------------------------------------------------------------

  async testConnection(config) {
    const t0 = Date.now()
    let conn = null
    try {
      const url = this._buildUrl(config)

      conn = await Promise.race([
        amqp.connect(url),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Connection timed out after ${CONNECTION_TIMEOUT_MS / 1000}s`)),
            CONNECTION_TIMEOUT_MS
          )
        ),
      ])

      await conn.close()
      return {
        success: true,
        message: 'Connected to RabbitMQ successfully',
        latencyMs: Date.now() - t0,
      }
    } catch (err) {
      if (conn) {
        try { await conn.close() } catch {}
      }
      return {
        success: false,
        message: RabbitMQBroker._friendlyError(err),
        latencyMs: Date.now() - t0,
      }
    }
  }

  async connect(config) {
    const url = this._buildUrl(config)
    this._conn = await amqp.connect(url)

    // Survive unexpected broker-side disconnects gracefully
    this._conn.on('error', () => {})
    this._conn.on('close', () => {})

    this._channel = await this._conn.createChannel()

    // Default prefetch — prevents the channel buffer from growing unboundedly
    this._channel.prefetch(256)
  }

  async prepareDestination(destination) {
    const queue = this._queueName(destination)
    if (!this._assertedQueues.has(queue)) {
      await this._channel.assertQueue(queue, { durable: true })
      this._assertedQueues.add(queue)
    }
  }

  publish(destination, body) {
    const queue = this._queueName(destination)
    const t0 = process.hrtime.bigint()
    const ok = this._channel.sendToQueue(
      queue,
      Buffer.from(body),
      { persistent: false, contentType: 'application/json' }
    )
    const latencyMs = Number(process.hrtime.bigint() - t0) / 1e6
    return { ok, latencyMs }
  }

  async disconnect() {
    try { if (this._channel) await this._channel.close() } catch {}
    try { if (this._conn) await this._conn.close() } catch {}
    this._channel = null
    this._conn = null
    this._assertedQueues.clear()
  }

  /**
   * Extract a human-readable error message from amqplib errors.
   * amqplib often throws AggregateError with an empty `.message` — the useful
   * detail lives in `.code`, `.errors[0]`, or the nested cause.
   */
  static _friendlyError(err) {
    if (err.message && err.message.trim()) return err.message

    // AggregateError: check nested errors first
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      const inner = err.errors[0]
      if (inner.message) return inner.message
      if (inner.code)    return `${inner.code} (${inner.address ?? 'unknown host'}:${inner.port ?? '?'})`
    }

    // Flat error with just a code (e.g. ECONNREFUSED)
    if (err.code) {
      const addr = err.address ? ` ${err.address}:${err.port}` : ''
      const codeMessages = {
        ECONNREFUSED:  `Connection refused${addr} — is RabbitMQ running?`,
        ENOTFOUND:     `Host not found${addr} — check the hostname`,
        ETIMEDOUT:     `Connection timed out${addr}`,
        ECONNRESET:    `Connection reset by peer`,
        ACCESS_REFUSED:`Access refused — check username / password / vhost`,
      }
      return codeMessages[err.code] ?? `${err.code}${addr}`
    }

    return String(err)
  }
}

module.exports = RabbitMQBroker

/**
 * AMQArtemisBroker — AMQP 1.0 implementation for Red Hat AMQ / ActiveMQ Artemis.
 *
 * Uses the `rhea` library (the reference AMQP 1.0 Node.js client, also
 * maintained by Red Hat).
 *
 * Connection config shape:
 * {
 *   host:        string   e.g. "amq-broker.internal"
 *   port:        number   5672 (plain) | 5671 (SSL)
 *   username:    string
 *   password:    string
 *   // SSL options (all optional — only used when ssl: true)
 *   ssl:               boolean  enable TLS
 *   sslCertId:         string   UUID returned by POST /api/v1/ssl-certs
 *   sslVerifyServer:   boolean  reject self-signed / untrusted server certs (default: true)
 * }
 *
 * Destination format: "queue/myqueue" or "topic/mytopic"
 * Topics are mapped to AMQP multicast addresses (prefix "topic://").
 */

const rhea      = require('rhea')
const BaseBroker = require('../BaseBroker')

const CONNECT_TIMEOUT_MS = 8000
const SENDER_TIMEOUT_MS  = 5000

class AMQArtemisBroker extends BaseBroker {
  constructor() {
    super()
    this._container = null
    this._conn      = null
    this._sender    = null
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Resolve AMQP address from "queue/foo" or "topic/foo" notation */
  static _address(destination) {
    if (!destination) return 'queuestorm.default'
    // "topic/foo" → "topic://foo" (Artemis multicast address prefix)
    if (/^topic\//i.test(destination)) {
      return destination.replace(/^topic\//i, 'topic://')
    }
    // "queue/foo" → "foo" (Artemis anycast address — default)
    return destination.replace(/^queue\//i, '')
  }

  /**
   * Build rhea connect options from connection config + optional TLS bundle.
   * @param {object} config
   * @param {import('../../routes/v1/sslCerts').CertBundle|null} certBundle
   * @returns {object}
   */
  static _buildOptions(config, certBundle) {
    const opts = {
      host:       config.host     || 'localhost',
      port:       Number(config.port) || 5672,
      username:   config.username || undefined,
      password:   config.password || undefined,
      reconnect:  false,
      // Increase idle timeout for high-throughput scenarios
      idle_time_out: 30000,
    }

    if (config.ssl || certBundle) {
      opts.transport = 'tls'
      opts.tls = {
        rejectUnauthorized: config.sslVerifyServer !== false,
      }

      if (certBundle) {
        if (certBundle.ca)   opts.tls.ca         = certBundle.ca
        if (certBundle.cert) opts.tls.cert        = certBundle.cert
        if (certBundle.key)  opts.tls.key         = certBundle.key
        if (certBundle.pfx)  opts.tls.pfx         = certBundle.pfx
        if (certBundle.passphrase) opts.tls.passphrase = certBundle.passphrase
      }
    }

    return opts
  }

  /** Resolve cert bundle from global cert store (safe — returns null if absent) */
  static _resolveCertBundle(config) {
    if (!config.sslCertId) return null
    try {
      const { certStore } = require('../../routes/v1/sslCerts')
      return certStore.get(config.sslCertId) || null
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // BaseBroker interface
  // ---------------------------------------------------------------------------

  async testConnection(config) {
    const t0 = Date.now()
    let conn = null
    let container = null

    try {
      container = rhea.create_container({ id: `qs-test-${Date.now()}` })
      const certBundle = AMQArtemisBroker._resolveCertBundle(config)
      const opts       = AMQArtemisBroker._buildOptions(config, certBundle)

      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS
        )

        conn = container.connect(opts)

        conn.on('connection_open', () => {
          clearTimeout(timer)
          resolve()
        })

        conn.on('connection_error', ctx => {
          clearTimeout(timer)
          reject(new Error(
            ctx.connection?.error?.description ||
            ctx.connection?.error?.condition   ||
            'Connection error'
          ))
        })

        conn.on('disconnected', ctx => {
          clearTimeout(timer)
          const err = ctx.error || ctx.connection?.error
          reject(new Error(err?.message || err?.description || 'Disconnected before open'))
        })
      })

      return {
        success:   true,
        message:   'Connected to Red Hat AMQ (Artemis) successfully',
        latencyMs: Date.now() - t0,
      }
    } catch (err) {
      return {
        success:   false,
        message:   AMQArtemisBroker._friendlyError(err),
        latencyMs: Date.now() - t0,
      }
    } finally {
      try { if (conn) conn.close() } catch {}
    }
  }

  async connect(config) {
    this._container = rhea.create_container({ id: `qs-${Date.now()}` })
    const certBundle = AMQArtemisBroker._resolveCertBundle(config)
    const opts       = AMQArtemisBroker._buildOptions(config, certBundle)

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
        CONNECT_TIMEOUT_MS
      )

      this._conn = this._container.connect(opts)

      this._conn.on('connection_open', () => {
        clearTimeout(timer)
        resolve()
      })

      this._conn.on('connection_error', ctx => {
        clearTimeout(timer)
        reject(new Error(
          ctx.connection?.error?.description ||
          ctx.connection?.error?.condition   ||
          'Connection error'
        ))
      })

      this._conn.on('disconnected', ctx => {
        // Only reject if we have not yet resolved
        if (!this._conn?.is_open()) {
          clearTimeout(timer)
          const err = ctx.error || ctx.connection?.error
          reject(new Error(err?.message || err?.description || 'Disconnected'))
        }
      })

      // Swallow errors after we're up — the runner will fail naturally
      this._conn.on('error', () => {})
    })
  }

  async prepareDestination(destination) {
    const address = AMQArtemisBroker._address(destination)

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Sender open timed out for address: ${address}`)),
        SENDER_TIMEOUT_MS
      )

      this._sender = this._conn.open_sender({
        target: { address },
        // Ensure the address exists (auto-create on modern Artemis)
        snd_settle_mode: 1,   // settled — fire-and-forget for throughput
      })

      this._sender.on('sender_open', () => {
        clearTimeout(timer)
        resolve()
      })

      this._sender.on('sender_error', ctx => {
        clearTimeout(timer)
        reject(new Error(
          ctx.sender?.error?.description ||
          ctx.sender?.error?.condition   ||
          'Sender error'
        ))
      })
    })
  }

  publish(destination, body) {
    const t0 = process.hrtime.bigint()

    // If the sender has no credit (flow control), the message is buffered by rhea
    // and sent when credit becomes available — we treat this as ok.
    const ok = !!(this._sender && this._conn?.is_open())

    if (ok) {
      this._sender.send({
        body,
        durable: false,
        content_type: 'application/json',
      })
    }

    return {
      ok,
      latencyMs: Number(process.hrtime.bigint() - t0) / 1e6,
    }
  }

  async disconnect() {
    try {
      if (this._sender && !this._sender.is_closed()) {
        this._sender.close()
      }
    } catch {}

    await new Promise(resolve => {
      if (!this._conn || this._conn.is_closed()) return resolve()

      const timer = setTimeout(resolve, 2000)  // force-close after 2s

      try {
        this._conn.on('connection_close', () => {
          clearTimeout(timer)
          resolve()
        })
        this._conn.close()
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })

    this._sender    = null
    this._conn      = null
    this._container = null
  }

  // ---------------------------------------------------------------------------
  // Error formatting
  // ---------------------------------------------------------------------------

  static _friendlyError(err) {
    if (!err) return 'Unknown error'
    const msg = err.message || err.description || err.condition || String(err)

    const codeMessages = {
      ECONNREFUSED: 'Connection refused — is AMQ Artemis running?',
      ENOTFOUND:    'Host not found — check the hostname',
      ETIMEDOUT:    'Connection timed out',
      ECONNRESET:   'Connection reset by peer',
      CERT_HAS_EXPIRED:        'TLS certificate has expired',
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS: unable to verify server certificate — upload a CA cert or disable server verification',
      SELF_SIGNED_CERT_IN_CHAIN:       'TLS: self-signed certificate in chain — upload a CA cert',
      ERR_TLS_CERT_ALTNAME_INVALID:    'TLS: hostname does not match certificate',
    }

    if (err.code && codeMessages[err.code]) return codeMessages[err.code]
    if (msg.includes('amqp:unauthorized-access')) return 'Access refused — check username and password'
    if (msg.includes('amqp:not-found'))           return 'Address not found on broker'
    if (msg.includes('amqp:resource-locked'))      return 'Resource locked by another client'
    return msg
  }
}

module.exports = AMQArtemisBroker

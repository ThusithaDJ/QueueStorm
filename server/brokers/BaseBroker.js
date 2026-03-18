/**
 * BaseBroker — abstract interface every broker implementation must honour.
 *
 * Adding a new broker:
 *   1. Create server/brokers/<name>/<Name>Broker.js extending BaseBroker
 *   2. Register it in server/brokers/registry.js
 *   3. Add its connection fields to client/src/config/brokers.js
 */
class BaseBroker {
  /**
   * Test whether a connection to the broker can be established.
   * The implementation must open and cleanly close the connection — do NOT leave it open.
   *
   * @param {object} config  Broker-specific connection parameters
   * @returns {Promise<{ success: boolean, message: string, latencyMs: number }>}
   */
  async testConnection(config) {
    throw new Error(`${this.constructor.name}.testConnection() is not implemented`)
  }

  /**
   * Open a persistent connection for high-throughput publishing.
   * Called once per TestRunner before the interval loop starts.
   *
   * @param {object} config  Broker-specific connection parameters
   * @returns {Promise<void>}
   */
  async connect(config) {
    throw new Error(`${this.constructor.name}.connect() is not implemented`)
  }

  /**
   * Declare / assert the destination (queue, topic, exchange) so messages
   * can be published to it.  Called once after connect(), before publishing.
   *
   * @param {string} destination  e.g. "queue/orders"
   * @returns {Promise<void>}
   */
  async prepareDestination(destination) {
    // Optional — subclasses that need up-front declaration override this.
  }

  /**
   * Publish a single message.  Called repeatedly inside the tick loop.
   * Implementations should be as fast as possible (prefer fire-and-forget
   * or internally buffered writes).
   *
   * @param {string} destination  e.g. "queue/orders"
   * @param {string} body         Serialised message body (UTF-8 string)
   * @returns {{ ok: boolean, latencyMs: number }}
   */
  publish(destination, body) {
    throw new Error(`${this.constructor.name}.publish() is not implemented`)
  }

  /**
   * Close the connection cleanly.  Called when the job stops or completes.
   * Implementations must swallow their own errors so the caller is not blocked.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error(`${this.constructor.name}.disconnect() is not implemented`)
  }
}

module.exports = BaseBroker

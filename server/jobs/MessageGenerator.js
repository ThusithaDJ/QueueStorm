/**
 * MessageGenerator — produces message bodies for the test runner.
 *
 * Currently generates sequential JSON payloads.
 * Future: support CSV rows and user-defined templates.
 */

class MessageGenerator {
  /**
   * @param {object} opts
   * @param {'sequential'|'random'|'burst'} opts.orderMode
   * @param {string[]|null}                 opts.customRows  CSV rows or null
   */
  constructor(opts = {}) {
    this.orderMode = (opts.orderMode || 'Sequential').toLowerCase()
    this.customRows = opts.customRows || null
    this._counter = 0
  }

  /**
   * Generate the next message body string.
   * @returns {string}
   */
  next() {
    this._counter++
    const idx = this.orderMode === 'random'
      ? Math.floor(Math.random() * 1e6) + 1
      : this._counter

    if (this.customRows && this.customRows.length > 0) {
      const row = this.customRows[(this._counter - 1) % this.customRows.length]
      return row
    }

    return JSON.stringify({
      _msgId: this._counter,
      _seq: idx,
      _ts: Date.now(),
      _source: 'QueueStorm',
      payload: `Load test message #${this._counter}`,
    })
  }

  get count() {
    return this._counter
  }

  reset() {
    this._counter = 0
  }
}

module.exports = MessageGenerator

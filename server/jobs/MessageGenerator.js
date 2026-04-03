/**
 * MessageGenerator — produces message bodies for the test runner.
 */

const TemplateEngine = require('./TemplateEngine')

class MessageGenerator {
  /**
   * @param {object} opts
   * @param {'sequential'|'random'|'burst'} opts.orderMode
   * @param {string[]|null}                 opts.customRows  CSV rows or null
   */
  constructor(opts = {}) {
    this.orderMode = (opts.orderMode || 'Sequential').toLowerCase()
    this.customRows = opts.customRows || null
    this.columnMapping = opts.columnMapping || null
    this.template = opts.template || null
    this._counter = 0
    this._engine = new TemplateEngine()
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

    // Template-based generation
    if (this.template) {
      return this._engine.render(this.template)
    }

    if (this.customRows && this.customRows.length > 0) {
      const rowObj = this.customRows[(this._counter - 1) % this.customRows.length]
      // Apply column mapping if provided
      if (this.columnMapping && Object.keys(this.columnMapping).length > 0) {
        const mapped = {}
        for (const [csvCol, msgField] of Object.entries(this.columnMapping)) {
          if (msgField) mapped[msgField] = rowObj[csvCol]
        }
        return JSON.stringify(mapped)
      }
      return typeof rowObj === 'string' ? rowObj : JSON.stringify(rowObj)
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

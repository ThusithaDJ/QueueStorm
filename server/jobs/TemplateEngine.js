/**
 * TemplateEngine — resolves {{tokens}} in message templates.
 *
 * Supported tokens:
 *   {{uuid}}               — random UUID v4
 *   {{timestamp}}          — current ISO-8601 timestamp
 *   {{sequence}}           — auto-incrementing integer (per-engine instance)
 *   {{random(min,max)}}    — random integer between min and max (inclusive)
 *   {{randomFloat(min,max,decimals)}} — random float
 *   {{randomItem(a,b,c)}}  — pick one of the listed items
 */

const { randomUUID } = require('crypto')

class TemplateEngine {
  constructor() {
    this._seq = 0
  }

  render(template) {
    this._seq++
    const seq = this._seq

    return template
      .replace(/\{\{uuid\}\}/g, () => randomUUID())
      .replace(/\{\{timestamp\}\}/g, () => new Date().toISOString())
      .replace(/\{\{sequence\}\}/g, () => String(seq))
      .replace(/\{\{random\((-?\d+),\s*(-?\d+)\)\}\}/g, (_m, min, max) => {
        const lo = parseInt(min, 10)
        const hi = parseInt(max, 10)
        return String(Math.floor(Math.random() * (hi - lo + 1)) + lo)
      })
      .replace(/\{\{randomFloat\((-?[\d.]+),\s*(-?[\d.]+)(?:,\s*(\d+))?\)\}\}/g, (_m, min, max, dec) => {
        const lo = parseFloat(min)
        const hi = parseFloat(max)
        const d  = dec !== undefined ? parseInt(dec, 10) : 2
        return (Math.random() * (hi - lo) + lo).toFixed(d)
      })
      .replace(/\{\{randomItem\(([^)]+)\)\}\}/g, (_m, items) => {
        const list = items.split(',').map(s => s.trim())
        return list[Math.floor(Math.random() * list.length)]
      })
  }
}

module.exports = TemplateEngine

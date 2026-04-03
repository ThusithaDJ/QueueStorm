/**
 * POST /api/v1/log-analyser/upload
 *
 * Accepts a plain-text log file (up to 500 MB via streaming).
 * Detects:
 *   • Timestamps (ISO-8601 or common syslog patterns)
 *   • Dropped / failed messages (keywords: DROP, FAIL, ERROR, TIMEOUT, DEAD)
 *   • Out-of-order messages (when a sequence number decreases)
 *   • Basic stats: total lines, error lines, ordering violations
 *
 * Returns JSON analysis result.
 */

const { Router } = require('express')
const multer = require('multer')
const path   = require('path')
const { asyncRoute, httpError } = require('../../middleware/errorHandler')

const router  = Router()
const storage = multer.memoryStorage()
const upload  = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!['.log', '.txt', ''].includes(ext)) {
      return cb(new Error('Only .log or .txt files are accepted'))
    }
    cb(null, true)
  },
})

// Timestamp patterns (most specific first)
const TS_PATTERNS = [
  // ISO 8601: 2024-01-15T13:45:22.123Z or with offset
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/,
  // syslog: Jan 15 13:45:22
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,
  // nginx / apache: 15/Jan/2024:13:45:22
  /\d{2}\/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/\d{4}:\d{2}:\d{2}:\d{2}/,
  // simple date-time: 2024-01-15 13:45:22
  /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,
]

// Drop/error keywords
const DROP_KEYWORDS = /\b(DROP(?:PED)?|FAIL(?:ED|URE)?|ERROR|TIMEOUT|DEAD.?LETTER|NACK|REJECTED)\b/i

// Sequence number patterns:  seq=123  |  msgId=MSG-45  |  #123
const SEQ_PATTERNS = [
  /\bseq(?:uence)?[=:]\s*(\d+)/i,
  /\bmsg(?:Id)?[=:#]\s*(\d+)/i,
  /\bid[=:]\s*(\d+)/i,
  /#(\d+)\b/,
]

function extractTimestamp(line) {
  for (const pat of TS_PATTERNS) {
    const m = line.match(pat)
    if (m) return m[0]
  }
  return null
}

function extractSeq(line) {
  for (const pat of SEQ_PATTERNS) {
    const m = line.match(pat)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function analyseLog(buffer) {
  const text  = buffer.toString('utf-8')
  const lines = text.split(/\r?\n/)

  const result = {
    totalLines:          0,
    errorLines:          0,
    orderingViolations:  0,
    timestampedLines:    0,
    droppedMessages:     [],
    orderingErrors:      [],
    summary:             [],
  }

  let lastSeq  = null
  const MAX_DETAILS = 200  // cap returned rows

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    result.totalLines++

    const ts  = extractTimestamp(line)
    if (ts) result.timestampedLines++

    // Dropped/error detection
    if (DROP_KEYWORDS.test(line)) {
      result.errorLines++
      if (result.droppedMessages.length < MAX_DETAILS) {
        result.droppedMessages.push({
          lineNo: i + 1,
          ts:     ts || null,
          line:   line.slice(0, 200),
        })
      }
    }

    // Ordering violation detection
    const seq = extractSeq(line)
    if (seq !== null) {
      if (lastSeq !== null && seq < lastSeq) {
        result.orderingViolations++
        if (result.orderingErrors.length < MAX_DETAILS) {
          result.orderingErrors.push({
            lineNo:  i + 1,
            ts:      ts || null,
            seq,
            prevSeq: lastSeq,
            line:    line.slice(0, 200),
          })
        }
      }
      lastSeq = seq
    }
  }

  // Build summary
  result.summary = [
    `Total lines processed: ${result.totalLines.toLocaleString()}`,
    `Lines with timestamps: ${result.timestampedLines.toLocaleString()}`,
    `Error / dropped lines: ${result.errorLines.toLocaleString()}`,
    `Ordering violations:   ${result.orderingViolations.toLocaleString()}`,
  ]

  return result
}

router.post('/upload', upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw httpError(400, 'No file uploaded')

  const analysis = analyseLog(req.file.buffer)

  res.json({
    filename: req.file.originalname,
    sizeBytes: req.file.size,
    ...analysis,
  })
}))

module.exports = router

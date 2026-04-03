/**
 * POST /api/v1/uploads/csv
 *
 * Accepts a multipart CSV file, parses headers + first N rows as preview,
 * stores the full parsed rows in memory (keyed by uploadId).
 *
 * Response: { uploadId, headers, preview (first 5 rows), totalRows }
 */

const { Router } = require('express')
const multer = require('multer')
const { parse } = require('csv-parse/sync')
const { randomUUID } = require('crypto')

const router = Router()

// Keep parsed uploads in memory (TTL eviction not needed for dev)
const uploadStore = new Map()

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.csv$/i)) {
      return cb(new Error('Only CSV files are accepted'))
    }
    cb(null, true)
  },
})

router.post('/csv', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  let records
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    return res.status(422).json({ error: `CSV parse error: ${err.message}` })
  }

  if (records.length === 0) {
    return res.status(422).json({ error: 'CSV file is empty or has no data rows' })
  }

  const uploadId = randomUUID()
  const headers = Object.keys(records[0])

  uploadStore.set(uploadId, { headers, rows: records, filename: req.file.originalname })

  return res.status(201).json({
    uploadId,
    headers,
    preview: records.slice(0, 5),
    totalRows: records.length,
  })
})

/**
 * GET /api/v1/uploads/:id/rows
 * Returns all parsed rows for an upload (used by the job runner)
 */
router.get('/:id/rows', (req, res) => {
  const entry = uploadStore.get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Upload not found' })
  return res.json({ rows: entry.rows, headers: entry.headers })
})

module.exports = router
module.exports.uploadStore = uploadStore

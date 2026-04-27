/**
 * SSL Certificate store
 *
 * POST /api/v1/ssl-certs
 *   Accepts a multipart form with up to four cert files:
 *     ca    — CA / trust-store certificate (PEM)
 *     cert  — Client certificate (PEM)
 *     key   — Client private key (PEM)
 *     pfx   — PKCS#12 bundle (replaces cert+key)
 *   Plus optional text field:
 *     passphrase — private key / PFX passphrase
 *
 * Returns: { certId, uploaded: ['ca','cert',...] }
 *
 * GET /api/v1/ssl-certs/:id
 *   Returns metadata only (filenames + uploaded fields — never raw cert bytes)
 *
 * DELETE /api/v1/ssl-certs/:id
 *   Removes the stored cert bundle
 *
 * Cert bundles are kept in memory for the lifetime of the server process.
 * In production you would persist them (encrypted) in the database.
 */

const { Router } = require('express')
const multer = require('multer')
const { randomUUID } = require('crypto')
const { httpError, asyncRoute } = require('../../middleware/errorHandler')

const router = Router()

// ── In-memory store ───────────────────────────────────────────────────────────

/** @type {Map<string, CertBundle>} */
const certStore = new Map()

/**
 * @typedef {object} CertBundle
 * @property {string}   id
 * @property {Buffer}  [ca]         — CA certificate (PEM)
 * @property {Buffer}  [cert]       — client certificate (PEM)
 * @property {Buffer}  [key]        — client private key (PEM)
 * @property {Buffer}  [pfx]        — PKCS#12 bundle
 * @property {string}  [passphrase] — key / PFX passphrase
 * @property {string[]} uploaded    — which of ca/cert/key/pfx were provided
 * @property {object}   filenames   — original file names for display
 */

// ── Multer (memory storage, accept any cert-like extension) ───────────────────

const CERT_FIELDS = ['ca', 'cert', 'key', 'pfx']
const MAX_CERT_SIZE = 256 * 1024  // 256 KB — certs are small

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: MAX_CERT_SIZE, files: 4 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pem|crt|cer|key|p12|pfx)$/i.test(file.originalname)
    if (!ok) return cb(new Error(`Unsupported file type: ${file.originalname}`))
    cb(null, true)
  },
})

// ── POST /api/v1/ssl-certs ────────────────────────────────────────────────────

router.post(
  '/',
  upload.fields(CERT_FIELDS.map(name => ({ name, maxCount: 1 }))),
  asyncRoute(async (req, res) => {
    const files = req.files || {}
    const uploaded = CERT_FIELDS.filter(f => files[f]?.[0])

    if (uploaded.length === 0) {
      throw httpError(400, 'Upload at least one certificate file (ca, cert, key, or pfx)')
    }

    const id = randomUUID()

    /** @type {CertBundle} */
    const bundle = {
      id,
      uploaded,
      filenames: {},
      passphrase: req.body?.passphrase || null,
    }

    for (const field of uploaded) {
      bundle[field]           = files[field][0].buffer
      bundle.filenames[field] = files[field][0].originalname
    }

    certStore.set(id, bundle)

    res.status(201).json({
      certId:   id,
      uploaded,
      filenames: bundle.filenames,
    })
  })
)

// ── GET /api/v1/ssl-certs/:id ─────────────────────────────────────────────────

router.get('/:id', asyncRoute(async (req, res) => {
  const bundle = certStore.get(req.params.id)
  if (!bundle) throw httpError(404, 'SSL cert bundle not found')

  res.json({
    certId:    bundle.id,
    uploaded:  bundle.uploaded,
    filenames: bundle.filenames,
  })
}))

// ── DELETE /api/v1/ssl-certs/:id ─────────────────────────────────────────────

router.delete('/:id', asyncRoute(async (req, res) => {
  if (!certStore.delete(req.params.id)) {
    throw httpError(404, 'SSL cert bundle not found')
  }
  res.status(204).end()
}))

// ── Export store for broker use ────────────────────────────────────────────────

module.exports = router
module.exports.certStore = certStore

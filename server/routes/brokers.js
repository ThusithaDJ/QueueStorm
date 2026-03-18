const { Router } = require('express')
const { getBrokerClass } = require('../brokers/registry')

const router = Router()

/**
 * POST /api/brokers/:type/test-connection
 *
 * Body: broker-specific connection config (host, port, username, password, vhost …)
 * Response: { success: boolean, message: string, latencyMs: number }
 */
router.post('/:type/test-connection', async (req, res) => {
  const { type } = req.params

  let BrokerClass
  try {
    BrokerClass = getBrokerClass(type)
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message, latencyMs: 0 })
  }

  try {
    const broker = new BrokerClass()
    const result = await broker.testConnection(req.body)
    // HTTP 200 even when success === false — the test ran; it's the connection that failed
    return res.json(result)
  } catch (err) {
    return res.status(500).json({ success: false, message: `Server error: ${err.message}`, latencyMs: 0 })
  }
})

module.exports = router

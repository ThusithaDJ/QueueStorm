/**
 * Global error-handling middleware for Express.
 * Catches errors thrown by route handlers (via next(err) or async throws).
 *
 * Produces a consistent JSON response:
 * { error: string, code?: string, details?: any }
 */

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500
  const body = {
    error: err.message || 'Internal server error',
  }
  if (err.code)    body.code    = err.code
  if (err.details) body.details = err.details

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path} →`, err)
  }

  return res.status(status).json(body)
}

/**
 * Wrap an async route handler so thrown errors are forwarded to errorHandler.
 * @param {Function} fn
 */
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

/**
 * Create a typed HTTP error.
 * @param {number} status
 * @param {string} message
 * @param {object} [extra]
 */
function httpError(status, message, extra = {}) {
  const err = Object.assign(new Error(message), { status, ...extra })
  return err
}

module.exports = { errorHandler, asyncRoute, httpError }

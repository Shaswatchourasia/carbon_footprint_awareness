const env = require('../config/env');
const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'NotFound', message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  logger.error('Unhandled request error', {
    path: req.path,
    method: req.method,
    message: err.message,
    // Stack traces go to the server log only - never to the response body,
    // and never in production console output via the response.
    stack: env.isProduction() ? undefined : err.stack,
  });

  res.status(status).json({
    error: err.name || 'InternalServerError',
    message: status >= 500 ? 'Something went wrong on our end.' : err.message,
  });
}

module.exports = { notFoundHandler, errorHandler };

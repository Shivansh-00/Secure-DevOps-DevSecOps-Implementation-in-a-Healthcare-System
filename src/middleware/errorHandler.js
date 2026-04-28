const logger = require('../utils/logger');

// Central error handler — never leak stack traces to clients.
module.exports = function errorHandler(err, _req, res, _next) {
  logger.error('unhandled_error', { message: err.message, stack: err.stack });
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
  });
};

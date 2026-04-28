const logger = require('../utils/logger');

// Audit trail for sensitive PHI access (HIPAA-aligned).
module.exports = function auditLogger(req, res, next) {
  res.on('finish', () => {
    if (req.path.startsWith('/api/patients') || req.path.startsWith('/api/auth')) {
      logger.info('audit', {
        type: 'audit',
        userId: req.user?.id || null,
        role: req.user?.role || null,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ip: req.ip,
        ua: req.headers['user-agent'],
        ts: new Date().toISOString(),
      });
    }
  });
  next();
};

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { metricsMiddleware, metricsHandler } = require('./utils/metrics');
const errorHandler = require('./middleware/errorHandler');
const auditLogger = require('./middleware/auditLogger');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');

const app = express();

// --- Security headers (defense in depth) ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // demo CSS uses inline style attr
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// --- HTTPS enforcement (behind reverse proxy / ingress) ---
// Enabled only when FORCE_HTTPS=true so the same image works locally and in K8s.
app.set('trust proxy', 1);
if (process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// --- Body & query hardening ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize()); // NoSQL injection
app.use(xss());           // XSS
app.use(hpp());           // HTTP param pollution
app.use(compression());

// --- CORS (restrict origins) ---
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
    credentials: true,
  })
);

// --- Rate limiting (brute-force protection) ---
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Logging & metrics ---
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));
app.use(metricsMiddleware);
app.use(auditLogger);

// --- Routes ---
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/metrics', metricsHandler);
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);

// --- Static demo frontend ---
const path = require('node:path');
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

// --- 404 (JSON for /api, HTML otherwise) + central error handler ---
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  return res.status(404).send('Not found');
});
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => logger.info(`Healthcare API listening on :${PORT}`));
  });
}

module.exports = app;

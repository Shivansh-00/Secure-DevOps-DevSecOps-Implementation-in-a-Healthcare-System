const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be >= 32 chars');
  return s;
}

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    getSecret(),
    { expiresIn: process.env.JWT_TTL || '15m', issuer: 'healthcare-api' }
  );
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = jwt.verify(token, getSecret(), { issuer: 'healthcare-api' });
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
  } catch (err) {
    // Token verification failed (expired, malformed, bad signature, etc.)
    require('../utils/logger').warn('auth_failed', { reason: err.message });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { authenticate, signToken };

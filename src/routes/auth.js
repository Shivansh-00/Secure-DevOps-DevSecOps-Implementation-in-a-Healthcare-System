const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const { signToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again later' },
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 12 })
      .matches(/[A-Z]/).withMessage('uppercase required')
      .matches(/[a-z]/).withMessage('lowercase required')
      .matches(/\d/).withMessage('digit required')
      .matches(/[^A-Za-z0-9]/).withMessage('symbol required'),
    body('name').trim().isLength({ min: 1, max: 120 }).escape(),
    body('role').optional().isIn(['doctor', 'patient']),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password, name, role } = req.body;
      const exists = await User.findOne({ email });
      if (exists) return res.status(409).json({ error: 'Email already registered' });

      const user = await User.create({ email, password, name, role: role || 'patient' });
      logger.info('user_registered', { userId: user.id, role: user.role });
      return res.status(201).json({ id: user.id, email: user.email, role: user.role });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      if (user.isLocked()) {
        return res.status(423).json({ error: 'Account locked, try again later' });
      }

      const ok = await user.verifyPassword(password);
      if (!ok) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_FAILED) {
          user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
          user.failedLoginAttempts = 0;
          logger.warn('account_locked', { userId: user.id });
        }
        await user.save();
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      await user.save();

      const token = signToken(user);
      logger.info('user_login', { userId: user.id, role: user.role });
      return res.json({ token, role: user.role, name: user.name });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

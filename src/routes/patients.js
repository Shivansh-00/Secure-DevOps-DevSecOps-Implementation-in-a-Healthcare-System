const express = require('express');
const { body, param, validationResult } = require('express-validator');

const Patient = require('../models/Patient');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

router.use(authenticate);

function canAccess(record, user) {
  if (user.role === 'admin') return true;
  if (user.role === 'doctor') {
    return !record.doctorId || record.doctorId.toString() === user.id;
  }
  // patient: only own record
  return record.ownerId.toString() === user.id;
}

// CREATE — doctors/admins only
router.post(
  '/',
  requireRole('doctor', 'admin'),
  [
    body('ownerId').isMongoId(),
    body('fullName').isString().trim().isLength({ min: 1, max: 200 }),
    body('dateOfBirth').optional().isString().isLength({ max: 32 }),
    body('ssn').optional().isString().isLength({ max: 32 }),
    body('diagnosis').optional().isString().isLength({ max: 2000 }),
    body('notes').optional().isString().isLength({ max: 5000 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const record = await Patient.create({
        ...req.body,
        doctorId: req.user.role === 'doctor' ? req.user.id : req.body.doctorId,
      });
      return res.status(201).json({ id: record.id });
    } catch (err) {
      next(err);
    }
  }
);

// READ list — scoped by role
function buildScopeFilter(user) {
  if (user.role === 'admin') return {};
  if (user.role === 'doctor') {
    return { $or: [{ doctorId: user.id }, { doctorId: { $exists: false } }] };
  }
  return { ownerId: user.id };
}

router.get('/', async (req, res, next) => {
  try {
    const records = await Patient.find(buildScopeFilter(req.user)).limit(100);
    res.json(records);
  } catch (err) {
    next(err);
  }
});

// READ one
router.get('/:id', [param('id').isMongoId()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const record = await Patient.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(record, req.user)) return res.status(403).json({ error: 'Forbidden' });

    res.json(record);
  } catch (err) {
    next(err);
  }
});

// UPDATE — doctors/admins only
router.put(
  '/:id',
  requireRole('doctor', 'admin'),
  [param('id').isMongoId()],
  async (req, res, next) => {
    try {
      const record = await Patient.findById(req.params.id);
      if (!record) return res.status(404).json({ error: 'Not found' });
      if (!canAccess(record, req.user)) return res.status(403).json({ error: 'Forbidden' });

      const allowed = ['fullName', 'dateOfBirth', 'ssn', 'diagnosis', 'notes'];
      for (const k of allowed) {
        if (req.body[k] !== undefined) record[k] = req.body[k];
      }
      await record.save();
      res.json({ id: record.id });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE — admin only
router.delete(
  '/:id',
  requireRole('admin'),
  [param('id').isMongoId()],
  async (req, res, next) => {
    try {
      const r = await Patient.findByIdAndDelete(req.params.id);
      if (!r) return res.status(404).json({ error: 'Not found' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

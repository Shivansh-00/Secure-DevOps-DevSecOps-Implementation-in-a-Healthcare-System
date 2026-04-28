const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

// PHI fields are encrypted at rest using AES-256-GCM (HIPAA-aligned).
const patientSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    fullName: { type: String, required: true, set: encrypt, get: decrypt },
    dateOfBirth: { type: String, set: encrypt, get: decrypt },
    ssn: { type: String, set: encrypt, get: decrypt },
    diagnosis: { type: String, set: encrypt, get: decrypt },
    notes: { type: String, set: encrypt, get: decrypt },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

module.exports = mongoose.model('Patient', patientSchema);

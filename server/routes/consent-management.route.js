const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Consent } = require('../models/consent.model');
const { authDoctor } = require('../middleware/doctor.middleware');

// Get consents for patient
router.get('/patient/:patientId', authDoctor, async (req, res) => {
  try {
    const consents = await Consent.findAll({
      where: { patientId: req.params.patientId },
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: consents });
  } catch (error) {
    console.error('Fetch consents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch consents', error: error.message });
  }
});

// Create consent
router.post('/', authDoctor, async (req, res) => {
  try {
    const { consentType, patientId, consentText, patientSignature, witnessSignature } = req.body;
    const documentHash = crypto.createHash('sha256').update(consentText).digest('hex');
    
    const consent = await Consent.create({
      consentType,
      patientId,
      providerId: req.doctor.id,
      consentText,
      patientSignature,
      witnessSignature,
      documentHash,
      signedAt: new Date(),
      auditLog: [{ timestamp: new Date(), action: 'created', userId: req.doctor.id }]
    });
    
    res.status(201).json({ success: true, data: consent });
  } catch (error) {
    console.error('Create consent error:', error);
    res.status(500).json({ success: false, message: 'Failed to create consent', error: error.message });
  }
});

// Revoke consent
router.patch('/:id/revoke', authDoctor, async (req, res) => {
  try {
    const consent = await Consent.findByPk(req.params.id);
    if (!consent) return res.status(404).json({ success: false, message: 'Consent not found' });
    
    await consent.update({
      revokedAt: new Date(),
      revokedBy: req.doctor.id,
      revocationReason: req.body.reason,
      auditLog: [...(consent.auditLog || []), { 
        timestamp: new Date(), 
        action: 'revoked', 
        userId: req.doctor.id,
        reason: req.body.reason 
      }]
    });
    
    res.json({ success: true, data: consent });
  } catch (error) {
    console.error('Revoke consent error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke consent', error: error.message });
  }
});

module.exports = router;

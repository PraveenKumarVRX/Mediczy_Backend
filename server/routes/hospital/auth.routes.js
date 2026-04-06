import express from 'express';
import {
  hospitalLogin,
  hospitalLoginV2,
  hospitalLoginTenant,
  hospitalProfile,
  hospitalCreateCorporate,
  hospitalListCorporates,
  hospitalVerify,
  hospitalLogout
} from '../hospital-auth.route.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import Hospital from '../../models/hospital.model.intelligent.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from '../shared/registrationHelpers.js';

const hospUploadFields = createUploadMiddleware('contactIdCard');
const router = express.Router();

/**
 * POST /api/hospital/register  (secure wizard registration)
 */
router.post('/register', registerLimiter, hospUploadFields, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, hospitalType, city, state, address,
            registrationNumber, directorName, directorQual, directorRegNo, medicalCouncil,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Hospital name, email, password, phone, and city are required' });
    if (!directorName)
      return res.status(400).json({ success: false, message: 'Director / CMO name is required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await Hospital.findOne({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'hospital', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'hospital', req });

    const hospital = await Hospital.create({
      hospitalName: name, email: normalizedEmail, password, phoneNumber: phone,
      city, state: state || '', address: address || '',
      hospitalType: hospitalType || 'Multi-Specialty',
      registrationNumber: registrationNumber || null,
      metadata: {
        registrationDocs: docs,
        primaryContact: { name: directorName, qualification: directorQual || '', regNumber: directorRegNo || '', medicalCouncil: medicalCouncil || '', idCard },
        submittedAt: new Date(),
      },
      status: 'pending', isVerified: false,
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: hospital.id, entityType: 'hospital' });

    sendAdminLeadEmail({ entityLabel: 'Hospital', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: hospital.id,
      extraRows: [['Hospital Type', hospitalType || 'Multi-Specialty'], ...(registrationNumber ? [['Reg. Number', registrationNumber]] : []),
                  ['Director / CMO', directorName], ...(directorQual ? [['Qualification', directorQual]] : [])],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Hospital registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});
router.post('/login', authLimiter, hospitalLogin);
router.post('/login/v2', authLimiter, hospitalLoginV2);
router.post('/login-tenant', authLimiter, hospitalLoginTenant);
router.get('/profile', authUser, requireRole('hospital'), hospitalProfile);
router.get('/verify', hospitalVerify);
router.post('/logout', hospitalLogout);
router.post('/corporates', authUser, requireRole('hospital'), hospitalCreateCorporate);
router.get('/corporates', authUser, requireRole('hospital'), hospitalListCorporates);

// OTP routes
addOtpRoutes(router, 'Hospital', '#3b82f6');

export default router;

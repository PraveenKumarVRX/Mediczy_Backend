/**
 * Super Admin - Clinic Management Routes
 * Only super admin (admin@mediczy.com) can access these endpoints
 */

import express from 'express';
import { body } from 'express-validator';
import nodemailer from 'nodemailer';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import Hospital from '../models/hospital.model.intelligent.js';
import {
  createClinicWithAdmin,
  listClinics,
  getClinicDetails,
  updateClinic,
  deleteClinic
} from '../controller/superadmin-clinic.controller.js';

const router = express.Router();

/**
 * Middleware to verify super admin
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.email !== 'admin@mediczy.com' || req.user.role !== 'system_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only super admin can access this resource'
    });
  }
  next();
};

/**
 * POST /api/superadmin/clinics
 * Create new clinic with clinic admin
 * Super admin only
 */
router.post(
  '/',
  authUser,
  requireSuperAdmin,
  [
    body('clinic_name').trim().notEmpty().withMessage('Clinic name is required'),
    body('clinic_email').isEmail().withMessage('Invalid clinic email'),
    body('clinic_phone').trim().notEmpty().withMessage('Clinic phone is required'),
    body('clinic_type').isIn(['clinic', 'hospital', 'lab', 'corporate']).withMessage('Invalid clinic type'),
    body('clinic_slug').optional().trim(),
    body('clinic_address').optional().trim(),
    body('clinic_city').optional().trim(),
    body('clinic_state').optional().trim(),
    body('clinic_pincode').optional().trim(),
    body('registration_number').optional().trim(),
    body('tax_id').optional().trim(),
    body('admin_email').isEmail().withMessage('Invalid admin email'),
    body('admin_password').isLength({ min: 8 }).withMessage('Admin password must be at least 8 characters'),
    body('admin_first_name').trim().notEmpty().withMessage('Admin first name is required'),
    body('admin_last_name').trim().notEmpty().withMessage('Admin last name is required'),
    body('plan').optional().isIn(['free', 'basic', 'professional', 'enterprise']),
    body('timezone').optional().trim(),
    body('language').optional().trim(),
    body('currency').optional().trim()
  ],
  createClinicWithAdmin
);

/**
 * GET /api/superadmin/clinics
 * List all clinics with filters
 * Super admin only
 */
router.get(
  '/',
  authUser,
  requireSuperAdmin,
  listClinics
);

/**
 * GET /api/superadmin/clinics/:clinicId
 * Get clinic details
 * Super admin only
 */
router.get(
  '/:clinicId',
  authUser,
  requireSuperAdmin,
  getClinicDetails
);

/**
 * PATCH /api/superadmin/clinics/:clinicId
 * Update clinic
 * Super admin only
 */
router.patch(
  '/:clinicId',
  authUser,
  requireSuperAdmin,
  [
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().trim(),
    body('status').optional().isIn(['active', 'suspended', 'cancelled']),
    body('plan').optional().isIn(['free', 'basic', 'professional', 'enterprise'])
  ],
  updateClinic
);

/**
 * DELETE /api/superadmin/clinics/:clinicId
 * Delete clinic (soft delete - marks as cancelled)
 * Super admin only
 */
router.delete(
  '/:clinicId',
  authUser,
  requireSuperAdmin,
  deleteClinic
);

// ─── Self-registered clinic approval flow (hospitals table) ──────────────────

/**
 * Helper: send approval/rejection email to clinic
 */
async function sendClinicStatusEmail(email, clinicName, approved, rejectReason) {
  try {
    const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: (process.env.SMTP_USER || '').trim(),
        pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim()
      }
    });
    const subject = approved
      ? `✅ Your Mediczy clinic account has been approved — ${clinicName}`
      : `Your Mediczy clinic registration — update required for ${clinicName}`;
    const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mediqzy.com'}/clinic/login`;
    const html = approved
      ? `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#0d9488,#0891b2);padding:28px 32px">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800">✅ Account Approved!</h1>
          </div>
          <div style="padding:28px 32px">
            <p style="color:#0f172a;font-size:15px">Hi <strong>${clinicName}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.6">Great news! Our team has reviewed and approved your Mediczy clinic account. You can now sign in and start managing your practice.</p>
            <div style="margin:24px 0;text-align:center">
              <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0d9488,#0891b2);color:#fff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none">Sign in to your Clinic →</a>
            </div>
            <p style="color:#94a3b8;font-size:12px">If you have any questions, reply to this email or contact support@mediqzy.com</p>
          </div>
        </div>`
      : `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:#dc2626;padding:28px 32px">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800">Registration Update</h1>
          </div>
          <div style="padding:28px 32px">
            <p style="color:#0f172a;font-size:15px">Hi <strong>${clinicName}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.6">Thank you for registering on Mediczy. After review, we were unable to approve your account at this time.</p>
            ${rejectReason ? `<div style="margin:16px 0;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px"><p style="margin:0;color:#991b1b;font-size:13px"><strong>Reason:</strong> ${rejectReason}</p></div>` : ''}
            <p style="color:#475569;font-size:14px;line-height:1.6">If you believe this is an error or would like to re-apply, please contact us at <a href="mailto:support@mediqzy.com" style="color:#0d9488">support@mediqzy.com</a>.</p>
          </div>
        </div>`;
    await transporter.sendMail({
      from: `"Mediczy" <${process.env.SMTP_USER || 'support@mediqzy.com'}>`,
      to: email,
      subject,
      html,
      text: approved
        ? `Hi ${clinicName}, your Mediczy clinic account has been approved. Sign in at ${loginUrl}`
        : `Hi ${clinicName}, your registration was not approved at this time.${rejectReason ? ' Reason: ' + rejectReason : ''} Contact support@mediqzy.com for help.`
    });
  } catch (err) {
    console.warn('Clinic status email failed (non-critical):', err.message);
  }
}

/**
 * GET /api/superadmin/clinics/registrations/pending
 * List self-registered clinics awaiting approval (status = 'pending' in hospitals table)
 */
router.get('/registrations/pending', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const clinics = await Hospital.findAndCountAll({
      where: { status: 'pending' },
      attributes: ['id', 'hospitalName', 'email', 'phoneNumber', 'city', 'state',
                   'registrationNumber', 'metadata', 'isVerified', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json({
      success: true,
      total: clinics.count,
      clinics: clinics.rows.map(c => ({
        id: c.id,
        name: c.hospitalName,
        email: c.email,
        phone: c.phoneNumber,
        city: c.city,
        state: c.state,
        registrationNumber: c.registrationNumber,
        clinicType: c.metadata?.clinicType,
        documents: c.metadata?.registrationDocs || [],
        submittedAt: c.metadata?.submittedAt || c.createdAt
      }))
    });
  } catch (err) {
    console.error('List pending clinics error:', err);
    res.status(500).json({ success: false, message: 'Failed to list pending clinics' });
  }
});

/**
 * POST /api/superadmin/clinics/registrations/:id/approve
 * Approve a self-registered clinic — sets status=active, isVerified=true
 */
router.post('/registrations/:id/approve', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const clinic = await Hospital.findOne({ where: { id: req.params.id, status: 'pending' } });
    if (!clinic) {
      return res.status(404).json({ success: false, message: 'Pending clinic not found' });
    }
    await clinic.update({
      status: 'active',
      isVerified: true,
      metadata: { ...clinic.metadata, approvedAt: new Date(), approvedBy: req.user?.email }
    });
    await sendClinicStatusEmail(clinic.email, clinic.hospitalName, true);
    console.log(`✅ Clinic approved: ${clinic.hospitalName} (${clinic.email}) by ${req.user?.email}`);
    res.json({ success: true, message: `${clinic.hospitalName} approved and notified by email` });
  } catch (err) {
    console.error('Approve clinic error:', err);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
});

/**
 * POST /api/superadmin/clinics/registrations/:id/reject
 * Reject a self-registered clinic — sets status=rejected, emails reason
 * Body: { reason?: string }
 */
router.post('/registrations/:id/reject', authUser, requireSuperAdmin,
  [body('reason').optional().trim().isLength({ max: 500 })],
  async (req, res) => {
    try {
      const clinic = await Hospital.findOne({ where: { id: req.params.id, status: 'pending' } });
      if (!clinic) {
        return res.status(404).json({ success: false, message: 'Pending clinic not found' });
      }
      const reason = req.body.reason || '';
      await clinic.update({
        status: 'rejected',
        metadata: { ...clinic.metadata, rejectedAt: new Date(), rejectedBy: req.user?.email, rejectReason: reason }
      });
      await sendClinicStatusEmail(clinic.email, clinic.hospitalName, false, reason);
      console.log(`❌ Clinic rejected: ${clinic.hospitalName} (${clinic.email}) by ${req.user?.email}`);
      res.json({ success: true, message: `${clinic.hospitalName} rejected and notified by email` });
    } catch (err) {
      console.error('Reject clinic error:', err);
      res.status(500).json({ success: false, message: 'Rejection failed' });
    }
  }
);

export default router;

/**
 * Admin Pending Registrations Route
 * Super admin: review, approve, reject entity registrations
 * Mounted at: /api/admin/pending-registrations
 */

import express from 'express';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import Hospital from '../../models/hospital.model.intelligent.js';
import Lab from '../../models/postgres/lab.model.postgres.js';
import HomecareProvider from '../../models/postgres/homecare.model.postgres.js';
import Corporate from '../../models/postgres/corporate.model.postgres.js';
import User from '../../models/postgres/user.model.postgres.js';
import { Pharmacy } from '../../models/index.js';
import Doctor from '../../models/postgres/doctor.model.postgres.js';

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const base = [...Array(10)].map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
  return base + '!2'; // satisfies most password policies
};

const ENTITY_COLORS = {
  clinic: '#0d9488', lab: '#3b82f6', pharmacy: '#10b981', homecare: '#ec4899', corporate: '#8b5cf6'
};

const buildApprovalEmail = (email, name, entityType, tempPassword) => {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mediqzy.com'}/${entityType}/login`;
  const color = ENTITY_COLORS[entityType] || '#0d9488';
  const label = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Account Approved</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8">
<tr><td align="center" style="padding:48px 20px;">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <!-- Header -->
    <tr><td style="background:linear-gradient(135deg,${color} 0%,${color}cc 100%);padding:52px 48px;text-align:center;">
      <div style="width:80px;height:80px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 24px;line-height:80px;font-size:40px;">✓</div>
      <h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:800;letter-spacing:-0.5px;">Account Approved! 🎉</h1>
      <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:16px;">Your ${label} is now live on Mediczy</p>
    </td></tr>
    <!-- Body -->
    <tr><td style="padding:48px 48px 32px;">
      <p style="font-size:17px;color:#0f172a;margin:0 0 16px;font-weight:600;">Hello, ${name}!</p>
      <p style="color:#475569;line-height:1.8;margin:0 0 36px;font-size:15px;">
        Congratulations! Your <strong>${label}</strong> registration on the <strong>Mediczy Healthcare Platform</strong> has been reviewed and <span style="color:${color};font-weight:700;">approved</span> by our team.
        Your account is now fully active and ready to use.
      </p>

      <!-- Credentials Card -->
      <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:28px;margin-bottom:28px;">
        <p style="margin:0 0 18px;font-weight:800;color:#166534;font-size:15px;display:flex;align-items:center;">
          🔐 &nbsp;Your Login Credentials
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:10px 0;border-bottom:1px dashed #d1fae5;">
              <span style="color:#374151;font-size:14px;font-weight:600;">Email Address</span>
              <span style="float:right;font-family:monospace;background:#e0f2fe;color:#0369a1;padding:4px 12px;border-radius:8px;font-size:14px;">${email}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;">
              <span style="color:#374151;font-size:14px;font-weight:600;">Temporary Password</span>
              <span style="float:right;font-family:monospace;background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:8px;font-size:14px;letter-spacing:2.5px;">${tempPassword}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Warning -->
      <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:16px 20px;margin-bottom:36px;">
        <p style="margin:0;color:#92400e;font-size:13px;">
          ⚠️ <strong>Security:</strong> Please change your password immediately after first login to secure your account.
        </p>
      </div>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:0 0 40px;">
          <a href="${loginUrl}"
            style="display:inline-block;background:linear-gradient(135deg,${color},${color}bb);color:#ffffff;font-size:16px;font-weight:800;padding:18px 52px;border-radius:16px;text-decoration:none;letter-spacing:0.3px;box-shadow:0 4px 20px ${color}44;">
            Sign In to Your Account &rarr;
          </a>
        </td></tr>
      </table>

      <hr style="border:none;border-top:1.5px solid #e2e8f0;margin:0 0 28px;">
      <p style="color:#94a3b8;font-size:13px;line-height:1.8;margin:0;">
        Need help? Contact us at <a href="mailto:support@mediqzy.com" style="color:${color};font-weight:600;">support@mediqzy.com</a>
      </p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#f8fafc;padding:28px 48px;text-align:center;border-top:1.5px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">© 2026 Mediczy Healthcare &middot; Bengaluru, Karnataka, India</p>
      <p style="margin:8px 0 0;color:#cbd5e1;font-size:11px;">This email was sent to ${email}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
};

const buildRejectionEmail = (email, name, entityType, reason) => {
  const label = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Registration Update</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8">
<tr><td align="center" style="padding:48px 20px;">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <tr><td style="background:linear-gradient(135deg,#64748b,#475569);padding:48px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;">Registration Update</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.8);">Regarding your ${label} application</p>
    </td></tr>
    <tr><td style="padding:48px;">
      <p style="font-size:17px;color:#0f172a;margin:0 0 16px;font-weight:600;">Hello, ${name},</p>
      <p style="color:#475569;line-height:1.8;margin:0 0 28px;font-size:15px;">
        Thank you for your interest in joining the Mediczy Healthcare Network. After careful review of your <strong>${label}</strong> registration, we are unable to approve your account at this time.
      </p>
      ${reason ? `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:22px;margin-bottom:28px;">
        <p style="margin:0 0 10px;font-weight:700;color:#991b1b;font-size:14px;">Reason:</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">${reason}</p>
      </div>` : ''}
      <p style="color:#475569;line-height:1.8;font-size:14px;margin:0 0 32px;">
        If you believe this was in error or wish to reapply with updated information, please contact our support team at
        <a href="mailto:support@mediqzy.com" style="color:#0d9488;font-weight:600;">support@mediqzy.com</a>.
      </p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:24px 48px;text-align:center;border-top:1.5px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">© 2026 Mediczy Healthcare &middot; Bengaluru, Karnataka, India</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
};

const sendEmail = async (to, subject, html, text) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: (process.env.SMTP_PORT || '465') === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS
      }
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Mediczy Healthcare" <${process.env.SMTP_USER || 'noreply@mediczy.com'}>`,
      to, subject, html, text
    });
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
};

const buildDoctorActivationEmail = (doctorName, email) => {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mediqzy.com'}/doctor/login`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8">
<tr><td align="center" style="padding:48px 20px;">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <tr><td style="background:linear-gradient(135deg,#059669 0%,#0d9488 100%);padding:52px 48px;text-align:center;">
      <div style="width:80px;height:80px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 24px;line-height:80px;font-size:40px;">✅</div>
      <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;">Account Activated!</h1>
      <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Your Mediczy doctor account is now live</p>
    </td></tr>
    <tr><td style="padding:48px 48px 32px;">
      <p style="font-size:17px;color:#0f172a;font-weight:600;margin:0 0 16px">Hello, ${doctorName}!</p>
      <p style="color:#475569;line-height:1.8;font-size:15px;margin:0 0 32px">
        Congratulations! Our team has reviewed and verified your registration documents.
        Your Mediczy doctor account is now <strong style="color:#059669">fully active</strong>.
        You can log in using the email and password you created during registration.
      </p>
      <div style="text-align:center;margin-bottom:32px">
        <a href="${loginUrl}" style="background:linear-gradient(135deg,#059669,#0d9488);color:#fff;text-decoration:none;padding:14px 40px;border-radius:12px;font-weight:700;font-size:15px;display:inline-block">
          Login to Your Dashboard →
        </a>
      </div>
      <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:18px 22px">
        <p style="margin:0;font-size:13px;color:#166534">📧 Login Email: <strong>${email}</strong></p>
        <p style="margin:6px 0 0;font-size:13px;color:#166534">🔐 Use the password you created during registration.</p>
      </div>
    </td></tr>
    <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · Mayden SmartHealth Pvt Ltd · support@mediqzy.com</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
};

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/pending-registrations
 * List all pending registrations across all entity types
 */
router.get('/', authUser, requireRole('admin'), async (req, res) => {
  try {
    const [clinics, labs, homecareProv, pharmacies, corpUsers, pendingDoctors] = await Promise.all([
      Hospital.findAll({
        where: { status: 'pending' },
        attributes: ['id', 'hospitalName', 'email', 'phoneNumber', 'city', 'state', 'createdAt', 'metadata', 'isVerified'],
        order: [['createdAt', 'DESC']]
      }).catch(() => []),
      Lab.findAll({
        where: { status: 'pending' },
        attributes: ['id', 'name', 'email', 'phoneNumber', 'licenseNumber', 'labType', 'createdAt', 'metadata', 'isVerified'],
        order: [['createdAt', 'DESC']]
      }).catch(() => []),
      HomecareProvider.findAll({
        where: { status: 'pending' },
        attributes: ['id', 'name', 'email', 'phone', 'providerType', 'registrationNumber', 'createdAt', 'metadata', 'isVerified'],
        order: [['createdAt', 'DESC']]
      }).catch(() => []),
      Pharmacy.findAll({
        where: { status: 'pending' },
        attributes: ['id', 'name', 'email', 'phoneNumber', 'licenseNumber', 'pharmacyType', 'createdAt', 'metadata', 'isVerified'],
        order: [['createdAt', 'DESC']]
      }).catch(() => []),
      User.findAll({
        where: { role: 'corporate_admin', status: 'pending' },
        attributes: ['id', 'email', 'phone', 'createdAt', 'organization_id'],
        order: [['createdAt', 'DESC']]
      }).catch(() => []),
      Doctor.findAll({
        where: { isVerified: false, status: 'pending' },
        attributes: ['id', 'prefix', 'firstName', 'lastName', 'email', 'phoneNumber', 'specialization', 'experience', 'qualifications', 'documents', 'createdAt'],
        order: [['createdAt', 'DESC']]
      }).catch(() => [])
    ]);

    // Fetch corporate details for corporate users
    const corpWithDetails = await Promise.all(
      corpUsers.map(async (u) => {
        let corp = null;
        try { corp = await Corporate.findByPk(u.organization_id, { attributes: ['id', 'companyName', 'industry', 'employeeCount', 'metadata', 'gstNumber'] }); } catch (_) {}
        return {
          id: u.id,
          entityType: 'corporate',
          name: corp?.companyName || u.email,
          email: u.email,
          phone: u.phone,
          industry: corp?.industry,
          employeeCount: corp?.employeeCount,
          gstNumber: corp?.gstNumber,
          corporateId: u.organization_id,
          createdAt: u.createdAt,
          metadata: corp?.metadata || {}
        };
      })
    );

    const toList = (items, type) => items.map(i => {
      const json = i.toJSON();
      // Normalize name field across different models
      if (!json.name) json.name = json.hospitalName || json.companyName || json.email;
      return { ...json, entityType: type };
    });

    const doctorList = pendingDoctors.map(d => {
      const json = d.toJSON();
      const docKeys = ['idProof', 'addressProof', 'medicalDegree', 'councilCertificate'];
      const docsObj = json.documents || {};
      const registrationDocs = docKeys.filter(k => docsObj[k]?.data).length;
      return {
        ...json,
        entityType: 'doctor',
        name: `${json.prefix || ''} ${json.firstName} ${json.lastName}`.trim(),
        phone: json.phoneNumber,
        submittedAt: json.createdAt,
        registrationDocs,
      };
    });

    const all = [
      ...toList(clinics, 'clinic'),
      ...toList(labs, 'lab'),
      ...toList(homecareProv, 'homecare'),
      ...toList(pharmacies, 'pharmacy'),
      ...corpWithDetails,
      ...doctorList
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, total: all.length, registrations: all });
  } catch (error) {
    console.error('Pending registrations fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending registrations', error: error.message });
  }
});

/**
 * POST /api/admin/pending-registrations/approve
 * Approve a pending registration and send credentials email
 */
router.post('/approve', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { entityType, id, adminNote } = req.body;
    if (!entityType || !id) {
      return res.status(400).json({ success: false, message: 'entityType and id are required' });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    let entityName, entityEmail;

    if (entityType === 'clinic') {
      const entity = await Hospital.findByPk(id);
      if (!entity || entity.status !== 'pending') return res.status(404).json({ success: false, message: 'Pending clinic not found' });
      entityName = entity.hospitalName; entityEmail = entity.email;
      await entity.update({
        status: 'active', isVerified: true, password: hashedPassword,
        metadata: { ...(entity.metadata || {}), approvedAt: new Date(), adminNote: adminNote || '', approvedBy: req.user?.email }
      });

    } else if (entityType === 'lab') {
      const entity = await Lab.findByPk(id);
      if (!entity || entity.status !== 'pending') return res.status(404).json({ success: false, message: 'Pending lab not found' });
      entityName = entity.name; entityEmail = entity.email;
      await entity.update({
        status: 'active', isVerified: true, password: hashedPassword,
        metadata: { ...(entity.metadata || {}), approvedAt: new Date(), adminNote: adminNote || '' }
      });

    } else if (entityType === 'homecare') {
      const entity = await HomecareProvider.findByPk(id);
      if (!entity || entity.status !== 'pending') return res.status(404).json({ success: false, message: 'Pending homecare provider not found' });
      entityName = entity.name; entityEmail = entity.email;
      await entity.update({
        status: 'active', isVerified: true, isAvailable: true, password: hashedPassword,
        metadata: { ...(entity.metadata || {}), approvedAt: new Date(), adminNote: adminNote || '' }
      });

    } else if (entityType === 'pharmacy') {
      const entity = await Pharmacy.findByPk(id);
      if (!entity || entity.status !== 'pending') return res.status(404).json({ success: false, message: 'Pending pharmacy not found' });
      entityName = entity.name; entityEmail = entity.email;
      await entity.update({
        status: 'active', isVerified: true, password: hashedPassword,
        metadata: { ...(entity.metadata || {}), approvedAt: new Date(), adminNote: adminNote || '' }
      });

    } else if (entityType === 'corporate') {
      const adminUser = await User.findOne({ where: { id, role: 'corporate_admin', status: 'pending' } });
      if (!adminUser) return res.status(404).json({ success: false, message: 'Pending corporate admin not found' });
      const corporate = await Corporate.findByPk(adminUser.organization_id);
      entityName = corporate?.companyName || adminUser.email;
      entityEmail = adminUser.email;
      await adminUser.update({ status: 'active', password: hashedPassword });
      if (corporate) {
        await corporate.update({
          status: 'Active',
          metadata: { ...(corporate.metadata || {}), approvedAt: new Date(), adminNote: adminNote || '' }
        });
      }

    } else if (entityType === 'doctor') {
      const { adminSignature, adminSignName } = req.body;
      if (!adminSignature) {
        return res.status(400).json({
          success: false,
          message: 'Admin countersignature is required to activate a doctor account. Please draw your signature in the approval form.',
        });
      }
      const entity = await Doctor.findOne({ where: { id, isVerified: false, status: 'pending' } });
      if (!entity) return res.status(404).json({ success: false, message: 'Pending doctor not found' });
      entityName = `${entity.prefix || ''} ${entity.firstName} ${entity.lastName}`.trim();
      entityEmail = entity.email;
      const existingDocs = entity.documents || {};
      await entity.update({
        isVerified: true,
        status: 'active',
        documentVerified: true,
        documents: {
          ...existingDocs,
          mouCountersign: {
            data: adminSignature,
            signedBy: adminSignName || req.user?.email || 'admin',
            signedAt: new Date().toISOString(),
          },
        },
      });
      // Send activation email — doctor already has their own password
      await sendEmail(
        entityEmail,
        `✅ Your Mediczy Doctor Account is Now Active — Welcome, ${entityName}!`,
        buildDoctorActivationEmail(entityName, entityEmail),
        `Hello ${entityName},\n\nCongratulations! Your Mediczy doctor account is now active.\n\nLogin at: ${process.env.FRONTEND_URL || 'https://app.mediqzy.com'}/doctor/login\nUse the email and password you created during registration.\n\nMediczy Team`
      );
      return res.json({ success: true, message: 'Doctor account activated', emailSent: true, entityName, entityEmail });

    } else {
      return res.status(400).json({ success: false, message: `Unknown entity type: ${entityType}` });
    }

    const html = buildApprovalEmail(entityEmail, entityName, entityType, tempPassword);
    const label = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    const emailSent = await sendEmail(
      entityEmail,
      `🎉 Your ${label} Account on Mediczy is Now Active!`,
      html,
      `Hello ${entityName},\n\nYour ${label} account has been approved!\n\nLogin: ${process.env.FRONTEND_URL}/${entityType}/login\nEmail: ${entityEmail}\nTemporary Password: ${tempPassword}\n\nPlease change your password after first login.\n\nMediczy Team`
    );

    res.json({ success: true, message: `${entityType} account approved`, emailSent, entityName, entityEmail });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ success: false, message: 'Approval failed', error: error.message });
  }
});

/**
 * POST /api/admin/pending-registrations/reject
 * Reject a pending registration
 */
router.post('/reject', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { entityType, id, reason } = req.body;
    if (!entityType || !id) {
      return res.status(400).json({ success: false, message: 'entityType and id are required' });
    }

    let entityName, entityEmail;

    if (entityType === 'clinic') {
      const e = await Hospital.findByPk(id);
      if (!e) return res.status(404).json({ success: false, message: 'Not found' });
      entityName = e.name; entityEmail = e.email;
      await e.update({ status: 'rejected', metadata: { ...(e.metadata || {}), rejectedAt: new Date(), rejectionReason: reason || '' } });

    } else if (entityType === 'lab') {
      const e = await Lab.findByPk(id);
      if (!e) return res.status(404).json({ success: false, message: 'Not found' });
      entityName = e.name; entityEmail = e.email;
      await e.update({ status: 'rejected', metadata: { ...(e.metadata || {}), rejectedAt: new Date(), rejectionReason: reason || '' } });

    } else if (entityType === 'homecare') {
      const e = await HomecareProvider.findByPk(id);
      if (!e) return res.status(404).json({ success: false, message: 'Not found' });
      entityName = e.name; entityEmail = e.email;
      await e.update({ status: 'rejected', metadata: { ...(e.metadata || {}), rejectedAt: new Date(), rejectionReason: reason || '' } });

    } else if (entityType === 'pharmacy') {
      const e = await Pharmacy.findByPk(id);
      if (!e) return res.status(404).json({ success: false, message: 'Not found' });
      entityName = e.name; entityEmail = e.email;
      await e.update({ status: 'rejected', metadata: { ...(e.metadata || {}), rejectedAt: new Date(), rejectionReason: reason || '' } });

    } else if (entityType === 'corporate') {
      const u = await User.findOne({ where: { id, role: 'corporate_admin' } });
      if (!u) return res.status(404).json({ success: false, message: 'Not found' });
      entityEmail = u.email;
      const corp = await Corporate.findByPk(u.organization_id);
      entityName = corp?.companyName || u.email;
      await u.update({ status: 'rejected' });
      if (corp) await corp.update({ status: 'Rejected' });

    } else if (entityType === 'doctor') {
      const e = await Doctor.findByPk(id);
      if (!e) return res.status(404).json({ success: false, message: 'Not found' });
      entityName = `${e.prefix || ''} ${e.firstName} ${e.lastName}`.trim();
      entityEmail = e.email;
      await e.update({ status: 'inactive', isVerified: false });
    }

    const html = buildRejectionEmail(entityEmail, entityName, entityType, reason);
    const label = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    const emailSent = await sendEmail(
      entityEmail,
      `Update on Your ${label} Registration with Mediczy`,
      html,
      `Hello ${entityName},\n\nYour ${label} registration could not be approved.\n\n${reason ? `Reason: ${reason}\n\n` : ''}Contact support@mediqzy.com for assistance.\n\nMediczy Team`
    );

    res.json({ success: true, message: `${entityType} registration rejected`, emailSent });
  } catch (error) {
    console.error('Rejection error:', error);
    res.status(500).json({ success: false, message: 'Rejection failed', error: error.message });
  }
});

export default router;

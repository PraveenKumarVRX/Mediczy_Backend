import express from 'express';
import { body, validationResult } from 'express-validator';
import { randomBytes } from 'crypto';
import userModel from '../models/user.model.intelligent.js';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import { CRM_ROLE_LIST, crmPermissionsForRole } from '../config/crm-roles.config.js';
import passwordResetService from '../services/password-reset.service.js';

const router = express.Router();
router.use(authCRM, requireCRMCapability('team:manage'));

function parseMetadata(user) {
  try { return typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch (_) { return {}; }
}

function serializeTeamUser(user) {
  const metadata = parseMetadata(user);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    crmRole: metadata.crmRole || 'sales_rep',
    department: metadata.department || user.department || null,
    designation: metadata.designation || user.designation || null,
    status: user.status || 'active',
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
  };
}

// List CRM users in the caller's tenant.
router.get('/users', async (req, res) => {
  try {
    const tenantId = req.crmUser.tenantId;
    const users = await userModel.findAll({
      where: { isTeam: true },
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    const scoped = users.filter((u) => {
      const metadata = parseMetadata(u);
      return metadata.isCRM === true && String(metadata.tenantId || '') === String(tenantId || '');
    });
    return res.json({ success: true, data: scoped.map(serializeTeamUser) });
  } catch (error) {
    console.error('[CRM Team] List error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to list CRM team members' });
  }
});

// Create a new CRM login with an assigned role. No password is accepted from
// the caller — a random unusable placeholder is set and the new user is sent
// through the existing password-reset OTP flow (userType 'team', which
// already resolves to this same users table) to set their own password.
router.post('/users', [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('crmRole').isIn(CRM_ROLE_LIST).withMessage(`Role must be one of: ${CRM_ROLE_LIST.join(', ')}`),
  body('department').optional().isString(),
  body('designation').optional().isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { firstName, lastName, phone, department, designation, crmRole } = req.body;
    const email = String(req.body.email).trim().toLowerCase();
    const tenantId = req.crmUser.tenantId;

    const existing = await userModel.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists' });
    }

    const placeholderPassword = randomBytes(32).toString('hex');

    const newUser = await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      password: placeholderPassword,
      role: 'team',
      isTeam: true,
      status: 'active',
      department: department || 'CRM',
      designation: designation || 'CRM User',
      metadata: JSON.stringify({
        isCRM: true,
        crmRole,
        crmPermissions: crmPermissionsForRole(crmRole),
        tenantId,
        department: department || 'CRM',
        designation: designation || 'CRM User',
        createdBy: req.crmUser.id,
        createdAt: new Date().toISOString(),
      }),
    });

    // Send the new team member a password-setup OTP through the existing
    // password-reset flow rather than emailing a temp password.
    passwordResetService.requestPasswordReset({ email, userType: 'team' }).catch((err) => {
      console.error('[CRM Team] Failed to send password-setup email:', err.message);
    });

    return res.status(201).json({
      success: true,
      message: `CRM login created. A password-setup email has been sent to ${email}.`,
      data: serializeTeamUser(newUser),
    });
  } catch (error) {
    console.error('[CRM Team] Create error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create CRM login' });
  }
});

// Update a CRM user's role, department, designation, or active status.
router.patch('/users/:id', [
  body('crmRole').optional().isIn(CRM_ROLE_LIST).withMessage(`Role must be one of: ${CRM_ROLE_LIST.join(', ')}`),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const tenantId = req.crmUser.tenantId;
    const target = await userModel.findOne({ where: { id: req.params.id, isTeam: true } });
    if (!target) return res.status(404).json({ success: false, message: 'CRM user not found' });

    const metadata = parseMetadata(target);
    if (metadata.isCRM !== true || String(metadata.tenantId || '') !== String(tenantId || '')) {
      return res.status(404).json({ success: false, message: 'CRM user not found' });
    }

    const { crmRole, department, designation, status } = req.body;
    const nextMetadata = {
      ...metadata,
      crmRole: crmRole || metadata.crmRole,
      crmPermissions: crmRole ? crmPermissionsForRole(crmRole) : metadata.crmPermissions,
      department: department ?? metadata.department,
      designation: designation ?? metadata.designation,
      updatedBy: req.crmUser.id,
      updatedAt: new Date().toISOString(),
    };

    await target.update({
      department: department ?? target.department,
      designation: designation ?? target.designation,
      status: status || target.status,
      metadata: JSON.stringify(nextMetadata),
    });

    return res.json({ success: true, data: serializeTeamUser(target) });
  } catch (error) {
    console.error('[CRM Team] Update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update CRM user' });
  }
});

export default router;

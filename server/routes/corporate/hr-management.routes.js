/**
 * Corporate HR team self-service — one super-HR (corporate_admin) per
 * corporate, who can invite/remove/hand off their own team of hr_staff,
 * corporate_cmo (Chief Medical Officer), and corporate_ohc (OHC — a
 * day-care clinic owned and run by the corporate) members.
 * All routes require an authenticated corporate session; invite/remove/
 * transfer additionally require the caller to BE the active
 * corporate_admin (enforced in the service layer, not just here).
 *
 *   GET    /api/corporate/hr/team              — list active HR team members
 *   POST   /api/corporate/hr/team               — invite a new hr_staff/corporate_cmo/corporate_ohc member (super-HR only)
 *   DELETE /api/corporate/hr/team/:userId       — remove a team member (super-HR only)
 *   POST   /api/corporate/hr/team/:userId/promote — hand off super-HR ownership (super-HR only, hr_staff successor only)
 */
import express from 'express';
import { authCorporate } from '../../middleware/corporate.middleware.js';
import hrManagement from '../../services/corporate-hr-management.service.js';
import Corporate from '../../models/postgres/corporate.model.postgres.js';

const router = express.Router();

const corporateId = (req) => req.user?.corporateId || req.user?.id;
const actingUserId = (req) => req.user?.userId || req.user?.id;

// A direct corporate login (role='corporate' in the JWT, e.g. "Test Contact"
// signing in with the corporate's own credentials) has no `users` row at all
// - it's a completely separate identity space, keyed by corporates.id, not
// users.id. listHrTeam only ever queries `users`, so this identity could
// never appear in its own HR team list no matter how the role filter was
// tuned. Synthesize a read-only entry for it from corporates.contactPerson/
// email, same spirit as the existing fix that already treats this role as
// the super-admin for Invite-button visibility.
async function withDirectLoginEntry(req, teamRows) {
  if (req.user?.role !== 'corporate') return teamRows;
  const corp = await Corporate.findByPk(corporateId(req));
  if (!corp) return teamRows;
  const [firstName, ...rest] = String(corp.contactPerson || 'Corporate Contact').trim().split(/\s+/);
  return [
    {
      id: `corporate:${corp.id}`,
      firstName: firstName || 'Corporate',
      lastName: rest.join(' ') || 'Contact',
      email: corp.email,
      role: 'corporate_admin',
      invited_by: null,
      lastLoginAt: null,
      createdAt: corp.createdAt,
      isDirectLogin: true,
    },
    ...teamRows,
  ];
}

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = err.statusCode || (/required|not found|already exists|cannot remove|not an? (hr_staff|HR staff)|must be an active|role must be/i.test(err.message) ? 400 : 500);
    res.status(status).json({ success: false, message: err.message });
  }
};

router.get('/team', authCorporate, wrap(async (req) => withDirectLoginEntry(req, await hrManagement.listHrTeam(corporateId(req)))));

router.post('/team', authCorporate, wrap((req) => hrManagement.inviteHrStaff({
  corporateId: corporateId(req),
  directCorporateLogin: req.user?.role === 'corporate',
  invitedByUserId: actingUserId(req),
  firstName: req.body.firstName,
  lastName: req.body.lastName,
  email: req.body.email,
  phoneNumber: req.body.phoneNumber,
  registrationNumber: req.body.registrationNumber,
  role: req.body.role,
})));

router.delete('/team/:userId', authCorporate, wrap((req) => hrManagement.removeHrStaff({
  corporateId: corporateId(req),
  directCorporateLogin: req.user?.role === 'corporate',
  requestedByUserId: actingUserId(req),
  targetUserId: req.params.userId,
})));

router.post('/team/:userId/promote', authCorporate, wrap((req) => hrManagement.transferSuperHr({
  corporateId: corporateId(req),
  directCorporateLogin: req.user?.role === 'corporate',
  requestedByUserId: actingUserId(req),
  newAdminUserId: req.params.userId,
})));

export default router;

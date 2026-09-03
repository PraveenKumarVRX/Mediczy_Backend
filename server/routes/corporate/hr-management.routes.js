/**
 * Corporate HR team self-service — one super-HR (corporate_admin) per
 * corporate, who can invite/remove/hand off their own team of hr_staff and
 * corporate_cmo (Chief Medical Officer, claims-scrutiny role) members.
 * All routes require an authenticated corporate session; invite/remove/
 * transfer additionally require the caller to BE the active
 * corporate_admin (enforced in the service layer, not just here).
 *
 *   GET    /api/corporate/hr/team              — list active HR team members
 *   POST   /api/corporate/hr/team               — invite a new hr_staff/corporate_cmo member (super-HR only)
 *   DELETE /api/corporate/hr/team/:userId       — remove a team member (super-HR only)
 *   POST   /api/corporate/hr/team/:userId/promote — hand off super-HR ownership (super-HR only, hr_staff successor only)
 */
import express from 'express';
import { authCorporate } from '../../middleware/corporate.middleware.js';
import hrManagement from '../../services/corporate-hr-management.service.js';

const router = express.Router();

const corporateId = (req) => req.user?.corporateId || req.user?.id;
const actingUserId = (req) => req.user?.userId || req.user?.id;

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = err.statusCode || (/required|not found|already exists|cannot remove|not an? (hr_staff|HR staff)|must be an active|role must be/i.test(err.message) ? 400 : 500);
    res.status(status).json({ success: false, message: err.message });
  }
};

router.get('/team', authCorporate, wrap((req) => hrManagement.listHrTeam(corporateId(req))));

router.post('/team', authCorporate, wrap((req) => hrManagement.inviteHrStaff({
  corporateId: corporateId(req),
  invitedByUserId: actingUserId(req),
  firstName: req.body.firstName,
  lastName: req.body.lastName,
  email: req.body.email,
  phoneNumber: req.body.phoneNumber,
  role: req.body.role,
})));

router.delete('/team/:userId', authCorporate, wrap((req) => hrManagement.removeHrStaff({
  corporateId: corporateId(req),
  requestedByUserId: actingUserId(req),
  targetUserId: req.params.userId,
})));

router.post('/team/:userId/promote', authCorporate, wrap((req) => hrManagement.transferSuperHr({
  corporateId: corporateId(req),
  requestedByUserId: actingUserId(req),
  newAdminUserId: req.params.userId,
})));

export default router;

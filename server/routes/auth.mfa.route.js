import express from 'express';
import { body } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getMfaStatus, beginEnrollment, verifyEnrollment, issueStepUpToken, disableMfa,
} from '../services/mfa-step-up.service.js';

const router = express.Router();
const userContext = (req) => ({
  userId: req.user?.id || req.authToken?.id || req.authToken?.sub,
  organizationId: req.user?.tenant_id || req.user?.tenantId || req.authToken?.tenant_id || req.authToken?.tenantId,
});
const handleError = (res, error) => res.status(error.status || 500).json({ success: false, code: error.code || 'MFA_ERROR', message: error.message });

router.use(authUser);

router.get('/status', async (req, res) => {
  try { return res.json({ success: true, ...await getMfaStatus(userContext(req)) }); }
  catch (error) { return handleError(res, error); }
});

router.post('/enroll', [body('issuer').optional().isLength({ min: 1, max: 80 }), body('account').optional().isLength({ min: 1, max: 160 })], async (req, res) => {
  try {
    const context = userContext(req);
    return res.status(201).json({ success: true, ...await beginEnrollment({ ...context, issuer: req.body.issuer, account: req.body.account || req.user?.email }) });
  } catch (error) { return handleError(res, error); }
});

router.post('/verify-enrollment', [body('code').isLength({ min: 6, max: 6 }).matches(/^\d{6}$/)], async (req, res) => {
  try { return res.json({ success: true, ...await verifyEnrollment({ ...userContext(req), code: req.body.code, requestId: req.id }) }); }
  catch (error) { return handleError(res, error); }
});

router.post('/step-up', [body('code').isLength({ min: 6, max: 6 }).matches(/^\d{6}$/)], async (req, res) => {
  try { return res.json({ success: true, ...await issueStepUpToken({ user: req.user, authToken: req.authToken, code: req.body.code, requestId: req.id }) }); }
  catch (error) { return handleError(res, error); }
});

router.post('/disable', [body('code').isLength({ min: 6, max: 6 }).matches(/^\d{6}$/)], async (req, res) => {
  try { return res.json({ success: true, ...await disableMfa({ ...userContext(req), code: req.body.code, requestId: req.id }) }); }
  catch (error) { return handleError(res, error); }
});

export default router;

/** The corporate's view of the OHCs that serve it. Mounted at /api/corporate/ohc-units. Pure factory: authCorporate + principal resolution injected. */
import express from 'express';
import { forbidden } from '../../services/collection/errors.js';
import { handle, mw, send } from '../lab/collection-http.js';

const READ_ROLES = new Set(['corporate', 'corporate_admin', 'corporate_cmo', 'corporate_ohc']);
const DECIDE_ROLES = new Set(['corporate', 'corporate_admin']);

export function buildCorporateOhcRouter({ service, authenticate, resolvePrincipal }) {
  const router = express.Router();
  router.use(authenticate);
  router.use(mw(async (req, res, next) => {
    const role = req.user?.role;
    if (!READ_ROLES.has(role)) throw forbidden('OHC information is available to the corporate account, its super-HR, CMO and OHC staff');
    req.corporatePrincipal = { ...(await resolvePrincipal(req)), role };
    next();
  }));
  const P = (req) => req.corporatePrincipal;
  const mayDecide = (req) => { if (!DECIDE_ROLES.has(P(req).role)) throw forbidden('Only the corporate account owner or super-HR can accept or end an OHC contract'); };

  router.get('/', handle(async (req, res) => res.json({ success: true, ...(await service.corporateUnits(P(req))) })));
  router.get('/:uid', handle(async (req, res) => res.json({ success: true, ...(await service.corporateUnitDashboard(P(req), req.params.uid)) })));
  router.get('/:uid/access-log', handle(async (req, res) => res.json({ success: true, ...(await service.accessLog(P(req), req.params.uid, req.query)) })));
  router.post('/:uid/accept', handle(async (req, res) => { mayDecide(req); send(res, await service.acceptContract(P(req), req.params.uid)); }));
  router.post('/:uid/end-contract', handle(async (req, res) => { mayDecide(req); send(res, await service.endContract(P(req), req.params.uid, req.body)); }));
  return router;
}

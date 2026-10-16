/** The corporate's view of the OHCs that serve it. Mounted at /api/corporate/ohc-units. Pure factory: authCorporate + principal resolution injected. */
import express from 'express';
import { forbidden } from '../../services/collection/errors.js';
import { handle, mw, send } from '../lab/collection-http.js';

const READ_ROLES = new Set(['corporate', 'corporate_admin', 'corporate_cmo', 'corporate_ohc']);
const DECIDE_ROLES = new Set(['corporate', 'corporate_admin']);

export function buildCorporateOhcRouter({ service, ohcService, authenticate, resolvePrincipal, renderPdf = null, pdfPathOf = null }) {
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
  /** The CMO's OHC-shaped principal, for the clinical/operational actions below. */
  const mayOperate = (req) => {
    const ohc = P(req).ohc;
    if (P(req).role !== 'corporate_cmo' || !ohc) throw forbidden("Only the OHC's medically-registered CMO can do this");
    return ohc;
  };

  router.get('/', handle(async (req, res) => res.json({ success: true, ...(await service.corporateUnits(P(req))) })));
  router.get('/:uid', handle(async (req, res) => {
    const dash = await service.corporateUnitDashboard(P(req), req.params.uid);
    const ohc = P(req).ohc;
    res.json({ success: true, ...dash, cmo: ohc ? { canSign: Boolean(ohc.registrationNumber), registrationNumberOnFile: Boolean(ohc.registrationNumber) } : undefined });
  }));
  router.get('/:uid/access-log', handle(async (req, res) => res.json({ success: true, ...(await service.accessLog(P(req), req.params.uid, req.query)) })));
  router.post('/:uid/accept', handle(async (req, res) => { mayDecide(req); send(res, await service.acceptContract(P(req), req.params.uid)); }));
  router.post('/:uid/end-contract', handle(async (req, res) => { mayDecide(req); send(res, await service.endContract(P(req), req.params.uid, req.body)); }));

  // ── CMO clinical operations, reusing the OHC workspace's own service functions ──────────────
  router.get('/:uid/employees', handle(async (req, res) => res.json({ success: true, ...(await ohcService.employees(mayOperate(req), { ...req.query, unit: req.params.uid })) })));
  router.get('/:uid/certificates', handle(async (req, res) => res.json({ success: true, ...(await ohcService.certificates(mayOperate(req), { ...req.query, unit: req.params.uid })) })));
  router.post('/:uid/certificates', handle(async (req, res) => {
    const ohc = mayOperate(req);
    const result = await ohcService.issueCertificate(ohc, { ...req.body, unit: req.params.uid });
    const cert = result.body.certificate;
    let pdfUrl = null;
    if (renderPdf) {
      try {
        const unit = ohc.units.find((u) => u.uid === cert.issued_by_unit_uid) || ohc.units[0];
        await renderPdf(cert, await ohcService.certificateLetterhead(ohc, unit));
        pdfUrl = `/api/corporate/ohc-units/${req.params.uid}/certificates/${cert.id}/pdf`;
      } catch (err) { console.error('[corporate-ohc] certificate pdf failed:', err.message); }
    }
    send(res, { ...result, body: { ...result.body, pdfUrl } });
  }));
  router.get('/:uid/certificates/:certId/pdf', handle(async (req, res) => {
    const cert = await ohcService.certificateById(mayOperate(req), req.params.certId);
    if (!pdfPathOf) return res.status(404).json({ success: false, code: 'not_found', message: 'PDF not available' });
    const file = pdfPathOf(cert);
    res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).json({ success: false, code: 'not_found', message: 'PDF not available' }); });
  }));
  router.get('/:uid/emergencies', handle(async (req, res) => res.json({ success: true, ...(await ohcService.emergencies(mayOperate(req), { ...req.query, unit: req.params.uid })) })));
  router.post('/:uid/emergencies', handle(async (req, res) => send(res, await ohcService.createEmergency(mayOperate(req), { ...req.body, unit: req.params.uid }))));
  router.patch('/:uid/emergencies/:emergencyId', handle(async (req, res) => res.json({ success: true, emergency: await ohcService.updateEmergency(mayOperate(req), req.params.emergencyId, { ...req.body, unit: req.params.uid }) })));

  // ── CMO staff control: deactivate/reactivate an existing OHC doctor/staff's assignment only ──
  router.patch('/:uid/staff/:staffUid', handle(async (req, res) => {
    if (P(req).role !== 'corporate_cmo') throw forbidden('Only the CMO can change OHC staff access');
    send(res, await service.setStaffActiveForCorporate(P(req), req.params.uid, req.params.staffUid, req.body?.active));
  }));
  return router;
}

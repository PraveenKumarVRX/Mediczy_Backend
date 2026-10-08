/** The OHC workspace API for ohc_doctor / ohc_staff. Mounted at /api/ohc-workspace. Pure factory: services, auth and limiter injected. */
import express from 'express';
import { handle, send } from '../lab/collection-http.js';

export function buildOhcWorkspaceRouter({ ohc, authenticate, limiter = [], renderPdf = null, pdfPathOf = null }) {
  const router = express.Router();

  router.post('/auth/login', limiter, handle(async (req, res) => res.json({ success: true, ...(await ohc.login({ email: req.body?.email, password: req.body?.password, deviceId: req.get('X-Device-Id') })) })));
  router.post('/auth/refresh', limiter, handle(async (req, res) => {
    const out = await ohc.refresh({ refreshToken: req.body?.refreshToken, deviceId: req.get('X-Device-Id') });
    res.json({ success: true, accessToken: out.accessToken, refreshToken: out.refreshToken });
  }));
  router.post('/auth/logout', handle(async (req, res) => res.json({ success: true, ...(await ohc.logout({ refreshToken: req.body?.refreshToken })) })));

  router.use(authenticate);   // sets req.ohc = principal (re-read from the database on every request)
  router.get('/me', handle(async (req, res) => res.json({ success: true, ...ohc.me(req.ohc) })));
  router.get('/employees', handle(async (req, res) => res.json({ success: true, ...(await ohc.employees(req.ohc, req.query)) })));
  router.get('/certificates', handle(async (req, res) => res.json({ success: true, ...(await ohc.certificates(req.ohc, req.query)) })));
  router.post('/certificates', handle(async (req, res) => {
    const result = await ohc.issueCertificate(req.ohc, req.body);
    const cert = result.body.certificate;
    let pdfUrl = null;
    if (renderPdf) {
      try {
        const unit = req.ohc.units.find((u) => u.uid === cert.issued_by_unit_uid) || req.ohc.units[0];
        await renderPdf(cert, { doctorId: req.ohc.id, clinicName: unit.name, doctorQualifications: undefined });
        pdfUrl = `/api/ohc-workspace/certificates/${cert.id}/pdf`;
      } catch (err) { console.error('[ohc] certificate pdf failed:', err.message); }
    }
    send(res, { ...result, body: { ...result.body, pdfUrl } });
  }));
  router.get('/certificates/:id/pdf', handle(async (req, res) => {
    const cert = await ohc.certificateById(req.ohc, req.params.id);
    if (!pdfPathOf) return res.status(404).json({ success: false, code: 'not_found', message: 'PDF not available' });
    const file = pdfPathOf(cert.id);
    res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).json({ success: false, code: 'not_found', message: 'PDF not available' }); });
  }));
  return router;
}

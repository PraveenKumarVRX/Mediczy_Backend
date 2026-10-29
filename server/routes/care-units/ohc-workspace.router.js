/** The OHC workspace API for hospital OHC staff and the corporate CMO super-admin. Mounted at /api/ohc-workspace. */
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
  // A worker on a temporary password can do nothing but read /me and change it.
  router.use((req, res, next) => {
    if (req.ohc.mustChangePassword && !['/auth/change-password', '/me'].includes(req.path)) {
      return res.status(403).json({ success: false, code: 'password_change_required', message: 'Change your temporary password to continue' });
    }
    return next();
  });
  router.post('/auth/change-password', handle(async (req, res) => res.json({ success: true, ...(await ohc.changePassword(req.ohc, req.body)) })));
  router.get('/me', handle(async (req, res) => res.json({ success: true, ...ohc.me(req.ohc) })));
  router.get('/employees', handle(async (req, res) => res.json({ success: true, ...(await ohc.employees(req.ohc, req.query)) })));
  router.get('/staff', handle(async (req, res) => res.json({ success: true, ...(await ohc.staff(req.ohc, req.query)) })));
  router.get('/appointments', handle(async (req, res) => res.json({ success: true, ...(await ohc.appointments(req.ohc, req.query)) })));
  router.post('/appointments', handle(async (req, res) => res.status(201).json({ success: true, appointment: await ohc.createAppointment(req.ohc, req.body) })));
  router.patch('/appointments/:id', handle(async (req, res) => res.json({ success: true, appointment: await ohc.updateAppointment(req.ohc, req.params.id, req.body) })));
  router.post('/appointments/:id/remind', handle(async (req, res) => res.json({ success: true, ...(await ohc.remindAppointment(req.ohc, req.params.id, req.body)) })));
  router.get('/encounters', handle(async (req, res) => res.json({ success: true, ...(await ohc.encounters(req.ohc, req.query)) })));
  router.post('/encounters', handle(async (req, res) => res.status(201).json({ success: true, encounter: await ohc.createEncounter(req.ohc, req.body) })));
  router.post('/encounters/:id/finalize', handle(async (req, res) => res.json({ success: true, encounter: await ohc.finalizeEncounter(req.ohc, req.params.id, req.body) })));
  router.post('/encounters/:id/screenings', handle(async (req, res) => res.status(201).json({ success: true, screening: await ohc.addScreeningResult(req.ohc, req.params.id, req.body) })));
  router.get('/staff-messages', handle(async (req, res) => res.json({ success: true, ...(await ohc.staffMessages(req.ohc, req.query)) })));
  router.post('/staff-messages', handle(async (req, res) => res.status(201).json({ success: true, message: await ohc.createStaffMessage(req.ohc, req.body) })));
  router.get('/occupational-summary', handle(async (req, res) => res.json({ success: true, ...(await ohc.occupationalSummary(req.ohc, req.query)) })));
  router.get('/occupational-summary.csv', handle(async (req, res) => {
    const out = await ohc.occupationalSummary(req.ohc, req.query);
    const lines = [['metric', 'value'], ['appointments_total', out.summary.appointments.total], ['appointments_completed', out.summary.appointments.completed], ['appointments_no_show', out.summary.appointments.no_show], ['encounters_total', out.summary.encounters.total], ['encounters_finalized', out.summary.encounters.finalized], ['screenings_total', out.summary.screenings.total], ['screenings_attention_required', out.summary.screenings.attention_required]];
    res.type('text/csv').attachment(`mediqzy-ohc-summary-${out.unit.uid}.csv`).send(lines.map((line) => line.join(',')).join('\n'));
  }));
  router.get('/responders', handle(async (req, res) => res.json({ success: true, ...(await ohc.responders(req.ohc, req.query)) })));
  router.put('/responders/me/availability', handle(async (req, res) => res.json({ success: true, ...(await ohc.responderAvailability(req.ohc, req.body)) })));
  router.get('/emergencies', handle(async (req, res) => res.json({ success: true, ...(await ohc.emergencies(req.ohc, req.query)) })));
  router.get('/emergencies/analytics', handle(async (req, res) => res.json({ success: true, ...(await ohc.emergencyAnalytics(req.ohc, req.query)) })));
  router.post('/emergencies', handle(async (req, res) => {
    const result = await ohc.createEmergency(req.ohc, req.body);
    send(res, result);
  }));
  router.get('/emergencies/:id', handle(async (req, res) => res.json({ success: true, ...(await ohc.emergencyDetail(req.ohc, req.params.id, req.query)) })));
  router.post('/emergencies/:id/notes', handle(async (req, res) => res.status(201).json({ success: true, note: await ohc.addEmergencyNote(req.ohc, req.params.id, req.body) })));
  router.put('/emergencies/:id/report/draft', handle(async (req, res) => res.json({ success: true, report: await ohc.saveEmergencyReportDraft(req.ohc, req.params.id, req.body) })));
  router.post('/emergencies/:id/report/finalize', handle(async (req, res) => res.json({ success: true, report: await ohc.finalizeEmergencyReport(req.ohc, req.params.id, req.body) })));
  router.post('/emergencies/:id/report/amendments', handle(async (req, res) => res.status(201).json({ success: true, amendment: await ohc.amendEmergencyReport(req.ohc, req.params.id, req.body) })));
  router.patch('/emergencies/:id', handle(async (req, res) => res.json({ success: true, emergency: await ohc.updateEmergency(req.ohc, req.params.id, req.body) })));
  router.post('/emergencies/:id/assignments', handle(async (req, res) => res.status(201).json({ success: true, assignment: await ohc.assignEmergency(req.ohc, req.params.id, req.body) })));
  router.patch('/emergencies/:id/assignments/:assignmentId/respond', handle(async (req, res) => res.json({ success: true, assignment: await ohc.respondToAssignment(req.ohc, req.params.id, req.params.assignmentId, req.body) })));
  router.get('/certificates', handle(async (req, res) => res.json({ success: true, ...(await ohc.certificates(req.ohc, req.query)) })));
  router.post('/certificates', handle(async (req, res) => {
    const result = await ohc.issueCertificate(req.ohc, req.body);
    const cert = result.body.certificate;
    let pdfUrl = null;
    if (renderPdf) {
      try {
        const unit = req.ohc.units.find((u) => u.uid === cert.issued_by_unit_uid) || req.ohc.units[0];
        await renderPdf(cert, await ohc.certificateLetterhead(req.ohc, unit));
        pdfUrl = `/api/ohc-workspace/certificates/${cert.id}/pdf`;
      } catch (err) { console.error('[ohc] certificate pdf failed:', err.message); }
    }
    send(res, { ...result, body: { ...result.body, pdfUrl } });
  }));
  router.get('/certificates/:id/pdf', handle(async (req, res) => {
    const cert = await ohc.certificateById(req.ohc, req.params.id);
    if (!pdfPathOf) return res.status(404).json({ success: false, code: 'not_found', message: 'PDF not available' });
    const file = pdfPathOf(cert);
    res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).json({ success: false, code: 'not_found', message: 'PDF not available' }); });
  }));
  return router;
}

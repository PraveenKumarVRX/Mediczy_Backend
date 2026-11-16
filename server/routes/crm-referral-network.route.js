/** /api/crm/referral-network — doctors, referral credit, field activity, approvals and events for the web CRM.
 * Mounted under /api/crm, so authCRM has run. Read access: field force, doctor dashboards or contact centre;
 * what each role may change is enforced in the service (scopeFor). */
import express from 'express';
import { hasCRMCapability } from '../config/crm-roles.config.js';
import * as net from '../services/crm-referral-network.service.js';

const canRead = (u) => ['field_force:read', 'dashboard:doctors', 'contact_center:read'].some((c) => hasCRMCapability(u, c));

const action = (handler) => async (req, res) => {
  if (!req.crmUser?.tenantId || !req.crmUser?.tenantUid) return res.status(400).json({ success: false, message: 'CRM tenant context is required' });
  if (!canRead(req.crmUser)) return res.status(403).json({ success: false, message: 'Your role does not include the referral network.' });
  try { return res.json({ success: true, data: await handler(req, net.scopeFor(req.crmUser)) }); }
  catch (error) {
    const status = error.statusCode || (error.code === '23505' ? 409 : 500);
    if (status >= 500) console.error('[referral-network]', error.message);
    return res.status(status).json({ success: false, message: status >= 500 ? 'Referral network request failed' : error.message });
  }
};

export function buildReferralNetworkRouter() {
  const r = express.Router();
  r.get('/doctors', action((req, ctx) => net.listDoctors(ctx, req.query)));
  r.get('/doctors/facets', action((req, ctx) => net.directoryFacets(ctx)));
  r.post('/doctors', action((req, ctx) => net.createDoctor(ctx, req.body || {})));
  r.post('/doctors/import', action((req, ctx) => net.importDoctors(ctx, req.body?.rows)));
  r.get('/doctors/:id', action((req, ctx) => net.doctorProfile(ctx, req.params.id)));
  r.patch('/doctors/:id', action((req, ctx) => net.updateDoctor(ctx, req.params.id, req.body || {})));
  r.put('/doctors/:id/intel', action((req, ctx) => net.saveIntel(ctx, req.params.id, req.body || {})));
  r.post('/doctors/:id/referrals', action((req, ctx) => net.recordReferral(ctx, req.params.id, req.body || {}, { channel: 'web' })));
  r.get('/doctor-templates', action((req, ctx) => net.doctorTemplates(ctx)));
  r.post('/doctors/:id/send', action((req, ctx) => net.sendDoctorMessage(ctx, req.params.id, req.body || {})));
  r.post('/doctors/:id/call', action((req, ctx) => net.callDoctor(ctx, req.params.id)));
  r.post('/events/cme/:id/invites/send', action((req, ctx) => net.sendCmeInvites(ctx, req.params.id, req.body || {})));
  r.get('/territories', action((req, ctx) => net.listTerritories(ctx)));
  r.post('/territories', action((req, ctx) => net.saveTerritory(ctx, req.body || {})));
  r.patch('/territories/:id', action((req, ctx) => net.saveTerritory(ctx, req.body || {}, req.params.id)));
  r.get('/empanelment', action((req, ctx) => net.listEmpanelment(ctx)));
  r.post('/empanelment', action((req, ctx) => net.saveEmpanelment(ctx, req.body || {})));
  r.patch('/empanelment/:id', action((req, ctx) => net.saveEmpanelment(ctx, req.body || {}, req.params.id)));
  r.post('/empanelment/:id/milestones', action((req, ctx) => net.addMilestone(ctx, req.params.id, req.body || {})));
  r.patch('/empanelment/milestones/:id', action((req, ctx) => net.setMilestone(ctx, req.params.id, req.body?.status)));
  r.patch('/leads/:leadId/referral', action((req, ctx) => net.setReferralCredit(ctx, req.params.leadId, req.body?.doctor_id ?? null)));
  r.get('/overview', action((req, ctx) => net.networkOverview(ctx, req.query)));
  r.get('/team', action((req, ctx) => net.teamMembers(ctx)));
  r.get('/team-performance', action((req, ctx) => net.teamPerformance(ctx, req.query)));
  r.get('/visits', action((req, ctx) => net.listVisits(ctx, req.query)));
  r.get('/daily-reports', action((req, ctx) => net.listDailyReports(ctx, req.query)));
  r.get('/approvals', action((req, ctx) => net.listApprovals(ctx, req.query)));
  r.patch('/approvals/budgets/:id', action((req, ctx) => net.decideBudget(ctx, req.params.id, req.body || {})));
  r.get('/samples', action((req, ctx) => net.listSamples(ctx, req.query)));
  r.get('/events', action((req, ctx) => net.listEvents(ctx)));
  r.post('/events/cme', action((req, ctx) => net.createCme(ctx, req.body || {})));
  r.post('/events/camps', action((req, ctx) => net.createCamp(ctx, req.body || {})));
  r.post('/events/cme/:id/speakers', action((req, ctx) => net.addCmeSpeaker(ctx, req.params.id, req.body || {})));
  r.patch('/events/speakers/:id', action((req, ctx) => net.setSpeakerCompliance(ctx, req.params.id, req.body?.compliance_cleared)));
  r.post('/events/cme/:id/invite', action((req, ctx) => net.inviteDoctorsToCme(ctx, req.params.id, req.body?.doctor_ids)));
  r.post('/events/camps/:id/convert', action((req, ctx) => net.convertCampRegistrations(ctx, req.params.id)));
  r.get('/events/:kind/:id', action((req, ctx) => net.eventDetail(ctx, req.params.kind === 'cme' ? 'cme' : 'camp', req.params.id)));
  r.get('/team-today', action((req, ctx) => net.fieldTeamToday(ctx, req.query)));
  r.put('/field-settings', action((req, ctx) => net.saveFieldSettings(ctx, req.body || {})));
  r.post('/targets', action((req, ctx) => net.setTargets(ctx, req.body || {})));
  r.post('/targets/move', action((req, ctx) => net.moveQuota(ctx, req.body || {})));
  r.get('/targets/moves', action((req, ctx) => net.listQuotaMoves(ctx, req.query)));
  r.get('/outreach', action((req, ctx) => net.listOutreachPermissions(ctx, req.query)));
  r.post('/outreach', action((req, ctx) => net.saveOutreachPermission(ctx, req.body || {})));
  r.patch('/outreach/:id', action((req, ctx) => net.decideOutreachPermission(ctx, req.params.id, req.body || {})));
  r.get('/institutions', action((req, ctx) => net.listInstitutions(ctx, req.query)));
  r.patch('/institutions/:id/stage', action((req, ctx) => net.moveInstitution(ctx, req.params.id, req.body || {})));
  r.post('/doctors/link-contacts', action((req, ctx) => net.linkAllDoctorContacts(ctx)));
  r.patch('/approvals/:kind/:id', action((req, ctx) => net.decideApproval(ctx, req.params.kind, req.params.id, req.body || {})));
  return r;
}

/**
 * Access rules of the CRM modules merged back from the Medstar installation (Phase 1):
 * who may see a patient lead, who may reassign, who may run campaigns or manage telephony.
 * The rules live in services/crm-access.service.js and the route capability checks; the database is mocked.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Leads 1-3 belong to tenant 11; lead 1 is assigned to user 7 (a field executive), lead 2 to user 8.
const LEADS = { 1: 7, 2: 8 };
const query = jest.fn(async (sql, params = []) => {
  if (/FROM crm_leads_v2 lv JOIN crm_leads l/.test(sql)) {
    const [tenantId, id] = params;
    return { rows: tenantId === 11 && LEADS[id] !== undefined ? [{ assigned_to: LEADS[id] }] : [] };
  }
  if (/FROM crm_leads WHERE id/.test(sql)) return { rows: LEADS[params[0]] !== undefined ? [{ assigned_to: LEADS[params[0]] }] : [] };
  if (/telecmi_user_id/.test(sql)) return { rows: [{ agent: params[0] === 9 ? 'agent-9' : null }] };
  if (/FROM crm_communication_events/.test(sql)) return { rows: params[0] === 50 ? [{ owner_user_id: 8, agent: 'agent-9' }] : [] };
  return { rows: [] };
});
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect: jest.fn() } }));

const ok = () => jest.fn(async () => ({ ok: true }));
const inbox = Object.fromEntries(['listUnifiedInbox', 'getUnifiedThread', 'createTask', 'updateTask', 'bookAppointment', 'setLeadFields',
  'sendUnified', 'setUnifiedStatus', 'assignUnified', 'inboxSummary', 'setJourneyStage', 'v2ForLegacy', 'telephonyStatus', 'clickToCall',
  'callRecording', 'telephonyAgents', 'linkTelephonyAgent', 'currentOwner', 'taskLead'].map((n) => [n, ok()]));
inbox.currentOwner = jest.fn(async () => null);
jest.unstable_mockModule('../services/crm-unified-inbox.service.js', () => ({ INBOX_CHANNELS: [], ...inbox }));
jest.unstable_mockModule('../services/crm-contact-capture.service.js', () => ({ updateContactDetails: ok() }));
const engage = Object.fromEntries(['bulkEnabled', 'listTemplates', 'saveTemplate', 'archiveTemplate', 'previewAudience', 'listAudiences',
  'saveAudience', 'removeAudience', 'audienceMembers', 'searchLeads', 'listCampaigns', 'saveCampaign', 'campaignAction', 'campaignRecipients',
  'runCampaignTick', 'automationOptions'].map((n) => [n, ok()]));
jest.unstable_mockModule('../services/crm-engage.service.js', () => engage);
jest.unstable_mockModule('../services/crm-automations.service.js', () => Object.fromEntries(['createAutomation', 'updateAutomationStatus',
  'getAutomation', 'updateAutomation', 'listAssignableUsers', 'listAutomations', 'deleteAutomation', 'listExecutions', 'runAutomationForLead',
  'runAutomationTick'].map((n) => [n, ok()])));
jest.unstable_mockModule('../services/crm-home.service.js', () => ({ JOURNEY: [], RETIRED_DASHBOARD_PATHS: [], homeData: ok() }));
const telecmi = Object.fromEntries(['telecmiConfigured', 'rawAgents', 'listAgents', 'addAgent', 'updateAgent', 'removeAgent', 'setAgentStatus',
  'getRouting', 'saveRouting', 'identifyCaller', 'routeIncoming', 'pushLiveCall', 'updateLiveCall', 'liveCalls', 'handleLiveEvent',
  'telephonyOverview', 'syncCallLogs'].map((n) => [n, ok()]));
telecmi.telephonyOverview = jest.fn(async () => ({ agents: 2, urls: { webhook: 'secret-url' } }));
jest.unstable_mockModule('../services/telecmi-control.service.js', () => telecmi);

const access = await import('../services/crm-access.service.js');
const { buildUnifiedInboxRouter } = await import('../routes/crm-unified-inbox.route.js');
const { buildEngageRouter } = await import('../routes/crm-engage.route.js');
const { buildTelephonyRouter } = await import('../routes/crm-telephony.route.js');

const USERS = { sales_rep: 7, telecaller: 9, marketing: 10, business_head: 11, marketing_head: 12, conversion: 13 };
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const role = req.get('x-role') || 'sales_rep';
  req.crmUser = { id: role === 'admin' ? 1 : USERS[role], tenantId: 11, tenantUid: 'H11AAA', crmRole: role, isAdmin: role === 'admin' };
  next();
});
app.use('/inbox', buildUnifiedInboxRouter());
app.use('/engage', buildEngageRouter());
app.use('/telephony', buildTelephonyRouter());
const as = (role) => ({ get: (p) => request(app).get(p).set('x-role', role), post: (p, b = {}) => request(app).post(p).set('x-role', role).send(b),
  put: (p, b = {}) => request(app).put(p).set('x-role', role).send(b), patch: (p, b = {}) => request(app).patch(p).set('x-role', role).send(b) });

afterEach(() => jest.clearAllMocks());

describe('who sees which patient lead', () => {
  it('field executives see only their own leads, everyone else the whole tenant', () => {
    expect(access.ownScope({ crmRole: 'sales_rep' })).toBe(true);
    expect(access.ownScope({ crmRole: undefined })).toBe(true); // no role = the narrowest one
    for (const role of ['telecaller', 'conversion', 'marketing', 'marketing_head', 'business_head', 'admin']) expect(access.ownScope({ crmRole: role })).toBe(false);
    expect(access.ownScope({ crmRole: 'sales_rep', isAdmin: true })).toBe(false);
  });

  it('a field executive opens their own lead and gets 404, not 403, for anyone else\'s', async () => {
    expect((await as('sales_rep').get('/inbox/1')).status).toBe(200);
    const other = await as('sales_rep').get('/inbox/2');
    expect(other.status).toBe(404);
    expect(inbox.getUnifiedThread).toHaveBeenCalledTimes(1);
  });

  it('lead lookups are scoped to the caller\'s tenant', async () => {
    await expect(access.assertV2LeadAccess({ id: 7, crmRole: 'sales_rep' }, 12, 1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(access.assertV2LeadAccess({ id: 7, crmRole: 'sales_rep' }, 11, 1)).resolves.toBeUndefined();
  });

  it('a field executive cannot send to, call or edit another executive\'s patient', async () => {
    for (const [method, path] of [['post', '/inbox/2/send'], ['post', '/inbox/2/call'], ['patch', '/inbox/2/fields'], ['post', '/inbox/2/stage']]) {
      expect((await as('sales_rep')[method](path)).status).toBe(404);
    }
    expect(inbox.sendUnified).not.toHaveBeenCalled();
    expect(inbox.clickToCall).not.toHaveBeenCalled();
  });

  it('the inbox list is narrowed to own leads for field executives only', async () => {
    await as('sales_rep').get('/inbox/');
    await as('telecaller').get('/inbox/');
    expect(inbox.listUnifiedInbox.mock.calls[0][3]).toMatchObject({ ownOnly: true });
    expect(inbox.listUnifiedInbox.mock.calls[1][3]).toMatchObject({ ownOnly: false });
  });
});

describe('reassigning leads', () => {
  it('only managers reassign; anyone may take an unassigned lead', () => {
    expect(() => access.assertCanAssign({ id: 9, crmRole: 'telecaller' }, 8, 9)).toThrow(/Only a Business Head/);
    expect(() => access.assertCanAssign({ id: 9, crmRole: 'telecaller' }, null, 9)).not.toThrow();
    expect(() => access.assertCanAssign({ id: 9, crmRole: 'telecaller' }, null, 8)).toThrow();
    expect(() => access.assertCanAssign({ id: 9, crmRole: 'telecaller' }, 8, 8)).not.toThrow();
    for (const role of ['business_head', 'marketing_head', 'admin']) expect(() => access.assertCanAssign({ id: 1, crmRole: role }, 8, 9)).not.toThrow();
  });
});

describe('call recordings', () => {
  it('managers hear every call; an agent hears only calls they handled', async () => {
    await expect(access.assertRecordingAccess({ id: 11, crmRole: 'business_head' }, 11, 'evt:51')).resolves.toBeUndefined();
    await expect(access.assertRecordingAccess({ id: 9, crmRole: 'telecaller' }, 11, 'evt:50')).resolves.toBeUndefined();
    await expect(access.assertRecordingAccess({ id: 9, crmRole: 'telecaller' }, 11, 'evt:51')).rejects.toMatchObject({ statusCode: 403 });
    await expect(access.assertRecordingAccess({ id: 13, crmRole: 'conversion' }, 11, 'evt:50')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('Engage: campaigns are for managers and marketing', () => {
  it.each(['business_head', 'marketing_head', 'marketing', 'admin'])('%s may run campaigns', async (role) => {
    expect((await as(role).post('/engage/campaigns', { name: 'x' })).status).toBe(200);
    expect((await as(role).post('/engage/campaigns/4/launch')).status).toBe(200);
  });
  it.each(['telecaller', 'conversion', 'sales_rep'])('%s may not create, launch or edit campaign templates', async (role) => {
    expect((await as(role).post('/engage/campaigns', { name: 'x' })).status).toBe(403);
    expect((await as(role).post('/engage/campaigns/4/launch')).status).toBe(403);
    expect((await as(role).post('/engage/templates', {})).status).toBe(403);
    expect((await as(role).get('/engage/templates')).status).toBe(200); // reading templates to message one patient is fine
    expect(engage.saveCampaign).not.toHaveBeenCalled();
    expect(engage.campaignAction).not.toHaveBeenCalled();
  });
});

describe('Telephony: agents and routing are admin-only', () => {
  it.each(['business_head', 'marketing_head', 'telecaller', 'sales_rep'])('%s cannot manage agents or routing', async (role) => {
    expect((await as(role).post('/telephony/agents', {})).status).toBe(403);
    expect((await as(role).put('/telephony/routing', {})).status).toBe(403);
    expect((await as(role).post('/telephony/logs/refresh')).status).toBe(403);
    expect(telecmi.addAgent).not.toHaveBeenCalled();
  });
  it('admins manage agents; webhook URLs are shown to admins only', async () => {
    expect((await as('admin').post('/telephony/agents', {})).status).toBe(200);
    expect((await as('admin').get('/telephony/overview')).body.data.urls).toEqual({ webhook: 'secret-url' });
    expect((await as('telecaller').get('/telephony/overview')).body.data.urls).toBeNull();
  });
});

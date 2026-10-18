// Installation scopes are independent of organization-wide portal packs.
// These are requested deployment scopes, not a substitute for runtime entitlements.
export const INSTALLATION_PROFILES = {
  crm: {
    label: 'CRM', tenantTypes: ['hospital', 'clinic', 'corporate'],
    required: ['crm.core'],
    modules: [
      ['crm.core', 'Leads, contacts, pipeline and activities'],
      ['crm.campaigns', 'Campaigns, segments and automation'],
      ['crm.communications', 'Email, WhatsApp, SMS and calls'],
      ['crm.social', 'Social channels and content'],
      ['crm.agent', 'Agentic CRM'],
      ['crm.flows', 'Flow Builder'],
      ['crm.chatwoot', 'Chatwoot integration'],
    ],
    metrics: ['active_users', 'leads_created', 'deals_won', 'campaigns_sent', 'messages_sent', 'ai_calls'],
  },
  lab: {
    label: 'Lab / LIS', tenantTypes: ['lab', 'diagnostic_centre'],
    required: ['lab.core'],
    modules: [
      ['lab.core', 'Test catalogue, orders, specimens and results'],
      ['lab.billing', 'Lab billing'],
      ['lab.collection', 'Home and ward collection'],
      ['lab.quality', 'Quality control and result-release governance'],
      ['lab.packages', 'Health-checkup packages and slots'],
      ['lab.corporate', 'Corporate lab network'],
      ['lab.imaging', 'RIS / imaging integration'],
    ],
    metrics: ['active_users', 'orders_created', 'specimens_received', 'reports_released', 'samples_rejected', 'collections_completed'],
  },
};

export class InstallationError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (message) => { throw new InstallationError(422, 'validation_failed', message); };
export function exactFields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('A JSON object is required');
  if (Object.keys(value).some(k => !keys.includes(k))) fail('Unexpected fields supplied');
}
export function validateInstallation(value) {
  exactFields(value, ['tenantUid', 'name', 'profile', 'modules', 'domain', 'awsAccountId', 'region', 'version']);
  if (!/^[A-Z0-9]{6}$/.test(value.tenantUid || '')) fail('Select an existing tenant UID');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120) fail('Installation name must be 1–120 characters');
  const profile = Object.hasOwn(INSTALLATION_PROFILES, value.profile) ? INSTALLATION_PROFILES[value.profile] : null;
  if (!profile) fail('Choose CRM or Lab / LIS');
  if (!Array.isArray(value.modules) || value.modules.length > profile.modules.length ||
      value.modules.some(m => !profile.modules.some(([key]) => key === m)) ||
      new Set(value.modules).size !== value.modules.length || profile.required.some(m => !value.modules.includes(m))) fail('Invalid module scope');
  const domain = typeof value.domain === 'string' ? value.domain.trim().toLowerCase() : '';
  if (value.domain != null && typeof value.domain !== 'string') fail('Domain must be a hostname');
  if (domain && (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))) fail('Enter a hostname without a scheme, port or path');
  if (value.awsAccountId != null && (typeof value.awsAccountId !== 'string' || (value.awsAccountId !== '' && !/^\d{12}$/.test(value.awsAccountId)))) fail('AWS account ID must contain 12 digits');
  if (value.region != null && (typeof value.region !== 'string' || value.region.length > 40 || (value.region !== '' && !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(value.region)))) fail('Invalid AWS region');
  return { tenantUid: value.tenantUid, name: value.name.trim(), profile: value.profile,
    modules: [...value.modules].sort(), domain: domain || null, awsAccountId: value.awsAccountId || null, region: value.region || null };
}

export function validateReport(value, profileId, now = new Date()) {
  exactFields(value, ['eventId', 'observedAt', 'release', 'health', 'day', 'metrics']);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.eventId || '')) fail('eventId must be a UUID v4');
  const observed = new Date(value.observedAt);
  if (typeof value.observedAt !== 'string' || !Number.isFinite(observed.getTime()) || observed > new Date(now.getTime() + 300000) || observed < new Date(now.getTime() - 31 * 86400000)) fail('observedAt must be within the last 31 days and no more than five minutes ahead');
  if (!['healthy', 'degraded', 'unavailable'].includes(value.health)) fail('Invalid health status');
  if (typeof value.release !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(value.release)) fail('A release identifier is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.day || '') || value.day !== observed.toISOString().slice(0, 10)) fail('day must be the observed UTC date');
  const allowed = INSTALLATION_PROFILES[profileId]?.metrics || [];
  exactFields(value.metrics, allowed);
  if (Object.values(value.metrics).some(v => !Number.isSafeInteger(v) || v < 0 || v > 1000000000)) fail('Metrics must be non-negative bounded integers');
  return { ...value, observedAt: observed.toISOString(), metrics: Object.fromEntries(Object.entries(value.metrics).sort(([a], [b]) => a.localeCompare(b))) };
}

export function installationFreshness(row, now = Date.now()) {
  if (!row.last_observed_at) return 'never_reported';
  const age = now - new Date(row.last_observed_at).getTime();
  return age > 5 * 60000 ? 'stale' : row.health;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Eye, EyeOff, LockKeyhole, RefreshCw, Save, ShieldCheck, TestTube2, XCircle } from 'lucide-react';
import api from '@/utils/api';
import { hasCRMCapability } from './shared/crmRoles';

type Channel = 'email' | 'whatsapp' | 'sms' | 'calls' | 'facebook' | 'instagram' | 'linkedin' | 'google_ads' | 'youtube';
type Integration = { channel: Channel; provider: string | null; status: string; accountRef: string | null; config: Record<string, any>; credentialsConfigured: boolean; healthScore: number | null; healthMessage: string | null; lastHealthCheckAt: string | null };

const CHANNELS: Array<{ id: Channel; label: string; description: string; group: string; providers: string[]; fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }> }> = [
  { id: 'email', label: 'Email', description: 'Tenant sender credentials for CRM campaigns and notifications.', group: 'Messaging', providers: ['smtp', 'sendgrid', 'ses'], fields: [
    { key: 'fromEmail', label: 'From email', placeholder: 'crm@yourdomain.com' }, { key: 'fromName', label: 'From name', placeholder: 'Mediqzy Care' },
    { key: 'smtpHost', label: 'SMTP host', placeholder: 'smtp.example.com' }, { key: 'smtpPort', label: 'SMTP port', placeholder: '587' },
    { key: 'username', label: 'SMTP username' }, { key: 'password', label: 'SMTP password', secret: true },
  ] },
  { id: 'whatsapp', label: 'WhatsApp', description: 'WhatsApp Business provider used for patient conversations and templates.', group: 'Messaging', providers: ['meta', 'twilio', 'gupshup'], fields: [
    { key: 'phoneNumberId', label: 'Phone number ID', placeholder: 'Meta phone number ID' }, { key: 'businessAccountId', label: 'Business account ID' },
    { key: 'accessToken', label: 'Access token', secret: true }, { key: 'senderNumber', label: 'Sender number', placeholder: '+91...' },
  ] },
  { id: 'sms', label: 'SMS', description: 'Transactional and campaign SMS provider settings.', group: 'Messaging', providers: ['msg91', 'twilio', 'textlocal', 'custom'], fields: [
    { key: 'senderId', label: 'Sender ID', placeholder: 'MEDIQZ' }, { key: 'apiUrl', label: 'Provider API URL', placeholder: 'https://...' }, { key: 'apiKey', label: 'API key', secret: true },
  ] },
  { id: 'calls', label: 'Calls', description: 'Click-to-call or telephony provider used by the CRM team. Call activity is always logged in CRM.', group: 'Voice', providers: ['twilio', 'exotel', 'knowlarity', 'manual'], fields: [
    { key: 'accountId', label: 'Account / instance ID' }, { key: 'fromNumber', label: 'Caller ID', placeholder: '+91...' }, { key: 'authToken', label: 'Provider auth token', secret: true },
  ] },
  { id: 'facebook', label: 'Facebook', description: 'Meta page and social engagement credentials.', group: 'Social', providers: ['meta'], fields: [
    { key: 'pageId', label: 'Page ID' }, { key: 'accessToken', label: 'Page access token', secret: true },
  ] },
  { id: 'instagram', label: 'Instagram', description: 'Instagram business account connection.', group: 'Social', providers: ['meta'], fields: [
    { key: 'accountId', label: 'Business account ID' }, { key: 'accessToken', label: 'Access token', secret: true },
  ] },
  { id: 'linkedin', label: 'LinkedIn', description: 'LinkedIn organisation and campaign connection.', group: 'Social', providers: ['linkedin'], fields: [
    { key: 'organizationId', label: 'Organization ID' }, { key: 'accessToken', label: 'Access token', secret: true },
  ] },
  { id: 'google_ads', label: 'Google Ads', description: 'Google Ads account for acquisition campaigns.', group: 'Social', providers: ['google_ads'], fields: [
    { key: 'customerId', label: 'Customer ID' }, { key: 'managerId', label: 'Manager ID' }, { key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client secret', secret: true }, { key: 'refreshToken', label: 'Refresh token', secret: true },
  ] },
  { id: 'youtube', label: 'YouTube', description: 'YouTube channel and campaign connection.', group: 'Social', providers: ['google'], fields: [
    { key: 'channelId', label: 'Channel ID' }, { key: 'accessToken', label: 'Access token', secret: true },
  ] },
];

function authHeaders() { const token = localStorage.getItem('crmToken'); return token ? { Authorization: `Bearer ${token}` } : {}; }

function ChannelCard({ definition, integration, editable, onSaved }: { definition: typeof CHANNELS[number]; integration: Integration; editable: boolean; onSaved: (next: Integration) => void }) {
  const [provider, setProvider] = useState(integration.provider || definition.providers[0]);
  const [accountRef, setAccountRef] = useState(integration.accountRef || '');
  const [config, setConfig] = useState<Record<string, string>>(() => ({ ...(integration.config || {}) }));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setProvider(integration.provider || definition.providers[0]); setAccountRef(integration.accountRef || ''); setConfig({ ...(integration.config || {}) }); }, [integration, definition]);

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const credentials = Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim() !== ''));
      const response = await api.put(`/crm/communication-hub/integrations/${definition.id}`, { provider, accountRef, config, ...(Object.keys(credentials).length ? { credentials } : {}) }, { headers: authHeaders() });
      onSaved(response.data.data); setSecrets({}); setNotice('Saved securely. Secret values are not returned or shown again.');
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not save channel settings'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setError(''); setNotice('');
    try { const response = await api.post(`/crm/communication-hub/integrations/${definition.id}/test`, {}, { headers: authHeaders() }); onSaved(response.data.data); setNotice('Configuration decrypted successfully. Live provider delivery depends on its adapter.'); }
    catch (err: any) { setError(err?.response?.data?.message || 'Configuration test failed'); }
    finally { setBusy(false); }
  };

  return <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5">
    <div className="flex items-start justify-between gap-4 mb-4">
      <div><h4 className="text-sm font-semibold text-white">{definition.label}</h4><p className="text-xs text-slate-500 mt-1 max-w-xl">{definition.description}</p></div>
      <span className={`text-[10px] uppercase tracking-wide rounded-full px-2.5 py-1 ${integration.status === 'connected' ? 'bg-emerald-400/10 text-emerald-300' : integration.credentialsConfigured ? 'bg-blue-400/10 text-blue-300' : 'bg-slate-400/10 text-slate-400'}`}>{integration.status === 'not_configured' ? 'Not configured' : integration.status}</span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="block"><span className="text-[11px] text-slate-400">Provider</span><select disabled={!editable || busy} value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white"><option value="">Choose provider</option>{definition.providers.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      <label className="block"><span className="text-[11px] text-slate-400">Account reference <span className="text-slate-600">(optional)</span></span><input disabled={!editable || busy} value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder="Internal account / workspace ID" className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-700" /></label>
      {definition.fields.map((field) => <label key={field.key} className="block"><span className="text-[11px] text-slate-400">{field.label}{field.secret && integration.credentialsConfigured ? <span className="text-emerald-400 ml-1">(saved)</span> : null}</span><div className="relative mt-1"><input disabled={!editable || busy} type={field.secret && !showSecrets[field.key] ? 'password' : 'text'} value={field.secret ? (secrets[field.key] || '') : (config[field.key] || '')} onChange={(e) => field.secret ? setSecrets((current) => ({ ...current, [field.key]: e.target.value })) : setConfig((current) => ({ ...current, [field.key]: e.target.value }))} placeholder={field.secret && integration.credentialsConfigured ? 'Leave blank to keep saved secret' : field.placeholder} className="w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-700 pr-10" />{field.secret && <button type="button" onClick={() => setShowSecrets((current) => ({ ...current, [field.key]: !current[field.key] }))} className="absolute right-2 top-2 text-slate-500 hover:text-white" aria-label={showSecrets[field.key] ? 'Hide secret' : 'Show secret'}>{showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}</div></label>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-white/[0.06]">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">{integration.credentialsConfigured ? <><LockKeyhole className="h-3.5 w-3.5 text-emerald-400" /> Encrypted credentials stored</> : <><ShieldCheck className="h-3.5 w-3.5" /> No secret stored</>}{integration.lastHealthCheckAt ? <span>· checked {new Date(integration.lastHealthCheckAt).toLocaleString()}</span> : null}</div>
      {editable && <div className="flex gap-2"><button type="button" disabled={busy || !integration.credentialsConfigured} onClick={test} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"><TestTube2 className="h-3.5 w-3.5" /> Test</button><button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-40"><Save className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Save securely'}</button></div>}
    </div>
    {notice && <p className="mt-3 text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" />{notice}</p>}{error && <p className="mt-3 text-xs text-rose-300 flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" />{error}</p>}
  </div>;
}

export default function CRMChannelSettings({ crmUser }: { crmUser: any }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const editable = hasCRMCapability(crmUser, 'communication:write');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const response = await api.get('/crm/communication-hub/integrations', { headers: authHeaders() }); setIntegrations(response.data.data || []); } catch (err: any) { setError(err?.response?.data?.message || 'Could not load channel settings'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const byChannel = useMemo(() => new Map(integrations.map((item) => [item.channel, item])), [integrations]);
  const update = (next: Integration) => setIntegrations((current) => [...current.filter((item) => item.channel !== next.channel), next]);
  const groups = ['Messaging', 'Voice', 'Social'];

  return <section className="mt-8"><div className="flex items-start justify-between gap-4 mb-4"><div><h3 className="text-base font-semibold text-white">Communication & social channels</h3><p className="text-xs text-slate-500 mt-1 max-w-3xl">Configure tenant-owned credentials for the same email, WhatsApp, SMS, calling, and social channels available to the Team portal. Secrets are encrypted at rest and never returned to the UI.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>{!editable && <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">You have read-only access. Ask a CRM marketing head or administrator to change channel credentials.</div>}{error && <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-xs text-rose-200">{error}</div>}{loading ? <div className="h-32 rounded-2xl bg-white/[0.03] animate-pulse" /> : <div className="space-y-7">{groups.map((group) => <div key={group}><p className="text-[10px] uppercase tracking-[0.18em] text-violet-300/70 mb-3">{group}</p><div className="space-y-4">{CHANNELS.filter((item) => item.group === group).map((definition) => <ChannelCard key={definition.id} definition={definition} integration={byChannel.get(definition.id) || { channel: definition.id, provider: null, status: 'not_configured', accountRef: null, config: {}, credentialsConfigured: false, healthScore: null, healthMessage: null, lastHealthCheckAt: null }} editable={editable} onSaved={update} />)}</div></div>)}</div>}</section>;
}


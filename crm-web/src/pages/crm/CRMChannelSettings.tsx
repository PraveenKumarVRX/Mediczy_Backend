import { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND } from '@/config/brand';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import api from '@/utils/api';
import { hasCRMCapability } from './shared/crmRoles';
import { CRM_CHANNEL_DEFINITIONS, configurationErrors } from '@shared/crm-channel-schema.mjs';
import './crm-settings.css';

type Field = { key: string; label: string; type: string; secret: boolean; required: boolean };
type Definition = { id: string; label: string; group: string; managed?: boolean; providers: Record<string, { label: string; fields: Field[] }> };
export type Integration = { channel: string; provider: string | null; status: string; accountRef: string | null; config: Record<string, string>; credentialsConfigured: boolean; credentialFields?: string[] | null; healthMessage: string | null; lastHealthCheckAt: string | null; revision: string | null; id?: number };
const definitions = CRM_CHANNEL_DEFINITIONS as Definition[];
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` } });
const empty = (channel: string): Integration => ({ channel, provider: null, status: 'not_configured', accountRef: null, config: {}, credentialsConfigured: false, credentialFields: [], healthMessage: null, lastHealthCheckAt: null, revision: null });

function ChannelCard({ definition, integration, editable, stale, update, onDirty, onBusy, onAuthError }: { definition: Definition; integration: Integration; editable: boolean; stale: boolean; update: (value: Integration) => void; onDirty: (channel: string, dirty: boolean) => void; onBusy: (channel: string, busy: boolean) => void; onAuthError?: () => void }) {
  const [provider, setProvider] = useState(integration.provider || Object.keys(definition.providers)[0] || '');
  const [accountRef, setAccountRef] = useState(integration.accountRef || '');
  const [config, setConfig] = useState<Record<string, string>>(integration.config || {});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<'replace' | 'disable' | 'disconnect' | null>(null);
  const card = useRef<HTMLElement>(null);
  const fields = Object.prototype.hasOwnProperty.call(definition.providers, provider) ? definition.providers[provider].fields : [];
  const disabled = !editable || stale || !!busy;
  const changed = () => { setDirty(true); setNotice(''); setError(''); onDirty(definition.id, true); };
  const resetDirty = () => { setDirty(false); onDirty(definition.id, false); setSecrets({}); setRemoved([]); setShown({}); setFieldErrors({}); };
  const fail = (err: any) => { if (err?.response?.status === 401) onAuthError?.(); setError(err?.response?.data?.message || 'This request could not be completed. Your edits are retained.'); setFieldErrors(err?.response?.data?.fields || {}); };

  async function save(replaceProvider = false) {
    const errors = configurationErrors(definition.id, provider, config);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('Check the highlighted fields.'); return; }
    if (integration.provider && provider !== integration.provider && !replaceProvider) { setConfirm('replace'); return; }
    setBusy('save'); setError(''); setNotice('');
    try {
      const credentials = Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim()));
      const { data } = await api.put(`/crm/communication-hub/integrations/${definition.id}`, { provider, config, accountRef, credentials, removeCredentials: removed, expectedRevision: integration.revision, replaceProvider }, auth());
      update(data.data); resetDirty(); setNotice('Connection saved.');
    } catch (err) { fail(err); } finally { setBusy(''); }
  }
  async function verify() {
    if (dirty) return;
    setBusy('verify'); setError(''); setNotice('');
    try { const { data } = await api.post(`/crm/communication-hub/integrations/${definition.id}/test`, { expectedRevision: integration.revision }, auth()); update(data.data); setNotice(data.data.healthMessage); }
    catch (err) { fail(err); } finally { setBusy(''); }
  }
  async function action(kind: 'disable' | 'disconnect') {
    setConfirm(null); setBusy(kind); setError(''); setNotice('');
    try {
      const url = `/crm/communication-hub/integrations/${definition.id}`;
      const body = { expectedRevision: integration.revision, confirm: kind };
      const response = kind === 'disconnect' ? await api.delete(url, { ...auth(), data: body }) : await api.post(url + '/disable', body, auth());
      const next = kind === 'disconnect' ? empty(definition.id) : response.data.data;
      update(next); setProvider(next.provider || Object.keys(definition.providers)[0] || ''); setConfig(next.config || {}); setAccountRef(next.accountRef || ''); resetDirty();
      setNotice(kind === 'disconnect' ? 'Connection and its saved credentials were deleted.' : 'Channel disabled. Nothing is sent on it until it is saved again.');
    } catch (err) { fail(err); } finally { setBusy(''); }
  }
  useEffect(() => { onBusy(definition.id, !!busy); return () => onBusy(definition.id, false); }, [busy, definition.id, onBusy]);
  useEffect(() => { if (!dirty) { setProvider(integration.provider || Object.keys(definition.providers)[0] || ''); setConfig(integration.config || {}); setAccountRef(integration.accountRef || ''); } }, [integration]);
  useEffect(() => { if (error) card.current?.querySelector<HTMLElement>('[role=alert]')?.focus(); }, [error]);

  return <section ref={card} id={`channel-${definition.id}`} aria-labelledby={`heading-${definition.id}`} className="settings-card scroll-mt-20">
    <header className="flex flex-wrap items-center justify-between gap-3 mb-4"><h4 id={`heading-${definition.id}`} className="font-semibold">{definition.label}</h4><span className="settings-status">{definition.managed ? 'Managed separately' : integration.status === 'disabled' ? 'Disabled' : integration.id || integration.provider ? 'Saved' : 'Not connected'}</span></header>
    {definition.managed ? <><p>Exotel and LiveKit calling use the contact center’s approved provider bindings and readiness checks.</p><Link className="settings-link inline-flex min-h-[44px] items-center" to="/crm/contact-center">Open contact center</Link></> : <>
      <p className="mb-4 text-sm settings-muted">Saved credentials are encrypted. Email, SMS and WhatsApp send through the account saved here.</p>
      <form onSubmit={e => { e.preventDefault(); if (!disabled) void save(); }} noValidate>
        <fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-4">
          <label htmlFor={`${definition.id}-provider`}>Provider<select id={`${definition.id}-provider`} aria-label={`${definition.label} provider`} value={provider} onChange={e => { changed(); setProvider(e.target.value); setConfig({}); setSecrets({}); setRemoved([]); setShown({}); setFieldErrors({}); }}>
            {integration.provider && !Object.prototype.hasOwnProperty.call(definition.providers, integration.provider) && <option value={integration.provider}>Previous provider — choose a supported provider</option>}
            {Object.entries(definition.providers).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select></label>
          <label htmlFor={`${definition.id}-account`}>Account reference (optional)<input id={`${definition.id}-account`} aria-label={`${definition.label} account reference`} maxLength={240} value={accountRef} onChange={e => { changed(); setAccountRef(e.target.value); }} placeholder="Internal workspace reference" /></label>
          {fields.map(field => {
            const id = `${definition.id}-${field.key}`, saved = field.secret && integration.provider === provider && integration.credentialFields?.includes(field.key);
            return <div key={id} className="min-w-0"><label htmlFor={id}>{field.label}{field.required ? ' *' : ''}{saved && !removed.includes(field.key) ? <span className="ml-1 settings-saved">(saved)</span> : null}</label>
              <div className="relative"><input id={id} aria-label={`${definition.label} ${field.label}`} aria-invalid={!!fieldErrors[field.key]} aria-describedby={fieldErrors[field.key] ? id + '-error' : undefined}
                type={field.secret ? shown[field.key] ? 'text' : 'password' : field.type} required={field.required} maxLength={field.secret ? 16000 : 1000} min={field.type === 'number' ? 1 : undefined} max={field.type === 'number' ? 65535 : undefined}
                autoComplete={field.secret ? 'new-password' : 'off'} value={field.secret ? secrets[field.key] || '' : config[field.key] || ''} disabled={removed.includes(field.key)}
                className={field.secret ? 'settings-secret' : ''} placeholder={field.secret ? saved ? 'Leave blank to keep the saved value' : integration.provider === provider && integration.credentialsConfigured && integration.credentialFields == null ? 'Leave blank to keep legacy storage unchanged' : 'Type the value to save it' : undefined}
                onChange={e => { changed(); field.secret ? setSecrets(s => ({ ...s, [field.key]: e.target.value })) : setConfig(c => ({ ...c, [field.key]: e.target.value })); }} />
                {field.secret && <button className="settings-eye" type="button" aria-label={`${shown[field.key] ? 'Hide' : 'Show'} ${definition.label} ${field.label}`} aria-pressed={!!shown[field.key]} onClick={() => setShown(s => ({ ...s, [field.key]: !s[field.key] }))}>{shown[field.key] ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
              </div>
              {fieldErrors[field.key] && <p id={id + '-error'} className="settings-error mt-1 text-sm">{fieldErrors[field.key]}</p>}
              {field.secret && integration.provider === provider && (saved || integration.credentialsConfigured && integration.credentialFields == null) && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="settings-checkbox" checked={removed.includes(field.key)} onChange={e => { changed(); setRemoved(r => e.target.checked ? [...r, field.key] : r.filter(k => k !== field.key)); setSecrets(s => ({ ...s, [field.key]: '' })); }} />Remove saved {field.label} on save</label>}
            </div>;
          })}
        </fieldset>
        {dirty && <p className="mt-4 text-sm" role="status">Unsaved changes. Save or discard them before refreshing or testing.</p>}
        {integration.credentialsConfigured && integration.credentialFields == null && <p className="mt-4 text-sm settings-muted">Legacy credentials are stored. Individual saved fields will be identified after the next save.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editable && <><button type="submit" className="settings-button settings-primary" disabled={disabled}>{busy === 'save' ? 'Saving…' : 'Save connection'}</button>
            <button type="button" className="settings-button" disabled={disabled || dirty || !integration.credentialsConfigured || integration.status === 'disabled'} onClick={verify}>{busy === 'verify' ? 'Testing…' : 'Test connection'}</button></>}
          {dirty && <button type="button" className="settings-button" disabled={!!busy} onClick={() => { setProvider(integration.provider || Object.keys(definition.providers)[0]); setConfig(integration.config || {}); setAccountRef(integration.accountRef || ''); resetDirty(); setError(''); setNotice('Edits discarded.'); }}>Discard edits</button>}
        </div>
      </form>
    </>}
    {(integration.provider || integration.id) && editable && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-600 pt-4">
      <button className="settings-button" disabled={disabled || integration.status === 'disabled'} onClick={() => setConfirm('disable')}>Disable channel</button>
      <button className="settings-button settings-danger" disabled={disabled} onClick={() => setConfirm('disconnect')}>Disconnect</button>
    </div>}
    {integration.healthMessage && <p className="mt-4 text-sm settings-muted">{integration.healthMessage}</p>}
    {integration.lastHealthCheckAt && <p className="mt-2 text-sm settings-muted">Storage checked: {new Date(integration.lastHealthCheckAt).toLocaleString()}</p>}
    {notice && <p role="status" className="mt-4 settings-saved">{notice}</p>}
    {error && <p role="alert" tabIndex={-1} className="mt-4 settings-error">{error}</p>}
    {confirm && <div role="alertdialog" aria-modal="false" aria-labelledby={`${definition.id}-confirm`} className="mt-4 rounded-lg border border-amber-300 p-4">
      <p id={`${definition.id}-confirm`}>{confirm === 'replace' ? 'Switch to a different provider? The current provider’s saved credentials will be deleted when you save.' : confirm === 'disconnect' ? 'Disconnect this channel and delete its saved credentials? Messages stop sending on it immediately.' : 'Disable this channel? Messages stop sending on it until it is saved again.'}{dirty && confirm !== 'replace' ? ' Unsaved edits will be discarded.' : ''}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button className="settings-button settings-danger" disabled={disabled} autoFocus onClick={() => { const kind = confirm; setConfirm(null); if (kind === 'replace') void save(true); else void action(kind); }}>Confirm {confirm}</button><button className="settings-button" onClick={() => setConfirm(null)}>Cancel</button></div>
    </div>}
  </section>;
}

export default function CRMChannelSettings({ crmUser, profileLoading = false, profileError = '', onAuthError }: { crmUser: any; profileLoading?: boolean; profileError?: string; onAuthError?: () => void }) {
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [operations, setOperations] = useState<Record<string, boolean>>({});
  const operationRef = useRef(false);
  const anyBusy = Object.values(operations).some(Boolean); operationRef.current = anyBusy;
  const onBusy = useCallback((channel: string, value: boolean) => setOperations(d => d[channel] === value ? d : ({ ...d, [channel]: value })), []);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const editable = !profileLoading && !profileError && hasCRMCapability(crmUser, 'communication:configure');
  const anyDirty = Object.values(dirty).some(Boolean); dirtyRef.current = anyDirty;
  const onDirty = useCallback((channel: string, value: boolean) => setDirty(d => ({ ...d, [channel]: value })), []);
  const load = useCallback(async () => {
    if (dirtyRef.current || busyRef.current || operationRef.current) return;
    busyRef.current = true; setLoading(true); setError('');
    try {
      const { data } = await api.get('/crm/communication-hub/integrations', auth());
      if (!data?.success || !Array.isArray(data.data) || definitions.some(d => !data.data.some((i: Integration) => i.channel === d.id))) throw new Error('Incomplete settings response');
      setIntegrations(data.data);
    } catch (err: any) { if (err?.response?.status === 401) onAuthError?.(); setError('Channel connections could not be loaded. Retry before making changes.'); }
    finally { busyRef.current = false; setLoading(false); }
  }, [onAuthError]);
  useEffect(() => { if (!profileLoading && !profileError) void load(); }, [load, profileLoading, profileError]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigation = (event: MouseEvent) => { const a = (event.target as HTMLElement)?.closest('a'); if (dirtyRef.current && a?.href && a.origin === location.origin && a.pathname !== location.pathname && !window.confirm('Discard unsaved channel edits and leave settings?')) { event.preventDefault(); event.stopPropagation(); } };
    const navigationApi = (window as any).navigation;
    const navigate = (event: any) => { const target = new URL(event.destination.url); if (dirtyRef.current && event.cancelable && target.pathname !== location.pathname && target.pathname !== '/crm/login' && !window.confirm('Discard unsaved channel edits and leave settings?')) event.preventDefault(); };
    window.addEventListener('beforeunload', unload);
    if (navigationApi) navigationApi.addEventListener('navigate', navigate); else document.addEventListener('click', navigation, true);
    return () => { window.removeEventListener('beforeunload', unload); navigationApi?.removeEventListener('navigate', navigate); document.removeEventListener('click', navigation, true); };
  }, []);
  const update = (next: Integration) => setIntegrations(current => current?.map(row => row.channel === next.channel ? next : row) || null);
  return <section className="mt-6" aria-labelledby="channel-inventory-heading">
    <header className="flex flex-wrap justify-between items-start gap-4"><div><h3 id="channel-inventory-heading" className="text-lg font-semibold">Channel connections</h3><p className="settings-muted mt-2 max-w-3xl text-sm">Connect each channel to {BRAND.name}’s own provider account. Email, SMS and WhatsApp send through the account saved here; calling is set up on the Calls page. Saved credentials are encrypted and never shown again.</p></div>
      <button className="settings-button" onClick={load} disabled={loading || anyBusy || anyDirty || !!profileError || profileLoading}><RefreshCw size={16} aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh'}</button>
    </header>
    {!editable && !profileLoading && !profileError && <p className="mt-4 settings-muted">Read-only access. A Business Head, Marketing Head or administrator can manage these connections.</p>}
    {error && <div role="alert" className="settings-card settings-error mt-4"><p>{error}{integrations ? ' Previously loaded records may be out of date.' : ''}</p><button className="settings-button mt-3" disabled={loading || anyBusy || anyDirty} onClick={load}>Retry</button></div>}
    {anyDirty && <p className="mt-3 text-sm settings-muted">Refresh is paused while edits are unsaved.</p>}
    {loading && <p role="status" className="mt-4 settings-muted">Loading channel connections…</p>}
    {integrations && <><nav aria-label="Channel navigation" className="mt-5 flex flex-wrap gap-2">{definitions.map(d => <a key={d.id} href={`#channel-${d.id}`} className="settings-button">{d.label}</a>)}</nav>
      {['Messaging', 'Voice', 'Social'].map(group => <div key={group} className="mt-6 space-y-4"><h3 className="font-semibold">{group}</h3>{definitions.filter(d => d.group === group).map(d => <ChannelCard key={d.id} definition={d} integration={integrations.find(i => i.channel === d.id)!} editable={editable} stale={!!error || loading} update={update} onDirty={onDirty} onBusy={onBusy} onAuthError={onAuthError} />)}</div>)}
    </>}
  </section>;
}

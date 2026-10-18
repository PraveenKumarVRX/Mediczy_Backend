import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/utils/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Profile = { label: string; tenantTypes: string[]; required: string[]; modules: [string, string][]; metrics: string[] };
type Tenant = { tenant_uid: string; name: string; type: string };
type Installation = { id: string; tenant_uid: string; tenant_name?: string; name: string; profile: string; modules: string[];
  domain: string | null; aws_account_id: string | null; region: string | null; version: number; connector_enrolled: boolean;
  last_received_at: string | null; last_observed_at: string | null; release: string | null; freshness: string };
type Detail = { installation: Installation; dailyMetrics: { day: string; observed_at: string; metrics: Record<string, number> }[];
  audit: { action: string; actor_ref: string; created_at: string }[] };
type Form = { tenantUid: string; name: string; profile: string; modules: string[]; domain: string; awsAccountId: string; region: string; version?: number };
const base = '/admin/dedicated-installations';
const empty = (): Form => ({ tenantUid: '', name: '', profile: 'crm', modules: ['crm.core'], domain: '', awsAccountId: '', region: '' });
const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never received';
const message = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to complete the request. Please retry.';
const fieldClass = 'w-full border rounded-md p-2 bg-background text-foreground';

export default function AdminDedicatedInstallations() {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [rows, setRows] = useState<Installation[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [credentialAction, setCredentialAction] = useState<'rotate' | 'revoke' | null>(null);
  const [credentialTarget, setCredentialTarget] = useState<Installation | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    Promise.all([api.get(`${base}/catalog`), api.get(base, { params: { limit: 25, offset } })])
      .then(([catalog, list]) => { if (current) { setProfiles(catalog.data.profiles); setRows(list.data.installations); } })
      .catch(e => { if (current) { setRows([]); setError(message(e)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [offset, refresh]);

  useEffect(() => {
    if (!open || editing) return;
    let current = true;
    const timer = setTimeout(() => {
      api.get(`${base}/tenant-options`, { params: { search } })
        .then(r => { if (current) setTenants(r.data.tenants); })
        .catch(e => { if (current) { setTenants([]); setError(message(e)); } });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [open, search, editing]);

  const showDetail = useCallback(async (id: string) => {
    setBusy(true); setError(''); setDetail(null);
    try { const r = await api.get(`${base}/${id}`); setDetail(r.data); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }, []);

  function create(profile: string, name = '') {
    setEditing(null); setForm({ ...empty(), name, profile, modules: profiles[profile]?.required || [] });
    setSearch(''); setTenants([]); setError(''); setNotice(''); setOpen(true);
  }
  function edit(row: Installation) {
    setEditing(row.id); setError(''); setForm({ tenantUid: row.tenant_uid, name: row.name, profile: row.profile,
      modules: row.modules, domain: row.domain || '', awsAccountId: row.aws_account_id || '', region: row.region || '', version: row.version });
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = editing ? await api.put(`${base}/${editing}`, form) : await api.post(base, form);
      setOpen(false); setNotice('Installation configuration saved. Remote deployment and module enforcement are separate steps.');
      setRefresh(n => n + 1); await showDetail(result.data.installation.id);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function changeCredential() {
    if (!credentialTarget || !credentialAction) return;
    setBusy(true); setError('');
    try {
      const r = await api.post(`${base}/${credentialTarget.id}/connector/${credentialAction}`, { version: credentialTarget.version });
      setToken(r.data.token || ''); setCredentialAction(null); setCredentialTarget(null);
      setRefresh(n => n + 1); setNotice('Connector credential updated. This does not change AWS access or billing.');
      await showDetail(r.data.installation.id);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  const currentProfile = profiles[form.profile];

  return <AdminLayout><div className="container mx-auto py-8 space-y-6">
    <div className="flex flex-wrap justify-between items-start gap-4">
      <div><h1 className="text-3xl font-bold">Dedicated installations</h1>
        <p className="text-muted-foreground mt-2">Manage each organization's module scope and reporting connection.</p>
        <Link to="/admin/tenants" className="underline text-sm">Manage organizations</Link></div>
      <Button onClick={() => setRefresh(n => n + 1)} disabled={loading || busy}>Refresh</Button>
    </div>
    {error && <p role="alert" className="rounded border border-red-400 p-3 text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded border p-3">{notice}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Hospital CRM</CardTitle></CardHeader><CardContent className="space-y-3">
        <p>Medstar can use CRM without enabling the full hospital system.</p>
        <Button disabled={!profiles.crm || busy} onClick={() => create('crm', 'Medstar CRM')}>Configure CRM installation</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Lab / LIS</CardTitle></CardHeader><CardContent className="space-y-3">
        <p>Radolabs can use lab operations with separately selected collection, quality and package modules.</p>
        <Button disabled={!profiles.lab || busy} onClick={() => create('lab', 'Radolabs LIS')}>Configure lab installation</Button>
      </CardContent></Card>
    </div>
    <p className="text-sm text-muted-foreground">Registration does not provision AWS resources or activate a subscription. Module scopes are requested configuration. Payment linkage and remote enforcement are not connected yet.</p>
    {loading ? <p role="status">Loading installations…</p> : rows.length === 0 ? <p>No installations on this page. Register an installation for an existing organization.</p> :
      <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm"><caption className="sr-only">Registered dedicated installations</caption>
        <thead><tr className="border-b text-left">{['Installation', 'Organization', 'Scope', 'Connector', 'Reported health', 'Last observed', 'Actions'].map(x => <th key={x} className="p-3" scope="col">{x}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-b">
          <td className="p-3 font-medium">{row.name}<div className="font-normal text-muted-foreground">{row.domain || 'Domain not supplied'}</div></td>
          <td className="p-3">{row.tenant_name}<div>{row.tenant_uid}</div></td>
          <td className="p-3">{profiles[row.profile]?.label} · {row.modules.length} requested</td>
          <td className="p-3">{row.connector_enrolled ? 'Credential issued' : 'Not enrolled'}</td>
          <td className="p-3">{row.freshness.replaceAll('_', ' ')}</td><td className="p-3">{time(row.last_observed_at)}</td>
          <td className="p-3"><Button variant="outline" disabled={busy} onClick={() => showDetail(row.id)} aria-label={`View ${row.name}`}>View</Button></td>
        </tr>)}</tbody></table></div>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(n => Math.max(0, n - 25))}>Previous</Button>
      <span>Page {offset / 25 + 1}</span><Button variant="outline" disabled={rows.length < 25 || loading} onClick={() => setOffset(n => n + 25)}>Next</Button></div>

    {detail && <Card><CardHeader><CardTitle>{detail.installation.name}</CardTitle></CardHeader><CardContent className="space-y-5">
      <dl className="grid sm:grid-cols-2 gap-3 text-sm">
        <div><dt>Installation ID</dt><dd className="break-all">{detail.installation.id}</dd></div>
        <div><dt>Last received / last observed</dt><dd>{time(detail.installation.last_received_at)} / {time(detail.installation.last_observed_at)}</dd></div>
        <div><dt>AWS account / region</dt><dd>{detail.installation.aws_account_id || 'Not supplied'} / {detail.installation.region || 'Not supplied'}</dd></div>
        <div><dt>Reported release</dt><dd>{detail.installation.release || 'Not reported'}</dd></div>
        <div><dt>Requested modules</dt><dd>{detail.installation.modules.join(', ')}</dd></div>
        <div><dt>Subscription and payments</dt><dd>Not linked. No payment status has been inferred.</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => edit(detail.installation)}>Edit configuration</Button>
        <Button variant="outline" disabled={busy} onClick={() => { setCredentialTarget(detail.installation); setCredentialAction('rotate'); }}>Issue / rotate connector credential</Button>
        <Button variant="outline" disabled={busy || !detail.installation.connector_enrolled} onClick={() => { setCredentialTarget(detail.installation); setCredentialAction('revoke'); }}>Revoke connector</Button></div>
      <h2 className="font-semibold">Reported daily analytics</h2>
      <p className="text-sm text-muted-foreground">Latest available UTC-day snapshots, up to 31 days. Missing values are unknown. These reported totals are not verified billable usage.</p>
      {detail.dailyMetrics.length === 0 ? <p>No analytics received.</p> : <div className="overflow-auto"><table className="w-full text-sm"><caption className="sr-only">Daily reported metrics</caption>
        <thead><tr><th className="text-left p-2">UTC day</th>{profiles[detail.installation.profile]?.metrics.map(m => <th className="p-2 text-right" key={m}>{m.replaceAll('_', ' ')}</th>)}</tr></thead>
        <tbody>{detail.dailyMetrics.map(d => <tr key={d.day}><th scope="row" className="p-2 text-left">{d.day}</th>{profiles[detail.installation.profile]?.metrics.map(m => <td className="p-2 text-right" key={m}>{d.metrics[m] === undefined ? '—' : d.metrics[m].toLocaleString()}</td>)}</tr>)}</tbody>
      </table></div>}
      <h2 className="font-semibold">Recent administrative activity</h2>
      <ul className="text-sm space-y-2">{detail.audit.map((a, i) => <li key={i}>{time(a.created_at)} · {a.action.replaceAll('_', ' ')} · administrator {a.actor_ref}</li>)}</ul>
    </CardContent></Card>}

    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}><DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl"><DialogHeader>
      <DialogTitle>{editing ? 'Edit installation' : 'Register installation'}</DialogTitle><DialogDescription>Select an existing organization and its requested product scope. Domain and AWS fields are inventory only; ownership is not verified here.</DialogDescription>
    </DialogHeader><form onSubmit={save} className="space-y-4">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <label className="block">Installation name<Input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block">Product profile<select className={fieldClass} disabled={!!editing} value={form.profile} onChange={e => setForm({ ...form, profile: e.target.value, tenantUid: '', modules: profiles[e.target.value].required })}>
        {Object.entries(profiles).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}</select></label>
      {editing ? <p>Organization UID: {form.tenantUid} (fixed)</p> : <>
        <label className="block">Search organizations<Input value={search} onChange={e => { setSearch(e.target.value); setForm({ ...form, tenantUid: '' }); }} placeholder="Organization name or tenant UID" /></label>
        <label className="block">Organization<select required className={fieldClass} value={form.tenantUid} onChange={e => setForm({ ...form, tenantUid: e.target.value })}>
          <option value="">Select an organization</option>{tenants.filter(t => currentProfile?.tenantTypes.includes(t.type)).map(t => <option key={t.tenant_uid} value={t.tenant_uid}>{t.name} ({t.tenant_uid})</option>)}</select></label>
        <p className="text-sm">Only compatible organizations are listed. Create missing organizations through Tenant Management first.</p>
      </>}
      <fieldset className="space-y-2"><legend className="font-medium">Requested modules</legend>{currentProfile?.modules.map(([key, label]) => <label key={key} className="flex gap-2 items-start">
        <input type="checkbox" checked={form.modules.includes(key)} disabled={currentProfile.required.includes(key)} onChange={e => setForm({ ...form, modules: e.target.checked ? [...form.modules, key] : form.modules.filter(m => m !== key) })} />{label}{currentProfile.required.includes(key) ? ' (required)' : ''}
      </label>)}</fieldset>
      <label className="block">Domain hostname (optional)<Input maxLength={253} value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="crm.hospital.example" /></label>
      <div className="grid sm:grid-cols-2 gap-3"><label>AWS account ID (optional)<Input maxLength={12} pattern="[0-9]{12}" value={form.awsAccountId} onChange={e => setForm({ ...form, awsAccountId: e.target.value })} /></label>
        <label>AWS region (optional)<Input maxLength={40} value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="ap-south-1" /></label></div>
      <Button type="submit" disabled={busy || !form.tenantUid}>{busy ? 'Saving…' : 'Save configuration'}</Button>
    </form></DialogContent></Dialog>

    <Dialog open={!!credentialAction} onOpenChange={v => { if (!v && !busy) { setCredentialAction(null); setCredentialTarget(null); } }}><DialogContent><DialogHeader>
      <DialogTitle>{credentialAction === 'rotate' ? 'Issue new connector credential' : 'Revoke connector credential'}</DialogTitle>
      <DialogDescription>This immediately invalidates any previous connector credential for {credentialTarget?.name}. Reporting will stop until the connector is reconfigured. AWS access and the hospital application are unaffected.</DialogDescription>
    </DialogHeader>{error && <p role="alert">{error}</p>}<Button disabled={busy} onClick={changeCredential}>Confirm {credentialAction}</Button></DialogContent></Dialog>
    <Dialog open={!!token} onOpenChange={v => { if (!v) setToken(''); }}><DialogContent><DialogHeader><DialogTitle>Save connector credential</DialogTitle>
      <DialogDescription>This credential is shown once. Save it in the installation's secret store. It authorizes aggregate reporting only; do not place it in frontend code.</DialogDescription></DialogHeader>
      <textarea aria-label="New connector credential" readOnly value={token} className={`${fieldClass} font-mono break-all`} /><Button onClick={() => setToken('')}>I have saved the credential</Button>
    </DialogContent></Dialog>
  </div></AdminLayout>;
}

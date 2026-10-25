import { useEffect, useState } from 'react';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Product = 'patient' | 'phlebo' | 'crm' | 'smart-force';
type App = { product: Product; name: string; appId: string; registration: 'disabled' | 'open'; ownerUid?: string };
type Configuration = { enabled: boolean; origin: string; apps: App[]; revision: number; deploymentId?: string };
const products: { id: Product; label: string }[] = [{ id: 'patient', label: 'Patient' }, { id: 'phlebo', label: 'Phlebo' }, { id: 'crm', label: 'CRM' }, { id: 'smart-force', label: 'Smart-Force' }];

export default function TenantMobileAppsPanel({ tenantId, tenantName, token }: { tenantId: number; tenantName: string; token: string | null }) {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deployment, setDeployment] = useState('');
  const endpoint = `/superadmin/tenants/tenants/${tenantId}/mobile-apps`;
  useEffect(() => {
    const controller = new AbortController();
    setConfig(null); setBusy(true); setError(''); setMessage(''); setDeployment('');
    api.get(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setConfig(data.configuration || { enabled: false, origin: '', apps: [], revision: 0 });
    }).catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.message || 'Unable to load app configuration.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [endpoint, token]);
  function toggle(product: Product, checked: boolean) {
    if (!config) return;
    setConfig({ ...config, apps: checked ? [...config.apps, { product, name: `${tenantName} ${products.find(p => p.id === product)?.label}`, appId: '', registration: 'disabled' }] : config.apps.filter(app => app.product !== product) });
    setMessage('');
  }
  function change(product: Product, values: Partial<App>) {
    if (config) setConfig({ ...config, apps: config.apps.map(app => app.product === product ? { ...app, ...values } : app) });
    setMessage('');
  }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.put(endpoint, config, { headers: { Authorization: `Bearer ${token}` } });
      setConfig(data.configuration); setMessage('App configuration saved. Dedicated servers need the updated deployment configuration applied before it takes effect.'); setDeployment('');
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to save app configuration.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-4" aria-label="Tenant apps">
    <h3 className="font-semibold">White-labelled apps</h3>
    <p className="text-sm text-gray-600">Users enter this tenant URL before signing up or logging in. Choose the apps this organisation uses.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {busy && <p role="status">Loading…</p>}
    {config && <fieldset disabled={busy} className="space-y-3">
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={e => { setConfig({ ...config, enabled: e.target.checked }); setMessage(''); }} />Enable tenant app connections</label>
      <label className="block text-sm">Tenant server URL<Input type="url" placeholder="https://your-organisation.example" value={config.origin} onChange={e => { setConfig({ ...config, origin: e.target.value }); setMessage(''); }} /></label>
      {products.map(product => {
        const app = config.apps.find(a => a.product === product.id);
        return <div key={product.id} className="rounded border p-3 space-y-2">
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!app} onChange={e => toggle(product.id, e.target.checked)} />{product.label}</label>
          {app && <>
            <label className="block text-sm">App name<Input value={app.name} onChange={e => change(product.id, { name: e.target.value })} /></label>
            <label className="block text-sm">Package / bundle ID<Input placeholder="com.organisation.product" value={app.appId} onChange={e => change(product.id, { appId: e.target.value })} /></label>
            {product.id === 'phlebo' && <label className="block text-sm">Collection owner UID<Input placeholder="6-character lab/hospital UID" value={app.ownerUid || ''} onChange={e => change(product.id, { ownerUid: e.target.value.toUpperCase() })} /></label>}
            {product.id === 'patient' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={app.registration === 'open'} onChange={e => change(product.id, { registration: e.target.checked ? 'open' : 'disabled' })} />Allow patient self-registration</label>}
          </>}
        </div>;
      })}
      <Button onClick={save} disabled={!config.origin || !config.apps.length}>Save app configuration</Button>
      {config.deploymentId && <Button variant="outline" onClick={async () => {
        setBusy(true); setError('');
        try { const { data } = await api.get(`${endpoint}/deployment`, { headers: { Authorization: `Bearer ${token}` } }); setDeployment(JSON.stringify(data.environment, null, 2)); }
        catch (err: any) { setError(err.response?.data?.message || 'Unable to export deployment configuration.'); }
        finally { setBusy(false); }
      }}>Export deployment configuration</Button>}
      {deployment && <textarea aria-label="Deployment environment configuration" readOnly value={deployment} className="w-full min-h-40 rounded border p-2 text-xs" />}
      <p className="text-xs text-gray-500">Saving configures the backend. App signing, builds and store distribution are separate release steps.</p>
    </fieldset>}
  </section>;
}

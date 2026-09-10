import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Building2, RefreshCw, ShieldCheck, Star, Timer, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CRMLayout } from './CRMModulePages';
import { NotConfiguredBanner } from './shared/CRMWidgets';
import { hasCRMCapability } from './shared/crmRoles';
import api from '@/utils/api';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

function getCrmUser() {
  try { return JSON.parse(localStorage.getItem('crmUserData') || 'null'); } catch { return null; }
}

function isAllZero(business: any) {
  if (!business) return true;
  const leadCount = (business.leads || []).reduce((sum: number, row: any) => sum + Number(row.count || 0), 0);
  const revenue = Number(business?.revenue?.net_revenue || 0);
  const reviews = Number(business?.reviews?.reviews || 0);
  const feedback = Number(business?.feedback?.responses || 0);
  return leadCount === 0 && revenue === 0 && reviews === 0 && feedback === 0;
}

export default function HospitalCRMWorldclassPage() {
  const crmUser = getCrmUser();
  const canSeeBusinessHead = hasCRMCapability(crmUser, 'dashboard:business-head');
  const canSeeMarketingHead = hasCRMCapability(crmUser, 'dashboard:marketing-head');

  const [business, setBusiness] = useState<any>(null);
  const [marketing, setMarketing] = useState<any>(null);
  const [sla, setSla] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [businessResult, marketingResult, slaResult] = await Promise.allSettled([
      canSeeBusinessHead ? api.get('/crm/worldclass/dashboards/business-head', { headers: headers() }) : Promise.resolve(null),
      canSeeMarketingHead ? api.get('/crm/worldclass/dashboards/marketing-head', { headers: headers() }) : Promise.resolve(null),
      api.get('/crm/worldclass/sla/queue', { headers: headers(), params: { limit: 20 } }),
    ]);
    if (businessResult.status === 'fulfilled') setBusiness(businessResult.value?.data?.data || null);
    if (marketingResult.status === 'fulfilled') setMarketing(marketingResult.value?.data?.data || null);
    if (slaResult.status === 'fulfilled') setSla(slaResult.value?.data?.data || []);
    else setError(slaResult.reason?.response?.data?.message || 'Some world-class CRM domains are unavailable.');
    setLoading(false);
  }, [canSeeBusinessHead, canSeeMarketingHead]);

  useEffect(() => { load(); }, [load]);

  const revenue = Number(business?.revenue?.net_revenue || 0);
  const spend = Number(business?.spend?.spend || 0);
  const leads = (business?.leads || []).reduce((sum: number, row: any) => sum + Number(row.count || 0), 0);
  const campaigns = marketing?.campaigns || [];
  const businessConfigured = !isAllZero(business);

  return (
    <CRMLayout title="Command Center">
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Business, marketing, and operations</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Command Center</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">Executive views for business heads and marketing heads — acquisition, patient journey, revenue, SLA, and reputation in one place.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
        </div>

        {error && <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{error}</div>}

        {canSeeBusinessHead && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Business Head view</h3>
            {!loading && !businessConfigured && (
              <NotConfiguredBanner
                title="No revenue data flowing yet for this tenant"
                hint="Connect appointment and billing sources, or ask an admin to run the tenant backfill, before using these numbers for decisions."
                ctaLabel="Connect data sources"
                ctaTo="/crm/hospital/digital"
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: 'Leads', value: leads.toLocaleString('en-IN'), icon: TrendingUp },
                { label: 'Revenue', value: `₹${revenue.toLocaleString('en-IN')}`, icon: BarChart3 },
                { label: 'Marketing spend', value: `₹${spend.toLocaleString('en-IN')}`, icon: Building2 },
                { label: 'NPS', value: business?.feedback?.nps == null ? '—' : `${Number(business.feedback.nps).toFixed(0)}`, icon: Star },
                { label: 'SLA at risk', value: sla.length.toLocaleString('en-IN'), icon: Timer },
              ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4"><Icon className="h-5 w-5 text-cyan-300" /><p className="mt-4 text-xl font-bold text-white">{value}</p><p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p></div>)}
            </div>

            <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-300" /><div><h3 className="text-base font-semibold text-white">Patient journey performance</h3><p className="text-xs text-slate-500">Lead, appointment, visit, revenue, and feedback facts</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[...(business?.leads || [])].map((row: any) => <div key={row.lifecycle_stage} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-3"><span className="text-sm capitalize text-slate-300">{String(row.lifecycle_stage).replaceAll('_', ' ')}</span><span className="font-semibold text-white">{row.count}</span></div>)}
                {!loading && !(business?.leads || []).length && <p className="text-sm text-slate-500">No journey data yet.</p>}
              </div>
            </section>

            <section className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
              <div className="mb-4 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-300" /><div><h3 className="text-base font-semibold text-white">SLA queue</h3><p className="text-xs text-slate-500">Oldest open response and follow-up obligations</p></div></div>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="pb-3">Patient</th><th className="pb-3">Type</th><th className="pb-3">Due</th><th className="pb-3">Status</th></tr></thead><tbody className="divide-y divide-white/[0.05] text-slate-300">{sla.map((row) => <tr key={row.id}><td className="py-3 text-white">{row.display_name || `Lead ${row.lead_id}`}</td><td className="py-3">{row.sla_type}</td><td className="py-3">{row.due_at ? new Date(row.due_at).toLocaleString() : '—'}</td><td className="py-3 text-amber-200">{row.status}</td></tr>)}{!loading && !sla.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">No open SLA items.</td></tr>}</tbody></table></div>
            </section>
          </section>
        )}

        {canSeeMarketingHead && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Marketing Head view</h3>
            {!loading && !campaigns.length && (
              <NotConfiguredBanner
                title="No unified campaigns yet"
                hint="Register a channel on the Digital Growth Hub so campaign spend and ROAS can appear here."
                ctaLabel="Go to Digital Growth Hub"
                ctaTo="/crm/hospital/digital"
              />
            )}
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center gap-3"><BarChart3 className="h-5 w-5 text-violet-300" /><div><h3 className="text-base font-semibold text-white">Campaign performance</h3><p className="text-xs text-slate-500">Spend, leads, appointments, revenue, and ROAS</p></div></div>
              <div className="space-y-2">
                {campaigns.slice(0, 6).map((campaign: any) => <div key={campaign.id} className="rounded-lg border border-white/[0.06] px-3 py-3"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium text-white">{campaign.name}</span><span className="text-xs text-emerald-300">{campaign.roas == null ? '—' : `${Number(campaign.roas).toFixed(2)}x`}</span></div><div className="mt-1 flex gap-4 text-[11px] text-slate-500"><span>{campaign.leads} leads</span><span>{campaign.appointments} appointments</span><span>₹{Number(campaign.revenue || 0).toLocaleString('en-IN')}</span></div></div>)}
                {!loading && !campaigns.length && <p className="text-sm text-slate-500">No unified campaigns yet.</p>}
              </div>
            </section>
          </section>
        )}
      </div>
    </CRMLayout>
  );
}

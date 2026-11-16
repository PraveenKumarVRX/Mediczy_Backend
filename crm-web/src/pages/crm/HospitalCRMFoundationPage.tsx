import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, GitMerge, IndianRupee, Plus, RefreshCw, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CRMLayout } from './CRMModulePages';
import { FunnelBar, NotConfiguredBanner } from './shared/CRMWidgets';
import { hasCRMCapability } from './shared/crmRoles';
import api from '@/utils/api';

type FunnelRow = {
  lifecycle_stage: string;
  lead_count: number;
  assigned_count: number;
  responded_count: number;
  average_score: string | number | null;
};

type DuplicateGroup = {
  key_type: string;
  normalized_value: string;
  person_count: number;
  people: Array<{ person_id: number; name: string | null; lead_id: number | null; lifecycle_stage: string | null }>;
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}`,
});

const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());

function getCrmUser() {
  try { return JSON.parse(localStorage.getItem('crmUserData') || 'null'); } catch { return null; }
}

// A row from either /crm/worldclass dashboard block may carry an explicit
// count, or just be one row per event — sum whichever is present.
function sumRows(rows: any[] | undefined) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((total, row) => total + Number(row?.count ?? 1), 0);
}

export default function HospitalCRMFoundationPage() {
  const crmUser = getCrmUser();
  const canSeeRevenue = hasCRMCapability(crmUser, 'dashboard:business-head');

  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [funnelAnalytics, setFunnelAnalytics] = useState<any>(null);
  const [businessHead, setBusinessHead] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', serviceLine: '', sourceDetail: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [funnelResponse, duplicateResponse, analyticsResult, businessHeadResult] = await Promise.allSettled([
        api.get('/crm/v2/funnel', { headers: authHeaders() }),
        api.get('/crm/v2/duplicates', { headers: authHeaders(), params: { limit: 25 } }),
        api.get('/crm/funnel-analytics', { headers: authHeaders() }),
        canSeeRevenue ? api.get('/crm/worldclass/dashboards/business-head', { headers: authHeaders() }) : Promise.resolve(null),
      ]);
      if (funnelResponse.status === 'fulfilled') setFunnel(funnelResponse.value.data?.data || []);
      if (duplicateResponse.status === 'fulfilled') setDuplicates(duplicateResponse.value.data?.data || []);
      if (analyticsResult.status === 'fulfilled') setFunnelAnalytics(analyticsResult.value?.data?.data || null);
      if (businessHeadResult.status === 'fulfilled') setBusinessHead(businessHeadResult.value?.data?.data || null);
      if (funnelResponse.status === 'rejected' && analyticsResult.status === 'rejected') {
        setError('Hospital CRM foundation is not available yet. Run the CRM migration first.');
      }
    } finally {
      setLoading(false);
    }
  }, [canSeeRevenue]);

  useEffect(() => { load(); }, [load]);

  // Prefer the event-backed v2 funnel; fall back to funnel-analytics' lead
  // status counts (which stay populated even before v2 funnel events exist),
  // so this page never looks broken just because the newer table is empty.
  const acquisitionStages = useMemo(() => {
    if (funnel.length) {
      return funnel.map((row) => ({ label: titleCase(row.lifecycle_stage), value: Number(row.lead_count || 0) }));
    }
    const leads = funnelAnalytics?.leads;
    if (leads) {
      return [
        { label: 'New', value: Number(leads.new_leads || 0) },
        { label: 'Contacted', value: Number(leads.contacted || 0) },
        { label: 'Qualified', value: Number(leads.qualified || 0) },
        { label: 'Converted', value: Number(leads.converted || 0) },
      ];
    }
    return [];
  }, [funnel, funnelAnalytics]);

  const tailStages = useMemo(() => {
    if (!businessHead) return [];
    return [
      { label: 'Appointment Booked', value: sumRows(businessHead.appointments) },
      { label: 'Visited', value: sumRows(businessHead.visits) },
    ];
  }, [businessHead]);

  const combinedStages = [...acquisitionStages, ...tailStages];
  const revenue = Number(businessHead?.revenue?.net_revenue || 0);

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name && !form.email && !form.phone) return;
    setSaving(true);
    try {
      await api.post('/crm/v2/leads', form, { headers: authHeaders() });
      setForm({ name: '', email: '', phone: '', serviceLine: '', sourceDetail: '' });
      await load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to create lead');
    } finally {
      setSaving(false);
    }
  };

  const totalLeads = funnel.reduce((total, row) => total + Number(row.lead_count || 0), 0);
  const assignedLeads = funnel.reduce((total, row) => total + Number(row.assigned_count || 0), 0);
  const respondedLeads = funnel.reduce((total, row) => total + Number(row.responded_count || 0), 0);

  return (
    <CRMLayout title="Patient journey">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Hospital growth operations</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Identity-safe patient acquisition</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Tenant-scoped leads, funnel events, source attribution, and duplicate visibility in one operating view.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {error && <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Tracked leads', value: totalLeads, icon: Target },
            { label: 'Assigned leads', value: assignedLeads, icon: Users },
            { label: 'Responded leads', value: respondedLeads, icon: GitMerge },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <Icon className="h-5 w-5 text-violet-300" />
              <p className="mt-4 text-2xl font-bold text-white">{value.toLocaleString('en-IN')}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Patient acquisition funnel</h3>
              <p className="text-xs text-slate-500">Source → lead → appointment → visit, one connected view</p>
            </div>
            <Target className="h-5 w-5 text-violet-300" />
          </div>
          {!loading && !combinedStages.some((s) => s.value > 0) ? (
            <NotConfiguredBanner
              title="No funnel activity recorded yet"
              hint="Leads will appear here as they come in. Appointment and visit stages need an admin to connect appointment data for this tenant."
            />
          ) : (
            <>
              <FunnelBar stages={combinedStages} />
              {canSeeRevenue && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3">
                  <IndianRupee className="h-4 w-4 flex-shrink-0 text-emerald-300" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-100">₹{revenue.toLocaleString('en-IN')} revenue at the end of this funnel</p>
                    <p className="text-[11px] text-emerald-200/60">Shown separately from the stage counts above — revenue and lead counts aren't on the same scale.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Stage detail</h3>
                <p className="text-xs text-slate-500">Assignment and response depth per lifecycle stage</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr><th className="pb-3">Stage</th><th className="pb-3">Leads</th><th className="pb-3">Assigned</th><th className="pb-3">Responded</th><th className="pb-3">Avg score</th></tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-slate-300">
                  {funnel.map((row) => <tr key={row.lifecycle_stage}>
                    <td className="py-3 font-medium text-white">{titleCase(row.lifecycle_stage)}</td>
                    <td className="py-3">{row.lead_count}</td>
                    <td className="py-3">{row.assigned_count}</td>
                    <td className="py-3">{row.responded_count}</td>
                    <td className="py-3">{row.average_score ?? '0'}</td>
                  </tr>)}
                  {!loading && funnel.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No lifecycle-event detail yet — see the funnel above for lead-status counts.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="text-base font-semibold text-white">Capture a lead</h3><p className="text-xs text-slate-500">Creates an identity and audit event</p></div>
              <Plus className="h-5 w-5 text-emerald-300" />
            </div>
            <form onSubmit={submitLead} className="space-y-3">
              {(['name', 'email', 'phone', 'serviceLine', 'sourceDetail'] as const).map((field) => (
                <Input key={field} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} placeholder={titleCase(field)} className="border-white/10 bg-black/20 text-white placeholder:text-slate-600" />
              ))}
              <Button type="submit" disabled={saving || (!form.name && !form.email && !form.phone)} className="w-full gap-2 bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4" /> {saving ? 'Creating...' : 'Create lead'}</Button>
            </form>
          </section>
        </div>

        <section className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
          <div className="mb-4 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-300" /><div><h3 className="text-base font-semibold text-white">Duplicate identity review</h3><p className="text-xs text-slate-500">Same normalized contact keys attached to multiple people</p></div></div>
          <div className="space-y-2">
            {duplicates.map((group) => <DuplicateGroupRow key={`${group.key_type}-${group.normalized_value}`} group={group} onMerged={load} />)}
            {!loading && duplicates.length === 0 && <p className="text-sm text-slate-500">No duplicate identity groups detected.</p>}
          </div>
        </section>
      </div>
    </CRMLayout>
  );
}

/**
 * One duplicate-identity group. Only identities with a resolved lead can
 * actually be merged — merge operates on crm_leads_v2 rows, not identities
 * directly, so a person with no lead yet has nothing to merge.
 */
function DuplicateGroupRow({ group, onMerged }: { group: DuplicateGroup; onMerged: () => void }) {
  const mergeable = group.people.filter((p) => p.lead_id != null);
  const [keepId, setKeepId] = useState<number | ''>('');
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  const merge = async () => {
    if (!keepId) return;
    setMerging(true);
    setError('');
    try {
      const target = mergeable.find((p) => p.person_id === keepId);
      const others = mergeable.filter((p) => p.person_id !== keepId);
      for (const source of others) {
        await api.post(`/crm/v2/leads/${source.lead_id}/merge`, { targetLeadId: target!.lead_id, reason: `Duplicate ${group.key_type}: ${group.normalized_value}` }, { headers: authHeaders() });
      }
      onMerged();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Merge failed.');
    } finally { setMerging(false); }
  };

  return <div className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-3 text-sm space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-amber-200">{group.key_type}: {group.normalized_value}</span>
      <span className="text-slate-400">{group.person_count} identities{mergeable.length < group.person_count ? ` (${mergeable.length} with a lead)` : ''}</span>
    </div>
    {mergeable.length >= 2 ? <div className="flex flex-wrap items-center gap-2">
      <select value={keepId} onChange={(e) => setKeepId(Number(e.target.value) || '')} className="h-8 rounded-md border border-white/10 bg-[#111827] px-2 text-xs text-white">
        <option value="">Keep…</option>
        {mergeable.map((p) => <option key={p.person_id} value={p.person_id}>{p.name || `#${p.person_id}`} ({p.lifecycle_stage})</option>)}
      </select>
      <Button size="sm" disabled={!keepId || merging} onClick={merge} className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-500 text-xs"><GitMerge className="h-3.5 w-3.5" />{merging ? 'Merging…' : 'Merge others into this one'}</Button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div> : <p className="text-xs text-slate-600">Fewer than two of these identities have a lead yet — nothing to merge.</p>}
  </div>;
}

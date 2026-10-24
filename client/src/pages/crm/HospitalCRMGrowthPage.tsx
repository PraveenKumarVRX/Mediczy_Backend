import LeadPicker, { type ResolvedLead } from './shared/LeadPicker';
import { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, CheckCircle2, Clock3, IndianRupee, Megaphone, Plus, RefreshCw, Send, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CRMLayout } from './CRMModulePages';
import { NotConfiguredBanner } from './shared/CRMWidgets';
import api from '@/utils/api';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

function money(value: unknown) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function label(value: unknown) {
  return String(value || '—').replace(/_/g, ' ');
}

function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'success' | 'error' }) {
  const styles = { info: 'border-violet-400/20 bg-violet-400/10 text-violet-100', success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100', error: 'border-red-400/20 bg-red-400/10 text-red-100' };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}

function Metric({ icon: Icon, title, value, hint }: { icon: any; title: string; value: string; hint: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4"><Icon className="h-5 w-5 text-violet-300" /><p className="mt-4 text-xl font-bold text-white">{value}</p><p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{title}</p><p className="mt-2 text-xs text-slate-500">{hint}</p></div>;
}

export default function HospitalCRMGrowthPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [journeys, setJourneys] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any[]>([]);
  const [landingPages, setLandingPages] = useState<any[]>([]);
  const [enrollLead, setEnrollLead] = useState<ResolvedLead | null>(null);
  const leadId = enrollLead?.v2LeadId;
  const [selectedJourney, setSelectedJourney] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'success' | 'error'>('info');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [growth, scoreRules, journeyRows, recoveryRows, pages] = await Promise.all([
        api.get('/crm/growth/dashboard', { headers: headers() }),
        api.get('/crm/growth/scoring/rules', { headers: headers() }),
        api.get('/crm/growth/journeys', { headers: headers() }),
        api.get('/crm/growth/recovery/queue', { headers: headers(), params: { limit: 100 } }),
        api.get('/crm/growth/landing-pages', { headers: headers() }),
      ]);
      setDashboard(growth.data?.data || null);
      setRules(scoreRules.data?.data || []);
      setJourneys(journeyRows.data?.data || []);
      setRecovery(recoveryRows.data?.data || []);
      setLandingPages(pages.data?.data || []);
    } catch (error: any) {
      setMessage(error.response?.data?.message || 'Growth automation is unavailable until its migration is applied.');
      setMessageTone('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const action = async (request: Promise<any>, success: string) => {
    try {
      await request;
      setMessage(success);
      setMessageTone('success');
      await load();
    } catch (error: any) {
      setMessage(error.response?.data?.message || 'The action could not be completed.');
      setMessageTone('error');
    }
  };

  const createDefaultRule = () => action(api.post('/crm/growth/scoring/rules', {
    name: `High-intent appointment request ${new Date().toISOString().slice(0, 10)}`,
    ruleType: 'profile',
    conditions: { lifecycle_stage: 'appointment_requested' },
    points: 25,
    priority: 10,
  }, { headers: headers() }), 'High-intent scoring rule created.');

  const createDefaultJourney = () => action(api.post('/crm/growth/journeys', {
    name: `New patient nurture ${new Date().toISOString().slice(0, 10)}`,
    description: 'A consent-aware acknowledgement, education, and callback sequence.',
    journeyType: 'nurture',
    status: 'active',
    goalStage: 'appointment_booked',
    entryConditions: { lifecycle_stage: 'new' },
    steps: [
      { stepOrder: 1, stepType: 'message', delayMinutes: 0, channel: 'whatsapp', title: 'Acknowledge inquiry', content: 'Thank you for contacting the hospital. A care coordinator will help you shortly.' },
      { stepOrder: 2, stepType: 'task', delayMinutes: 15, title: 'Call new patient', content: 'Call, qualify the need, and offer the earliest suitable appointment.' },
      { stepOrder: 3, stepType: 'message', delayMinutes: 1440, channel: 'sms', title: 'Appointment prompt', content: 'Would you like help choosing a doctor or appointment time?' },
    ],
  }, { headers: headers() }), 'Nurture journey created.');

  const enroll = () => {
    if (!leadId || !selectedJourney) {
      setMessage('Enter a lead ID and select a journey to enroll a patient.');
      setMessageTone('error');
      return;
    }
    return action(api.post(`/crm/growth/journeys/${selectedJourney}/enroll`, { leadId: Number(leadId) }, { headers: headers() }), 'Lead enrolled in journey.');
  };

  const scan = () => action(api.post('/crm/growth/recovery/scan', {}, { headers: headers() }), 'Recovery queues scanned.');

  return <CRMLayout title="Growth Automation">
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Hospital growth automation</p><h2 className="mt-1 text-2xl font-bold text-white">Acquisition, nurture, and ROI</h2><p className="mt-1 max-w-3xl text-sm text-slate-400">Turn every paid or organic inquiry into a measurable journey from source to appointment, visit, treatment, revenue, and recovery.</p></div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
      </div>
      {message && <Notice tone={messageTone}>{message}</Notice>}

      {!loading && !message && Number(dashboard?.summary?.leads || 0) === 0 && Number(dashboard?.summary?.revenue || 0) === 0 && (
        <NotConfiguredBanner
          title="No growth-automation activity yet for this tenant"
          hint="This workspace is live but empty — create a scoring rule or nurture journey below, or connect a channel on the Digital Growth Hub to start seeing numbers here."
          ctaLabel="Go to Digital Growth Hub"
          ctaTo="/crm/hospital/digital"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Users} title="Leads" value={Number(dashboard?.summary?.leads || 0).toLocaleString('en-IN')} hint={`${Number(dashboard?.summary?.qualified || 0).toLocaleString('en-IN')} qualified`} />
        <Metric icon={Target} title="Appointments" value={Number(dashboard?.summary?.appointments || 0).toLocaleString('en-IN')} hint={`${Number(dashboard?.summary?.visits || 0).toLocaleString('en-IN')} visits`} />
        <Metric icon={IndianRupee} title="Attributed revenue" value={money(dashboard?.summary?.revenue)} hint={`ROAS ${dashboard?.summary?.roas == null ? '—' : `${Number(dashboard.summary.roas).toFixed(1)}x`}`} />
        <Metric icon={Megaphone} title="Marketing spend" value={money(dashboard?.summary?.spend)} hint={`CPL ${dashboard?.summary?.cpl == null ? '—' : money(dashboard.summary.cpl)}`} />
        <Metric icon={Activity} title="Average lead score" value={dashboard?.summary?.average_score == null ? '—' : Number(dashboard.summary.average_score).toFixed(0)} hint={`${rules.length} scoring rules configured`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Campaign-to-revenue scoreboard</h3><p className="text-xs text-slate-500">Spend, CPL, appointments, revenue, and ROAS by campaign</p></div><Megaphone className="h-5 w-5 text-violet-300" /></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="pb-3">Campaign</th><th className="pb-3">Leads</th><th className="pb-3">Appointments</th><th className="pb-3">Spend</th><th className="pb-3">Revenue</th><th className="pb-3">ROAS</th></tr></thead><tbody className="divide-y divide-white/[0.05] text-slate-300">{(dashboard?.campaigns || []).slice(0, 8).map((campaign: any) => <tr key={campaign.id}><td className="py-3 text-white">{campaign.name}</td><td className="py-3">{campaign.leads}</td><td className="py-3">{campaign.appointments}</td><td className="py-3">{money(campaign.spend)}</td><td className="py-3">{money(campaign.revenue)}</td><td className="py-3 text-emerald-300">{campaign.roas == null ? '—' : `${Number(campaign.roas).toFixed(1)}x`}</td></tr>)}{!loading && !(dashboard?.campaigns || []).length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Create unified campaigns and connect spend to see ROI.</td></tr>}</tbody></table></div></section>
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="mb-4 flex items-center gap-3"><Bot className="h-5 w-5 text-violet-300" /><div><h3 className="font-semibold text-white">Scoring intelligence</h3><p className="text-xs text-slate-500">Prioritize high-intent patients for immediate response</p></div></div><div className="space-y-3">{(dashboard?.scoreTiers || []).map((tier: any) => <div key={tier.tier} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-3"><span className="capitalize text-slate-300">{tier.tier} leads</span><span className="font-semibold text-white">{tier.count}</span></div>)}{!loading && !(dashboard?.scoreTiers || []).length && <p className="text-sm text-slate-500">No scored leads in this period.</p>}<Button onClick={createDefaultRule} className="mt-2 w-full gap-2 bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4" /> Add hospital scoring rule</Button></div></section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Nurture journeys</h3><p className="text-xs text-slate-500">Consent-aware multi-step WhatsApp, SMS, email, and task orchestration</p></div><Send className="h-5 w-5 text-violet-300" /></div><div className="space-y-2">{journeys.slice(0, 6).map((journey: any) => <div key={journey.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-3"><div><p className="text-sm font-medium text-white">{journey.name}</p><p className="mt-1 text-xs capitalize text-slate-500">{label(journey.status)} · {journey.step_count} steps · {journey.active_enrollment_count} active</p></div><span className="text-xs text-violet-200">{label(journey.journey_type)}</span></div>)}{!loading && !journeys.length && <p className="text-sm text-slate-500">No journeys configured.</p>}<div className="flex flex-wrap gap-2 pt-2"><Button onClick={createDefaultJourney} className="gap-2 bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4" /> Create nurture journey</Button><LeadPicker value={enrollLead} onSelect={setEnrollLead} /><select value={selectedJourney} onChange={(e) => setSelectedJourney(e.target.value)} aria-label="Journey" className="min-w-40 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"><option value="">Select journey</option>{journeys.map((journey: any) => <option key={journey.id} value={journey.id}>{journey.name}</option>)}</select><Button variant="outline" onClick={enroll} className="gap-2 border-white/10 text-slate-200"><Send className="h-4 w-4" /> Enroll</Button></div></div></section>

        <section className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Revenue recovery queue</h3><p className="text-xs text-slate-500">Speed-to-lead, abandoned forms, no-shows, and dormant patient opportunities</p></div><Clock3 className="h-5 w-5 text-amber-300" /></div><div className="space-y-2">{recovery.slice(0, 7).map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-3"><div><p className="text-sm text-white">{item.display_name || `Lead ${item.lead_id}`}</p><p className="mt-1 text-xs capitalize text-slate-500">{label(item.case_type)} · score {item.score || 0}</p></div><span className="text-xs uppercase text-amber-200">{item.priority}</span></div>)}{!loading && !recovery.length && <p className="text-sm text-slate-500">No recovery cases are currently open.</p>}<Button onClick={scan} variant="outline" className="mt-2 gap-2 border-amber-300/20 text-amber-100 hover:bg-amber-300/10"><RefreshCw className="h-4 w-4" /> Scan recovery queue</Button></div></section>
      </div>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="mb-4 flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><div><h3 className="font-semibold text-white">Landing-page conversion signals</h3><p className="text-xs text-slate-500">Track view, form start, abandonment, submission, and campaign linkage</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{landingPages.slice(0, 8).map((page: any) => <div key={page.id} className="rounded-lg border border-white/[0.06] px-3 py-3"><p className="truncate text-sm text-white">{page.page_name}</p><p className="mt-1 text-xs capitalize text-slate-500">{label(page.status)} · {page.event_count || 0} events</p><p className="mt-2 text-xs text-emerald-300">{page.submissions || 0} form submissions</p></div>)}{!loading && !landingPages.length && <p className="text-sm text-slate-500">No landing pages configured yet.</p>}</div></section>
    </div>
  </CRMLayout>;
}

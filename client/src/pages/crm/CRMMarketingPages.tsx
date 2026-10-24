import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, BarChart3, Check, ChevronRight, Clock, Copy, Download,
  Mail, Pause, Play, Plus, Save, Send, Settings2, Shield, Sparkles, Trash2,
  Upload, Users, X, ZapOff,
} from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

const ah = () => {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const card = 'rounded-2xl bg-white/[0.03] border border-white/[0.06]';
const inp = 'w-full h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30';
const btn = (variant = 'ghost') =>
  variant === 'primary' ? 'h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center gap-2 transition-colors'
  : variant === 'green'  ? 'h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium flex items-center gap-2 transition-colors'
  : variant === 'red'    ? 'h-10 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm flex items-center gap-2 transition-colors'
  : 'h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-sm flex items-center gap-2 transition-colors';

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-slate-400 bg-slate-500/20',
  scheduled: 'text-yellow-400 bg-yellow-500/20',
  sending: 'text-blue-400 bg-blue-500/20',
  sent: 'text-emerald-400 bg-emerald-500/20',
  paused: 'text-orange-400 bg-orange-500/20',
  aborted: 'text-red-400 bg-red-500/20',
};

const TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
];

// ─── Campaigns List ───────────────────────────────────────────────────────────

export function CRMCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/crm/campaigns/campaigns', { headers: ah() })
      .then(({ data }) => setCampaigns(data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const duplicate = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await api.post(`/crm/campaigns/campaigns/${id}/duplicate`, {}, { headers: ah() });
    load();
  };

  const remove = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Delete this campaign?')) return;
    await api.delete(`/crm/campaigns/campaigns/${id}`, { headers: ah() });
    load();
  };

  const filtered = campaigns.filter(
    (c) => c.name?.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase()),
  );

  const rate = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—';

  return (
    <CRMLayout title="Campaigns">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <input className={`${inp} max-w-xs`} placeholder="Search campaigns…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex-1" />
          <button onClick={() => navigate('/crm/marketing-copilot')} className={btn()}>
            <Sparkles className="h-4 w-4 text-violet-400" /> AI Copilot
          </button>
          <button onClick={() => navigate('/crm/campaigns/new')} className={btn('primary')}>
            <Plus className="h-4 w-4" />New Campaign
          </button>
        </div>

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06] text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="p-4 text-left">Campaign</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-right">Recipients</th>
                <th className="p-4 text-right">Open Rate</th>
                <th className="p-4 text-right">Click Rate</th>
                <th className="p-4 text-right">Sent</th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No campaigns yet. Create your first one.</td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/crm/campaigns/${c.id}`)} className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer">
                  <td className="p-4">
                    <div className="text-white font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[260px]">{c.subject}</div>
                    {(c.tags || []).length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {c.tags.map((t: string) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-xs">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || 'text-slate-400'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-4 text-right text-slate-300">{c.recipient_count ?? 0}</td>
                  <td className="p-4 text-right text-slate-300">{rate(c.opened_count ?? 0, c.sent_count ?? 0)}</td>
                  <td className="p-4 text-right text-slate-300">{rate(c.clicked_count ?? 0, c.sent_count ?? 0)}</td>
                  <td className="p-4 text-right text-emerald-400">{c.sent_count ?? 0}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button title="View analytics" onClick={(e) => { e.stopPropagation(); navigate(`/crm/campaigns/${c.id}/analytics`); }} className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 transition-colors">
                        <BarChart3 className="h-3.5 w-3.5" />
                      </button>
                      <button title="Duplicate" onClick={(e) => duplicate(e, c.id)} className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 transition-colors">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {['draft', 'scheduled'].includes(c.status) && (
                        <button title="Delete" onClick={(e) => remove(e, c.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </CRMLayout>
  );
}

// ─── Campaign Builder (4-tab wizard) ─────────────────────────────────────────

type Tab = 'setup' | 'content' | 'audience' | 'review';

export function CRMCampaignBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [tab, setTab] = useState<Tab>('setup');
  const [lists, setLists] = useState<any[]>([]);
  const [senders, setSenders] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [showTest, setShowTest] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [tagInput, setTagInput] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [form, setForm] = useState<any>({
    name: '', description: '', tags: [],
    sender_id: '', reply_to_address: '',
    subject: '', preheader: '',
    ab_test_enabled: false, ab_test_subject_b: '', ab_test_split: 50,
    html_content: '', text_content: '',
    utm_source: 'email', utm_medium: 'email', utm_campaign: '', utm_content: '',
    list_ids: [], exclude_list_ids: [],
    scheduled_at: '', send_timezone: 'Asia/Kolkata',
  });

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    Promise.all([
      api.get('/crm/campaigns/lists', { headers: ah() }),
      api.get('/crm/campaigns/senders', { headers: ah() }),
      api.get('/crm/campaigns/templates', { headers: ah() }),
    ]).then(([l, s, t]) => {
      setLists(l.data.data || []);
      setSenders(s.data.data || []);
      setTemplates(t.data.data || []);
    });

    if (id) {
      api.get(`/crm/campaigns/campaigns/${id}`, { headers: ah() }).then(({ data }) => {
        const c = data.data;
        setCampaign(c);
        setForm({
          name: c.name || '', description: c.description || '', tags: c.tags || [],
          sender_id: c.sender_id || '', reply_to_address: c.reply_to_address || '',
          subject: c.subject || '', preheader: c.preheader || '',
          ab_test_enabled: c.ab_test_enabled || false,
          ab_test_subject_b: c.ab_test_subject_b || '',
          ab_test_split: c.ab_test_split ?? 50,
          html_content: c.html_content || '', text_content: c.text_content || '',
          utm_source: c.utm_source || 'email', utm_medium: c.utm_medium || 'email',
          utm_campaign: c.utm_campaign || '', utm_content: c.utm_content || '',
          list_ids: (c.lists || []).filter((l: any) => l.mode === 'include').map((l: any) => l.list_id),
          exclude_list_ids: (c.lists || []).filter((l: any) => l.mode === 'exclude').map((l: any) => l.list_id),
          scheduled_at: c.scheduled_at ? c.scheduled_at.slice(0, 16) : '',
          send_timezone: c.send_timezone || 'Asia/Kolkata',
        });
      });
      api.get(`/crm/campaigns/campaigns/${id}/events`, { headers: ah() })
        .then(({ data }) => setEvents(data.data || []));
    }
  }, [id]);

  // Update iframe preview when html changes
  useEffect(() => {
    if (iframeRef.current && form.html_content) {
      const doc = iframeRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(form.html_content); doc.close(); }
    }
  }, [form.html_content, tab]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (isEdit) {
        await api.put(`/crm/campaigns/campaigns/${id}`, payload, { headers: ah() });
        setCampaign((p: any) => ({ ...p, ...payload }));
      } else {
        const { data } = await api.post('/crm/campaigns/campaigns', payload, { headers: ah() });
        navigate(`/crm/campaigns/${data.data.id}`, { replace: true });
      }
    } finally {
      setSaving(false);
    }
  };

  const loadAudienceCount = async () => {
    if (!id) return;
    const { data } = await api.post(`/crm/campaigns/campaigns/${id}/audience-preview`, {}, { headers: ah() });
    setAudienceCount(data.data?.recipient_count ?? 0);
  };

  const sendTest = async () => {
    if (!id || !testEmails.trim()) return;
    setTestStatus('sending…');
    try {
      await api.post(`/crm/campaigns/campaigns/${id}/test-send`, { emails: testEmails.split(',').map((e: string) => e.trim()).filter(Boolean) }, { headers: ah() });
      setTestStatus('Sent!');
    } catch {
      setTestStatus('Failed — check SMTP config.');
    }
  };

  const sendNow = async () => {
    if (!id) return;
    await api.post(`/crm/campaigns/campaigns/${id}/send-now`, {}, { headers: ah() });
    navigate('/crm/campaigns');
  };

  const schedule = async () => {
    if (!id || !form.scheduled_at) return;
    await api.post(`/crm/campaigns/campaigns/${id}/schedule`, {
      scheduled_at: form.scheduled_at,
      send_timezone: form.send_timezone,
    }, { headers: ah() });
    navigate('/crm/campaigns');
  };

  const pause  = async () => { if (!id) return; await api.post(`/crm/campaigns/campaigns/${id}/pause`,  {}, { headers: ah() }); setCampaign((p: any) => ({ ...p, status: 'paused' })); };
  const resume = async () => { if (!id) return; await api.post(`/crm/campaigns/campaigns/${id}/resume`, {}, { headers: ah() }); setCampaign((p: any) => ({ ...p, status: 'sending' })); };
  const abort  = async () => {
    if (!id || !confirm('Abort this campaign? This cannot be undone.')) return;
    await api.post(`/crm/campaigns/campaigns/${id}/abort`, {}, { headers: ah() });
    navigate('/crm/campaigns');
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !(form.tags || []).includes(t)) f('tags', [...(form.tags || []), t]);
    setTagInput('');
  };

  const utmPreview = () => {
    const parts = [
      form.utm_source   ? `utm_source=${encodeURIComponent(form.utm_source)}`   : '',
      form.utm_medium   ? `utm_medium=${encodeURIComponent(form.utm_medium)}`   : '',
      form.utm_campaign ? `utm_campaign=${encodeURIComponent(form.utm_campaign)}` : '',
      form.utm_content  ? `utm_content=${encodeURIComponent(form.utm_content)}`  : '',
    ].filter(Boolean).join('&');
    return parts ? `https://yourdomain.com/page?${parts}` : '';
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'setup',    label: '1 · Setup' },
    { key: 'content',  label: '2 · Content' },
    { key: 'audience', label: '3 · Audience' },
    { key: 'review',   label: '4 · Review & Send' },
  ];

  const isActive = campaign && ['sending', 'paused'].includes(campaign?.status);
  const isSent   = campaign?.status === 'sent';

  return (
    <CRMLayout title={isEdit ? (campaign?.name || 'Edit Campaign') : 'New Campaign'}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-1 w-fit">
        {tabs.map((t, i) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`h-9 px-5 rounded-xl text-sm font-medium transition-colors ${tab === t.key ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        {/* ── Tab: Setup ── */}
        {tab === 'setup' && (
          <div className={`${card} p-6 space-y-4`}>
            <h3 className="text-white font-semibold mb-2">Campaign Details</h3>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Campaign Name *</label>
              <input className={inp} placeholder="e.g. July Newsletter" value={form.name} onChange={(e) => f('name', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Description</label>
              <textarea className={`${inp} h-20 py-2.5`} placeholder="Internal notes about this campaign" value={form.description} onChange={(e) => f('description', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Tags</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {(form.tags || []).map((t: string) => (
                  <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs">
                    {t}
                    <button onClick={() => f('tags', form.tags.filter((x: string) => x !== t))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={`${inp} flex-1`} placeholder="Add tag…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} />
                <button onClick={addTag} className={btn()}>Add</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Sender *</label>
              <select className={inp} value={form.sender_id} onChange={(e) => f('sender_id', e.target.value)}>
                <option value="" className="bg-[#0d1120]">Choose sender…</option>
                {senders.map((s) => <option key={s.id} value={s.id} className="bg-[#0d1120]">{s.name} &lt;{s.email}&gt;</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Reply-To (optional)</label>
              <input className={inp} type="email" placeholder="replies@yourdomain.com" value={form.reply_to_address} onChange={(e) => f('reply_to_address', e.target.value)} />
            </div>
            <div className="pt-2">
              <button onClick={() => { save(); setTab('content'); }} className={btn('primary')}>
                Save & Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Content ── */}
        {tab === 'content' && (
          <div className="space-y-4">
            {/* Subject */}
            <div className={`${card} p-6 space-y-4`}>
              <h3 className="text-white font-semibold">Subject Line</h3>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Subject *</label>
                <input className={inp} placeholder="Your subject line (supports {{first_name}})" value={form.subject} onChange={(e) => f('subject', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Preheader text</label>
                <input className={inp} placeholder="Preview text shown in inbox…" value={form.preheader} onChange={(e) => f('preheader', e.target.value)} />
              </div>

              {/* A/B Test */}
              <div className="border border-white/[0.06] rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.ab_test_enabled} onChange={(e) => f('ab_test_enabled', e.target.checked)} className="accent-violet-500" />
                  Enable A/B Subject Test
                </label>
                {form.ab_test_enabled && (
                  <>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Subject B</label>
                      <input className={inp} placeholder="Alternate subject line" value={form.ab_test_subject_b} onChange={(e) => f('ab_test_subject_b', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Split — {form.ab_test_split}% receive Subject A, {100 - form.ab_test_split}% receive Subject B</label>
                      <input type="range" min={10} max={90} step={5} className="w-full accent-violet-500" value={form.ab_test_split} onChange={(e) => f('ab_test_split', Number(e.target.value))} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* HTML Editor */}
            <div className={`${card} p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">HTML Content</h3>
                <div className="flex items-center gap-2">
                  {templates.length > 0 && (
                    <select className={`${inp} w-auto`} defaultValue="" onChange={(e) => { const t = templates.find((x) => String(x.id) === e.target.value); if (t) { f('html_content', t.html_content); f('text_content', t.text_content || ''); } }}>
                      <option value="" className="bg-[#0d1120]">Load template…</option>
                      {templates.map((t) => <option key={t.id} value={t.id} className="bg-[#0d1120]">{t.name}</option>)}
                    </select>
                  )}
                  <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
                    {(['desktop', 'mobile'] as const).map((d) => (
                      <button key={d} onClick={() => setPreviewDevice(d)} className={`h-8 px-3 text-xs transition-colors ${previewDevice === d ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-slate-400'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid xl:grid-cols-2 gap-4">
                <textarea className={`${inp} h-72 py-3 font-mono text-xs`} placeholder="<html>…</html>" value={form.html_content} onChange={(e) => f('html_content', e.target.value)} />
                <div className={`rounded-xl overflow-hidden border border-white/[0.06] bg-white ${previewDevice === 'mobile' ? 'max-w-[375px]' : 'w-full'}`} style={{ height: 288 }}>
                  <iframe ref={iframeRef} className="w-full h-full" title="HTML preview" sandbox="allow-same-origin" />
                </div>
              </div>

              {/* Test send */}
              <div className="flex items-center gap-2">
                <button onClick={() => setShowTest(!showTest)} className={btn()}>
                  <Send className="h-4 w-4" />Send Test Email
                </button>
              </div>
              {showTest && (
                <div className="border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <label className="text-xs text-slate-500">Comma-separated email addresses</label>
                  <textarea className={`${inp} h-16 py-2`} placeholder="test@example.com, qa@company.com" value={testEmails} onChange={(e) => setTestEmails(e.target.value)} />
                  <div className="flex items-center gap-3">
                    <button onClick={sendTest} disabled={!id} className={btn('primary')}>
                      <Send className="h-4 w-4" />Send Test
                    </button>
                    {testStatus && <span className={`text-sm ${testStatus === 'Sent!' ? 'text-emerald-400' : 'text-red-400'}`}>{testStatus}</span>}
                    {!id && <span className="text-xs text-slate-500">Save campaign first to enable test send</span>}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Plain-text fallback</label>
                <textarea className={`${inp} h-28 py-3`} placeholder="Plain text version (auto-generated if blank)" value={form.text_content} onChange={(e) => f('text_content', e.target.value)} />
              </div>
            </div>

            {/* UTM Builder */}
            <div className={`${card} p-6 space-y-4`}>
              <h3 className="text-white font-semibold">UTM Parameters</h3>
              <div className="grid grid-cols-2 gap-3">
                {[['utm_source','Source','email'],['utm_medium','Medium','email'],['utm_campaign','Campaign','july-newsletter'],['utm_content','Content','button-cta']].map(([key, label, ph]) => (
                  <div key={key}>
                    <label className="text-xs text-slate-500 mb-1 block">{label}</label>
                    <input className={inp} placeholder={ph} value={form[key] || ''} onChange={(e) => f(key, e.target.value)} />
                  </div>
                ))}
              </div>
              {utmPreview() && (
                <div className="rounded-xl bg-white/[0.04] p-3">
                  <div className="text-xs text-slate-500 mb-1">Preview URL</div>
                  <div className="text-xs text-slate-300 break-all font-mono">{utmPreview()}</div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={save} className={btn()} disabled={saving}><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { save(); setTab('audience'); }} className={btn('primary')}>Save & Continue <ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {/* ── Tab: Audience ── */}
        {tab === 'audience' && (
          <div className="space-y-4">
            <div className={`${card} p-6 space-y-4`}>
              <h3 className="text-white font-semibold">Include Lists</h3>
              <div className="space-y-2">
                {lists.map((l) => (
                  <label key={l.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.04] cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="accent-violet-500" checked={(form.list_ids || []).includes(l.id)} onChange={(e) => {
                        const cur = form.list_ids || [];
                        f('list_ids', e.target.checked ? [...cur, l.id] : cur.filter((x: number) => x !== l.id));
                      }} />
                      <div>
                        <div className="text-sm text-white">{l.name}</div>
                        <div className="text-xs text-slate-500">{l.member_count} subscribers</div>
                      </div>
                    </div>
                    <Users className="h-4 w-4 text-slate-600" />
                  </label>
                ))}
              </div>
            </div>

            <div className={`${card} p-6 space-y-4`}>
              <h3 className="text-white font-semibold">Exclude Lists</h3>
              <p className="text-xs text-slate-500">Members in these lists will NOT receive the campaign even if they're in an included list.</p>
              <div className="space-y-2">
                {lists.map((l) => (
                  <label key={l.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.04] cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="accent-red-500" checked={(form.exclude_list_ids || []).includes(l.id)} onChange={(e) => {
                        const cur = form.exclude_list_ids || [];
                        f('exclude_list_ids', e.target.checked ? [...cur, l.id] : cur.filter((x: number) => x !== l.id));
                      }} />
                      <div>
                        <div className="text-sm text-white">{l.name}</div>
                        <div className="text-xs text-slate-500">{l.member_count} subscribers</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={`${card} p-4 flex items-center justify-between`}>
              <div>
                <div className="text-sm text-slate-400">Estimated Recipients</div>
                <div className="text-2xl font-semibold text-white mt-0.5">{audienceCount !== null ? audienceCount.toLocaleString() : '—'}</div>
              </div>
              <button onClick={loadAudienceCount} disabled={!id} className={btn()}>
                <Users className="h-4 w-4" />Calculate
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={save} className={btn()} disabled={saving}><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { save(); setTab('review'); }} className={btn('primary')}>Save & Continue <ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {/* ── Tab: Review & Send ── */}
        {tab === 'review' && (
          <div className="space-y-4">
            {/* Validation */}
            {(() => {
              const warns: string[] = [];
              if (!form.name) warns.push('Campaign name is required');
              if (!form.subject) warns.push('Subject line is required');
              if (!form.sender_id) warns.push('Sender is required');
              if ((form.list_ids || []).length === 0) warns.push('At least one include list must be selected');
              if (!form.html_content) warns.push('HTML content is empty');
              return warns.length > 0 ? (
                <div className={`${card} p-4 space-y-2`}>
                  <div className="flex items-center gap-2 text-orange-400 text-sm font-medium mb-1">
                    <AlertCircle className="h-4 w-4" />Issues to fix
                  </div>
                  {warns.map((w) => <div key={w} className="flex items-center gap-2 text-sm text-slate-400"><X className="h-3.5 w-3.5 text-red-400" />{w}</div>)}
                </div>
              ) : (
                <div className={`${card} p-4 flex items-center gap-2 text-emerald-400 text-sm`}>
                  <Check className="h-4 w-4" />Ready to send
                </div>
              );
            })()}

            {/* Summary grid */}
            <div className={`${card} p-5`}>
              <h3 className="text-white font-semibold mb-4">Campaign Summary</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ['Name', form.name],
                  ['Subject', form.subject],
                  ['Sender ID', form.sender_id],
                  ['A/B Test', form.ab_test_enabled ? `${form.ab_test_split}% / ${100 - form.ab_test_split}%` : 'Off'],
                  ['Include lists', (form.list_ids || []).length],
                  ['Exclude lists', (form.exclude_list_ids || []).length],
                  ['UTM Campaign', form.utm_campaign || '—'],
                  ['Timezone', form.send_timezone],
                ].map(([k, v]) => (
                  <div key={String(k)}><dt className="text-slate-500">{k}</dt><dd className="text-white mt-0.5 truncate">{String(v)}</dd></div>
                ))}
              </dl>
            </div>

            {/* Stats if already sent */}
            {events.length > 0 && (
              <div className={`${card} p-5`}>
                <h3 className="text-white font-semibold mb-4">Delivery Stats</h3>
                <div className="grid grid-cols-3 gap-3">
                  {events.map((e) => (
                    <div key={e.event_type} className="rounded-xl bg-white/[0.04] p-3 text-center">
                      <div className="text-2xl font-semibold text-white">{e.count}</div>
                      <div className="text-xs text-slate-500 capitalize mt-0.5">{e.event_type}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {!isSent && (
              <div className={`${card} p-5 space-y-4`}>
                <h3 className="text-white font-semibold">Send Options</h3>

                {!isActive && (
                  <>
                    <div className="flex items-center gap-3">
                      <button onClick={sendNow} disabled={!id} className={btn('green')}>
                        <Send className="h-4 w-4" />Send Now
                      </button>
                    </div>
                    <div className="relative flex items-center gap-1 text-slate-600 text-xs"><span className="flex-1 border-t border-white/[0.06]" />OR<span className="flex-1 border-t border-white/[0.06]" /></div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Schedule for later</label>
                      <div className="flex gap-2 flex-wrap">
                        <input type="datetime-local" className={`${inp} w-auto`} value={form.scheduled_at} onChange={(e) => f('scheduled_at', e.target.value)} />
                        <select className={`${inp} w-auto`} value={form.send_timezone} onChange={(e) => f('send_timezone', e.target.value)}>
                          {TIMEZONES.map((tz) => <option key={tz} value={tz} className="bg-[#0d1120]">{tz}</option>)}
                        </select>
                        <button onClick={schedule} disabled={!id || !form.scheduled_at} className={btn()}>
                          <Clock className="h-4 w-4" />Schedule
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {isActive && (
                  <div className="flex gap-3">
                    {campaign?.status === 'sending' && (
                      <button onClick={pause} className={btn()}>
                        <Pause className="h-4 w-4" />Pause
                      </button>
                    )}
                    {campaign?.status === 'paused' && (
                      <button onClick={resume} className={btn('green')}>
                        <Play className="h-4 w-4" />Resume
                      </button>
                    )}
                    <button onClick={abort} className={btn('red')}>
                      <ZapOff className="h-4 w-4" />Abort Campaign
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right rail — mini stats */}
        <div className="space-y-4">
          <div className={`${card} p-4`}>
            <h3 className="text-sm font-semibold text-white mb-3">Quick Stats</h3>
            {[
              { label: 'Recipients', value: campaign?.recipient_count ?? 0, color: 'text-blue-400' },
              { label: 'Sent',       value: campaign?.sent_count    ?? 0, color: 'text-emerald-400' },
              { label: 'Opened',     value: campaign?.opened_count  ?? 0, color: 'text-violet-400' },
              { label: 'Clicked',    value: campaign?.clicked_count ?? 0, color: 'text-yellow-400' },
              { label: 'Bounced',    value: campaign?.bounced_count ?? 0, color: 'text-red-400' },
              { label: 'Unsubs',     value: campaign?.unsub_count   ?? 0, color: 'text-orange-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between py-2 border-b border-white/[0.04] last:border-0 text-sm">
                <span className="text-slate-500">{label}</span>
                <span className={`font-medium ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {campaign && (
            <div className={`${card} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[campaign.status] || 'text-slate-400'}`}>
                  {campaign.status}
                </span>
              </div>
              {campaign.scheduled_at && (
                <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <Clock className="h-3.5 w-3.5" />{new Date(campaign.scheduled_at).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </CRMLayout>
  );
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export function CRMListsPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');

  const load = () => api.get('/crm/campaigns/lists', { headers: ah() }).then(({ data }) => setLists(data.data || []));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    await api.post('/crm/campaigns/lists', { name }, { headers: ah() });
    setName('');
    load();
  };

  const remove = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Delete this list and all its members?')) return;
    await api.delete(`/crm/campaigns/lists/${id}`, { headers: ah() });
    load();
  };

  const filtered = lists.filter((l) => l.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <CRMLayout title="Marketing Lists">
      <div className="space-y-5">
        <div className="flex gap-3 flex-wrap">
          <input className={`${inp} max-w-xs`} placeholder="Search lists…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex-1" />
          <input className={`${inp} w-52`} placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button onClick={create} className={btn('primary')}><Plus className="h-4 w-4" />Create</button>
        </div>
        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06] text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="p-4 text-left">List Name</th>
                <th className="p-4 text-right">Members</th>
                <th className="p-4 text-left">Created</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} onClick={() => navigate(`/crm/lists/${l.id}`)} className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer">
                  <td className="p-4 text-white font-medium">{l.name}</td>
                  <td className="p-4 text-right text-slate-300">{l.member_count ?? 0}</td>
                  <td className="p-4 text-slate-500">{l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}</td>
                  <td className="p-4">
                    <button onClick={(e) => remove(e, l.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No lists yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </CRMLayout>
  );
}

export function CRMListDetailPage() {
  const { id } = useParams();
  const [list, setList] = useState<any>(null);
  const [search, setSearch] = useState('');

  const refresh = () => api.get(`/crm/campaigns/lists/${id}`, { headers: ah() }).then(({ data }) => setList(data.data));
  useEffect(() => { refresh(); }, [id]);

  const upload = async (file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await api.post(`/crm/campaigns/lists/${id}/import`, fd, { headers: ah() });
    refresh();
  };

  const removeMember = async (memberId: number) => {
    await api.delete(`/crm/campaigns/list-members/${memberId}`, { headers: ah() });
    refresh();
  };

  const filtered = (list?.members || []).filter((m: any) =>
    m.email?.toLowerCase().includes(search.toLowerCase()) ||
    m.company?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <CRMLayout title={list?.name || 'List'}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <input className={`${inp} max-w-xs`} placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex-1" />
          <label className={`${btn('primary')} cursor-pointer`}>
            <Upload className="h-4 w-4" />Import CSV
            <input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>

        {(list?.imports || []).length > 0 && (
          <div className={`${card} p-4 space-y-2`}>
            <h4 className="text-xs text-slate-500 font-medium uppercase tracking-wide">Import History</h4>
            {list.imports.map((i: any) => (
              <div key={i.id} className="flex justify-between text-sm py-1">
                <span className="text-slate-300">{i.filename}</span>
                <span className="text-slate-500">{i.valid_rows} valid · {i.invalid_rows} invalid · {i.duplicate_rows} dupe</span>
              </div>
            ))}
          </div>
        )}

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06] text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="p-4 text-left">Email</th>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Company</th>
                <th className="p-4 text-left">City</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m: any) => (
                <tr key={m.id} className="border-b border-white/[0.04]">
                  <td className="p-4 text-white">{m.email}</td>
                  <td className="p-4 text-slate-300">{[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td className="p-4 text-slate-400">{m.company || '—'}</td>
                  <td className="p-4 text-slate-400">{[m.city, m.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${m.status === 'subscribed' ? 'text-emerald-400 bg-emerald-500/15' : 'text-slate-400 bg-white/[0.06]'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <button onClick={() => removeMember(m.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No members found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </CRMLayout>
  );
}

// ─── Templates ───────────────────────────────────────────────────────────────

export function CRMTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ name: '', subject: '', html_content: '', text_content: '' });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = () => api.get('/crm/campaigns/templates', { headers: ah() }).then(({ data }) => setTemplates(data.data || []));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (iframeRef.current && form.html_content) {
      const doc = iframeRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(form.html_content); doc.close(); }
    }
  }, [form.html_content]);

  const save = async () => {
    if (selected) {
      await api.put(`/crm/campaigns/templates/${selected.id}`, form, { headers: ah() });
    } else {
      await api.post('/crm/campaigns/templates', form, { headers: ah() });
    }
    setForm({ name: '', subject: '', html_content: '', text_content: '' });
    setSelected(null);
    load();
  };

  const edit = (t: any) => { setSelected(t); setForm({ name: t.name, subject: t.subject || '', html_content: t.html_content || '', text_content: t.text_content || '' }); };
  const remove = async (id: number) => { if (!confirm('Delete template?')) return; await api.delete(`/crm/campaigns/templates/${id}`, { headers: ah() }); load(); };

  return (
    <CRMLayout title="Email Templates">
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <div className={`${card} p-5 space-y-3`}>
          <h3 className="text-white font-semibold">{selected ? 'Edit Template' : 'New Template'}</h3>
          <input className={inp} placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inp} placeholder="Default subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <label className="block text-xs text-slate-400">Visual message editor</label>
          <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Template message" className={`${inp} min-h-32 py-3 whitespace-pre-wrap`} onBlur={e => {
            const text = e.currentTarget.innerText;
            const html = text.split('\n').map(line => '<p>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>').join('');
            setForm(f => ({ ...f, text_content: text, html_content: html }));
          }}>{form.text_content}</div>
          <label className="block text-xs text-slate-400">HTML source (optional)</label>
          <textarea className={`${inp} h-48 py-3 font-mono text-xs`} placeholder="<html>…</html>" value={form.html_content} onChange={(e) => setForm({ ...form, html_content: e.target.value })} />
          <textarea className={`${inp} h-24 py-3`} placeholder="Plain-text version" value={form.text_content} onChange={(e) => setForm({ ...form, text_content: e.target.value })} />
          <div className="flex gap-2">
            <button onClick={save} className={btn('primary')}><Save className="h-4 w-4" />{selected ? 'Update' : 'Save'} Template</button>
            {selected && <button onClick={() => { setSelected(null); setForm({ name: '', subject: '', html_content: '', text_content: '' }); }} className={btn()}>Cancel</button>}
          </div>
        </div>

        <div className="space-y-3">
          {form.html_content && (
            <div className={`${card} overflow-hidden`} style={{ height: 200 }}>
              <iframe ref={iframeRef} className="w-full h-full bg-white" title="preview" sandbox="allow-same-origin" />
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} className={`${card} p-4 flex items-center justify-between`}>
              <div>
                <div className="text-white font-medium">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.subject}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => edit(t)} className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 transition-colors"><Settings2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(t.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <div className="text-center text-slate-500 py-10 text-sm">No templates yet.</div>}
        </div>
      </div>
    </CRMLayout>
  );
}

// ─── Senders ─────────────────────────────────────────────────────────────────

export function CRMSendersPage() {
  const [senders, setSenders] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', reply_to: '', is_default: false });

  const load = () => api.get('/crm/campaigns/senders', { headers: ah() }).then(({ data }) => setSenders(data.data || []));
  useEffect(() => { load(); }, []);

  const save = async () => {
    await api.post('/crm/campaigns/senders', form, { headers: ah() });
    setForm({ name: '', email: '', reply_to: '', is_default: false });
    load();
  };

  return (
    <CRMLayout title="Senders">
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <div className={`${card} p-5 space-y-3`}>
          <h3 className="text-white font-semibold">Add Sender</h3>
          <input className={inp} placeholder="Sender name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inp} type="email" placeholder="sender@yourdomain.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inp} type="email" placeholder="reply-to@yourdomain.com (optional)" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input type="checkbox" className="accent-violet-500" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            Set as default sender
          </label>
          <button onClick={save} className={btn('primary')}><Plus className="h-4 w-4" />Add Sender</button>

          <div className={`${card} p-4 mt-4`}>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-2"><Shield className="h-3.5 w-3.5 text-violet-400" />Domain Authentication</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              To avoid spam filters, add these DNS records for your sending domain:
              <br /><br />
              <strong className="text-slate-400">SPF:</strong> v=spf1 include:mediqzy.com ~all<br />
              <strong className="text-slate-400">DKIM:</strong> Set up via your SMTP provider settings<br />
              <strong className="text-slate-400">DMARC:</strong> v=DMARC1; p=none; rua=mailto:dmarc@mediqzy.com
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {senders.map((s) => (
            <div key={s.id} className={`${card} p-4 flex items-center justify-between`}>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-white font-medium">{s.name}</div>
                  {s.is_default && <span className="px-2 py-0.5 rounded-full text-xs bg-violet-500/20 text-violet-300">Default</span>}
                </div>
                <div className="text-sm text-slate-500 mt-0.5">{s.email}</div>
                {s.reply_to && <div className="text-xs text-slate-600 mt-0.5">Reply-to: {s.reply_to}</div>}
              </div>
              <Mail className="h-4 w-4 text-slate-600" />
            </div>
          ))}
          {senders.length === 0 && <div className="text-center text-slate-500 py-10 text-sm">No senders configured.</div>}
        </div>
      </div>
    </CRMLayout>
  );
}

// ─── Suppressions ─────────────────────────────────────────────────────────────

export function CRMSuppressionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({ email: '', reason: 'manual', notes: '' });
  const PAGE = 50;

  const load = (p = page, s = search, r = reason) => {
    api.get('/crm/campaigns/suppressions', { params: { page: p, limit: PAGE, search: s, reason: r }, headers: ah() })
      .then(({ data }) => { setItems(data.data || []); setTotal(data.total || 0); });
  };

  useEffect(() => { load(1, search, reason); setPage(1); }, [search, reason]);

  const add = async () => {
    if (!form.email.trim()) return;
    await api.post('/crm/campaigns/suppressions', form, { headers: ah() });
    setForm({ email: '', reason: 'manual', notes: '' });
    load();
  };

  const remove = async (email: string) => {
    await api.delete(`/crm/campaigns/suppressions/${encodeURIComponent(email)}`, { headers: ah() });
    load();
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await api.post('/crm/campaigns/suppressions/import', fd, { headers: ah() });
    load();
  };

  const exportCsv = () => {
    const csv = ['email,reason,created_at', ...items.map((i) => `${i.email},${i.reason},${i.created_at}`)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'suppressions.csv';
    a.click();
  };

  const REASONS = ['', 'unsubscribed', 'bounced', 'complaint', 'manual'];
  const pages = Math.ceil(total / PAGE);

  return (
    <CRMLayout title="Suppressions">
      <div className="space-y-5">
        {/* Add form */}
        <div className={`${card} p-5`}>
          <h3 className="text-white font-semibold mb-4">Add to Suppression List</h3>
          <div className="flex gap-3 flex-wrap">
            <input className={`${inp} flex-1 min-w-[220px]`} type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <select className={`${inp} w-40`} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              <option value="manual" className="bg-[#0d1120]">Manual</option>
              <option value="unsubscribed" className="bg-[#0d1120]">Unsubscribed</option>
              <option value="bounced" className="bg-[#0d1120]">Bounced</option>
              <option value="complaint" className="bg-[#0d1120]">Complaint</option>
            </select>
            <input className={`${inp} flex-1 min-w-[180px]`} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button onClick={add} className={btn('primary')}><Plus className="h-4 w-4" />Add</button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input className={`${inp} max-w-xs`} placeholder="Search emails…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={`${inp} w-40`} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r} className="bg-[#0d1120]">{r || 'All reasons'}</option>)}
          </select>
          <div className="flex-1" />
          <span className="text-xs text-slate-500">{total.toLocaleString()} suppressed</span>
          <label className={`${btn()} cursor-pointer`}><Upload className="h-4 w-4" />Import CSV<input hidden type="file" accept=".csv" onChange={(e) => importCsv(e.target.files?.[0])} /></label>
          <button onClick={exportCsv} className={btn()}><Download className="h-4 w-4" />Export</button>
        </div>

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06] text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="p-4 text-left">Email</th>
                <th className="p-4 text-left">Reason</th>
                <th className="p-4 text-left">Notes</th>
                <th className="p-4 text-left">Added</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-white/[0.04]">
                  <td className="p-4 text-white">{item.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      item.reason === 'bounced'      ? 'text-red-400 bg-red-500/15'
                      : item.reason === 'complaint'  ? 'text-orange-400 bg-orange-500/15'
                      : item.reason === 'unsubscribed' ? 'text-yellow-400 bg-yellow-500/15'
                      : 'text-slate-400 bg-white/[0.06]'
                    }`}>{item.reason}</span>
                  </td>
                  <td className="p-4 text-slate-400 text-xs">{item.notes || '—'}</td>
                  <td className="p-4 text-slate-500 text-xs">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                  <td className="p-4">
                    <button onClick={() => remove(item.email)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No suppressed addresses.</td></tr>}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1); }} className={btn()}>Prev</button>
            <span className="text-slate-500 text-sm">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => { setPage(page + 1); load(page + 1); }} className={btn()}>Next</button>
          </div>
        )}
      </div>
    </CRMLayout>
  );
}


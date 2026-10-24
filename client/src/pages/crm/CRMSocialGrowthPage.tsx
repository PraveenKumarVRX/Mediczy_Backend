import { useEffect, useState } from 'react';
import { FileText, Inbox, MessageCircle, Plus, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

type Trigger = { id: string; channel: string; trigger_type: string; trigger_key: string; active: boolean };
type Rule = { id: string; name: string; match_type: string; active: boolean };
type Template = { id: string; name: string; language: string; status: string };

export default function CRMSocialGrowthPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [identities, setIdentities] = useState<any[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ triggerType: 'comment_to_dm', channel: 'instagram', triggerKey: '', accountId: '' });
  const [ruleForm, setRuleForm] = useState({ name: '', keyword: '', label: '' });
  const [templateForm, setTemplateForm] = useState({ name: '', language: 'en_US', category: 'utility' });

  const load = async () => {
    try {
      const headers = { headers: auth() };
      const [triggerResponse, identityResponse, ruleResponse, templateResponse, reminderResponse] = await Promise.all([
        api.get('/crm/social/triggers', headers),
        api.get('/crm/social/identities', headers),
        api.get('/crm/brightbean-chat/inbox/rules', headers),
        api.get('/crm/brightbean-chat/whatsapp/templates', headers),
        api.get('/crm/brightbean-chat/inbox/reminders', headers),
      ]);
      setTriggers(triggerResponse.data.triggers || []);
      setIdentities(identityResponse.data.identities || []);
      setRules(ruleResponse.data.rules || []);
      setTemplates(templateResponse.data.templates || []);
      setReminders(reminderResponse.data.reminders || []);
      setError('');
    } catch (e: any) { setError(e.response?.data?.message || 'Social growth is disabled or unavailable.'); }
  };

  useEffect(() => { load(); }, []);

  const addTrigger = async () => {
    try { await api.post('/crm/social/triggers', { ...form, config: { accountId: form.accountId } }, { headers: auth() }); setForm({ ...form, triggerKey: '' }); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not save trigger.'); }
  };
  const addRule = async () => {
    try {
      await api.post('/crm/brightbean-chat/inbox/rules', { name: ruleForm.name, matchType: 'keyword', matchConfig: { keywords: [ruleForm.keyword] }, actionConfig: ruleForm.label ? { label: ruleForm.label } : { pause: true } }, { headers: auth() });
      setRuleForm({ name: '', keyword: '', label: '' }); await load();
    } catch (e: any) { setError(e.response?.data?.message || 'Could not save inbox rule.'); }
  };
  const addTemplate = async () => {
    try { await api.post('/crm/brightbean-chat/whatsapp/templates', { ...templateForm, components: [] }, { headers: auth() }); setTemplateForm({ ...templateForm, name: '' }); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not save WhatsApp template.'); }
  };

  return <CRMLayout title="Social Growth">
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-white">Social omnichannel growth</h2><p className="text-sm text-slate-400">Tenant-scoped triggers, shared-inbox controls, compliant WhatsApp templates and operator reminders.</p></div><button onClick={load} className="rounded-lg p-2 text-slate-400 hover:text-white" aria-label="Refresh social growth"><RefreshCw className="h-5 w-5" /></button></div>
      {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-cyan-300" /><h3 className="font-semibold text-white">Growth triggers</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-4"><select className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })}><option value="comment_to_dm">Comment to direct message</option><option value="story_mention">Story mention</option><option value="follow">New follower</option><option value="ref_url">Referral URL</option><option value="qr">QR code</option></select><select className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option></select><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" placeholder="keyword / URL" value={form.triggerKey} onChange={(e) => setForm({ ...form, triggerKey: e.target.value })} /><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" placeholder="Meta account ID" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} /></div><button onClick={addTrigger} className="mt-3 flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" />Add trigger</button><div className="mt-4 space-y-2">{triggers.map((trigger) => <div key={trigger.id} className="rounded-lg bg-slate-800 p-3 text-sm text-slate-200">{trigger.channel} · {trigger.trigger_type} · {trigger.trigger_key}<span className="ml-2 text-xs text-slate-500">{trigger.active ? 'active' : 'paused'}</span></div>)}</div></section>
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><Inbox className="h-5 w-5 text-amber-300" /><h3 className="font-semibold text-white">Inbox rules</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" placeholder="Rule name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} /><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" placeholder="Keyword" value={ruleForm.keyword} onChange={(e) => setRuleForm({ ...ruleForm, keyword: e.target.value })} /><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" placeholder="Apply label" value={ruleForm.label} onChange={(e) => setRuleForm({ ...ruleForm, label: e.target.value })} /></div><button onClick={addRule} className="mt-3 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" />Add rule</button><div className="mt-4 space-y-2">{rules.map((rule) => <div key={rule.id} className="rounded-lg bg-slate-800 p-3 text-sm text-slate-200">{rule.name} · {rule.match_type}<span className="ml-2 text-xs text-slate-500">{rule.active ? 'active' : 'paused'}</span></div>)}{!rules.length && <p className="text-xs text-slate-500">No inbox rules yet.</p>}</div></section>
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-300" /><h3 className="font-semibold text-white">WhatsApp templates</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" placeholder="Template name" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /><input className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" aria-label="Language code, for example English (United States): en_US" placeholder="Language, e.g. en_US (English, US)" value={templateForm.language} onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })} /><select className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}><option value="utility">Utility</option><option value="marketing">Marketing</option><option value="authentication">Authentication</option></select></div><button onClick={addTemplate} className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" />Save draft</button><div className="mt-4 space-y-2">{templates.map((template) => <div key={template.id} className="rounded-lg bg-slate-800 p-3 text-sm text-slate-200">{template.name} · {template.language}<span className="ml-2 text-xs text-slate-500">{template.status}</span></div>)}{!templates.length && <p className="text-xs text-slate-500">No templates yet.</p>}</div></section>
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><Timer className="h-5 w-5 text-violet-300" /><h3 className="font-semibold text-white">Operator reminders</h3></div><div className="mt-4 space-y-2">{reminders.map((reminder) => <div key={reminder.id} className="rounded-lg bg-slate-800 p-3 text-sm text-slate-200">{reminder.note}<span className="ml-2 text-xs text-slate-500">{reminder.status} · {new Date(reminder.remind_at).toLocaleString()}</span></div>)}{!reminders.length && <p className="text-xs text-slate-500">No scheduled reminders.</p>}</div></section>
      </div>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky-300" /><h3 className="font-semibold text-white">Cross-channel identities</h3></div><div className="mt-4 grid gap-2 md:grid-cols-2">{identities.map((identity) => <div key={identity.id} className="rounded-lg bg-slate-800 p-3"><p className="text-sm text-white">{identity.channel} · {identity.external_user_id}</p><p className="text-xs text-slate-500">consent: {identity.consent_status}</p></div>)}{!identities.length && <p className="text-xs text-slate-500">No identities resolved yet.</p>}</div></section>
    </div>
  </CRMLayout>;
}

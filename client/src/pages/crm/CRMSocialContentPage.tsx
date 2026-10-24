import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock3, MessageSquare, Plus, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

const auth = () => {
  const token = localStorage.getItem('crmToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const platforms = [
  ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['pinterest', 'Pinterest'],
  ['threads', 'Threads'], ['bluesky', 'Bluesky'], ['google_business', 'Google Business'],
  ['mastodon', 'Mastodon'], ['devto', 'DEV.to'],
] as const;

type Platform = (typeof platforms)[number][0];
type Status = 'draft' | 'pending_approval' | 'approved' | 'rejected';
type PostComment = { id: number; body: string; createdBy: number; createdAt: string };
type PostEvent = { id: number; action: string; fromStatus: string | null; toStatus: string | null; actorUserId: number; createdAt: string };
type SocialPost = {
  id: number;
  uniqueId: string;
  caption: string;
  platforms: Platform[];
  platformCaptions: Record<string, string>;
  mediaUrls: string[];
  category: string | null;
  tags: string[];
  status: Status;
  plannedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  comments?: PostComment[];
  events?: PostEvent[];
};
type PostForm = {
  caption: string;
  platforms: Platform[];
  platformCaptions: Record<string, string>;
  mediaUrls: string;
  category: string;
  tags: string;
  plannedAt: string;
};

const emptyForm = (): PostForm => ({
  caption: '',
  platforms: ['instagram'],
  platformCaptions: {},
  mediaUrls: '',
  category: '',
  tags: '',
  plannedAt: '',
});
const statusStyles: Record<Status, string> = {
  draft: 'bg-slate-500/15 text-slate-300',
  pending_approval: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-300',
};
const localDateTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const readableDate = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function CRMSocialContentPage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PostForm>(emptyForm);
  const [rejectReason, setRejectReason] = useState('');
  const [planAt, setPlanAt] = useState('');
  const [comment, setComment] = useState('');

  const range = useMemo(() => ({
    from: new Date(month.getFullYear(), month.getMonth(), 1).toISOString(),
    to: new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString(),
  }), [month]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/social/posts', { headers: auth(), params: range });
      setPosts(data.posts || []);
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not load the content calendar.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  const refreshSelected = useCallback(async (id: number) => {
    const { data } = await api.get(`/crm/social/posts/${id}`, { headers: auth() });
    setSelected(data.post || null);
    setPlanAt(localDateTime(data.post?.plannedAt || null));
    await loadPosts();
  }, [loadPosts]);

  useEffect(() => { void loadPosts(); }, [loadPosts]);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [month]);
  const postsByDay = useMemo(() => {
    const grouped = new Map<string, SocialPost[]>();
    for (const post of posts) {
      if (!post.plannedAt) continue;
      const key = dateKey(new Date(post.plannedAt));
      grouped.set(key, [...(grouped.get(key) || []), post]);
    }
    return grouped;
  }, [posts]);

  const openNewPost = (date?: Date) => {
    if (date && dateKey(date) < dateKey(new Date())) return;
    const nextForm = emptyForm();
    if (date) {
      const planned = dateKey(date) === dateKey(new Date()) ? new Date(Date.now() + 3600000) : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0);
      nextForm.plannedAt = localDateTime(planned.toISOString());
    }
    setEditingId(null);
    setForm(nextForm);
    setFormOpen(true);
    setError('');
  };

  const editPost = (post: SocialPost) => {
    setEditingId(post.id);
    setForm({
      caption: post.caption,
      platforms: post.platforms,
      platformCaptions: post.platformCaptions || {},
      mediaUrls: (post.mediaUrls || []).join('\n'),
      category: post.category || '',
      tags: (post.tags || []).join(', '),
      plannedAt: localDateTime(post.plannedAt),
    });
    setFormOpen(true);
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      caption: form.caption,
      platforms: form.platforms,
      platformCaptions: form.platformCaptions,
      mediaUrls: form.mediaUrls.split('\n').map((url) => url.trim()).filter(Boolean),
      category: form.category,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      plannedAt: form.plannedAt ? new Date(form.plannedAt).toISOString() : null,
    };
    try {
      const response = editingId
        ? await api.patch(`/crm/social/posts/${editingId}`, payload, { headers: auth() })
        : await api.post('/crm/social/posts', payload, { headers: auth() });
      const post = response.data.post as SocialPost;
      setFormOpen(false);
      await refreshSelected(post.id);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not save the draft.');
    } finally {
      setSaving(false);
    }
  };

  const runPostAction = async (action: string, body: Record<string, string> = {}) => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/crm/social/posts/${selected.id}/${action}`, body, { headers: auth() });
      await refreshSelected(selected.id);
      setRejectReason('');
    } catch (e: any) {
      setError(e.response?.data?.message || 'The post action could not be completed.');
    } finally {
      setSaving(false);
    }
  };

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !comment.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/crm/social/posts/${selected.id}/comments`, { body: comment }, { headers: auth() });
      setComment('');
      await refreshSelected(selected.id);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not add the review comment.');
    } finally {
      setSaving(false);
    }
  };

  const savePlan = async () => {
    if (!selected || !planAt) return;
    await runPostAction('plan', { plannedAt: new Date(planAt).toISOString() });
  };

  const togglePlatform = (platform: Platform) => {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform],
    }));
  };

  return (
    <CRMLayout title="Social Content Calendar">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Content calendar</h2>
            <p className="mt-1 text-sm text-slate-400">Draft, review and plan social content with a clear approval trail.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void loadPosts()} className="rounded-xl border border-white/10 p-2.5 text-slate-300 hover:bg-white/5" aria-label="Refresh calendar"><RefreshCw className="h-4 w-4" /></button>
            <button onClick={() => openNewPost()} className="flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500"><Plus className="h-4 w-4" />Create post</button>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-xs leading-5 text-cyan-100/80">
          Planning and approvals are available here. Posts are not published automatically; a supported social account and publishing connector are required for delivery.
        </div>

        {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-2xl border border-white/[0.07] bg-[#0c1220] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-white"><Calendar className="h-5 w-5 text-violet-300" /><h3 className="font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3></div>
              <div className="flex items-center gap-1">
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-white/5">Today</button>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-l border-t border-white/[0.06]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="border-b border-r border-white/[0.06] py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{day}</div>)}
              {calendarDays.map((date) => {
                const dayPosts = postsByDay.get(dateKey(date)) || [];
                const outsideMonth = date.getMonth() !== month.getMonth();
                return (
                  <div key={dateKey(date)} className={`min-h-24 border-b border-r border-white/[0.06] p-1.5 sm:min-h-28 sm:p-2 ${outsideMonth ? 'bg-white/[0.015]' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${dateKey(date) === dateKey(new Date()) ? 'rounded-full bg-violet-600 px-2 py-1 text-white' : outsideMonth ? 'text-slate-700' : 'text-slate-400'}`}>{date.getDate()}</span>
                      {dateKey(date) >= dateKey(new Date()) && <button onClick={() => openNewPost(date)} className="rounded p-0.5 text-slate-600 hover:bg-white/10 hover:text-violet-300" aria-label={`Create post for ${date.toLocaleDateString()}`}><Plus className="h-3 w-3" /></button>}
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayPosts.slice(0, 3).map((post) => (
                        <button key={post.id} onClick={() => void refreshSelected(post.id)} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] leading-4 ${statusStyles[post.status]} ${selected?.id === post.id ? 'ring-1 ring-white/50' : ''}`}>
                          {post.caption}
                        </button>
                      ))}
                      {dayPosts.length > 3 && <span className="block px-1 text-[10px] text-slate-500">+{dayPosts.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {loading && <p className="mt-3 text-xs text-slate-500">Loading calendar…</p>}
            {!loading && posts.length === 0 && <p className="mt-3 text-xs text-slate-500">No planned posts this month. Draft one or use a day’s + button to plan it.</p>}
          </section>

          <aside className="space-y-4">
            {formOpen && (
              <form onSubmit={saveDraft} className="rounded-2xl border border-violet-500/20 bg-[#0c1220] p-4">
                <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-white">{editingId ? 'Edit draft' : 'Compose post'}</h3><button type="button" onClick={() => setFormOpen(false)} className="text-xs text-slate-400 hover:text-white">Close</button></div>
                <label className="mb-1 block text-xs text-slate-400">Caption</label>
                <textarea required maxLength={5000} rows={5} value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white outline-none focus:border-violet-500/50" placeholder="Write a clear, platform-ready caption…" />
                <div className="mt-2 flex justify-end text-[10px] text-slate-500">{form.caption.length}/5000</div>
                <fieldset className="mt-3">
                  <legend className="mb-2 text-xs text-slate-400">Platforms</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {platforms.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={form.platforms.includes(value)} onChange={() => togglePlatform(value)} className="accent-violet-500" />{label}</label>)}
                  </div>
                </fieldset>
                {form.platforms.length > 0 && <details className="mt-3 rounded-lg border border-white/[0.06] p-2">
                  <summary className="cursor-pointer text-xs text-slate-400">Optional platform-specific captions</summary>
                  <div className="mt-2 space-y-2">{form.platforms.map((platform) => <label key={platform} className="block text-[11px] capitalize text-slate-500">{platform.replace('_', ' ')}<textarea rows={2} maxLength={5000} value={form.platformCaptions[platform] || ''} onChange={(event) => setForm({ ...form, platformCaptions: { ...form.platformCaptions, [platform]: event.target.value } })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] p-2 text-xs text-white" placeholder="Leave blank to use the main caption" /></label>)}</div>
                </details>}
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="text-xs text-slate-400">Planned date and time<input type="datetime-local" min={localDateTime(new Date().toISOString())} value={form.plannedAt} onChange={(event) => setForm({ ...form, plannedAt: event.target.value })} className="mt-1 block h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-white" /></label>
                  <label className="text-xs text-slate-400">Category<input maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 block h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-white" placeholder="e.g. Health tips" /></label>
                </div>
                <label className="mt-3 block text-xs text-slate-400">Media URLs (one per line)<textarea rows={2} value={form.mediaUrls} onChange={(event) => setForm({ ...form, mediaUrls: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] p-2 text-xs text-white" placeholder="https://…" /></label>
                <label className="mt-3 block text-xs text-slate-400">Tags (comma-separated)<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-white" placeholder="awareness, clinic" /></label>
                <button disabled={saving || form.platforms.length === 0} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button>
              </form>
            )}

            {posts.some((post) => !post.plannedAt) && <section className="rounded-2xl border border-white/[0.07] bg-[#0c1220] p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">Unplanned drafts & review</h3>
              <div className="max-h-56 space-y-2 overflow-y-auto">{posts.filter((post) => !post.plannedAt).map((post) => <button key={post.id} onClick={() => void refreshSelected(post.id)} className={`block w-full rounded-lg border border-white/[0.05] p-2.5 text-left hover:bg-white/[0.04] ${selected?.id === post.id ? 'ring-1 ring-violet-500/50' : ''}`}><span className={`rounded-full px-2 py-0.5 text-[9px] ${statusStyles[post.status]}`}>{post.status.replace('_', ' ')}</span><span className="mt-1 block truncate text-xs text-slate-300">{post.caption}</span></button>)}</div>
            </section>}

            {selected && (
              <section className="rounded-2xl border border-white/[0.07] bg-[#0c1220] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${statusStyles[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
                  {['draft', 'rejected'].includes(selected.status) && <button onClick={() => editPost(selected)} className="text-xs text-violet-300 hover:text-white">Edit</button>}
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{selected.caption}</p>
                <div className="mt-3 flex flex-wrap gap-1">{selected.platforms.map((platform) => <span key={platform} className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] capitalize text-slate-400">{platform.replace('_', ' ')}</span>)}</div>
                {selected.plannedAt && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />Planned for {readableDate(selected.plannedAt)}</p>}
                {selected.rejectionReason && <p className="mt-3 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">Review note: {selected.rejectionReason}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {['draft', 'rejected'].includes(selected.status) && <button disabled={saving} onClick={() => void runPostAction('submit')} className="flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />Submit for review</button>}
                  {selected.status === 'pending_approval' && <button disabled={saving} onClick={() => void runPostAction('approve')} className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs text-white disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />Approve</button>}
                </div>
                {selected.status === 'pending_approval' && <div className="mt-3 flex gap-2"><input maxLength={1000} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white" placeholder="Reason for rejection" /><button disabled={saving || !rejectReason.trim()} onClick={() => void runPostAction('reject', { reason: rejectReason })} className="h-9 rounded-lg border border-rose-500/20 px-3 text-xs text-rose-300 disabled:opacity-40">Reject</button></div>}
                {selected.status === 'approved' && <div className="mt-3 space-y-2"><label className="block text-xs text-slate-400">Plan or reschedule<input type="datetime-local" min={localDateTime(new Date().toISOString())} value={planAt} onChange={(event) => setPlanAt(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white" /></label><button disabled={saving || !planAt} onClick={() => void savePlan()} className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-40">{selected.plannedAt ? 'Update planned time' : 'Add to calendar'}</button></div>}

                <form onSubmit={addComment} className="mt-4 border-t border-white/[0.06] pt-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300"><MessageSquare className="h-3.5 w-3.5" />Review thread</div>
                  <div className="max-h-36 space-y-2 overflow-y-auto">{(selected.comments || []).map((item) => <div key={item.id} className="rounded-lg bg-white/[0.04] p-2"><p className="text-xs text-slate-300">{item.body}</p><p className="mt-1 text-[10px] text-slate-600">{readableDate(item.createdAt)}</p></div>)}{!selected.comments?.length && <p className="text-[11px] text-slate-600">No review comments yet.</p>}</div>
                  <div className="mt-2 flex gap-2"><input maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white" placeholder="Add an internal comment" /><button disabled={saving || !comment.trim()} className="h-9 rounded-lg bg-white/[0.08] px-3 text-xs text-slate-200 disabled:opacity-40">Add</button></div>
                </form>
                <details className="mt-3 border-t border-white/[0.06] pt-3"><summary className="cursor-pointer text-xs text-slate-500">Activity history</summary><div className="mt-2 space-y-2">{(selected.events || []).map((event) => <p key={event.id} className="text-[10px] text-slate-500">{event.action.replace(/_/g, ' ')} · {readableDate(event.createdAt)}</p>)}</div></details>
              </section>
            )}

            {!formOpen && !selected && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center"><Calendar className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-2 text-sm text-slate-300">Select a calendar post</p><p className="mt-1 text-xs text-slate-600">or create a draft to start a review.</p><button onClick={() => openNewPost()} className="mt-4 inline-flex items-center gap-2 text-xs text-violet-300"><Plus className="h-3.5 w-3.5" />New post</button></div>}
          </aside>
        </div>
      </div>
    </CRMLayout>
  );
}

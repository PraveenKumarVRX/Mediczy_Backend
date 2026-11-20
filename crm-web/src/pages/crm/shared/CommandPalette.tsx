import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Loader2, Route, Search } from 'lucide-react';
import api from '@/utils/api';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

type NavItem = { label: string; path: string; section: string };
type Result = { kind: 'lead'; id: number; label: string; sub: string } | { kind: 'page'; id: string; label: string; sub: string; path: string };

/**
 * Global Cmd/Ctrl+K search — jump to a lead (opens its 360° drawer via
 * /crm/leads?open=<id>) or straight to any sidebar page by name, from
 * anywhere in the CRM. Mounted once in CRMLayout.
 */
export default function CommandPalette({ navItems, open, onOpenChange }: { navItems: NavItem[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const setOpen = onOpenChange;
  const [query, setQuery] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  useEffect(() => {
    if (open) { setQuery(''); setLeadResults([]); setActiveIndex(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setLeadResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await api.get('/crm/leads', { headers: headers(), params: { search: query, limit: 6 } });
        setLeadResults(response.data?.data || []);
      } catch { setLeadResults([]); } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const matchingPages = query.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
    : [];

  const results: Result[] = [
    ...leadResults.map((l): Result => ({ kind: 'lead', id: l.id, label: l.name, sub: l.email || l.phone || l.company || '' })),
    ...matchingPages.map((p): Result => ({ kind: 'page', id: p.path, label: p.label, sub: p.section, path: p.path })),
  ];

  const go = (result: Result) => {
    setOpen(false);
    if (result.kind === 'lead') navigate(`/crm/leads?open=${result.id}`);
    else navigate(result.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIndex]) { e.preventDefault(); go(results[activeIndex]); }
  };

  if (!open) return null;

  return <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/60 px-4" onClick={() => setOpen(false)}>
    <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141422] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4 border-b border-white/[0.06]">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }} onKeyDown={onKeyDown}
          placeholder="Search leads, or jump to a page…"
          className="h-12 flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
        />
        {searching && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
        <kbd className="text-[10px] text-slate-600 border border-white/10 rounded px-1.5 py-0.5">esc</kbd>
      </div>
      <div className="max-h-80 overflow-y-auto py-2">
        {!query.trim() && <div className="px-4 py-6 text-center text-xs text-slate-600">Type a lead's name, email, or phone — or a page like "segments".</div>}
        {query.trim() && !results.length && !searching && <div className="px-4 py-6 text-center text-xs text-slate-600">No matches.</div>}
        {results.map((result, i) => (
          <div key={`${result.kind}-${result.id}`}>
            {i === 0 && result.kind === 'lead' && <div className="px-4 pt-1 pb-1 text-[10px] uppercase tracking-wider text-slate-600">Leads</div>}
            {result.kind === 'page' && (i === 0 || results[i - 1].kind === 'lead') && <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-600">Pages</div>}
            <button
              onClick={() => go(result)} onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${i === activeIndex ? 'bg-violet-500/10' : ''}`}
            >
              <div className="h-7 w-7 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                {result.kind === 'lead' ? <Search className="h-3.5 w-3.5 text-violet-300" /> : <Route className="h-3.5 w-3.5 text-violet-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{result.label}</div>
                <div className="text-xs text-slate-500 truncate">{result.sub}</div>
              </div>
              {i === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

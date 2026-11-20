import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import api from '@/utils/api';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

export type ResolvedLead = {
  legacyLeadId: number;
  v2LeadId: number | null;
  identityId: number | null;
  contactId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
};

/**
 * Search-and-select a lead by name/email/phone, then resolve it to the v2
 * ids (leadId/identityId/contactId) the worldclass domain APIs expect —
 * so callers never have to know or type a raw database id. Reuses
 * GET /crm/leads/:id/context (the same endpoint backing the lead 360° view).
 */
export default function LeadPicker({ value, onSelect, placeholder = 'Search leads by name, email, or phone' }: {
  value: ResolvedLead | null;
  onSelect: (lead: ResolvedLead | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await api.get('/crm/leads', { headers: authHeaders(), params: { search: query, limit: 8 } });
        setResults(response.data?.data || []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const select = async (lead: any) => {
    setResolving(true);
    setError('');
    try {
      const response = await api.get(`/crm/leads/${lead.id}/context`, { headers: authHeaders() });
      const v2 = response.data?.data?.v2;
      if (!v2) { setError(`${lead.name} hasn't synced to the v2 CRM yet — try again shortly.`); return; }
      onSelect({ legacyLeadId: lead.id, v2LeadId: v2.leadId, identityId: v2.identityId, contactId: v2.contactId, name: lead.name, email: lead.email, phone: lead.phone });
      setOpen(false);
      setQuery('');
    } catch {
      setError('Could not resolve this lead. Try again.');
    } finally { setResolving(false); }
  };

  if (value) {
    return <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div><div className="text-sm text-white">{value.name}</div><div className="text-xs text-slate-500">{value.email || value.phone || 'No contact info'}</div></div>
      <button type="button" className="text-slate-400 hover:text-white" onClick={() => onSelect(null)}><X className="h-4 w-4" /></button>
    </div>;
  }

  return <div className="relative">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
      <input
        className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
        placeholder={placeholder} value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      />
      {resolving && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-cyan-300" />}
    </div>
    {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
    {open && query.trim() && (
      <div className="absolute z-10 mt-1 w-full rounded-md border border-white/10 bg-[#111827] shadow-xl max-h-56 overflow-y-auto">
        {searching && <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching…</div>}
        {!searching && results.length === 0 && <div className="px-3 py-3 text-xs text-slate-600">No matches.</div>}
        {!searching && results.map((lead: any) => (
          <button type="button" key={lead.id} className="w-full text-left px-3 py-2 hover:bg-white/[0.05] text-sm text-slate-200" onClick={() => select(lead)}>
            <div>{lead.name}</div>
            <div className="text-xs text-slate-500">{lead.email || lead.phone}{lead.company ? ` · ${lead.company}` : ''}</div>
          </button>
        ))}
      </div>
    )}
  </div>;
}

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Building2, CalendarPlus, Loader2, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

/**
 * Publishing a lab to the Provider Network does not make it bookable: Team booking
 * offers only the labs in each company's network. This panel does that step: find a
 * published lab, pick the companies, add it. It then appears in that company's lab
 * search when booking a check-up.
 */
interface DirectoryLab {
  id: string; name: string; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
  bookableFor: { corporateId: number; name: string }[];
}
interface Company { id: number; name: string }

const ProviderNetworkBookableLabs = ({ authHeader, searchHint }: { authHeader?: Record<string, string>; searchHint?: string }) => {
  const [search, setSearch] = useState('');
  const [labs, setLabs] = useState<DirectoryLab[]>([]);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedLab, setSelectedLab] = useState<DirectoryLab | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/team/provider-network-bot/directory/labs?search=${encodeURIComponent(q)}&limit=30`, { headers: authHeader });
      setLabs(data?.labs || []);
    } catch { toast.error('Could not load the published labs'); } finally { setLoading(false); }
  }, [authHeader]);

  useEffect(() => {
    api.get('/admin/corporates').then((r) => {
      const raw = r.data?.corporates || r.data?.data || r.data || [];
      setCompanies((Array.isArray(raw) ? raw : [])
        .filter((c: any) => String(c.status || '').toLowerCase() === 'active')
        .map((c: any) => ({ id: Number(c.id), name: String(c.companyName || c.company_name || '') }))
        .sort((a: Company, b: Company) => a.name.localeCompare(b.name)));
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => { if (searchHint) setSearch(searchHint); }, [searchHint]);
  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const pick = (lab: DirectoryLab) => {
    setSelectedLab(selectedLab?.id === lab.id ? null : lab);
    setChosen([]);
  };

  const add = async () => {
    if (!selectedLab || !chosen.length) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/team/provider-network-bot/directory/${selectedLab.id}/add-to-network`, { corporateIds: chosen }, { headers: authHeader });
      const added = (data?.added || []).map((c: Company) => c.name);
      const already = (data?.alreadyBookable || []).map((c: Company) => c.name);
      toast.success(
        added.length ? `${selectedLab.name} (${selectedLab.city}) can now be booked for ${added.join(', ')}.` : `${selectedLab.name} was already bookable for those companies.`,
        { description: already.length && added.length ? `Already bookable for ${already.join(', ')}.` : undefined },
      );
      setSelectedLab(null); setChosen([]);
      load(search.trim());
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not add the lab');
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarPlus className="h-4 w-4 text-primary" /> Make a lab bookable for a company</CardTitle>
        <CardDescription>
          Publishing a lab adds it to the directory only. To offer it for a company's health check-ups, pick the lab and the companies here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search published labs by name, city or pincode" className="pl-9" />
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : labs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No published labs match.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {labs.map((lab) => {
              const open = selectedLab?.id === lab.id;
              const bookableIds = new Set(lab.bookableFor.map((b) => b.corporateId));
              return (
                <li key={lab.id} className={open ? 'bg-muted/40' : ''}>
                  <button type="button" onClick={() => pick(lab)} aria-expanded={open} className="flex w-full flex-col gap-1 px-3 py-2.5 text-left sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{lab.name}</span>
                      <span className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="min-w-0 break-words">{lab.city ? `${lab.city}${lab.state ? `, ${lab.state}` : ''}` : 'No city'}{lab.pincode ? ` ${lab.pincode}` : ''}{lab.address ? ` · ${lab.address}` : ''}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-1">
                      {lab.bookableFor.length
                        ? lab.bookableFor.map((b) => <Badge key={b.corporateId} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{b.name}</Badge>)
                        : <Badge variant="outline" className="text-muted-foreground">Not bookable yet</Badge>}
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      {!lab.city ? (
                        <p className="text-sm text-amber-700 dark:text-amber-300">This entry has no city. Add it again with the city filled in, so employees know where the lab is.</p>
                      ) : (
                        <>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add to these companies' networks</p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {companies.map((c) => {
                              const already = bookableIds.has(c.id);
                              return (
                                <label key={c.id} className={`flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm ${already ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'}`}>
                                  <input type="checkbox" disabled={already} checked={already || chosen.includes(c.id)}
                                    onChange={(e) => setChosen((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))} />
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="min-w-0 truncate">{c.name}</span>
                                  {already && <span className="ml-auto text-xs text-muted-foreground">already</span>}
                                </label>
                              );
                            })}
                          </div>
                          <div className="flex justify-end">
                            <Button onClick={add} disabled={!chosen.length || saving}>
                              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                              Add to {chosen.length || ''} {chosen.length === 1 ? 'company' : 'companies'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default ProviderNetworkBookableLabs;

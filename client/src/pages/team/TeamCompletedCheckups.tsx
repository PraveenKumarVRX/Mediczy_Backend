/**
 * Team portal: employees who completed their annual health check-up, with reports to view,
 * download or share. Its own menu item, so Team does not have to open a company's booking
 * screen to find it. Same list and APIs as Corporate Health Booking → Completed Check-ups.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, CalendarCheck } from 'lucide-react';
import CheckupCompletionsTable from '@/components/corporate/CheckupCompletionsTable';
import api from '@/utils/api';

interface Corporate { id: number; companyName: string }
const LAST_KEY = 'team.completedCheckups.corporateId';

export default function TeamCompletedCheckups() {
  const [params, setParams] = useSearchParams();
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    api.get('/admin/corporates')
      .then((r) => {
        const raw = r.data.corporates || r.data.data || r.data || [];
        const list: Corporate[] = (Array.isArray(raw) ? raw : [])
          .map((c: Record<string, unknown>) => ({ id: Number(c.id), companyName: String(c.companyName || c.company_name || `Company ${c.id}`) }))
          .filter((c) => Number.isInteger(c.id) && c.id > 0)
          .sort((a, b) => a.companyName.localeCompare(b.companyName));
        setCorporates(list);
        let remembered = '';
        try { remembered = localStorage.getItem(LAST_KEY) || ''; } catch { /* storage blocked */ }
        const wanted = params.get('corporateId') || remembered;
        const pick = list.find((c) => String(c.id) === wanted) || (list.length === 1 ? list[0] : null);
        if (pick) setSelectedId(String(pick.id));
      })
      .catch(() => setError('Could not load your companies. Please refresh the page.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => {
    setSelectedId(id);
    setParams({ corporateId: id }, { replace: true });
    try { localStorage.setItem(LAST_KEY, id); } catch { /* storage blocked */ }
  };

  const selected = corporates.find((c) => String(c.id) === selectedId);

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-emerald-600" /> Completed Check-ups</h1>
            <p className="text-sm text-muted-foreground">Employees who have completed their annual health check-up, with their reports to view, download or share.</p>
          </div>
          <div className="w-full sm:w-80">
            <Select value={selectedId} onValueChange={choose} disabled={loading || corporates.length === 0}>
              <SelectTrigger aria-label="Company" className="h-10 [&>span]:flex-1 [&>span]:text-left">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={loading ? 'Loading companies…' : 'Choose a company'} />
              </SelectTrigger>
              <SelectContent>
                {corporates.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <Card><CardContent className="py-6 text-sm text-destructive">{error}</CardContent></Card>}
        {!error && !loading && corporates.length === 0 && (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">No companies are assigned to you.</CardContent></Card>
        )}
        {!error && !loading && corporates.length > 0 && !selected && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Choose a company to see its employees' completed check-ups and reports.</CardContent></Card>
        )}
        {selected && <CheckupCompletionsTable key={selected.id} mode="team" corporateId={selected.id} corporateName={selected.companyName} showTitle={false} />}
      </div>
    </MainLayout>
  );
}

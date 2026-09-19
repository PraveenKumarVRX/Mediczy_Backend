/**
 * Specialty OT — post-op follow-up worklist (due soon) and case lookup that
 * opens the SpecialtyOtPanel for an OT booking. Data entry / tracking only.
 * Backend: /api/specialty-ot/followup-plan/due-soon
 */

import { useCallback, useEffect, useState } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Scissors } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import SpecialtyOtPanel from '@/components/ot/SpecialtyOtPanel';
import { otNavSections } from './OTModulePages';

type DueItem = {
  id: number;
  ot_booking_id: number | string;
  patient_id: number | string | null;
  followup_type: string;
  due_date: string;
  status: string;
};

const FOLLOWUP_LABEL: Record<string, string> = { day1: 'Day 1', week1: 'Week 1', month1: 'Month 1' };

export default function SpecialtyOtWorklist() {
  const { toast } = useToast();
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withinDays, setWithinDays] = useState('7');
  const [lookupId, setLookupId] = useState('');
  const [bookingId, setBookingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/specialty-ot/followup-plan/due-soon', { params: { withinDays: Number(withinDays) || 7 } });
      const data = res.data?.data ?? res.data;
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not load follow-up worklist');
    } finally {
      setLoading(false);
    }
  }, [withinDays]);

  useEffect(() => { load(); }, [load]);

  const openCase = () => {
    const n = Number(lookupId);
    if (!Number.isInteger(n) || n <= 0) {
      toast({ title: 'Enter a valid OT booking number', variant: 'destructive' });
      return;
    }
    setBookingId(n);
  };

  return (
    <HospDeptLayout
      deptKey="ot" deptName="Operation Theatre" badgeLabel="OT"
      loginPath="/ot/login" DeptIcon={Scissors} navSections={otNavSections}
      title="Specialty OT Details" subtitle="Lens / implant record entry and post-op follow-up worklist"
      copilotModule="ot"
    >
      <div className="space-y-5">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Open a case</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="sot-lookup">OT booking number</Label>
                <Input
                  id="sot-lookup" inputMode="numeric" value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openCase(); }}
                />
              </div>
              <Button size="sm" onClick={openCase}>Open</Button>
            </div>
          </CardContent>
        </Card>

        {bookingId != null && <SpecialtyOtPanel key={bookingId} otBookingId={bookingId} />}

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Post-op follow-ups due soon (pending)</CardTitle>
              <div className="flex items-end gap-2">
                <div>
                  <Label htmlFor="sot-within">Within days</Label>
                  <Input id="sot-within" className="w-20" inputMode="numeric" value={withinDays} onChange={(e) => setWithinDays(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>}
            {!loading && error && <p className="text-sm text-red-500 py-6 text-center">{error}</p>}
            {!loading && !error && items.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No pending follow-ups due in this period.</p>
            )}
            {!loading && !error && items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OT booking</TableHead>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>#{String(it.ot_booking_id)}</TableCell>
                      <TableCell>{it.patient_id != null ? String(it.patient_id) : '—'}</TableCell>
                      <TableCell>{FOLLOWUP_LABEL[it.followup_type] || it.followup_type}</TableCell>
                      <TableCell>{String(it.due_date).slice(0, 10)}</TableCell>
                      <TableCell><Badge variant="outline">{it.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setLookupId(String(it.ot_booking_id)); setBookingId(Number(it.ot_booking_id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          Open case
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </HospDeptLayout>
  );
}

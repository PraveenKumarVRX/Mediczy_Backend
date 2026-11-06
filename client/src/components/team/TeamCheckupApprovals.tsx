import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, FlaskConical, Upload, FileCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Checkup {
  id: string; bookingReference: string; status: string;
  employee: { id: number; name?: string; email?: string; phone?: string };
  beneficiary?: { name?: string; relation?: string };
  packageName: string; lab: { name?: string; address?: any }; appointment: { date: string; timeSlot: string };
  reportCount: number;
}

const STATUS_CLS: Record<string, string> = {
  booked: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  confirmed: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  completed: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30',
  reports_available: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
};

const TeamCheckupApprovals = ({ corporateId, corporateName }: { corporateId?: number | string; corporateName?: string }) => {
  const [checkups, setCheckups] = useState<Checkup[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (!corporateId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/corporate-bookings/checkups?corporateId=${corporateId}`);
      setCheckups(data?.checkups || []);
    } catch { toast.error('Could not load checkups'); } finally { setLoading(false); }
  }, [corporateId]);
  useEffect(() => { load(); }, [load]);

  const act = async (c: Checkup, action: 'approve' | 'reject' | 'complete') => {
    setBusy(`${action}-${c.id}`);
    try {
      const body = action === 'reject' ? { reason: 'Not approved by the wellness team' } : {};
      await api.post(`/corporate-bookings/checkups/${c.id}/${action}`, body);
      toast.success(action === 'approve' ? 'Booking confirmed' : action === 'reject' ? 'Booking rejected' : 'Marked completed');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Action failed'); } finally { setBusy(null); }
  };

  const uploadReports = async (c: Checkup, files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(`upload-${c.id}`);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('reports', f));
      fd.append('reportName', `${c.packageName} report`);
      fd.append('corporateName', corporateName || '');
      fd.append('reportDate', new Date().toISOString().slice(0, 10));
      await api.post(`/corporate-bookings/checkups/${c.id}/reports`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Report uploaded — employee notified');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Upload failed'); } finally { setBusy(null); }
  };

  if (!corporateId) return <div className="py-12 text-center text-sm text-muted-foreground">Select a corporate to view employee checkup bookings.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Employee-initiated bookings — approve to confirm, then upload reports.</p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /><span className="ml-1.5">Refresh</span></Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : checkups.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">No employee checkup bookings yet.</div>
      ) : (
        <div className="space-y-2">
          {checkups.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{c.employee?.name || `Employee #${c.employee?.id}`}</span>
                    <Badge variant="outline" className={`capitalize ${STATUS_CLS[c.status] || ''}`}>{c.status.replace('_', ' ')}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.packageName} · {c.lab?.name || '—'} · {String(c.appointment?.date).slice(0, 10)} {c.appointment?.timeSlot}
                    {c.beneficiary?.relation && c.beneficiary.relation !== 'self' ? ` · for ${c.beneficiary?.name} (${c.beneficiary.relation})` : ''}
                    {c.reportCount ? ` · ${c.reportCount} report(s)` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {c.status === 'booked' && (
                    <>
                      <Button size="sm" disabled={busy === `approve-${c.id}`} onClick={() => act(c, 'approve')}>
                        {busy === `approve-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}<span className="ml-1.5">Approve</span>
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === `reject-${c.id}`} onClick={() => act(c, 'reject')}><XCircle className="h-4 w-4" /><span className="ml-1.5">Reject</span></Button>
                    </>
                  )}
                  {['confirmed', 'scheduled', 'rescheduled'].includes(c.status) && (
                    <Button size="sm" variant="outline" disabled={busy === `complete-${c.id}`} onClick={() => act(c, 'complete')}>
                      {busy === `complete-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}<span className="ml-1.5">Mark completed</span>
                    </Button>
                  )}
                  {['confirmed', 'scheduled', 'rescheduled', 'completed', 'reports_available'].includes(c.status) && (
                    <>
                      <input ref={(el) => (fileInputs.current[c.id] = el)} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={(e) => uploadReports(c, e.target.files)} />
                      <Button size="sm" variant="secondary" disabled={busy === `upload-${c.id}`} onClick={() => fileInputs.current[c.id]?.click()}>
                        {busy === `upload-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}<span className="ml-1.5">Upload report</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamCheckupApprovals;

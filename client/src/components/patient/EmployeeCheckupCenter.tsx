import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Download, Share2, Loader2, Info, FlaskConical, ChevronDown, ChevronUp, FileCheck, Clock, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

interface RefLetter { id: string; referenceNumber: string; lab: { name?: string }; tests: string[]; validUntil?: string | null; issuedAt: string; }
interface BookingReport { index: number; id: number | null; name: string; mimeType: string | null; }
interface Booking {
  id: string; bookingReference: string; status: string; date: string; timeSlot: string;
  package?: { name?: string; preparationInstructions?: string[] };
  lab?: { name?: string };
  pendingApproval?: boolean; instructionsAvailable?: boolean; instructions?: string | null;
  reportsAvailable?: boolean; reports?: BookingReport[];
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  booked: { label: 'Awaiting confirmation', cls: 'bg-warning/15 text-warning border-warning/30', icon: Clock },
  payment_pending: { label: 'Payment pending', cls: 'bg-warning/15 text-warning border-warning/30', icon: Clock },
  confirmed: { label: 'Confirmed', cls: 'bg-primary/15 text-primary border-primary/30', icon: CheckCircle2 },
  scheduled: { label: 'Confirmed', cls: 'bg-primary/15 text-primary border-primary/30', icon: CheckCircle2 },
  rescheduled: { label: 'Rescheduled', cls: 'bg-primary/15 text-primary border-primary/30', icon: CheckCircle2 },
  completed: { label: 'Completed', cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30', icon: FileCheck },
  reports_available: { label: 'Reports ready', cls: 'bg-success/15 text-success border-success/30', icon: FileCheck },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground border-border', icon: Info },
};

async function shareOrDownloadBlob(blob: Blob, filename: string, preferShare: boolean) {
  if (preferShare) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) { await navAny.share({ files: [file], title: filename }); return; }
    } catch { /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const EmployeeCheckupCenter = () => {
  const [letters, setLetters] = useState<RefLetter[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, bRes] = await Promise.allSettled([
        api.get('/health-checkups/referral-letters'),
        api.get('/health-checkups/bookings'),
      ]);
      if (lRes.status === 'fulfilled') setLetters(lRes.value.data?.letters || []);
      if (bRes.status === 'fulfilled') setBookings((bRes.value.data?.bookings || []).filter((b: Booking) => b.status !== 'cancelled'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const downloadLetter = async (l: RefLetter, share: boolean) => {
    setBusy(`letter-${l.id}`);
    try {
      const res = await api.get(`/health-checkups/referral-letters/${l.id}/pdf`, { responseType: 'blob' });
      await shareOrDownloadBlob(res.data, `${l.referenceNumber}.pdf`, share);
    } catch { toast.error('Could not open the letter'); } finally { setBusy(null); }
  };

  const openReport = async (b: Booking, r: BookingReport, share: boolean) => {
    setBusy(`report-${b.id}-${r.index}`);
    try {
      const { data } = await api.get(`/health-checkups/bookings/${b.id}/reports/${r.index}/download`);
      if (!data?.url) throw new Error();
      if (share) {
        try {
          const blob = await (await fetch(data.url)).blob();
          await shareOrDownloadBlob(blob, r.name || 'report.pdf', true);
          return;
        } catch { /* CORS — fall back to opening */ }
      }
      window.open(data.url, '_blank', 'noopener');
    } catch { toast.error('Could not open the report'); } finally { setBusy(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  );
  if (!letters.length && !bookings.length) return null;

  return (
    <div className="space-y-4 mb-6">
      {/* Referral letters */}
      {letters.length > 0 && (
        <Card className="border-border bg-card/[0.04]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Your referral letters</h3>
            </div>
            <div className="space-y-2">
              {letters.map((l) => (
                <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{l.lab?.name || 'Diagnostic centre'}</div>
                    <div className="text-xs text-muted-foreground">{l.referenceNumber} · {l.tests?.length || 0} tests{l.validUntil ? ` · valid till ${String(l.validUntil).slice(0, 10)}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" disabled={busy === `letter-${l.id}`} onClick={() => downloadLetter(l, false)}>
                      {busy === `letter-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      <span className="ml-1.5">Download</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadLetter(l, true)}><Share2 className="h-4 w-4" /><span className="ml-1.5">Share</span></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bookings + lifecycle */}
      {bookings.length > 0 && (
        <Card className="border-border bg-card/[0.04]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Your health checkups</h3>
            </div>
            <div className="space-y-2">
              {bookings.map((b) => {
                const meta = STATUS_META[b.status] || STATUS_META.confirmed;
                const Icon = meta.icon;
                const isOpen = expanded === b.id;
                const prep = b.package?.preparationInstructions || [];
                const hasDetail = b.instructionsAvailable || (b.reportsAvailable && (b.reports?.length || 0) > 0);
                return (
                  <div key={b.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{b.package?.name || 'Health Checkup'}</div>
                        <div className="text-xs text-muted-foreground">{b.lab?.name || ''} · {String(b.date).slice(0, 10)} · {b.timeSlot}</div>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}>
                        <Icon className="h-3 w-3" />{meta.label}
                      </span>
                    </div>
                    {b.status === 'booked' && (
                      <p className="mt-2 text-xs text-muted-foreground">Submitted for confirmation. Your wellness team will confirm this shortly.</p>
                    )}
                    {hasDetail && (
                      <button onClick={() => setExpanded(isOpen ? null : b.id)} className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {b.reportsAvailable ? 'View report & instructions' : 'View checkup instructions'}
                      </button>
                    )}
                    {isOpen && (
                      <div className="mt-2 space-y-3 border-t border-border pt-3">
                        {b.instructionsAvailable && (b.instructions || prep.length > 0) && (
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Info className="h-3.5 w-3.5 text-primary" />Instructions</div>
                            {b.instructions && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{b.instructions}</p>}
                            {prep.length > 0 && (
                              <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{prep.map((p, i) => <li key={i}>{p}</li>)}</ul>
                            )}
                          </div>
                        )}
                        {b.reportsAvailable && (b.reports?.length || 0) > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><FileCheck className="h-3.5 w-3.5 text-success" />Reports</div>
                            {b.reports!.map((r) => (
                              <div key={r.index} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                                <span className="truncate text-xs text-foreground">{r.name}</span>
                                <div className="flex shrink-0 gap-2">
                                  <Button size="sm" variant="outline" disabled={busy === `report-${b.id}-${r.index}`} onClick={() => openReport(b, r, false)}>
                                    {busy === `report-${b.id}-${r.index}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    <span className="ml-1.5">Download</span>
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => openReport(b, r, true)}><Share2 className="h-4 w-4" /><span className="ml-1.5">Share</span></Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmployeeCheckupCenter;

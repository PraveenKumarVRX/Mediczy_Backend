import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import KioskAadhaarScanner from '@/components/display/KioskAadhaarScanner';
import { printQmsTokenSlip } from '@/utils/qmsPrintSlip';
import { IdCard, Phone, Plus, Printer, RefreshCw, ScanLine, UserRound } from 'lucide-react';

export type QmsPortal = 'hospital' | 'clinic' | 'lab';

interface QmsEntry {
  id: number;
  tokenNumber: string;
  patientName?: string;
  doctorName?: string;
  counterId?: string;
  status: string;
  priorityScore?: number;
  estimatedWaitMinutes?: number;
  queueType?: string;
  chiefComplaint?: string;
  metadata?: Record<string, unknown>;
}

interface AadhaarFields {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  careOf?: string | null;
  address?: string | null;
  pincode?: string | null;
  state?: string | null;
  aadhaarLast4?: string | null;
}

interface OpdRow {
  doctorId: number | null;
  doctorName: string;
  specialization?: string;
  queueZone: string;
  waiting: number;
  called: number;
  serving: number;
  active: number;
}

interface CheckInForm {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  pincode: string;
  state: string;
  careOf: string;
  aadhaarLast4: string;
  notes: string;
  doctorId: string;
  doctorName: string;
  specialization: string;
  queueType: string;
  notifyOptIn: boolean;
}

const emptyForm = (): CheckInForm => ({
  firstName: '',
  lastName: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  pincode: '',
  state: '',
  careOf: '',
  aadhaarLast4: '',
  notes: '',
  doctorId: '',
  doctorName: '',
  specialization: '',
  queueType: 'walk_in',
  notifyOptIn: true,
});

function statusTone(status: string) {
  switch (status) {
    case 'waiting':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'called':
      return 'bg-sky-100 text-sky-900 border-sky-200';
    case 'serving':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'completed':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'no_show':
      return 'bg-rose-100 text-rose-900 border-rose-200';
    default:
      return 'bg-muted text-foreground';
  }
}

interface Props {
  portal: QmsPortal;
  title?: string;
  subtitle?: string;
  Layout: React.ComponentType<{ children: React.ReactNode; title?: string; subtitle?: string }>;
}

export default function PortalQmsPage({ portal, title, subtitle, Layout }: Props) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<QmsEntry[]>([]);
  const [analytics, setAnalytics] = useState({
    totalToday: 0,
    waiting: 0,
    called: 0,
    serving: 0,
    completedToday: 0,
    noShowsToday: 0,
    avgWaitMinutes: 0,
  });
  const [context, setContext] = useState<{
    label?: string;
    queueZone?: string;
    department?: string;
    organizationId?: number;
  }>({});
  const [loading, setLoading] = useState(true);
  const [scanOpen, setScanOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CheckInForm>(emptyForm);
  const [aadhaarSource, setAadhaarSource] = useState<string | null>(null);
  const [opds, setOpds] = useState<OpdRow[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');

  const pageTitle = title || (portal === 'lab' ? 'Patient Queue (QMS)' : 'Queue Management');
  const pageSubtitle =
    subtitle ||
    (portal === 'lab'
      ? 'Lab collection tokens · Aadhaar QR check-in'
      : portal === 'hospital'
        ? 'Multi-OPD · per-doctor queues · Aadhaar · WhatsApp + SMS slip'
        : 'Tokens · Aadhaar QR · call next');

  const refresh = useCallback(async () => {
    try {
      const consoleQs =
        selectedDoctorId && selectedDoctorId !== 'all'
          ? `?doctorId=${encodeURIComponent(selectedDoctorId)}`
          : '';
      const reqs: Promise<any>[] = [
        api.get('/qms/context'),
        api.get(`/qms/console${consoleQs}`),
        api.get('/qms/analytics'),
      ];
      if (portal === 'hospital' || portal === 'clinic') {
        reqs.push(api.get('/qms/opds'));
      }
      const [ctxRes, consoleRes, analyticsRes, opdsRes] = await Promise.all(reqs);
      if (ctxRes.data?.context) setContext(ctxRes.data.context);
      setEntries(consoleRes.data?.entries || []);
      if (analyticsRes.data?.analytics) setAnalytics(analyticsRes.data.analytics);
      if (opdsRes?.data?.opds) setOpds(opdsRes.data.opds);
    } catch (e: any) {
      toast({
        title: 'Could not load queue',
        description: e?.response?.data?.message || e?.message || 'Try again',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedDoctorId, portal]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 20000);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const selected = opds.find((o) => String(o.doctorId) === selectedDoctorId);
    const zone = selected?.queueZone || context.queueZone;
    if (!zone) return;
    const es = new EventSource(`/api/display/events?zone=${encodeURIComponent(zone)}`);
    const onUpdate = () => refresh();
    es.addEventListener('queue_updated', onUpdate);
    es.addEventListener('queue_token_issued', onUpdate);
    es.addEventListener('queue_token_called', onUpdate);
    es.addEventListener('queue_token_completed', onUpdate);
    return () => es.close();
  }, [context.queueZone, selectedDoctorId, opds, refresh]);

  const openManual = () => {
    setForm(emptyForm());
    setAadhaarSource(null);
    setDialogOpen(true);
  };

  const applyAadhaar = (fields: AadhaarFields, source?: string) => {
    setForm((prev) => ({
      ...prev,
      firstName: fields.firstName || prev.firstName,
      lastName: fields.lastName || prev.lastName,
      dateOfBirth: fields.dateOfBirth || prev.dateOfBirth,
      gender: fields.gender || prev.gender,
      address: fields.address || prev.address,
      pincode: fields.pincode || prev.pincode,
      state: fields.state || prev.state,
      careOf: fields.careOf || prev.careOf,
      aadhaarLast4: fields.aadhaarLast4 || prev.aadhaarLast4,
    }));
    setAadhaarSource(source || 'aadhaar-qr');
    setDialogOpen(true);
  };

  const handleAadhaarScan = async (payload: { qrBytesBase64?: string; qrText?: string }) => {
    // Keep scanner mounted until parse succeeds — seamless “Reading details…” state
    try {
      const { data } = await api.post('/qms/aadhaar/parse', {
        qrText: payload?.qrText,
        qrBytesBase64: payload?.qrBytesBase64,
      });
      if (!data?.success || !data.fields) {
        throw new Error(data?.message || 'Could not read Aadhaar details from that QR');
      }
      setScanOpen(false);
      applyAadhaar(data.fields, data.source);
      toast({
        title: 'Details ready',
        description: data.fields.fullName
          ? `${data.fields.fullName}${data.fields.aadhaarLast4 ? ` · ****${data.fields.aadhaarLast4}` : ''}`
          : 'Form prefilled from Aadhaar',
      });
    } catch (e: any) {
      const message =
        e?.response?.data?.message || e?.message || 'Hold the QR on the back of the card in the frame';
      // Re-throw so the scanner can resume auto-capture without dumping the user to manual
      throw new Error(message);
    }
  };

  const submitCheckIn = async () => {
    const patientName = `${form.firstName} ${form.lastName}`.trim();
    if (!patientName) {
      toast({ title: 'Name required', description: 'Enter patient name or scan Aadhaar.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/qms/check-in', {
        firstName: form.firstName,
        lastName: form.lastName,
        patientName,
        phone: form.phone || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        address: form.address || undefined,
        pincode: form.pincode || undefined,
        state: form.state || undefined,
        careOf: form.careOf || undefined,
        aadhaarLast4: form.aadhaarLast4 || undefined,
        notes: form.notes || undefined,
        doctorId: form.doctorId || undefined,
        doctorName: form.doctorName || undefined,
        specialization: form.specialization || undefined,
        queueType: form.queueType || 'walk_in',
        notifyOptIn: form.notifyOptIn,
        notifyPhone: form.phone || undefined,
        source: aadhaarSource ? 'aadhaar-qr' : 'manual',
      });
      toast({
        title: 'Token issued',
        description: data?.token
          ? `Token ${data.token}${data.whatsapp ? ' · WhatsApp + SMS slip sent' : ''}`
          : 'Patient added to queue',
      });
      if (data?.printSlip || data?.entry) {
        printQmsTokenSlip(data.printSlip || {
          tokenNumber: data.entry?.tokenNumber || data.token,
          patientName: data.entry?.patientName || patientName,
          doctorName: data.entry?.doctorName || form.doctorName,
          counterId: data.entry?.counterId,
          queueZone: data.entry?.queueZone,
          estimatedWaitMinutes: data.entry?.estimatedWaitMinutes,
          specialization: form.specialization,
        });
      }
      setDialogOpen(false);
      setForm(emptyForm());
      setAadhaarSource(null);
      await refresh();
    } catch (e: any) {
      toast({
        title: 'Check-in failed',
        description: e?.response?.data?.message || e?.message || 'Try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: number, action: 'call' | 'start' | 'complete' | 'no-show') => {
    try {
      await api.patch(`/qms/${id}/${action}`);
      await refresh();
    } catch (e: any) {
      toast({
        title: 'Action failed',
        description: e?.response?.data?.message || e?.message || 'Try again',
        variant: 'destructive',
      });
    }
  };

  const active = useMemo(
    () => entries.filter((e) => ['waiting', 'called', 'serving'].includes(e.status)),
    [entries],
  );

  return (
    <Layout title={pageTitle} subtitle={pageSubtitle}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {context.label || portal} · zone {context.queueZone || '—'} · dept {context.department || '—'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(portal === 'hospital' || portal === 'clinic') && opds.length > 0 && (
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="All OPDs / doctors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All OPDs / doctors</SelectItem>
                  {opds.map((o) => (
                    <SelectItem key={`${o.doctorId}-${o.queueZone}`} value={String(o.doctorId ?? o.queueZone)}>
                      {(o.doctorName || 'OPD') + (o.specialization ? ` · ${o.specialization}` : '')}
                      {` (${o.waiting} waiting)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => refresh()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} className="gap-2">
              <ScanLine className="h-4 w-4" /> Scan Aadhaar QR
            </Button>
            <Button size="sm" onClick={openManual} className="gap-2">
              <Plus className="h-4 w-4" /> Walk-in check-in
            </Button>
          </div>
        </div>

        {(portal === 'hospital' || portal === 'clinic') && opds.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {opds.slice(0, 9).map((o) => (
              <button
                key={`${o.doctorId}-${o.queueZone}`}
                type="button"
                onClick={() => setSelectedDoctorId(String(o.doctorId ?? 'all'))}
                className={`text-left rounded-xl border p-3 transition ${
                  String(o.doctorId) === selectedDoctorId
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
                    : 'border-border hover:border-teal-400/60'
                }`}
              >
                <div className="font-medium text-sm">{o.doctorName}</div>
                <div className="text-xs text-muted-foreground">{o.specialization || 'OPD'}</div>
                <div className="mt-2 text-xs flex gap-3">
                  <span>{o.waiting} waiting</span>
                  <span>{o.called + o.serving} in room</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Waiting', value: analytics.waiting },
            { label: 'Called / Serving', value: analytics.called + analytics.serving },
            { label: 'Completed today', value: analytics.completedToday },
            { label: 'Avg wait', value: `${analytics.avgWaitMinutes}m` },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-2xl">{loading ? '—' : s.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Live queue</CardTitle>
            <CardDescription>
              Issue tokens with Aadhaar QR extraction (name, DOB, gender, address, last 4). Full Aadhaar number is never stored.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : active.length === 0 ? (
              <p className="text-muted-foreground text-sm">No patients waiting. Scan Aadhaar or add a walk-in.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-3">Token</th>
                      <th className="pr-3">Patient</th>
                      <th className="pr-3">Status</th>
                      <th className="pr-3">ETA</th>
                      <th className="pr-3">Counter</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-3 pr-3 font-mono font-semibold text-teal-700 dark:text-teal-300">
                          <button
                            type="button"
                            className="hover:underline"
                            title="Print slip"
                            onClick={() => printQmsTokenSlip({
                              tokenNumber: e.tokenNumber,
                              patientName: e.patientName,
                              doctorName: e.doctorName,
                              counterId: e.counterId,
                              estimatedWaitMinutes: e.estimatedWaitMinutes,
                            })}
                          >
                            {e.tokenNumber}
                          </button>
                          <Printer className="inline h-3.5 w-3.5 ml-1 opacity-50" />
                        </td>
                        <td className="pr-3">
                          <div className="font-medium">{e.patientName || '—'}</div>
                          {e.doctorName ? (
                            <div className="text-xs text-muted-foreground">{e.doctorName}</div>
                          ) : null}
                        </td>
                        <td className="pr-3">
                          <Badge variant="outline" className={statusTone(e.status)}>
                            {e.status}
                          </Badge>
                        </td>
                        <td className="pr-3">{e.estimatedWaitMinutes != null ? `${e.estimatedWaitMinutes}m` : '—'}</td>
                        <td className="pr-3">{e.counterId || '—'}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {e.status === 'waiting' && (
                              <Button size="sm" variant="outline" onClick={() => act(e.id, 'call')}>
                                Call
                              </Button>
                            )}
                            {(e.status === 'called' || e.status === 'waiting') && (
                              <Button size="sm" variant="outline" onClick={() => act(e.id, 'start')}>
                                Start
                              </Button>
                            )}
                            {['waiting', 'called', 'serving'].includes(e.status) && (
                              <>
                                <Button size="sm" onClick={() => act(e.id, 'complete')}>
                                  Complete
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => act(e.id, 'no-show')}>
                                  No-show
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {scanOpen && (
        <KioskAadhaarScanner onScan={handleAadhaarScan} onClose={() => setScanOpen(false)} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" />
              {aadhaarSource ? 'Confirm Aadhaar check-in' : 'Walk-in check-in'}
            </DialogTitle>
            <DialogDescription>
              {aadhaarSource
                ? `Details extracted from Aadhaar (${aadhaarSource}). Only last 4 digits are kept.`
                : 'Enter patient details manually, or use Scan Aadhaar QR.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {form.aadhaarLast4 ? (
              <div className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 bg-muted/40">
                <IdCard className="h-4 w-4" />
                Aadhaar ending · ****{form.aadhaarLast4}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="qms-first">First name</Label>
                <Input
                  id="qms-first"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="qms-last">Last name</Label>
                <Input
                  id="qms-last"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="qms-dob">Date of birth</Label>
                <Input
                  id="qms-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select value={form.gender || undefined} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="qms-phone" className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> Phone
              </Label>
              <Input
                id="qms-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Optional — for SMS/WhatsApp notify"
              />
            </div>
            <div>
              <Label htmlFor="qms-address">Address</Label>
              <Input
                id="qms-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="qms-pin">Pincode</Label>
                <Input
                  id="qms-pin"
                  value={form.pincode}
                  onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="qms-state">State</Label>
                <Input
                  id="qms-state"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
            </div>
            {portal !== 'lab' && (
              <div>
                <Label>OPD / Doctor</Label>
                {opds.length > 0 ? (
                  <Select
                    value={form.doctorId || undefined}
                    onValueChange={(v) => {
                      const opd = opds.find((o) => String(o.doctorId) === v);
                      setForm((f) => ({
                        ...f,
                        doctorId: v,
                        doctorName: opd?.doctorName || f.doctorName,
                        specialization: opd?.specialization || f.specialization,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select doctor / OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      {opds.filter((o) => o.doctorId != null).map((o) => (
                        <SelectItem key={String(o.doctorId)} value={String(o.doctorId)}>
                          {o.doctorName}{o.specialization ? ` · ${o.specialization}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.doctorName}
                    onChange={(e) => setForm((f) => ({ ...f, doctorName: e.target.value }))}
                    placeholder="Doctor name"
                  />
                )}
              </div>
            )}
            <div>
              <Label htmlFor="qms-notes">{portal === 'lab' ? 'Tests / notes' : 'Chief complaint / notes'}</Label>
              <Input
                id="qms-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notifyOptIn}
                onChange={(e) => setForm((f) => ({ ...f, notifyOptIn: e.target.checked }))}
              />
              Send WhatsApp + SMS token updates (requires phone)
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine className="h-4 w-4 mr-2" /> Rescan Aadhaar
            </Button>
            <Button type="button" onClick={submitCheckIn} disabled={saving}>
              {saving ? 'Issuing…' : 'Issue token'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

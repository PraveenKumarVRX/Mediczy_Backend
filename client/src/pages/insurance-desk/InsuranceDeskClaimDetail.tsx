import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ShieldCheck, ArrowLeft, Loader2, Send, QrCode, Truck, FileText, History,
  Landmark, Plus, CheckCircle2, Package, RefreshCw, Receipt,
} from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

interface ClaimDetail {
  id: number;
  patientId: number;
  claimNumber: string;
  claimAmount: number;
  approvedAmount?: number | null;
  settledAmount?: number | null;
  status: string;
  settlementStatus?: string | null;
  policyNumber: string;
  insuranceProvider?: string | null;
  patient?: { firstName: string; lastName: string; email?: string; phoneNumber?: string };
  documents?: Array<{ fileName: string; type: string; url: string; size?: number }>;
}

interface BillingSummary {
  total: number;
  chargeCount: number;
  byChargeType: Array<{ chargeType: string; amount: number }>;
  charges: Array<{ id: number; chargeType: string; description?: string; amount: number; status?: string; postedAt?: string }>;
}

interface TimelineEvent {
  event: string;
  timestamp?: string;
  status?: string;
  details?: string;
  reason?: string;
  approvedAmount?: number;
}

interface CourierShipment {
  id: string;
  courierName: string;
  trackingNumber: string;
  sentTo: string;
  documentType: string;
  notes?: string;
  status: 'in_transit' | 'delivered' | 'returned';
  sentDate: string;
  deliveredDate?: string | null;
}

interface NotificationLogEntry {
  sentAt: string;
  channel: string | null;
  status: string;
  message?: string;
  actor?: string;
  error?: string;
}

interface EraPosting {
  id: number;
  payer_name?: string;
  payment_amount?: string;
  posted_at?: string;
  check_number?: string;
  status?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  approved:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  paid:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  query:     'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
};

const COURIER_STATUS_STYLES: Record<string, string> = {
  in_transit: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  delivered:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  returned:   'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const formatCurrency = (amount?: number | string | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('en-IN') : '—');

const emptyShipment = { courierName: '', trackingNumber: '', sentTo: '', documentType: 'claim_documents', notes: '' };

const InsuranceDeskClaimDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [shipments, setShipments] = useState<CourierShipment[]>([]);
  const [notificationLog, setNotificationLog] = useState<NotificationLogEntry[]>([]);
  const [postings, setPostings] = useState<EraPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const [showShipment, setShowShipment] = useState(false);
  const [newShipment, setNewShipment] = useState(emptyShipment);
  const [creatingShipment, setCreatingShipment] = useState(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);
  const [updatingShipmentId, setUpdatingShipmentId] = useState<string | null>(null);

  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${id}/detail`);
      setClaim(data.claim);
      setTimeline(data.timeline || []);
      setShipments(data.courierTracking || []);
      setNotificationLog(data.notificationLog || []);
      setPostings(data.reconciliationPostings || []);
      if (data.claim?.patientId) {
        setLoadingBilling(true);
        api.get(`/hospital/insurance/patient/${data.claim.patientId}/billing-summary`)
          .then((res) => setBilling(res.data.billingSummary))
          .catch(() => setBilling(null))
          .finally(() => setLoadingBilling(false));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load claim details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendNotify = async () => {
    if (!id) return;
    setNotifying(true);
    setNotifyResult(null);
    try {
      const { data } = await api.post(`/hospital/insurance/claims/${id}/notify`);
      setNotifyResult(data.success ? `Sent via ${data.channel}.` : (data.message || 'Could not send.'));
      load();
    } catch (err: any) {
      setNotifyResult(err?.response?.data?.message || 'Could not send notification.');
    } finally {
      setNotifying(false);
    }
  };

  const loadQr = async () => {
    if (!id) return;
    setLoadingQr(true);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${id}/status-qr`);
      setQrDataUrl(data.dataUrl);
      setQrUrl(data.url);
    } catch {
      setQrDataUrl(null);
    } finally {
      setLoadingQr(false);
    }
  };

  const createShipment = async () => {
    if (!id) return;
    if (!newShipment.courierName.trim() || !newShipment.trackingNumber.trim() || !newShipment.sentTo.trim()) {
      setShipmentError('Courier name, tracking number, and recipient are required.');
      return;
    }
    setCreatingShipment(true);
    setShipmentError(null);
    try {
      await api.post(`/hospital/insurance/claims/${id}/courier`, newShipment);
      setShowShipment(false);
      setNewShipment(emptyShipment);
      load();
    } catch (err: any) {
      setShipmentError(err?.response?.data?.message || 'Could not log shipment.');
    } finally {
      setCreatingShipment(false);
    }
  };

  const markDelivered = async (shipmentId: string) => {
    if (!id) return;
    setUpdatingShipmentId(shipmentId);
    try {
      await api.patch(`/hospital/insurance/claims/${id}/courier/${shipmentId}`, { status: 'delivered' });
      load();
    } catch {
      // surfaced via reload failing silently is acceptable here — row just won't update
    } finally {
      setUpdatingShipmentId(null);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Claim Detail" subtitle={claim?.claimNumber || '—'} copilotModule="insurance">

      <Button variant="ghost" size="sm" className="gap-1 mb-3" onClick={() => navigate('/insurance-desk/claims')}>
        <ArrowLeft className="h-4 w-4" /> Back to Claims
      </Button>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : error || !claim ? (
        <Card><CardContent className="py-8 text-center text-sm text-red-600">{error || 'Claim not found.'}</CardContent></Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">{claim.claimNumber}</p>
                  <p className="text-lg font-semibold">{claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : 'Unknown patient'}</p>
                  <p className="text-sm text-muted-foreground">{claim.insuranceProvider || 'No insurer on file'} · Policy {claim.policyNumber}</p>
                </div>
                <Badge className={STATUS_STYLES[claim.status] || ''} variant="outline">{claim.status}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                <div><p className="text-xs text-muted-foreground">Claimed</p><p className="font-semibold">{formatCurrency(claim.claimAmount)}</p></div>
                <div><p className="text-xs text-muted-foreground">Approved</p><p className="font-semibold">{claim.approvedAmount != null ? formatCurrency(claim.approvedAmount) : '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Settled</p><p className="font-semibold">{claim.settledAmount != null ? formatCurrency(claim.settledAmount) : '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Settlement</p><p className="font-semibold capitalize">{claim.settlementStatus || '—'}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4 text-teal-600" /> Patient Communication</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={sendNotify} disabled={notifying}>
                {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Status Update (WhatsApp/SMS)
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={loadQr} disabled={loadingQr}>
                {loadingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Generate Status QR Code
              </Button>
              {notifyResult && <p className="text-sm text-muted-foreground">{notifyResult}</p>}
              {qrDataUrl && (
                <div className="w-full flex items-center gap-4 mt-2 p-3 rounded-lg border bg-muted/30">
                  <img src={qrDataUrl} alt="Claim status QR code" className="h-32 w-32 rounded bg-white p-1" />
                  <div className="text-xs text-muted-foreground break-all">
                    <p className="mb-1 font-medium text-foreground">Scan for live claim status — safe to print on discharge paperwork.</p>
                    <p>{qrUrl}</p>
                  </div>
                </div>
              )}
              {notificationLog.length > 0 && (
                <div className="w-full mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Last sent: {notificationLog[notificationLog.length - 1].channel || 'failed'} — {formatDate(notificationLog[notificationLog.length - 1].sentAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline" className="gap-1"><History className="h-3.5 w-3.5" /> Timeline</TabsTrigger>
              <TabsTrigger value="documents" className="gap-1"><FileText className="h-3.5 w-3.5" /> Documents</TabsTrigger>
              <TabsTrigger value="bill" className="gap-1"><Receipt className="h-3.5 w-3.5" /> Bill Details</TabsTrigger>
              <TabsTrigger value="courier" className="gap-1"><Truck className="h-3.5 w-3.5" /> Courier Tracking</TabsTrigger>
              <TabsTrigger value="reconciliation" className="gap-1"><Landmark className="h-3.5 w-3.5" /> Reconciliation</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  {timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                  ) : timeline.map((ev, i) => (
                    <div key={i} className="flex gap-3 border-l-2 border-muted pl-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{ev.event}</p>
                        {ev.details && <p className="text-sm text-muted-foreground">{ev.details}</p>}
                        {ev.reason && <p className="text-sm text-muted-foreground">{ev.reason}</p>}
                        {ev.approvedAmount != null && <p className="text-sm text-muted-foreground">{formatCurrency(ev.approvedAmount)}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(ev.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bill" className="mt-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Itemized Bill Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {loadingBilling ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading billing data…</div>
                  ) : !billing || billing.chargeCount === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No posted billing charges found for this patient yet.</p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billing.byChargeType.map((c) => (
                            <TableRow key={c.chargeType}>
                              <TableCell className="capitalize">{c.chargeType.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="text-right">{formatCurrency(c.amount)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-semibold">Total</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(billing.total)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                      <p className="text-xs text-muted-foreground mt-3">{billing.chargeCount} individual line item{billing.chargeCount === 1 ? '' : 's'} across all posted charges for this patient.</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {!claim.documents || claim.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                  ) : (
                    <div className="space-y-2">
                      {claim.documents.map((doc, i) => (
                        <div key={i} className="flex items-center justify-between border rounded-lg px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{doc.fileName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{doc.type?.replace(/_/g, ' ')}</p>
                          </div>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline">View</a>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="courier" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Physical Documents Sent to TPA/Insurer</CardTitle>
                  <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => { setShowShipment(true); setShipmentError(null); }}>
                    <Plus className="h-4 w-4" /> Log Shipment
                  </Button>
                </CardHeader>
                <CardContent>
                  {shipments.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
                      <Package className="h-6 w-6 mb-2 opacity-30" />
                      <p className="text-sm">No courier shipments logged yet.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Courier</TableHead>
                          <TableHead>Tracking #</TableHead>
                          <TableHead>Sent To</TableHead>
                          <TableHead>Document</TableHead>
                          <TableHead>Sent</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipments.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{s.courierName}</TableCell>
                            <TableCell className="font-mono text-xs">{s.trackingNumber}</TableCell>
                            <TableCell>{s.sentTo}</TableCell>
                            <TableCell className="capitalize">{s.documentType?.replace(/_/g, ' ')}</TableCell>
                            <TableCell>{formatDate(s.sentDate)}</TableCell>
                            <TableCell><Badge className={COURIER_STATUS_STYLES[s.status] || ''} variant="outline">{s.status.replace('_', ' ')}</Badge></TableCell>
                            <TableCell>
                              {s.status === 'in_transit' && (
                                <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={() => markDelivered(s.id)} disabled={updatingShipmentId === s.id}>
                                  {updatingShipmentId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Mark Delivered
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reconciliation" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Remittances Posted Against This Claim</CardTitle>
                  <Button size="sm" variant="outline" className="gap-1" onClick={load}>
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {postings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No ERA/reconciliation postings linked to this claim yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Payer</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Check #</TableHead>
                          <TableHead>Posted</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {postings.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{p.payer_name || '—'}</TableCell>
                            <TableCell className="text-right">{formatCurrency(p.payment_amount)}</TableCell>
                            <TableCell className="font-mono text-xs">{p.check_number || '—'}</TableCell>
                            <TableCell>{formatDate(p.posted_at)}</TableCell>
                            <TableCell><Badge variant="outline">{p.status || 'posted'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showShipment} onOpenChange={setShowShipment}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Courier Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {shipmentError && <p className="text-sm text-red-600">{shipmentError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Courier</Label>
                <Input value={newShipment.courierName} onChange={(e) => setNewShipment((s) => ({ ...s, courierName: e.target.value }))} placeholder="Bluedart, DTDC, etc." />
              </div>
              <div>
                <Label>Tracking / AWB #</Label>
                <Input value={newShipment.trackingNumber} onChange={(e) => setNewShipment((s) => ({ ...s, trackingNumber: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Sent To (TPA/Insurer office)</Label>
                <Input value={newShipment.sentTo} onChange={(e) => setNewShipment((s) => ({ ...s, sentTo: e.target.value }))} />
              </div>
              <div>
                <Label>Document Type</Label>
                <Input value={newShipment.documentType} onChange={(e) => setNewShipment((s) => ({ ...s, documentType: e.target.value }))} placeholder="claim_documents" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={newShipment.notes} onChange={(e) => setNewShipment((s) => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShipment(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={createShipment} disabled={creatingShipment}>
              {creatingShipment ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log Shipment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskClaimDetail;

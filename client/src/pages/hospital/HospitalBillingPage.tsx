import { useCallback, useEffect, useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import hospitalBillingService from '@/services/hospital-billing.service';
import api from '@/utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, CreditCard, FileText, History, LayoutDashboard, Loader2,
  Monitor, Receipt, Shield, Wallet
} from 'lucide-react';

interface Station {
  id: number;
  station_code: string;
  station_name: string;
  location?: string;
  station_type: string;
}

interface ChargeRow {
  id: number;
  code: string;
  name: string;
  category: string;
  unit_price: string;
}

export default function HospitalBillingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState('centralized');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [activeSession, setActiveSession] = useState<Record<string, unknown> | null>(null);
  const [patientId, setPatientId] = useState('');
  const [patientAccount, setPatientAccount] = useState<Record<string, unknown> | null>(null);
  const [admissionId, setAdmissionId] = useState('');
  const [clearance, setClearance] = useState<unknown>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [statementChannel, setStatementChannel] = useState('print');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, stationsRes, tplRes, invRes, auditRes, chargesRes] = await Promise.all([
        hospitalBillingService.getCentralizedDashboard(),
        hospitalBillingService.listStations(),
        hospitalBillingService.listTemplates(),
        hospitalBillingService.listInvoices({ limit: 30 }),
        hospitalBillingService.listAudit({ limit: 50 }),
        api.get('/v1/charge-master/charges').catch(() => ({ data: { data: [] } })),
      ]);
      setDashboard(dashRes.data || null);
      setStations(stationsRes.stations || []);
      setTemplates(tplRes.templates || []);
      setInvoices(invRes.invoices || []);
      setAudit(auditRes.audit || []);
      setCharges(chargesRes.data?.data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to load billing data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadCore(); }, [loadCore]);

  const refreshSession = async (stationId: number) => {
    const res = await hospitalBillingService.getActiveSession(stationId);
    setActiveSession(res.session || null);
  };

  useEffect(() => {
    if (selectedStation) refreshSession(Number(selectedStation));
  }, [selectedStation]);

  const openSession = async () => {
    if (!selectedStation) return;
    try {
      await hospitalBillingService.openSession({
        stationId: Number(selectedStation),
        cashierName: 'Billing Desk',
        openingFloat: 0,
      });
      await refreshSession(Number(selectedStation));
      toast({ title: 'Cashier session opened' });
    } catch (e: unknown) {
      toast({ title: 'Could not open session', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const closeSession = async () => {
    if (!activeSession?.id) return;
    try {
      await hospitalBillingService.closeSession(Number(activeSession.id), {
        closingTotal: Number(activeSession.total_collected || 0),
      });
      setActiveSession(null);
      toast({ title: 'Session closed' });
      loadCore();
    } catch (e: unknown) {
      toast({ title: 'Close failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const loadPatientAccount = async () => {
    if (!patientId) return;
    try {
      const res = await hospitalBillingService.getPatientAccount(patientId, admissionId || undefined);
      setPatientAccount(res.data || null);
    } catch (e: unknown) {
      toast({ title: 'Patient account error', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const generateBill = async () => {
    if (!patientId) return;
    try {
      const res = await hospitalBillingService.createInvoice({
        patientId: Number(patientId),
        admissionId: admissionId ? Number(admissionId) : undefined,
        stationId: selectedStation ? Number(selectedStation) : undefined,
        sessionId: activeSession?.id ? Number(activeSession.id) : undefined,
        autoPgi: true,
        paymentMode: 'mixed',
      });
      toast({ title: 'Bill generated', description: res.invoice?.bill_number });
      if (res.pgi?.orderId) {
        toast({ title: 'PGI order created', description: `Razorpay order ${res.pgi.orderId}` });
      }
      loadCore();
      loadPatientAccount();
    } catch (e: unknown) {
      toast({ title: 'Bill generation failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const collectPayment = async () => {
    if (!selectedInvoiceId || !paymentAmount) return;
    try {
      await hospitalBillingService.recordPayment(Number(selectedInvoiceId), {
        paymentMethod,
        amount: Number(paymentAmount),
        stationId: selectedStation ? Number(selectedStation) : undefined,
        sessionId: activeSession?.id ? Number(activeSession.id) : undefined,
      });
      toast({ title: 'Payment recorded' });
      setPaymentAmount('');
      loadCore();
    } catch (e: unknown) {
      toast({ title: 'Payment failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const createPgiLink = async () => {
    if (!selectedInvoiceId) return;
    try {
      const res = await hospitalBillingService.createPaymentLink(Number(selectedInvoiceId));
      toast({ title: 'Payment gateway order ready', description: `Order ${res.pgi?.orderId}` });
    } catch (e: unknown) {
      toast({ title: 'PGI failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const sendPatientStatement = async () => {
    if (!patientId) return;
    try {
      const res = await hospitalBillingService.generateStatement(Number(patientId), {
        admissionId: admissionId ? Number(admissionId) : undefined,
        deliveryMethod: statementChannel,
      });
      toast({
        title: 'Statement issued',
        description: res.statement?.statement_number
          ? `${res.statement.statement_number}${res.delivery ? ' — delivered via ' + statementChannel : ''}`
          : 'Statement created',
      });
    } catch (e: unknown) {
      toast({ title: 'Statement failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const checkClearance = async () => {
    if (!admissionId) return;
    const res = await api.get(`/v1/charge-master/clearance/${admissionId}`);
    setClearance(res.data?.data);
  };

  const money = (v: unknown) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

  return (
    <HospitalLayout title="Hospital Billing Suite" subtitle="Centralized billing · Multi-station cashiering · Cash · Credit · Insurance · PGI · Audit">
      <div className="space-y-6 p-4">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading billing suite…
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="centralized" className="gap-1"><LayoutDashboard className="h-4 w-4" />Centralized</TabsTrigger>
            <TabsTrigger value="stations" className="gap-1"><Monitor className="h-4 w-4" />Stations</TabsTrigger>
            <TabsTrigger value="cashier" className="gap-1"><Wallet className="h-4 w-4" />Cashier</TabsTrigger>
            <TabsTrigger value="insurance" className="gap-1"><Shield className="h-4 w-4" />Insurance</TabsTrigger>
            <TabsTrigger value="templates" className="gap-1"><FileText className="h-4 w-4" />Templates</TabsTrigger>
            <TabsTrigger value="charges" className="gap-1"><Receipt className="h-4 w-4" />Charge Master</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1"><History className="h-4 w-4" />Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="centralized" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Billing Stations</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{String(dashboard?.stations ?? 0)}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Sessions</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{String(dashboard?.openSessions ?? 0)}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending Charges</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{money((dashboard?.pendingCharges as { total?: number })?.total)}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">30d Invoices</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{(dashboard?.invoiceStats as unknown[])?.length ?? 0}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Recent Invoices</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Bill #</TableHead><TableHead>Patient</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={String(inv.id)}>
                        <TableCell className="font-mono text-xs">{String(inv.bill_number)}</TableCell>
                        <TableCell>{String(inv.patient_id)}</TableCell>
                        <TableCell>{money(inv.total_amount)}</TableCell>
                        <TableCell>{money(inv.amount_paid)}</TableCell>
                        <TableCell>{money(inv.amount_due)}</TableCell>
                        <TableCell><Badge variant="outline">{String(inv.status)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stations" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Billing Stations</CardTitle>
                <CardDescription>Multi-station counters — Main Cash, IPD, Insurance Desk</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Location</TableHead><TableHead>Type</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {stations.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.station_code}</TableCell>
                        <TableCell>{s.station_name}</TableCell>
                        <TableCell>{s.location}</TableCell>
                        <TableCell><Badge>{s.station_type}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cashier" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle>Cashier Workstation</CardTitle><CardDescription>Cash · Card · UPI · Credit collection with session tracking</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Billing Station</Label>
                    <Select value={selectedStation} onValueChange={setSelectedStation}>
                      <SelectTrigger><SelectValue placeholder="Select station" /></SelectTrigger>
                      <SelectContent>
                        {stations.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.station_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={openSession} disabled={!selectedStation}>Open Session</Button>
                    <Button variant="outline" onClick={closeSession} disabled={!activeSession}>Close Session</Button>
                  </div>
                  {activeSession && (
                    <div className="text-sm border rounded-lg p-3">
                      <p className="font-medium">Active session #{String(activeSession.id)}</p>
                      <p>Collected: {money(activeSession.total_collected)}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
                  <Input placeholder="Admission ID (optional)" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} />
                  <Button variant="outline" onClick={loadPatientAccount}>Load Account</Button>
                  <Button onClick={generateBill}>Generate Bill + Auto PGI</Button>
                </div>

                {patientAccount && (
                  <div className="border rounded-lg p-4 text-sm space-y-3">
                    <p>Pending charges: {money((patientAccount.summary as { pendingCharges?: number })?.pendingCharges)}</p>
                    <p>Total due: {money((patientAccount.summary as { totalDue?: number })?.totalDue)}</p>
                    <p>Credit balance: {money((patientAccount.creditAccount as { balance?: number })?.balance)}</p>
                    <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
                      <div className="space-y-1">
                        <Label className="text-xs">Statement delivery</Label>
                        <Select value={statementChannel} onValueChange={setStatementChannel}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="print">Print only</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="both">SMS + WhatsApp</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="secondary" size="sm" onClick={sendPatientStatement}>Issue Statement</Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 border-t pt-4">
                  <Input placeholder="Invoice ID" value={selectedInvoiceId} onChange={(e) => setSelectedInvoiceId(e.target.value)} />
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Amount" type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                  <div className="flex gap-2">
                    <Button onClick={collectPayment}><CreditCard className="h-4 w-4 mr-1" />Collect</Button>
                    <Button variant="outline" onClick={createPgiLink}>PGI Link</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insurance" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle>Insurance Billing</CardTitle><CardDescription>Discharge clearance and insurance split billing</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 items-end">
                  <Input placeholder="Admission ID" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} />
                  <Button onClick={checkClearance}>Check Clearance</Button>
                </div>
                {clearance && <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">{JSON.stringify(clearance, null, 2)}</pre>}
                <p className="text-sm text-muted-foreground">
                  Full insurance claims workflow: <a href="/hospital/insurance-claims" className="text-primary underline">Insurance Claims Dashboard</a>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Bill Templates</CardTitle><CardDescription>GST itemized, insurance summary, cash receipt formats</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Payer</TableHead><TableHead>Default</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={String(t.id)}>
                        <TableCell>{String(t.template_code)}</TableCell>
                        <TableCell>{String(t.template_name)}</TableCell>
                        <TableCell>{String(t.template_type)}</TableCell>
                        <TableCell>{String(t.payer_type)}</TableCell>
                        <TableCell>{t.is_default ? <Badge>Default</Badge> : null}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charges" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Charge Master</CardTitle>
                <Button variant="outline" onClick={async () => {
                  const res = await api.post('/v1/charge-master/bed-day-charge/run');
                  toast({ title: 'Bed-day charge run', description: JSON.stringify(res.data?.data) });
                }}>Run Bed-Day Charge</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {charges.map((c) => (
                      <TableRow key={c.id}><TableCell>{c.code}</TableCell><TableCell>{c.name}</TableCell><TableCell>{c.category}</TableCell><TableCell>{money(c.unit_price)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Billing Audit Trail</CardTitle><CardDescription>Immutable log of invoices, payments, sessions, and PGI events</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Resource</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {audit.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className="text-xs">{new Date(String(row.created_at)).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline">{String(row.action)}</Badge></TableCell>
                        <TableCell>{String(row.resource_type)} #{String(row.resource_id || '')}</TableCell>
                        <TableCell>{String(row.actor_name || '—')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </HospitalLayout>
  );
}

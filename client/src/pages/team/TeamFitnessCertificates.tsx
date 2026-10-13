import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  Stethoscope, Search, Building2, User, Loader2, CheckCircle2, FileDown,
  ShieldCheck, AlertTriangle, XCircle, History,
} from 'lucide-react';
import api from '@/utils/api';

interface Corporate { id: number; companyName: string; }
interface Employee { id: number; firstName: string; lastName: string; email: string; phoneNumber?: string; }
interface MappedCmo { doctorName: string; doctorRegNo?: string; clinicName: string; }
interface Certificate {
  id: number; patient_name: string; employee_id: string; fitness_status: string;
  examination_date: string; valid_from: string; valid_until: string; signed_at: string;
}

const STATUS_OPTIONS = [
  { value: 'fit', label: 'Fit for duty', icon: CheckCircle2, color: 'text-green-500' },
  { value: 'fit_with_restrictions', label: 'Fit — with restrictions', icon: ShieldCheck, color: 'text-amber-500' },
  { value: 'temporarily_unfit', label: 'Temporarily unfit', icon: AlertTriangle, color: 'text-orange-500' },
  { value: 'unfit', label: 'Unfit for duty', icon: XCircle, color: 'text-red-500' },
];

const today = () => new Date().toISOString().slice(0, 10);
const plusOneYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

const TeamFitnessCertificates = () => {
  const { toast } = useToast();

  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [corporate, setCorporate] = useState<Corporate | null>(null);
  const [corpSearch, setCorpSearch] = useState('');
  const [mappedCmo, setMappedCmo] = useState<MappedCmo | null>(null);
  const [cmoLoading, setCmoLoading] = useState(false);
  const [cmoChecked, setCmoChecked] = useState(false);

  const [empSearch, setEmpSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [form, setForm] = useState({
    employeeCode: '', jobDescription: '', examinationDate: today(),
    fitnessStatus: 'fit', restrictions: '', validFrom: today(), validUntil: plusOneYear(),
    remarks: '', doctorName: '', doctorRegNo: '',
  });
  const [issuing, setIssuing] = useState(false);
  const [lastIssued, setLastIssued] = useState<{ id: number; pdfUrl: string } | null>(null);

  const [history, setHistory] = useState<Certificate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    api.get('/admin/corporates').then((r) => {
      const list = (r.data.data || r.data.corporates || []).map((c: any) => ({
        id: c.id, companyName: c.companyName || c.name || `Corporate #${c.id}`,
      }));
      setCorporates(list);
    }).catch((e) => console.error('Failed to load corporates', e));
  }, []);

  const filteredCorporates = corporates.filter((c) =>
    !corpSearch || c.companyName.toLowerCase().includes(corpSearch.toLowerCase()));

  useEffect(() => {
    if (!corporate) { setMappedCmo(null); setCmoChecked(false); return; }
    setCmoLoading(true); setCmoChecked(false);
    api.get(`/team/occupational-health/cmo/${corporate.id}`)
      .then((r) => setMappedCmo(r.data.cmo || null))
      .catch(() => setMappedCmo(null))
      .finally(() => { setCmoLoading(false); setCmoChecked(true); });
  }, [corporate]);

  const searchEmployees = async (q: string) => {
    setEmpSearch(q);
    if (!corporate || q.length < 2) { setEmployees([]); return; }
    setEmpLoading(true);
    try {
      const r = await api.get('/corporate-bookings/employees', { params: { corporateId: corporate.id, search: q } });
      setEmployees(r.data.employees || []);
    } catch (e) {
      console.error('Employee search failed', e);
    } finally {
      setEmpLoading(false);
    }
  };

  const loadHistory = async (emp: Employee) => {
    if (!corporate) return;
    setHistoryLoading(true);
    try {
      const r = await api.get(`/team/occupational-health/fitness-certificate/patient/${emp.id}`, {
        params: { organizationId: corporate.id },
      });
      setHistory(r.data.data || []);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const selectEmployee = (emp: Employee) => {
    setEmployee(emp);
    setEmployees([]);
    setEmpSearch(`${emp.firstName} ${emp.lastName}`);
    setLastIssued(null);
    loadHistory(emp);
  };

  const issue = async () => {
    if (!corporate || !employee) {
      toast({ title: 'Select a corporate and employee first', variant: 'destructive' });
      return;
    }
    setIssuing(true);
    try {
      const { data } = await api.post('/team/occupational-health/fitness-certificate', {
        organizationId: corporate.id,
        patientId: employee.id,
        patientName: `${employee.firstName} ${employee.lastName}`,
        employeeId: form.employeeCode || undefined,
        employerName: corporate.companyName,
        jobDescription: form.jobDescription || undefined,
        examinationDate: form.examinationDate,
        fitnessStatus: form.fitnessStatus,
        restrictions: form.restrictions || undefined,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        remarks: form.remarks || undefined,
        doctorName: form.doctorName || undefined,
        doctorRegNo: form.doctorRegNo || undefined,
      });
      setLastIssued({ id: data.certificate.id, pdfUrl: data.pdfUrl });
      toast({ title: 'Certificate issued', description: `MER for ${employee.firstName} ${employee.lastName} · signed by Dr. ${data.certificate.issued_by}` });
      loadHistory(employee);
    } catch (e: any) {
      console.error('Issue failed', e);
      toast({ title: 'Failed to issue certificate', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setIssuing(false);
    }
  };

  const download = (id: number) => {
    api.get(`/team/occupational-health/fitness-certificate/${id}/pdf`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url; a.download = `fitness-certificate-${id}.pdf`; a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => {
        console.error('Download failed', e);
        toast({ title: 'Download failed', variant: 'destructive' });
      });
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-emerald-500" />
            Fitness Certificates / MER
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Issue a General Fitness Certificate / Medical Examination Report for a corporate employee — for health camps and on-site checkups.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> 1. Corporate</CardTitle>
          </CardHeader>
          <CardContent>
            {!corporate ? (
              <div className="space-y-2">
                <Input placeholder="Search corporate (e.g. Ninjacart)…" value={corpSearch} onChange={(e) => setCorpSearch(e.target.value)} />
                {corpSearch && (
                  <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                    {filteredCorporates.slice(0, 20).map((c) => (
                      <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                        onClick={() => { setCorporate(c); setCorpSearch(''); }}>
                        {c.companyName}
                      </button>
                    ))}
                    {filteredCorporates.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No match</div>}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-sm py-1.5 px-3">{corporate.companyName}</Badge>
                <Button size="sm" variant="ghost" onClick={() => { setCorporate(null); setEmployee(null); }}>Change</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {corporate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> 2. Employee</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search employee by name, email or phone…" value={empSearch}
                  onChange={(e) => searchEmployees(e.target.value)} />
                {empLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin" />}
              </div>
              {employees.length > 0 && (
                <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {employees.map((e) => (
                    <button key={e.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                      onClick={() => selectEmployee(e)}>
                      {e.firstName} {e.lastName} <span className="text-muted-foreground">· {e.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {employee && (
                <Badge variant="outline" className="text-sm py-1.5 px-3">
                  {employee.firstName} {employee.lastName} — {employee.email}
                </Badge>
              )}
            </CardContent>
          </Card>
        )}

        {corporate && employee && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> 3. Examination</CardTitle>
              <CardDescription>Fill in findings and issue the certificate — a printable PDF is generated immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Employee ID / code (optional)</Label>
                  <Input value={form.employeeCode} onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Job / role</Label>
                  <Input value={form.jobDescription} onChange={(e) => setForm((f) => ({ ...f, jobDescription: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Examination date</Label>
                  <Input type="date" value={form.examinationDate} onChange={(e) => setForm((f) => ({ ...f, examinationDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Fitness status</Label>
                  <Select value={form.fitnessStatus} onValueChange={(v) => setForm((f) => ({ ...f, fitnessStatus: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          <span className={`inline-flex items-center gap-1.5 ${s.color}`}><s.icon className="h-3.5 w-3.5" />{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Valid from</Label>
                  <Input type="date" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Valid until</Label>
                  <Input type="date" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} />
                </div>
              </div>
              <div>
                {cmoLoading && <p className="text-xs text-muted-foreground">Checking this corporate's mapped CMO…</p>}
                {cmoChecked && mappedCmo && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                    <Stethoscope className="size-4 shrink-0" />
                    <span>Will be signed by <strong>Dr. {mappedCmo.doctorName}</strong> — the mapped CMO at {mappedCmo.clinicName}. No action needed.</span>
                  </div>
                )}
                {cmoChecked && !mappedCmo && (
                  <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                    <p className="text-xs text-amber-900 dark:text-amber-200">This corporate has no mapped CMO on file. Enter the examining doctor's details for this certificate.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Examining doctor's name</Label>
                        <Input value={form.doctorName} onChange={(e) => setForm((f) => ({ ...f, doctorName: e.target.value }))} placeholder="e.g. Nandita Agarwal" />
                      </div>
                      <div>
                        <Label className="text-xs">Doctor's registration no.</Label>
                        <Input value={form.doctorRegNo} onChange={(e) => setForm((f) => ({ ...f, doctorRegNo: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {(form.fitnessStatus === 'fit_with_restrictions' || form.fitnessStatus === 'temporarily_unfit' || form.fitnessStatus === 'unfit') && (
                <div>
                  <Label className="text-xs">Restrictions</Label>
                  <Textarea rows={2} value={form.restrictions} onChange={(e) => setForm((f) => ({ ...f, restrictions: e.target.value }))} />
                </div>
              )}
              <div>
                <Label className="text-xs">Clinical remarks (optional)</Label>
                <Textarea rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
              </div>

              <Button onClick={issue} disabled={issuing || (cmoChecked && !mappedCmo && !form.doctorName.trim())} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {issuing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Stethoscope className="h-4 w-4 mr-2" />}
                Issue Certificate
              </Button>

              {lastIssued && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm flex-1">Certificate FC-{lastIssued.id} issued.</span>
                  <Button size="sm" variant="outline" onClick={() => download(lastIssued.id)}>
                    <FileDown className="h-4 w-4 mr-1" /> Download PDF
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {corporate && employee && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Certificate history</CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No certificates issued yet for this employee.</p>
              ) : (
                <div className="divide-y">
                  {history.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">FC-{c.id} — {STATUS_OPTIONS.find((s) => s.value === c.fitness_status)?.label || c.fitness_status}</p>
                        <p className="text-xs text-muted-foreground">Examined {new Date(c.examination_date).toLocaleDateString()} · Valid until {c.valid_until ? new Date(c.valid_until).toLocaleDateString() : '—'}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => download(c.id)}>
                        <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default TeamFitnessCertificates;

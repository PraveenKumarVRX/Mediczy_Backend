import { useEffect, useMemo, useState } from 'react';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, Search, Loader2, Plus, X, Download, Ban, Save, FlaskConical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

interface Employee { id: string; employeeId: string; name: string; email?: string; department?: string; }
interface Letter {
  id: string; referenceNumber: string; status: string;
  employee: { name?: string; employeeId?: string; department?: string };
  lab: { name?: string }; tests: string[]; validFrom?: string | null; validUntil?: string | null;
  issuedAt: string;
}
interface Template {
  headerText: string; introParagraph: string; bodyNote: string; footerText: string;
  signatoryName: string; signatoryTitle: string;
}

const EMPTY_TEMPLATE: Template = { headerText: '', introParagraph: '', bodyNote: '', footerText: '', signatoryName: '', signatoryTitle: '' };

const CorporateReferralLetters = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('issue');

  // Issue form
  const [empSearch, setEmpSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [tests, setTests] = useState<string[]>([]);
  const [newTest, setNewTest] = useState('');
  const [pkgName, setPkgName] = useState<string | null>(null);
  const [labName, setLabName] = useState('');
  const [labAddress, setLabAddress] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);

  // Issued list
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loadingLetters, setLoadingLetters] = useState(false);

  // Template
  const [template, setTemplate] = useState<Template>(EMPTY_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadEmployees = async (q: string) => {
    try {
      const { data } = await api.get(`/corporate/employees?status=active&q=${encodeURIComponent(q)}`);
      setEmployees((data?.employees || data?.data || []).slice(0, 25));
    } catch { /* ignore */ }
  };
  useEffect(() => { const t = setTimeout(() => loadEmployees(empSearch), 300); return () => clearTimeout(t); }, [empSearch]);

  const loadLetters = async () => {
    setLoadingLetters(true);
    try { const { data } = await api.get('/corporate/referral-letters'); setLetters(data?.letters || []); }
    catch { /* ignore */ } finally { setLoadingLetters(false); }
  };
  const loadTemplate = async () => {
    try { const { data } = await api.get('/corporate/referral-template'); if (data?.template) setTemplate({ ...EMPTY_TEMPLATE, ...data.template }); }
    catch { /* ignore */ }
  };
  useEffect(() => { loadLetters(); loadTemplate(); }, []);

  const selectEmployee = async (emp: Employee) => {
    setSelectedEmp(emp); setEmployees([]); setEmpSearch('');
    setLoadingTests(true);
    try {
      const { data } = await api.get(`/corporate/employees/${encodeURIComponent(emp.employeeId || emp.id)}/ahc-tests`);
      setTests(data?.tests || []);
      setPkgName(data?.package?.name || null);
      if (data?.package?.validFrom) setValidFrom(String(data.package.validFrom).slice(0, 10));
      if (data?.package?.validTo) setValidUntil(String(data.package.validTo).slice(0, 10));
      if (!data?.hasLogin) toast({ title: 'No employee login yet', description: 'The letter will be issued but will only appear in the app once the employee has a login.', });
    } catch { setTests([]); } finally { setLoadingTests(false); }
  };

  const addTest = () => { const v = newTest.trim(); if (v && !tests.includes(v)) setTests([...tests, v]); setNewTest(''); };
  const removeTest = (t: string) => setTests(tests.filter((x) => x !== t));

  const resetForm = () => { setSelectedEmp(null); setTests([]); setPkgName(null); setLabName(''); setLabAddress(''); setValidFrom(''); setValidUntil(''); setNotes(''); };

  const issue = async () => {
    if (!selectedEmp) { toast({ title: 'Select an employee', variant: 'destructive' }); return; }
    if (!tests.length) { toast({ title: 'Add at least one test', variant: 'destructive' }); return; }
    if (!labName.trim()) { toast({ title: 'Enter the target lab / diagnostic centre', variant: 'destructive' }); return; }
    setIssuing(true);
    try {
      await api.post('/corporate/referral-letters', {
        employeeId: selectedEmp.employeeId || selectedEmp.id,
        tests,
        lab: { name: labName.trim(), address: labAddress.trim() || null },
        validFrom: validFrom || null, validUntil: validUntil || null, notes: notes.trim() || null,
      });
      toast({ title: 'Referral letter issued', description: 'The employee has been notified and can download it from the app.' });
      resetForm(); setTab('issued'); loadLetters();
    } catch (err: any) {
      toast({ title: 'Could not issue letter', description: err?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally { setIssuing(false); }
  };

  const downloadPdf = async (letter: Letter) => {
    try {
      const res = await api.get(`/corporate/referral-letters/${letter.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `${letter.referenceNumber}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { toast({ title: 'Download failed', variant: 'destructive' }); }
  };

  const revoke = async (letter: Letter) => {
    try { await api.post(`/corporate/referral-letters/${letter.id}/revoke`, { reason: 'Withdrawn by HR' }); toast({ title: 'Letter withdrawn' }); loadLetters(); }
    catch { toast({ title: 'Could not withdraw', variant: 'destructive' }); }
  };

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try { await api.put('/corporate/referral-template', template); toast({ title: 'Template saved' }); }
    catch { toast({ title: 'Could not save template', variant: 'destructive' }); }
    finally { setSavingTemplate(false); }
  };

  const activeLetters = useMemo(() => letters.filter((l) => l.status === 'issued'), [letters]);

  return (
    <CorporateLayout>
      <div className="space-y-6">
        <CorporatePageHeader
          title="Referral Letters"
          description="Issue authorised health-checkup referral letters to labs for your employees"
          icon={FileText}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="issue">Issue a letter</TabsTrigger>
            <TabsTrigger value="issued">Issued ({activeLetters.length})</TabsTrigger>
            <TabsTrigger value="template">Letter template</TabsTrigger>
          </TabsList>

          {/* ISSUE ------------------------------------------------------- */}
          <TabsContent value="issue" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Authorise an employee for a health checkup</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                {/* Employee picker */}
                <div className="space-y-2">
                  <Label>Employee</Label>
                  {selectedEmp ? (
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                      <div>
                        <div className="font-medium text-foreground">{selectedEmp.name}</div>
                        <div className="text-xs text-muted-foreground">{selectedEmp.employeeId}{selectedEmp.department ? ` · ${selectedEmp.department}` : ''}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={resetForm}>Change</Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Search by name or employee ID" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} />
                      {employees.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-64 overflow-auto">
                          {employees.map((e) => (
                            <button key={e.id} onClick={() => selectEmployee(e)} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted">
                              <span className="text-sm font-medium text-foreground">{e.name}</span>
                              <span className="text-xs text-muted-foreground">{e.employeeId}{e.department ? ` · ${e.department}` : ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Tests */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Authorised tests</Label>
                    {loadingTests && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {pkgName && <span className="text-xs text-muted-foreground">prefilled from {pkgName}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tests.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs">
                        <FlaskConical className="h-3 w-3" />{t}
                        <button onClick={() => removeTest(t)} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {tests.length === 0 && !loadingTests && <span className="text-xs text-muted-foreground">No tests yet — add below or select an employee to prefill.</span>}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Add a test" value={newTest} onChange={(e) => setNewTest(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTest(); } }} />
                    <Button type="button" variant="secondary" onClick={addTest}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>

                {/* Lab */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Target lab / diagnostic centre</Label>
                    <Input placeholder="e.g. Agilus Diagnostics — Indiranagar" value={labName} onChange={(e) => setLabName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lab address <span className="text-muted-foreground">(optional)</span></Label>
                    <Input placeholder="Branch / city" value={labAddress} onChange={(e) => setLabAddress(e.target.value)} />
                  </div>
                </div>

                {/* Validity + notes */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Valid from</Label><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Valid until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Notes <span className="text-muted-foreground">(optional)</span></Label><Textarea rows={2} placeholder="e.g. fasting required for lipid profile" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

                <div className="flex justify-end">
                  <Button onClick={issue} disabled={issuing}>{issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}<span className="ml-2">Issue referral letter</span></Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ISSUED ------------------------------------------------------ */}
          <TabsContent value="issued" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loadingLetters ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : letters.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">No referral letters issued yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {letters.map((l) => (
                      <div key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{l.employee?.name || '—'}</span>
                            <Badge variant={l.status === 'issued' ? 'secondary' : 'outline'} className="capitalize">{l.status}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{l.referenceNumber} · {l.lab?.name || '—'} · {l.tests?.length || 0} tests</div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button variant="outline" size="sm" onClick={() => downloadPdf(l)}><Download className="h-4 w-4" /><span className="ml-1.5">PDF</span></Button>
                          {l.status === 'issued' && <Button variant="ghost" size="sm" onClick={() => revoke(l)}><Ban className="h-4 w-4" /><span className="ml-1.5">Withdraw</span></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TEMPLATE ---------------------------------------------------- */}
          <TabsContent value="template" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Letter template</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">This template is applied to every referral letter your organisation issues. The employee and test details are filled in per letter.</p>
                <div className="space-y-2"><Label>Letterhead / header</Label><Input placeholder="Your organisation name" value={template.headerText} onChange={(e) => setTemplate({ ...template, headerText: e.target.value })} /></div>
                <div className="space-y-2"><Label>Introduction paragraph</Label><Textarea rows={3} placeholder="This is to authorise the below-named employee…" value={template.introParagraph} onChange={(e) => setTemplate({ ...template, introParagraph: e.target.value })} /></div>
                <div className="space-y-2"><Label>Standing note <span className="text-muted-foreground">(optional)</span></Label><Textarea rows={2} value={template.bodyNote} onChange={(e) => setTemplate({ ...template, bodyNote: e.target.value })} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Signatory name</Label><Input value={template.signatoryName} onChange={(e) => setTemplate({ ...template, signatoryName: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Signatory title</Label><Input value={template.signatoryTitle} onChange={(e) => setTemplate({ ...template, signatoryTitle: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Footer / disclaimer</Label><Textarea rows={2} value={template.footerText} onChange={(e) => setTemplate({ ...template, footerText: e.target.value })} /></div>
                <div className="flex justify-end"><Button onClick={saveTemplate} disabled={savingTemplate}>{savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="ml-2">Save template</span></Button></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CorporateLayout>
  );
};

export default CorporateReferralLetters;

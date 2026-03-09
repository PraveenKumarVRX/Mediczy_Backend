import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { Shield, Plus, CheckCircle2, ArrowRight, Search, ChevronRight, User } from 'lucide-react';

const STEPS = ['Search Member', 'Admission Details', 'Review & Submit', 'Confirmation'];

const InsurancePreAuthPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const statusFilter = searchParams.get('status') || 'pending';
  const isNewMode = window.location.pathname.includes('/new');

  const [preAuths, setPreAuths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(isNewMode);
  const [wizardStep, setWizardStep] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);

  // Pre-auth form
  const [form, setForm] = useState({
    memberId: '', memberName: '', employeeId: '', policyNumber: '',
    insurer: '', procedure: '', estimatedCost: '', plannedDate: '',
    diagnosis: '', icdCode: '', roomCategory: '',
    proposedTreatment: '', surgicalManagement: '', doctorName: '',
    clinicalJustification: '',
  });

  useEffect(() => {
    if (!isNewMode) fetchPreAuths();
  }, [statusFilter]);

  const fetchPreAuths = async () => {
    setLoading(true);
    try {
      const endpoint = statusFilter === 'approved'
        ? '/hospital/insurance/pre-auth/approved'
        : statusFilter === 'rejected'
        ? '/hospital/insurance/pre-auth/rejected'
        : '/hospital/insurance/pre-auth/pending';
      const { data } = await api.get(endpoint);
      if (data.success) setPreAuths(data.preAuths || data.data || []);
    } catch { setPreAuths([]); }
    finally { setLoading(false); }
  };

  const handleSearchMember = async () => {
    try {
      const { data } = await api.post('/hospital/insurance/patient/search', { searchTerm, searchType: 'policy' });
      if (data.success && data.results?.length > 0) {
        setSelectedMember(data.results[0]);
        setForm(f => ({
          ...f,
          memberId: data.results[0].id,
          memberName: `${data.results[0].firstName || ''} ${data.results[0].lastName || ''}`.trim(),
          policyNumber: data.results[0].policyNumber || '',
        }));
        toast({ title: 'Member Found', description: `${data.results[0].firstName || 'Patient'} found.` });
      } else {
        toast({ title: 'Not Found', description: 'No member found with the given details.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Search failed', variant: 'destructive' });
    }
  };

  const handleSubmitPreAuth = async () => {
    try {
      const { data } = await api.post('/hospital/insurance/pre-auth/new', {
        patientId: form.memberId || 1,
        policyNumber: form.policyNumber,
        insurerCode: form.insurer,
        procedure: form.procedure,
        estimatedCost: parseFloat(form.estimatedCost) || 0,
        plannedDate: form.plannedDate,
        diagnosis: form.diagnosis,
        icdCode: form.icdCode,
        roomCategory: form.roomCategory,
        proposedTreatment: form.proposedTreatment,
        surgicalManagement: form.surgicalManagement,
        doctorName: form.doctorName,
        clinicalJustification: form.clinicalJustification,
      });
      if (data.success) {
        setWizardStep(3);
        toast({ title: 'Pre-Auth Submitted', description: 'Pre-authorization request submitted successfully.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Submission failed', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700', expired: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  // 4-Step Wizard for New Pre-Auth
  if (showNew || isNewMode) {
    return (
      <InsurancePortalLayout title="New Pre-Authorization" subtitle="4-Step admission flow">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Steps indicator */}
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center gap-2 ${i <= wizardStep ? 'text-indigo-600' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i < wizardStep ? 'bg-green-500 text-white' : i === wizardStep ? 'bg-indigo-600 text-white' : 'bg-slate-200'
                  }`}>
                    {i < wizardStep ? '✓' : i + 1}
                  </div>
                  <span className="text-sm font-medium hidden md:block">{step}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />}
              </div>
            ))}
          </div>

          {/* Step 0: Search Member */}
          {wizardStep === 0 && (
            <Card>
              <CardHeader><CardTitle>Step 1: Search Member</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Search by Member ID, Employee ID, Policy Number, or ABHA ID</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Member ID / Employee ID / Policy No"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleSearchMember}><Search className="h-4 w-4 mr-1" /> Search</Button>
                </div>
                {selectedMember && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <User className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="font-medium">{form.memberName}</p>
                          <p className="text-sm text-muted-foreground">Policy: {form.policyNumber}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <div className="flex justify-end">
                  <Button disabled={!selectedMember} onClick={() => setWizardStep(1)}>
                    Next <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Admission Details */}
          {wizardStep === 1 && (
            <Card>
              <CardHeader><CardTitle>Step 2: Admission Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Insurer / TPA</label>
                    <Select value={form.insurer} onValueChange={(v) => setForm({...form, insurer: v})}>
                      <SelectTrigger><SelectValue placeholder="Select insurer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="star_health">Star Health</SelectItem>
                        <SelectItem value="hdfc_ergo">HDFC ERGO</SelectItem>
                        <SelectItem value="icici_lombard">ICICI Lombard</SelectItem>
                        <SelectItem value="bajaj_allianz">Bajaj Allianz</SelectItem>
                        <SelectItem value="care_health">Care Health</SelectItem>
                        <SelectItem value="niva_bupa">Niva Bupa</SelectItem>
                        <SelectItem value="medi_assist">Medi Assist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Planned Date</label>
                    <Input type="date" value={form.plannedDate} onChange={(e) => setForm({...form, plannedDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Procedure</label>
                    <Input value={form.procedure} onChange={(e) => setForm({...form, procedure: e.target.value})} placeholder="Procedure name" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Estimated Cost (₹)</label>
                    <Input type="number" value={form.estimatedCost} onChange={(e) => setForm({...form, estimatedCost: e.target.value})} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Diagnosis</label>
                    <Input value={form.diagnosis} onChange={(e) => setForm({...form, diagnosis: e.target.value})} placeholder="Diagnosis" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">ICD-10 Code</label>
                    <Input value={form.icdCode} onChange={(e) => setForm({...form, icdCode: e.target.value})} placeholder="e.g. J44.1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Room Category</label>
                    <Select value={form.roomCategory} onValueChange={(v) => setForm({...form, roomCategory: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Ward</SelectItem>
                        <SelectItem value="semi_private">Semi-Private</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="deluxe">Deluxe</SelectItem>
                        <SelectItem value="icu">ICU</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Doctor Name</label>
                    <Input value={form.doctorName} onChange={(e) => setForm({...form, doctorName: e.target.value})} placeholder="Treating doctor" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Proposed Line of Treatment</label>
                    <Textarea value={form.proposedTreatment} onChange={(e) => setForm({...form, proposedTreatment: e.target.value})} rows={2} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Surgical Management Details</label>
                    <Textarea value={form.surgicalManagement} onChange={(e) => setForm({...form, surgicalManagement: e.target.value})} rows={2} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Clinical Justification</label>
                    <Textarea value={form.clinicalJustification} onChange={(e) => setForm({...form, clinicalJustification: e.target.value})} rows={2} />
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setWizardStep(0)}>Back</Button>
                  <Button onClick={() => setWizardStep(2)}>Next: Review <ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Review */}
          {wizardStep === 2 && (
            <Card>
              <CardHeader><CardTitle>Step 3: Review & Submit</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(form).filter(([,v]) => v).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setWizardStep(1)}>Back</Button>
                  <Button onClick={handleSubmitPreAuth} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Submit Pre-Authorization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Confirmation */}
          {wizardStep === 3 && (
            <Card className="text-center">
              <CardContent className="py-12">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Pre-Authorization Submitted!</h3>
                <p className="text-muted-foreground mb-6">Your pre-auth request has been submitted for review by the insurer.</p>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={() => { setWizardStep(0); setSelectedMember(null); setForm({
                    memberId: '', memberName: '', employeeId: '', policyNumber: '',
                    insurer: '', procedure: '', estimatedCost: '', plannedDate: '',
                    diagnosis: '', icdCode: '', roomCategory: '',
                    proposedTreatment: '', surgicalManagement: '', doctorName: '', clinicalJustification: '',
                  }); }}>
                    New Pre-Auth
                  </Button>
                  <Button onClick={() => navigate('/hospital-insurance/pre-auth?status=pending')}>
                    View Pending
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </InsurancePortalLayout>
    );
  }

  // List view
  return (
    <InsurancePortalLayout title="Pre-Authorization" subtitle={`${statusFilter} requests`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {['pending', 'approved', 'rejected'].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => navigate(`/hospital-insurance/pre-auth?status=${s}`)}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={() => navigate('/hospital-insurance/pre-auth/new')}>
            <Plus className="h-4 w-4 mr-1" /> New Pre-Auth
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <p className="text-muted-foreground col-span-3 text-center py-12">Loading...</p>
          ) : preAuths.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No {statusFilter} pre-authorization requests</p>
            </div>
          ) : (
            preAuths.map((pa: any) => (
              <Card key={pa.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-medium">{pa.preAuthNumber || `PA-${pa.id}`}</span>
                    <Badge className={getStatusBadge(pa.status)}>{pa.status}</Badge>
                  </div>
                  <div>
                    <p className="font-medium">{pa.patientName || '—'}</p>
                    <p className="text-xs text-muted-foreground">{pa.insurer || pa.provider || '—'}</p>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estimated:</span>
                    <span className="font-bold">₹{(pa.estimatedCost || pa.amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {pa.approvedAmount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Approved:</span>
                      <span className="font-bold text-green-600">₹{pa.approvedAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {pa.procedure || pa.diagnosis || '—'}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsurancePreAuthPage;

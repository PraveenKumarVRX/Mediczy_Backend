import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { fetchPortalSection, savePortalSection } from '@/utils/hospitalInsurancePortalApi';
import { Shield, Globe, CheckCircle2, AlertTriangle, ArrowRight, FileText, Link2, Building2 } from 'lucide-react';

const InsuranceNHCXPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [onboardingStep, setOnboardingStep] = useState(0);

  const [hfrData, setHfrData] = useState({
    facilityId: '', facilityName: '', ownershipCode: '', facilityType: '',
    systemOfMedicine: 'modern', longitude: '', latitude: '', address: '', state: '', district: '', pin: '',
  });

  const [participantData, setParticipantData] = useState({
    participantName: '', participantCode: '', role: 'provider',
    signingCertificate: '', encryptionCertificate: '', callbackUrl: '',
  });

  useEffect(() => {
    fetchPortalSection('compliance/nhcx').then(res => {
      const d = res?.data || {};
      if (typeof d.onboardingStep === 'number') setOnboardingStep(d.onboardingStep);
      if (d.hfrData)         setHfrData(x => ({ ...x, ...d.hfrData }));
      if (d.participantData) setParticipantData(x => ({ ...x, ...d.participantData }));
    }).catch(() => {});
  }, []);

  const persistNHCX = async (step: number) => {
    try {
      await savePortalSection('compliance/nhcx', { onboardingStep: step, hfrData, participantData });
    } catch { /* silent */ }
  };

  const steps = [
    { title: 'Health Facility Registry', desc: 'Register on HFR (ABDM)' },
    { title: 'NHCX Participant', desc: 'Create NHCX participant' },
    { title: 'Certificate Setup', desc: 'Upload signing & encryption certs' },
    { title: 'Integration Test', desc: 'Test NHCX sandbox connectivity' },
    { title: 'Go Live', desc: 'Switch to production NHCX' },
  ];

  const nhcxFlows = [
    { name: 'Coverage Eligibility', status: 'ready', desc: 'Check patient insurance eligibility' },
    { name: 'Pre-Authorization', status: 'ready', desc: 'Submit and track pre-auth requests' },
    { name: 'Claims Submission', status: 'in_progress', desc: 'Submit final claims digitally' },
    { name: 'Payment Notice', status: 'pending', desc: 'Receive settlement notifications' },
    { name: 'Communication', status: 'pending', desc: 'Query and response exchange' },
  ];

  return (
    <InsurancePortalLayout title="NHCX Compliance" subtitle="National Health Claims Exchange onboarding and management">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
            <TabsTrigger value="flows">NHCX Flows</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-indigo-100 dark:bg-indigo-800 rounded-lg">
                    <Shield className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">National Health Claims Exchange (NHCX)</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      NHCX is a digital health claims platform under Ayushman Bharat Digital Mission (ABDM) that enables
                      standardized, paperless claims processing between providers and payers using FHIR standards.
                    </p>
                    <div className="flex gap-4 mt-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-indigo-600">{onboardingStep}/5</p>
                        <p className="text-xs text-muted-foreground">Steps Complete</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">Sandbox</p>
                        <p className="text-xs text-muted-foreground">Environment</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${onboardingStep >= 5 ? 'text-green-600' : 'text-red-600'}`}>{onboardingStep >= 5 ? 'Active' : 'Not Active'}</p>
                        <p className="text-xs text-muted-foreground">Status</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">NHCX Requirements</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { item: 'Health Facility Registry (HFR) Registration', done: false },
                    { item: 'Valid ROHINI ID', done: false },
                    { item: 'ABDM Health ID Integration', done: false },
                    { item: 'Digital Signing Certificate (DSC)', done: false },
                    { item: 'NHCX Sandbox Access', done: false },
                    { item: 'FHIR R4 Resource Support', done: true },
                    { item: 'API Endpoint Configuration', done: false },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {req.done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      <span className={req.done ? 'text-green-700' : ''}>{req.item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">IRDAI Compliance Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { date: 'Q1 2025', milestone: 'Sandbox registration', status: 'overdue' },
                    { date: 'Q2 2025', milestone: 'Integration testing', status: 'current' },
                    { date: 'Q3 2025', milestone: 'Pilot with 2+ payers', status: 'upcoming' },
                    { date: 'Q4 2025', milestone: 'Full production go-live', status: 'upcoming' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                      <div className="flex items-center gap-2">
                        <Badge className={item.status === 'overdue' ? 'bg-red-100 text-red-700' : item.status === 'current' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>{item.date}</Badge>
                        <span>{item.milestone}</span>
                      </div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-4">
            {/* Step Indicator */}
            <div className="flex items-center gap-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center">
                  <button
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${idx === onboardingStep ? 'bg-indigo-100 text-indigo-700 font-medium' : idx < onboardingStep ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                    onClick={() => setOnboardingStep(idx)}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === onboardingStep ? 'bg-indigo-600 text-white' : idx < onboardingStep ? 'bg-green-600 text-white' : 'bg-slate-300 text-slate-600'}`}>
                      {idx < onboardingStep ? '✓' : idx + 1}
                    </span>
                    {step.title}
                  </button>
                  {idx < steps.length - 1 && <ArrowRight className="h-4 w-4 text-slate-300 mx-1" />}
                </div>
              ))}
            </div>

            {/* Step Content */}
            {onboardingStep === 0 && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-5 w-5" /> Health Facility Registry (HFR)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Register your facility on ABDM Health Facility Registry to get a unique HFR ID.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm font-medium">Facility Name</label><Input value={hfrData.facilityName} onChange={(e) => setHfrData({...hfrData, facilityName: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">Facility ID (if existing)</label><Input value={hfrData.facilityId} onChange={(e) => setHfrData({...hfrData, facilityId: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">Ownership Code</label><Input placeholder="e.g. PVT, GOV" value={hfrData.ownershipCode} onChange={(e) => setHfrData({...hfrData, ownershipCode: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">Facility Type</label><Input placeholder="Hospital, Clinic, etc." value={hfrData.facilityType} onChange={(e) => setHfrData({...hfrData, facilityType: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">State</label><Input value={hfrData.state} onChange={(e) => setHfrData({...hfrData, state: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">District</label><Input value={hfrData.district} onChange={(e) => setHfrData({...hfrData, district: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">PIN Code</label><Input value={hfrData.pin} onChange={(e) => setHfrData({...hfrData, pin: e.target.value})} /></div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" asChild><a href="https://facilitysbx.abdm.gov.in" target="_blank" rel="noopener"><Globe className="h-4 w-4 mr-1" /> Open HFR Portal</a></Button>
                    <Button onClick={async () => { setOnboardingStep(1); toast({ title: 'Step 1 Complete' }); await persistNHCX(1); }} className="bg-indigo-600 hover:bg-indigo-700">Next: Create Participant <ArrowRight className="h-4 w-4 ml-1" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {onboardingStep === 1 && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5" /> NHCX Participant Creation</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Create your participant profile on NHCX to start exchanging claims digitally.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm font-medium">Participant Name</label><Input value={participantData.participantName} onChange={(e) => setParticipantData({...participantData, participantName: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">Participant Code</label><Input placeholder="Auto-generated or custom" value={participantData.participantCode} onChange={(e) => setParticipantData({...participantData, participantCode: e.target.value})} /></div>
                    <div className="col-span-2"><label className="text-sm font-medium">Callback URL</label><Input value={participantData.callbackUrl} onChange={(e) => setParticipantData({...participantData, callbackUrl: e.target.value})} placeholder="https://api.yourhospital.com/nhcx/callback" /></div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setOnboardingStep(0)}>Back</Button>
                    <Button onClick={async () => { setOnboardingStep(2); toast({ title: 'Step 2 Complete' }); await persistNHCX(2); }} className="bg-indigo-600 hover:bg-indigo-700">Next: Certificates <ArrowRight className="h-4 w-4 ml-1" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {onboardingStep >= 2 && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5" /> {steps[onboardingStep].title}</CardTitle></CardHeader>
                <CardContent className="py-12 text-center">
                  <Shield className="h-16 w-16 mx-auto mb-4 text-indigo-300" />
                  <p className="text-lg font-medium">{steps[onboardingStep].desc}</p>
                  <p className="text-sm text-muted-foreground mt-2">This step requires coordination with your IT team and NHCX support.</p>
                  <div className="flex justify-center gap-3 mt-6">
                    <Button variant="outline" onClick={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}>Back</Button>
                    {onboardingStep < 4 && <Button onClick={async () => { const next = onboardingStep + 1; setOnboardingStep(next); await persistNHCX(next); }} className="bg-indigo-600 hover:bg-indigo-700">Mark Complete & Next <ArrowRight className="h-4 w-4 ml-1" /></Button>}
                    {onboardingStep === 4 && <Button className="bg-green-600 hover:bg-green-700" onClick={() => toast({ title: 'NHCX Go Live', description: 'Production activation initiated!' })}>Activate Production <CheckCircle2 className="h-4 w-4 ml-1" /></Button>}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="flows" className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {nhcxFlows.map((flow, idx) => (
                <Card key={idx} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${flow.status === 'ready' ? 'bg-green-100' : flow.status === 'in_progress' ? 'bg-amber-100' : 'bg-slate-100'}`}>
                        {flow.status === 'ready' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : flow.status === 'in_progress' ? <Globe className="h-5 w-5 text-amber-600" /> : <AlertTriangle className="h-5 w-5 text-slate-400" />}
                      </div>
                      <div>
                        <p className="font-medium">{flow.name}</p>
                        <p className="text-sm text-muted-foreground">{flow.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={flow.status === 'ready' ? 'bg-green-100 text-green-700' : flow.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>
                        {flow.status.replace('_', ' ')}
                      </Badge>
                      <Button variant="outline" size="sm">Test</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceNHCXPage;

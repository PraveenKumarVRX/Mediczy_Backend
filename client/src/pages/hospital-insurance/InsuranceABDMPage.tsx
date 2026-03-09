import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Fingerprint, Search, UserPlus, CheckCircle2, Link2, FileText, Shield, Smartphone } from 'lucide-react';

const InsuranceABDMPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('create');
  const [abhaStep, setAbhaStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const [abhaForm, setAbhaForm] = useState({
    method: 'aadhaar',
    aadhaarNo: '', otp: '', name: '', dob: '', gender: '',
    mobile: '', email: '', address: '', state: '', district: '',
  });

  const [linkedRecords] = useState([
    { id: 1, abhaId: '91-1234-5678-9012', name: 'Rajesh Kumar', dob: '1985-03-15', mobile: '9876543210', status: 'verified', linkedDate: '2025-06-10' },
    { id: 2, abhaId: '91-2345-6789-0123', name: 'Priya Singh', dob: '1990-07-22', mobile: '9876543211', status: 'verified', linkedDate: '2025-06-12' },
    { id: 3, abhaId: '91-3456-7890-1234', name: 'Amit Verma', dob: '1978-11-05', mobile: '9876543212', status: 'pending', linkedDate: '2025-06-18' },
  ]);

  const handleSendOTP = () => {
    if (abhaForm.method === 'aadhaar' && abhaForm.aadhaarNo.length !== 12) {
      toast({ title: 'Error', description: 'Please enter valid 12-digit Aadhaar number.', variant: 'destructive' });
      return;
    }
    toast({ title: 'OTP Sent', description: `OTP sent to ${abhaForm.method === 'aadhaar' ? 'Aadhaar-linked' : ''} mobile number.` });
    setAbhaStep(1);
  };

  const handleVerifyOTP = () => {
    if (!abhaForm.otp || abhaForm.otp.length !== 6) {
      toast({ title: 'Error', description: 'Please enter valid 6-digit OTP.', variant: 'destructive' });
      return;
    }
    toast({ title: 'OTP Verified', description: 'Identity verified successfully.' });
    setAbhaStep(2);
  };

  const handleCreateABHA = () => {
    toast({ title: 'ABHA Created', description: 'ABHA Health ID created successfully!' });
    setAbhaStep(3);
  };

  return (
    <InsurancePortalLayout title="ABDM / ABHA Management" subtitle="Create and manage Ayushman Bharat Health Accounts">
      <div className="space-y-4">
        {/* Info Banner */}
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
          <CardContent className="p-4 flex items-center gap-4">
            <Fingerprint className="h-10 w-10 text-green-600" />
            <div>
              <p className="font-semibold">Ayushman Bharat Digital Mission (ABDM)</p>
              <p className="text-sm text-muted-foreground">Create ABHA (Ayushman Bharat Health Account) IDs for patients and link health records digitally.</p>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="create">Create ABHA</TabsTrigger>
            <TabsTrigger value="linked">Linked Records</TabsTrigger>
            <TabsTrigger value="consent">Consent Management</TabsTrigger>
          </TabsList>

          {/* Create ABHA */}
          <TabsContent value="create" className="space-y-4">
            {/* Step Indicator */}
            <div className="flex items-center gap-6 mb-4">
              {['Identity Verification', 'OTP Validation', 'Profile Details', 'ABHA Created'].map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx < abhaStep ? 'bg-green-600 text-white' : idx === abhaStep ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {idx < abhaStep ? '✓' : idx + 1}
                  </span>
                  <span className={`text-sm ${idx === abhaStep ? 'font-medium' : 'text-muted-foreground'}`}>{step}</span>
                </div>
              ))}
            </div>

            {abhaStep === 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-5 w-5" /> Identity Verification</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Verification Method</label>
                    <Select value={abhaForm.method} onValueChange={(v) => setAbhaForm({...abhaForm, method: v})}>
                      <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aadhaar">Aadhaar OTP</SelectItem>
                        <SelectItem value="mobile">Mobile OTP</SelectItem>
                        <SelectItem value="demographics">Demographics</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {abhaForm.method === 'aadhaar' && (
                    <div>
                      <label className="text-sm font-medium">Aadhaar Number</label>
                      <Input
                        value={abhaForm.aadhaarNo}
                        onChange={(e) => setAbhaForm({...abhaForm, aadhaarNo: e.target.value.replace(/\D/g, '').slice(0, 12)})}
                        placeholder="Enter 12-digit Aadhaar number"
                        maxLength={12}
                        className="w-72"
                      />
                    </div>
                  )}

                  {abhaForm.method === 'mobile' && (
                    <div>
                      <label className="text-sm font-medium">Mobile Number</label>
                      <Input
                        value={abhaForm.mobile}
                        onChange={(e) => setAbhaForm({...abhaForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        placeholder="Enter 10-digit mobile number"
                        maxLength={10}
                        className="w-72"
                      />
                    </div>
                  )}

                  <Button onClick={handleSendOTP} className="bg-indigo-600 hover:bg-indigo-700">
                    <Smartphone className="h-4 w-4 mr-1" /> Send OTP
                  </Button>
                </CardContent>
              </Card>
            )}

            {abhaStep === 1 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Verify OTP</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Enter the 6-digit OTP sent to the registered mobile number.</p>
                  <Input
                    value={abhaForm.otp}
                    onChange={(e) => setAbhaForm({...abhaForm, otp: e.target.value.replace(/\D/g, '').slice(0, 6)})}
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    className="w-48 text-center text-lg tracking-widest"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAbhaStep(0)}>Back</Button>
                    <Button onClick={handleVerifyOTP} className="bg-indigo-600 hover:bg-indigo-700">Verify OTP</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {abhaStep === 2 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Complete Profile</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm font-medium">Full Name</label><Input value={abhaForm.name} onChange={(e) => setAbhaForm({...abhaForm, name: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">Date of Birth</label><Input type="date" value={abhaForm.dob} onChange={(e) => setAbhaForm({...abhaForm, dob: e.target.value})} /></div>
                    <div>
                      <label className="text-sm font-medium">Gender</label>
                      <Select value={abhaForm.gender} onValueChange={(v) => setAbhaForm({...abhaForm, gender: v})}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><label className="text-sm font-medium">Mobile</label><Input value={abhaForm.mobile} onChange={(e) => setAbhaForm({...abhaForm, mobile: e.target.value})} /></div>
                    <div className="col-span-2"><label className="text-sm font-medium">Address</label><Input value={abhaForm.address} onChange={(e) => setAbhaForm({...abhaForm, address: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">State</label><Input value={abhaForm.state} onChange={(e) => setAbhaForm({...abhaForm, state: e.target.value})} /></div>
                    <div><label className="text-sm font-medium">District</label><Input value={abhaForm.district} onChange={(e) => setAbhaForm({...abhaForm, district: e.target.value})} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAbhaStep(1)}>Back</Button>
                    <Button onClick={handleCreateABHA} className="bg-green-600 hover:bg-green-700"><UserPlus className="h-4 w-4 mr-1" /> Create ABHA</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {abhaStep === 3 && (
              <Card className="border-2 border-green-200">
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-700">ABHA Health ID Created Successfully!</h3>
                  <p className="text-2xl font-mono font-bold mt-3 text-indigo-700">91-9876-5432-1098</p>
                  <p className="text-sm text-muted-foreground mt-2">ABHA address: {abhaForm.name.toLowerCase().replace(' ', '')}@abdm</p>
                  <div className="flex justify-center gap-3 mt-6">
                    <Button variant="outline">Download Card</Button>
                    <Button onClick={() => { setAbhaStep(0); setAbhaForm({...abhaForm, aadhaarNo: '', otp: '', name: '', dob: '', gender: ''}); }} className="bg-indigo-600 hover:bg-indigo-700">Create Another</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Linked Records */}
          <TabsContent value="linked" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search by ABHA ID, name, or mobile..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">ABHA ID</th>
                      <th className="py-2 px-3 text-left font-medium">Patient Name</th>
                      <th className="py-2 px-3 text-left font-medium">DOB</th>
                      <th className="py-2 px-3 text-left font-medium">Mobile</th>
                      <th className="py-2 px-3 text-center font-medium">Status</th>
                      <th className="py-2 px-3 text-left font-medium">Linked Date</th>
                      <th className="py-2 px-3 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedRecords.map(record => (
                      <tr key={record.id} className="border-b">
                        <td className="py-2 px-3 font-mono text-xs">{record.abhaId}</td>
                        <td className="py-2 px-3 font-medium">{record.name}</td>
                        <td className="py-2 px-3">{record.dob}</td>
                        <td className="py-2 px-3">{record.mobile}</td>
                        <td className="py-2 px-3 text-center">
                          <Badge className={record.status === 'verified' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>{record.status}</Badge>
                        </td>
                        <td className="py-2 px-3">{record.linkedDate}</td>
                        <td className="py-2 px-3 text-center">
                          <Button variant="ghost" size="sm"><Link2 className="h-3 w-3 mr-1" /> Link Records</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consent Management */}
          <TabsContent value="consent" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" /> Health Information Consent</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">Manage patient consent for sharing health records via ABDM Health Information Exchange.</p>
                <div className="space-y-3">
                  {[
                    { patient: 'Rajesh Kumar', purpose: 'Insurance Claim', hiu: 'Star Health', status: 'granted', expiry: '2025-12-31' },
                    { patient: 'Priya Singh', purpose: 'Pre-Authorization', hiu: 'ICICI Lombard', status: 'requested', expiry: '2025-09-30' },
                    { patient: 'Amit Verma', purpose: 'Treatment Follow-up', hiu: 'Self', status: 'granted', expiry: '2026-06-30' },
                  ].map((consent, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div>
                        <p className="font-medium">{consent.patient}</p>
                        <p className="text-sm text-muted-foreground">Purpose: {consent.purpose} | HIU: {consent.hiu}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Exp: {consent.expiry}</span>
                        <Badge className={consent.status === 'granted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>{consent.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceABDMPage;

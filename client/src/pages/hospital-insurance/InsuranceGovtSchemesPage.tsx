import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { fetchPortalSection, savePortalSection } from '@/utils/hospitalInsurancePortalApi';
import {
  Building2, CheckCircle2, AlertCircle, FileText, Upload,
  Search, Plus, Info, IndianRupee, Clock, User, RefreshCw
} from 'lucide-react';

const schemes = [
  {
    id: 'cghs', name: 'CGHS', fullName: 'Central Govt Health Scheme',
    empaneled: true, panelCode: 'CGHS-KA-2024-0192',
    patientEligibility: 'Central Govt employees, pensioners, dependents',
    coverage: 'Cashless treatment, CGHS rates applicable',
    keyContacts: 'CGHS Wellness Centre, Helpline: 1800-11-6666',
    claimProcess: 'Direct cashless – present CGHS card. No TPA. Reimbursement to hospital direct.',
    tariffRef: 'CGHS 2024 Schedule of Rates',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'echs', name: 'ECHS', fullName: 'Ex-Servicemen Contributory Health Scheme',
    empaneled: true, panelCode: 'ECHS-MH-2023-0456',
    patientEligibility: 'Retired armed forces personnel and dependents',
    coverage: 'Cashless treatment at network hospitals',
    keyContacts: 'ECHS Polyclinic coordination. Helpline: 1800-180-1246',
    claimProcess: 'Pre-auth from ECHS Polyclinic or Station HQ. Submit claim to ZO/Controlling HQ.',
    tariffRef: 'ECHS 2023 Scale of Charges',
    color: 'bg-green-100 text-green-700',
  },
  {
    id: 'esi', name: 'ESI', fullName: 'Employees State Insurance Scheme',
    empaneled: false, panelCode: null,
    patientEligibility: 'Employees earning ≤ ₹21,000/month in organized sector',
    coverage: 'Medical benefits, hospitalization, maternity',
    keyContacts: 'ESIC Regional Office. Helpline: 1800-11-2526',
    claimProcess: 'ESIC dispenses via its own hospitals. Referral to empaneled hospitals for super-specialty.',
    tariffRef: 'ESIC Rates',
    color: 'bg-orange-100 text-orange-700',
  },
  {
    id: 'pmjay', name: 'PMJAY / Ayushman Bharat', fullName: 'PM Jan Arogya Yojana',
    empaneled: true, panelCode: 'AB-KY-MH-2024-004521',
    patientEligibility: 'BPL & low-income families (≈ 100Mn families). Beneficiary card / PMJAY ID required.',
    coverage: '₹5 lakh/family/year for secondary & tertiary care. ~1,929 procedures.',
    keyContacts: 'SHA helpline: 14555. NHA portal: pmjay.gov.in',
    claimProcess: 'Verify beneficiary on NHA portal. Raise pre-auth. Submit claim via NHA transaction management system.',
    tariffRef: 'HBP 2022 Package Rates',
    color: 'bg-yellow-100 text-yellow-700',
  },
  {
    id: 'rsby', name: 'RSBY / State Scheme', fullName: 'Rashtriya Swasthya Bima Yojana / State Insurance',
    empaneled: false, panelCode: null,
    patientEligibility: 'Below poverty line families per state scheme',
    coverage: 'Varies by state scheme',
    keyContacts: 'State Health Authority (SHA)',
    claimProcess: 'Varies by state. Check state SHA portal for empanelment and claim process.',
    tariffRef: 'State SHA Package Rates',
    color: 'bg-purple-100 text-purple-700',
  },
];

const mockGovtClaims = [
  { id: 1, scheme: 'CGHS', claimNo: 'CGHS-2024-0891', patient: 'Mohan Gupta', beneficiaryId: 'CGHS-DEL-4521', amount: 48000, status: 'submitted', date: '2024-12-10' },
  { id: 2, scheme: 'PMJAY', claimNo: 'PMJAY-TMS-2024-0312', patient: 'Lakshmi Bai', beneficiaryId: 'AB-MH-7891234', amount: 72000, status: 'approved', date: '2024-12-08' },
  { id: 3, scheme: 'ECHS', claimNo: 'ECHS-MH-2024-0156', patient: 'Col. SK Sharma (Retd)', beneficiaryId: 'ECHS-PUNE-9901', amount: 135000, status: 'pending_docs', date: '2024-12-07' },
  { id: 4, scheme: 'CGHS', claimNo: 'CGHS-2024-0870', patient: 'Sunita Verma', beneficiaryId: 'CGHS-DEL-8821', amount: 22000, status: 'settled', date: '2024-12-05' },
];

const statusMap: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  pending_docs: 'bg-amber-100 text-amber-700',
  settled: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const InsuranceGovtSchemesPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'schemes' | 'claims'>('schemes');
  const [selectedScheme, setSelectedScheme] = useState<any>(null);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [claimForm, setClaimForm] = useState({ scheme: '', beneficiaryId: '', patient: '', amount: '', procedure: '' });
  const [schemeData, setSchemeData] = useState(schemes);
  const [govtClaims, setGovtClaims] = useState(mockGovtClaims);

  useEffect(() => {
    fetchPortalSection('compliance/govt-schemes').then(res => {
      const d = res?.data || {};
      if (d.schemes?.length)    setSchemeData(s => s.map(scheme => ({ ...scheme, ...(d.schemes.find((x: any) => x.id === scheme.id) || {}) })));
      if (d.govtClaims?.length) setGovtClaims(d.govtClaims);
    }).catch(() => {});
  }, []);

  const persistSchemes = async (updatedSchemes: typeof schemes) => {
    try {
      await savePortalSection('compliance/govt-schemes', { schemes: updatedSchemes, govtClaims });
    } catch { /* silent */ }
  };

  return (
    <InsurancePortalLayout title="Govt Schemes" subtitle="CGHS / ECHS / ESI / PMJAY claims workflow">
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'schemes' ? 'default' : 'outline'} size="sm" onClick={() => setTab('schemes')}>
          <Building2 className="h-4 w-4 mr-1" />Scheme Directory
        </Button>
        <Button variant={tab === 'claims' ? 'default' : 'outline'} size="sm" onClick={() => setTab('claims')}>
          <FileText className="h-4 w-4 mr-1" />Govt Claims
        </Button>
      </div>

      {tab === 'schemes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schemeData.map(s => (
              <Card key={s.id} className={`border-l-4 ${s.empaneled ? 'border-l-green-500' : 'border-l-gray-300'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={s.color}>{s.name}</Badge>
                        {s.empaneled
                          ? <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-0.5" />Empaneled</Badge>
                          : <Badge className="bg-gray-100 text-gray-600">Not Empaneled</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.fullName}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-muted-foreground">Eligibility: </span>
                      <span>{s.patientEligibility}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Coverage: </span>
                      <span>{s.coverage}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Claim Process: </span>
                      <span>{s.claimProcess}</span>
                    </div>
                    {s.panelCode && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Panel Code: </span>
                        <span className="font-mono">{s.panelCode}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-muted-foreground">Contacts: </span>
                      <span>{s.keyContacts}</span>
                    </div>
                  </div>

                  {!s.empaneled && (
                    <Button size="sm" variant="outline" className="w-full text-xs"
                      onClick={async () => {
                        const updated = schemeData.map(x => x.id === s.id ? { ...x, empaneled: true } : x);
                        setSchemeData(updated);
                        toast({ title: 'Empanelment Request', description: `Initiated empanelment process for ${s.name}.` });
                        await persistSchemes(updated);
                      }}>
                      <Plus className="h-3 w-3 mr-1" />Apply for Empanelment
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Info */}
          <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 flex gap-2 text-sm text-blue-800 dark:text-blue-200">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>For PMJAY, beneficiaries must be verified on the NHA portal before admission. Rates are pre-fixed per HBP package. No additional charges allowed for covered procedures.</p>
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Govt Claims', value: govtClaims.length, color: 'text-indigo-600' },
              { label: 'Pending Settlement', value: govtClaims.filter(c => c.status !== 'settled').length, color: 'text-amber-600' },
              { label: 'Total Amount', value: `₹${(govtClaims.reduce((s, c) => s + c.amount, 0) / 1000).toFixed(0)}K`, color: 'text-green-600' },
              { label: 'Avg TAT', value: '14 days', color: 'text-muted-foreground' },
            ].map(k => (
              <Card key={k.label}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </CardContent></Card>
            ))}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNewClaim(true)}>
              <Plus className="h-3 w-3 mr-1" />New Govt Claim
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      {['Scheme', 'Claim No', 'Patient', 'Beneficiary ID', 'Amount', 'Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {govtClaims.map(c => (
                      <tr key={c.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3"><Badge className={schemeData.find(s => s.name === c.scheme)?.color || ''}>{c.scheme}</Badge></td>
                        <td className="px-4 py-3 font-mono text-xs">{c.claimNo}</td>
                        <td className="px-4 py-3 font-medium">{c.patient}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c.beneficiaryId}</td>
                        <td className="px-4 py-3 font-bold">₹{c.amount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-xs">{c.date}</td>
                        <td className="px-4 py-3"><Badge className={statusMap[c.status]}>{c.status.replace('_', ' ')}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost"><FileText className="h-3 w-3" /></Button>
                            {c.status === 'pending_docs' && (
                              <Button size="sm" variant="outline" className="text-xs">
                                <Upload className="h-3 w-3 mr-1" />Docs
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New Govt Claim Dialog */}
      <Dialog open={showNewClaim} onOpenChange={setShowNewClaim}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Government Scheme Claim</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Scheme</label>
              <Select value={claimForm.scheme} onValueChange={v => setClaimForm({...claimForm, scheme: v})}>
                <SelectTrigger><SelectValue placeholder="Select scheme" /></SelectTrigger>
                <SelectContent>
                  {schemes.filter(s => s.empaneled).map(s => <SelectItem key={s.id} value={s.name}>{s.name} – {s.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium block mb-1">Beneficiary ID</label><Input placeholder="Scheme card / ID" value={claimForm.beneficiaryId} onChange={e => setClaimForm({...claimForm, beneficiaryId: e.target.value})} /></div>
              <div><label className="text-sm font-medium block mb-1">Patient Name</label><Input value={claimForm.patient} onChange={e => setClaimForm({...claimForm, patient: e.target.value})} /></div>
              <div><label className="text-sm font-medium block mb-1">Procedure / Package</label><Input value={claimForm.procedure} onChange={e => setClaimForm({...claimForm, procedure: e.target.value})} /></div>
              <div><label className="text-sm font-medium block mb-1">Claim Amount (₹)</label><Input type="number" value={claimForm.amount} onChange={e => setClaimForm({...claimForm, amount: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClaim(false)}>Cancel</Button>
            <Button onClick={() => { toast({ title: 'Claim Created', description: `New ${claimForm.scheme} claim raised.` }); setShowNewClaim(false); }}>
              Create Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InsurancePortalLayout>
  );
};

export default InsuranceGovtSchemesPage;

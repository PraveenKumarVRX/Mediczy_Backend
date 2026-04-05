import { useState, useEffect } from 'react';
import { fetchPortalSection, savePortalSection } from '@/utils/hospitalInsurancePortalApi';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, CheckCircle2, AlertCircle, Clock, Upload,
  Download, Calendar, FileText, RefreshCw, Bell, Plus
} from 'lucide-react';

const mockEmpanelments = [
  { id: 1, insurer: 'Star Health', type: 'TPL', status: 'active', mouDate: '2023-04-01', expiryDate: '2025-03-31',
    daysToExpiry: 110, panelCode: 'SH-MH-2023-1042', contactPerson: 'Ramesh Iyer', email: 'network@starhealth.in',
    phone: '044-28288800', accreditationStatus: 'NABH Verified', complianceScore: 94 },
  { id: 2, insurer: 'Care Health', type: 'TPL', status: 'active', mouDate: '2023-07-01', expiryDate: '2025-06-30',
    daysToExpiry: 200, panelCode: 'CH-MH-2023-0789', contactPerson: 'Priya Sharma', email: 'hospitals@carehealth.in',
    phone: '011-41515151', accreditationStatus: 'NABH Verified', complianceScore: 88 },
  { id: 3, insurer: 'HDFC ERGO', type: 'TPL', status: 'renewal_due', mouDate: '2022-01-01', expiryDate: '2024-12-31',
    daysToExpiry: 19, panelCode: 'HE-MH-2022-0234', contactPerson: 'Arun Kumar', email: 'provider@hdfcergo.com',
    phone: '022-66382222', accreditationStatus: 'JCI Accredited', complianceScore: 91 },
  { id: 4, insurer: 'CGHS', type: 'Government', status: 'active', mouDate: '2024-04-01', expiryDate: '2025-03-31',
    daysToExpiry: 110, panelCode: 'CGHS-CGO-MH-2024', contactPerson: 'CGHS Delhi', email: 'cghs.empanel@nic.in',
    phone: '011-23382453', accreditationStatus: 'NABH Mandatory', complianceScore: 100 },
  { id: 5, insurer: 'Bajaj Allianz', type: 'TPL', status: 'pending_renewal', mouDate: '2023-01-01', expiryDate: '2024-12-15',
    daysToExpiry: 3, panelCode: 'BA-MH-2023-0556', contactPerson: 'Sunil Mehta', email: 'network@bajajallianz.co.in',
    phone: '020-66026666', accreditationStatus: 'NABH Verified', complianceScore: 79 },
];

const complianceItems = [
  { id: 1, category: 'Accreditation', item: 'NABH Accreditation Certificate', status: 'valid', expiry: '2026-04-01' },
  { id: 2, category: 'Accreditation', item: 'Fire NOC from Municipal Authority', status: 'valid', expiry: '2025-08-15' },
  { id: 3, category: 'Accreditation', item: 'Clinical Establishment Certificate', status: 'expiring', expiry: '2025-01-20' },
  { id: 4, category: 'Staff', item: 'Medical Superintendent Registration', status: 'valid', expiry: '2027-06-01' },
  { id: 5, category: 'Staff', item: 'Nursing Home License', status: 'valid', expiry: '2025-12-31' },
  { id: 6, category: 'Billing', item: 'GST Registration', status: 'valid', expiry: null },
  { id: 7, category: 'Billing', item: 'PAN of Hospital', status: 'valid', expiry: null },
  { id: 8, category: 'Insurance', item: 'Medical Indemnity Insurance', status: 'expiring', expiry: '2025-02-01' },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  renewal_due: { label: 'Renewal Due', color: 'bg-amber-100 text-amber-700' },
  pending_renewal: { label: 'Urgent Renewal', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-700' },
  valid: { label: 'Valid', color: 'bg-green-100 text-green-700' },
  expiring: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700' },
};

const InsuranceEmpanelmentPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'mou' | 'compliance'>('mou');
  const [selectedInsurer, setSelectedInsurer] = useState<any>(null);
  const [showMOUDialog, setShowMOUDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [empanelments, setEmpanelments] = useState<any[]>(mockEmpanelments);
  const [documents, setDocuments] = useState<any[]>(complianceItems);
  const [addForm, setAddForm] = useState({ insurer: '', panelCode: '', mouDate: '', expiryDate: '' });

  useEffect(() => {
    fetchPortalSection('compliance/empanelment').then(d => {
      if (!d) return;
      if (d.empanelments?.length) setEmpanelments(d.empanelments);
      if (d.documents?.length) setDocuments(d.documents);
    });
  }, []);

  const urgentCount = empanelments.filter(e => (e.status === 'renewal_due' || e.status === 'pending_renewal') && e.daysToExpiry <= 30).length;

  return (
    <InsurancePortalLayout title="MOU & Empanelment" subtitle="Hospital empanelment, MOU management & compliance">
      {/* Alert banner */}
      {urgentCount > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-800">
          <Bell className="h-4 w-4 flex-shrink-0" />
          <strong>{urgentCount} MOU(s)</strong> expiring within 30 days. Initiate renewal immediately to avoid cashless suspension.
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'mou' ? 'default' : 'outline'} size="sm" onClick={() => setTab('mou')}>
          <Building2 className="h-4 w-4 mr-1" />Empanelment / MOU
        </Button>
        <Button variant={tab === 'compliance' ? 'default' : 'outline'} size="sm" onClick={() => setTab('compliance')}>
          <CheckCircle2 className="h-4 w-4 mr-1" />Compliance Docs
        </Button>
      </div>

      {tab === 'mou' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Active MOUs', value: empanelments.filter(e => e.status === 'active').length, color: 'text-green-600' },
              { label: 'Renewal Due', value: empanelments.filter(e => e.status !== 'active').length, color: 'text-amber-600' },
              { label: 'Avg Compliance', value: `${empanelments.length ? Math.round(empanelments.reduce((s, e) => s + (e.complianceScore || 0), 0) / empanelments.length) : 0}%`, color: 'text-indigo-600' },
              { label: 'Total Insurers', value: empanelments.length, color: 'text-slate-700' },
            ].map(k => (
              <Card key={k.label}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              </CardContent></Card>
            ))}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3 w-3 mr-1" />Add Empanelment
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {empanelments.map(e => (
              <Card key={e.id} className={`border-2 ${e.daysToExpiry <= 30 ? 'border-red-200' : e.daysToExpiry <= 90 ? 'border-amber-200' : 'border-transparent'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{e.insurer}</h3>
                      <p className="text-xs text-muted-foreground">{e.panelCode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={e.type === 'Government' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>{e.type}</Badge>
                      <Badge className={statusConfig[e.status]?.color}>{statusConfig[e.status]?.label}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">MOU From: </span><span>{e.mouDate}</span></div>
                    <div><span className="text-muted-foreground">Expires: </span>
                      <span className={e.daysToExpiry <= 30 ? 'font-bold text-red-600' : e.daysToExpiry <= 90 ? 'font-bold text-amber-600' : ''}>{e.expiryDate}</span>
                    </div>
                    <div><span className="text-muted-foreground">Contact: </span><span>{e.contactPerson}</span></div>
                    <div><span className="text-muted-foreground">Phone: </span><span>{e.phone}</span></div>
                  </div>

                  {/* Compliance score */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Compliance Score</span>
                      <span className={`font-bold ${e.complianceScore >= 90 ? 'text-green-600' : e.complianceScore >= 75 ? 'text-amber-600' : 'text-red-600'}`}>{e.complianceScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${e.complianceScore >= 90 ? 'bg-green-500' : e.complianceScore >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${e.complianceScore}%` }} />
                    </div>
                  </div>

                  {e.daysToExpiry <= 30 && (
                    <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded p-2">
                      <AlertCircle className="h-3 w-3" />
                      Expires in <strong>{e.daysToExpiry} days</strong>. Initiate renewal immediately.
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 text-xs"
                      onClick={() => { setSelectedInsurer(e); setShowMOUDialog(true); }}>
                      <FileText className="h-3 w-3 mr-1" />View MOU
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs">
                      <Upload className="h-3 w-3 mr-1" />Upload Renewal
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs">
                      <RefreshCw className="h-3 w-3 mr-1" />Renew
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'compliance' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Track all hospital compliance documents required for insurance empanelment.</p>
            <Button size="sm"><Plus className="h-3 w-3 mr-1" />Add Document</Button>
          </div>
          {(['Accreditation', 'Staff', 'Billing', 'Insurance'] as string[]).map(cat => {
            const items = documents.filter(i => i.category === cat);
            return (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{cat}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.status === 'valid'
                            ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            : <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                          <div>
                            <p className="text-sm font-medium">{item.item}</p>
                            {item.expiry && <p className="text-xs text-muted-foreground">Expires: {item.expiry}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusConfig[item.status]?.color}>{statusConfig[item.status]?.label}</Badge>
                          <Button size="sm" variant="ghost"><Upload className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost"><Download className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* MOU View Dialog */}
      <Dialog open={showMOUDialog} onOpenChange={setShowMOUDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>MOU Details – {selectedInsurer?.insurer}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">Panel Code</span><p className="font-mono font-semibold">{selectedInsurer?.panelCode}</p></div>
              <div><span className="text-muted-foreground">Status</span><p><Badge className={statusConfig[selectedInsurer?.status]?.color}>{statusConfig[selectedInsurer?.status]?.label}</Badge></p></div>
              <div><span className="text-muted-foreground">Valid From</span><p>{selectedInsurer?.mouDate}</p></div>
              <div><span className="text-muted-foreground">Valid Until</span><p className="font-semibold">{selectedInsurer?.expiryDate}</p></div>
              <div><span className="text-muted-foreground">Contact</span><p>{selectedInsurer?.contactPerson}</p></div>
              <div><span className="text-muted-foreground">Email</span><p className="text-xs">{selectedInsurer?.email}</p></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMOUDialog(false)}>Close</Button>
            <Button><Download className="h-3 w-3 mr-1" />Download MOU</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Empanelment Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Empanelment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium block mb-1">Insurer Name</label><Input placeholder="Insurer name" value={addForm.insurer} onChange={e => setAddForm({...addForm, insurer: e.target.value})} /></div>
              <div><label className="text-sm font-medium block mb-1">Panel Code</label><Input placeholder="Panel / network code" value={addForm.panelCode} onChange={e => setAddForm({...addForm, panelCode: e.target.value})} /></div>
              <div><label className="text-sm font-medium block mb-1">MOU Start Date</label><Input type="date" value={addForm.mouDate} onChange={e => setAddForm({...addForm, mouDate: e.target.value})} /></div>
              <div><label className="text-sm font-medium block mb-1">MOU Expiry Date</label><Input type="date" value={addForm.expiryDate} onChange={e => setAddForm({...addForm, expiryDate: e.target.value})} /></div>
            </div>
            <div><label className="text-sm font-medium block mb-1">Upload MOU Document</label>
              <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" />Upload PDF</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!addForm.insurer) return;
              const daysToExpiry = addForm.expiryDate ? Math.ceil((new Date(addForm.expiryDate).getTime() - Date.now()) / 86400000) : 365;
              const newEntry = { id: Date.now(), insurer: addForm.insurer, type: 'TPL', status: 'active', mouDate: addForm.mouDate, expiryDate: addForm.expiryDate, daysToExpiry, panelCode: addForm.panelCode, contactPerson: '', email: '', phone: '', accreditationStatus: '', complianceScore: 80 };
              const updated = [...empanelments, newEntry];
              setEmpanelments(updated);
              await savePortalSection('compliance/empanelment', { empanelments: updated, documents });
              toast({ title: 'Empanelment Added' });
              setAddForm({ insurer: '', panelCode: '', mouDate: '', expiryDate: '' });
              setShowAddDialog(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InsurancePortalLayout>
  );
};

export default InsuranceEmpanelmentPage;

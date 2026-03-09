import { useState, useEffect, useCallback } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Plus, Download, RefreshCw, Eye, ChevronLeft, ChevronRight,
  Search, Printer
} from 'lucide-react';

const STATUS_TABS = [
  { value: 'all', label: 'All Claims' },
  { value: 'pa_draft', label: 'PA Draft' },
  { value: 'pa_query_pending', label: 'PA Query (Pending)' },
  { value: 'pa_query_3hrs', label: 'PA Query (>3hrs)' },
  { value: 'pa_approved', label: 'PA Approved' },
  { value: 'awaiting', label: 'Awaiting' },
  { value: 'discharge_today', label: 'Discharge Today' },
  { value: 'discharge_tomorrow', label: 'Discharge Tomorrow' },
  { value: 'discharge_pending', label: 'Discharge Pending' },
  { value: 'claim_draft', label: 'Claim Draft' },
  { value: 'claim_query', label: 'Claim Query' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'settled', label: 'Settled' },
];

const InsuranceClaimsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('status') || 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [insurerFilter, setInsurerFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [claimTimeline, setClaimTimeline] = useState<any[]>([]);

  // New claim form
  const [newClaim, setNewClaim] = useState({
    uhid: '', patientName: '', policyNumber: '', insurer: '',
    claimType: 'cashless', priority: 'normal', admissionDate: '',
    estimatedAmount: '', diagnosis: '', procedureCode: '', notes: ''
  });

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (activeTab !== 'all') params.status = activeTab;
      if (searchTerm) params.search = searchTerm;
      if (insurerFilter !== 'all') params.insurer = insurerFilter;

      const { data } = await api.get('/hospital/insurance/claims', { params });
      if (data.success) {
        setClaims(data.claims || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.warn('Claims fetch error:', err);
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm, insurerFilter, page]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleCreateClaim = async () => {
    try {
      const { data } = await api.post('/hospital/insurance/claims/new', {
        patientId: 1,
        policyNumber: newClaim.policyNumber,
        claimAmount: parseFloat(newClaim.estimatedAmount) || 0,
        claimType: newClaim.claimType,
        hospitalizationDetails: {
          admissionDate: newClaim.admissionDate,
          diagnosis: newClaim.diagnosis,
          procedureCode: newClaim.procedureCode,
        },
        notes: newClaim.notes,
      });
      if (data.success) {
        toast({ title: 'Claim Created', description: `Claim ${data.claim?.claimNumber || ''} submitted successfully.` });
        setShowNewClaim(false);
        fetchClaims();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to create claim', variant: 'destructive' });
    }
  };

  const handleViewClaim = async (claim: any) => {
    setSelectedClaim(claim);
    setShowDetail(true);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${claim.id}/history`);
      if (data.success) setClaimTimeline(data.history || []);
    } catch { setClaimTimeline([]); }
  };

  const handleExportCSV = () => {
    const headers = ['Claim #', 'Patient', 'Policy', 'Amount', 'Status', 'Date'];
    const rows = claims.map(c => [
      c.claimNumber, c.patientName || '', c.policyNumber, c.claimAmount, c.status,
      new Date(c.createdAt).toLocaleDateString('en-IN')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `claims-export-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = async (claimId: number) => {
    try {
      window.open(`/api/hospital/insurance/claims/${claimId}/pdf`, '_blank');
    } catch {
      toast({ title: 'PDF Error', description: 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700', query: 'bg-orange-100 text-orange-700',
      settled: 'bg-blue-100 text-blue-700', draft: 'bg-gray-100 text-gray-700',
      pa_draft: 'bg-gray-100 text-gray-700', pa_approved: 'bg-green-100 text-green-700',
      pa_query_pending: 'bg-orange-100 text-orange-700', discharge_today: 'bg-purple-100 text-purple-700',
      settlement: 'bg-cyan-100 text-cyan-700',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <InsurancePortalLayout title="Claims Queue" subtitle="Manage insurance claims">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Claim ID, Policy No..."
                className="pl-9 w-72"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={insurerFilter} onValueChange={setInsurerFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Insurers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Insurers</SelectItem>
                <SelectItem value="star_health">Star Health</SelectItem>
                <SelectItem value="hdfc_ergo">HDFC ERGO</SelectItem>
                <SelectItem value="icici_lombard">ICICI Lombard</SelectItem>
                <SelectItem value="bajaj_allianz">Bajaj Allianz</SelectItem>
                <SelectItem value="care_health">Care Health</SelectItem>
                <SelectItem value="niva_bupa">Niva Bupa</SelectItem>
                <SelectItem value="tata_aig">Tata AIG</SelectItem>
                <SelectItem value="sbi_general">SBI General</SelectItem>
                <SelectItem value="medi_assist">Medi Assist</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchClaims}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowNewClaim(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Claim
            </Button>
          </div>
        </div>

        {/* Status Tabs (IHX-style) */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setActiveTab(tab.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.value
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Claims Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Claim #</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Patient</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Policy No.</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Insurer</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Claimed</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Approved</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Loading claims...</td></tr>
                  ) : claims.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No claims found</td></tr>
                  ) : (
                    claims.map((claim) => (
                      <tr key={claim.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-4 font-mono text-xs font-medium">{claim.claimNumber || `CLM-${claim.id}`}</td>
                        <td className="py-3 px-4">{claim.patientName || claim.patient?.firstName || '—'}</td>
                        <td className="py-3 px-4 font-mono text-xs">{claim.policyNumber || '—'}</td>
                        <td className="py-3 px-4">{claim.insurerName || claim.provider || '—'}</td>
                        <td className="py-3 px-4 text-right font-medium">₹{(claim.claimAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right">{claim.approvedAmount ? `₹${claim.approvedAmount.toLocaleString('en-IN')}` : '—'}</td>
                        <td className="py-3 px-4">
                          <Badge className={getStatusColor(claim.status)}>{claim.status}</Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {new Date(claim.submittedAt || claim.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewClaim(claim)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintPDF(claim.id)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Claim Detail Dialog */}
        <Dialog open={showDetail} onOpenChange={setShowDetail}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Claim Detail — {selectedClaim?.claimNumber}</DialogTitle>
            </DialogHeader>
            {selectedClaim && (
              <Tabs defaultValue="member">
                <TabsList className="grid grid-cols-5">
                  <TabsTrigger value="member">Member</TabsTrigger>
                  <TabsTrigger value="treatment">Treatment</TabsTrigger>
                  <TabsTrigger value="bills">Bills</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="member" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Patient Name</p>
                      <p className="font-medium">{selectedClaim.patientName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Policy Number</p>
                      <p className="font-mono">{selectedClaim.policyNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Insurer</p>
                      <p className="font-medium">{selectedClaim.insurerName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Claim Type</p>
                      <p>{selectedClaim.claimType || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Claimed Amount</p>
                      <p className="font-bold text-lg">₹{(selectedClaim.claimAmount || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Approved Amount</p>
                      <p className="font-bold text-lg text-green-600">
                        {selectedClaim.approvedAmount ? `₹${selectedClaim.approvedAmount.toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="treatment" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Diagnosis</p>
                      <p>{selectedClaim.hospitalizationDetails?.diagnosis || selectedClaim.diagnosis || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Procedure Code</p>
                      <p className="font-mono">{selectedClaim.hospitalizationDetails?.procedureCode || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Admission Date</p>
                      <p>{selectedClaim.hospitalizationDetails?.admissionDate || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Discharge Date</p>
                      <p>{selectedClaim.hospitalizationDetails?.dischargeDate || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Proposed Line of Treatment</p>
                      <p>{selectedClaim.treatmentDetails?.proposedTreatment || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Surgical Management</p>
                      <p>{selectedClaim.treatmentDetails?.surgicalManagement || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Room Category</p>
                      <p>{selectedClaim.treatmentDetails?.roomCategory || '—'}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="bills" className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Itemized bill details will appear here once available.
                  </p>
                  <div className="space-y-2">
                    {(selectedClaim.billDetails || [
                      { item: 'Room Rent', amount: 0 },
                      { item: 'ICU Charges', amount: 0 },
                      { item: 'OT Charges', amount: 0 },
                      { item: 'Consultation', amount: 0 },
                      { item: 'Anesthetist', amount: 0 },
                      { item: 'Investigation/Diagnostics', amount: 0 },
                      { item: 'Medicines', amount: 0 },
                      { item: 'Consumables', amount: 0 },
                    ]).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between py-2 border-b">
                        <span>{item.item || item.name}</span>
                        <span className="font-medium">₹{(item.amount || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-3 font-bold text-lg border-t-2">
                      <span>Total</span>
                      <span>₹{(selectedClaim.claimAmount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="documents" className="space-y-4 mt-4">
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Document management available in the Document Center</p>
                    <Button variant="outline" className="mt-2" onClick={() => { setShowDetail(false); navigate('/hospital-insurance/documents'); }}>
                      Go to Documents
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4 mt-4">
                  {claimTimeline.length > 0 ? (
                    <div className="space-y-3">
                      {claimTimeline.map((event: any, i: number) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2" />
                          <div>
                            <p className="font-medium text-sm">{event.action || event.status}</p>
                            <p className="text-xs text-muted-foreground">{event.remarks || ''}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.timestamp || event.createdAt).toLocaleString('en-IN')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No timeline events</p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* New Claim Dialog */}
        <Dialog open={showNewClaim} onOpenChange={setShowNewClaim}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Claim</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">UHID</label>
                <Input value={newClaim.uhid} onChange={(e) => setNewClaim({...newClaim, uhid: e.target.value})} placeholder="Enter UHID" />
              </div>
              <div>
                <label className="text-sm font-medium">Patient Name</label>
                <Input value={newClaim.patientName} onChange={(e) => setNewClaim({...newClaim, patientName: e.target.value})} placeholder="Patient name" />
              </div>
              <div>
                <label className="text-sm font-medium">Policy Number</label>
                <Input value={newClaim.policyNumber} onChange={(e) => setNewClaim({...newClaim, policyNumber: e.target.value})} placeholder="Policy number" />
              </div>
              <div>
                <label className="text-sm font-medium">Insurer / TPA</label>
                <Select value={newClaim.insurer} onValueChange={(v) => setNewClaim({...newClaim, insurer: v})}>
                  <SelectTrigger><SelectValue placeholder="Select insurer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="star_health">Star Health</SelectItem>
                    <SelectItem value="hdfc_ergo">HDFC ERGO</SelectItem>
                    <SelectItem value="icici_lombard">ICICI Lombard</SelectItem>
                    <SelectItem value="bajaj_allianz">Bajaj Allianz</SelectItem>
                    <SelectItem value="care_health">Care Health</SelectItem>
                    <SelectItem value="niva_bupa">Niva Bupa</SelectItem>
                    <SelectItem value="tata_aig">Tata AIG</SelectItem>
                    <SelectItem value="sbi_general">SBI General</SelectItem>
                    <SelectItem value="medi_assist">Medi Assist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Claim Type</label>
                <Select value={newClaim.claimType} onValueChange={(v) => setNewClaim({...newClaim, claimType: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashless">Cashless</SelectItem>
                    <SelectItem value="reimbursement">Reimbursement</SelectItem>
                    <SelectItem value="preauth">Pre-Authorization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={newClaim.priority} onValueChange={(v) => setNewClaim({...newClaim, priority: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Admission Date</label>
                <Input type="date" value={newClaim.admissionDate} onChange={(e) => setNewClaim({...newClaim, admissionDate: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium">Estimated Amount (₹)</label>
                <Input type="number" value={newClaim.estimatedAmount} onChange={(e) => setNewClaim({...newClaim, estimatedAmount: e.target.value})} placeholder="0" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Diagnosis</label>
                <Input value={newClaim.diagnosis} onChange={(e) => setNewClaim({...newClaim, diagnosis: e.target.value})} placeholder="ICD-10 code or description" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea value={newClaim.notes} onChange={(e) => setNewClaim({...newClaim, notes: e.target.value})} placeholder="Additional notes..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewClaim(false)}>Cancel</Button>
              <Button onClick={handleCreateClaim}>Submit Claim</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceClaimsPage;

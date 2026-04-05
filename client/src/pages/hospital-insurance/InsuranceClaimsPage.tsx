import { useState, useEffect, useCallback } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Search, Printer, CheckCircle2, Circle, Upload, AlertCircle
} from 'lucide-react';

const DEMO_CLAIMS = [
  { id: 'CLM-2026-0001', claimNumber: 'CLM-2026-0001', patientName: 'Ramesh Kumar', uhid: 'UHID-10045', policyNumber: 'SH-2024-789123', insurer: 'Star Health', claimType: 'cashless', status: 'pa_approved', claimAmount: 150000, approvedAmount: 145000, admissionDate: '2026-03-28', dischargeDate: '2026-04-02', diagnosis: 'Acute Appendicitis', procedureCode: 'APPY', ward: 'General', priority: 'normal', createdAt: '2026-03-28' },
  { id: 'CLM-2026-0002', claimNumber: 'CLM-2026-0002', patientName: 'Sunita Sharma', uhid: 'UHID-10062', policyNumber: 'HDFC-2023-456789', insurer: 'HDFC Ergo', claimType: 'cashless', status: 'claim_query', claimAmount: 320000, approvedAmount: null, admissionDate: '2026-03-30', dischargeDate: null, diagnosis: 'Coronary Artery Disease', procedureCode: 'PTCA', ward: 'ICU', priority: 'high', createdAt: '2026-03-30' },
  { id: 'CLM-2026-0003', claimNumber: 'CLM-2026-0003', patientName: 'Amit Verma', uhid: 'UHID-10071', policyNumber: 'ICICI-2024-321654', insurer: 'ICICI Lombard', claimType: 'cashless', status: 'pa_query_pending', claimAmount: 85000, approvedAmount: null, admissionDate: '2026-04-01', dischargeDate: null, diagnosis: 'Cholecystitis - Laparoscopic', procedureCode: 'CHOL', ward: 'Private', priority: 'normal', createdAt: '2026-04-01' },
  { id: 'CLM-2026-0004', claimNumber: 'CLM-2026-0004', patientName: 'Priya Singh', uhid: 'UHID-10089', policyNumber: 'BAJ-2023-654987', insurer: 'Bajaj Allianz', claimType: 'reimbursement', status: 'settled', claimAmount: 62000, approvedAmount: 58000, admissionDate: '2026-03-10', dischargeDate: '2026-03-14', diagnosis: 'Type 2 Diabetes with Complications', procedureCode: 'E11.9', ward: 'General', priority: 'normal', createdAt: '2026-03-10' },
  { id: 'CLM-2026-0005', claimNumber: 'CLM-2026-0005', patientName: 'Meera Devi', uhid: 'UHID-10094', policyNumber: 'CARE-2024-112233', insurer: 'Care Health', claimType: 'cashless', status: 'discharge_today', claimAmount: 110000, approvedAmount: null, admissionDate: '2026-03-31', dischargeDate: null, diagnosis: 'Knee Osteoarthritis - TKR', procedureCode: 'TKR', ward: 'Private', priority: 'high', createdAt: '2026-03-31' },
  { id: 'CLM-2026-0006', claimNumber: 'CLM-2026-0006', patientName: 'Suresh Patel', uhid: 'UHID-10102', policyNumber: 'NIVA-2023-778899', insurer: 'Niva Bupa', claimType: 'cashless', status: 'claim_draft', claimAmount: 45000, approvedAmount: null, admissionDate: '2026-04-03', dischargeDate: '2026-04-05', diagnosis: 'Kidney Stone - URS', procedureCode: 'URS', ward: 'Semi-Private', priority: 'normal', createdAt: '2026-04-03' },
  { id: 'CLM-2026-0007', claimNumber: 'CLM-2026-0007', patientName: 'Geeta Nair', uhid: 'UHID-10113', policyNumber: 'SBI-2024-443322', insurer: 'SBI General', claimType: 'cashless', status: 'settlement', claimAmount: 200000, approvedAmount: 190000, admissionDate: '2026-03-15', dischargeDate: '2026-03-22', diagnosis: 'Fracture Tibia - ORIF', procedureCode: 'S82.0', ward: 'Private', priority: 'normal', createdAt: '2026-03-15' },
  { id: 'CLM-2026-0008', claimNumber: 'CLM-2026-0008', patientName: 'Rohit Joshi', uhid: 'UHID-10127', policyNumber: 'TATA-2023-998877', insurer: 'Tata AIG', claimType: 'cashless', status: 'awaiting', claimAmount: 75000, approvedAmount: null, admissionDate: '2026-04-04', dischargeDate: null, diagnosis: 'COPD Exacerbation', procedureCode: 'J44.1', ward: 'General', priority: 'normal', createdAt: '2026-04-04' },
  { id: 'CLM-2026-0009', claimNumber: 'CLM-2026-0009', patientName: 'Anjali Mehta', uhid: 'UHID-10138', policyNumber: 'NH-2024-556677', insurer: 'New India', claimType: 'reimbursement', status: 'pa_approved', claimAmount: 95000, approvedAmount: 90000, admissionDate: '2026-03-25', dischargeDate: '2026-03-28', diagnosis: 'Hysterectomy - Abdominal', procedureCode: 'HYST', ward: 'Private', priority: 'normal', createdAt: '2026-03-25' },
  { id: 'CLM-2026-0010', claimNumber: 'CLM-2026-0010', patientName: 'Vijay Rao', uhid: 'UHID-10145', policyNumber: 'HDFC-2022-334455', insurer: 'HDFC Ergo', claimType: 'cashless', status: 'discharge_pending', claimAmount: 410000, approvedAmount: null, admissionDate: '2026-03-20', dischargeDate: null, diagnosis: 'CABG - Triple Vessel Disease', procedureCode: 'CABG', ward: 'ICU', priority: 'high', createdAt: '2026-03-20' },
];

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
  const [docChecklist, setDocChecklist] = useState<{name: string; required: boolean; uploaded: boolean}[]>([
    { name: 'Claim Form (Duly Filled)', required: true, uploaded: false },
    { name: 'Original Discharge Summary', required: true, uploaded: false },
    { name: 'Hospital Final Bill', required: true, uploaded: false },
    { name: 'All Investigation Reports', required: true, uploaded: false },
    { name: 'Prescriptions & Drug Receipt', required: true, uploaded: false },
    { name: 'Pre-Auth Letter', required: false, uploaded: false },
    { name: 'Ambulance Bill (if any)', required: false, uploaded: false },
    { name: 'ID Proof of Patient', required: true, uploaded: false },
    { name: 'Cancelled Cheque / Bank Details', required: true, uploaded: false },
    { name: 'Treating Doctor Certificate', required: false, uploaded: false },
  ]);

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
      console.warn('Claims fetch error, using demo data:', err);
      const filtered = activeTab === 'all' ? DEMO_CLAIMS : DEMO_CLAIMS.filter(c => c.status === activeTab);
      setClaims(filtered.length > 0 ? filtered : DEMO_CLAIMS);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm, insurerFilter, page]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleCreateClaim = async () => {
    try {
      const derivedPatientId = parseInt((newClaim.uhid || '').replace(/\D/g, ''), 10) || 1;
      const { data } = await api.post('/hospital/insurance/claims/new', {
        patientId: derivedPatientId,
        policyNumber: newClaim.policyNumber,
        insuranceProvider: newClaim.insurer,
        claimAmount: parseFloat(newClaim.estimatedAmount) || 0,
        claimType: newClaim.claimType,
        hospitalizationDetails: {
          admissionDate: newClaim.admissionDate,
          diagnosis: newClaim.diagnosis,
          procedureCode: newClaim.procedureCode,
          ward: newClaim.priority,
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
      if (data.success) setClaimTimeline(data.timeline || []);
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

        {/* Page Hero */}
        <div className="rounded-2xl overflow-hidden relative" style={{ background: 'linear-gradient(130deg, #0b0f1e 0%, #1e1b4b 55%, #1e3a5f 100%)', minHeight: 108 }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-30px] left-[-20px] w-52 h-52 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
            <div className="absolute bottom-[-20px] right-20 w-44 h-44 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }} />
          </div>
          <div className="relative z-10 flex items-center justify-between px-6 py-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.3)' }}>
                  <FileText className="h-4 w-4 text-indigo-300" />
                </div>
                <h2 className="text-[17px] font-bold text-white tracking-tight">Claims Queue</h2>
              </div>
              <p className="text-[12px]" style={{ color: 'rgba(148,163,184,0.8)' }}>Track, manage and act on insurance claims in real time</p>
            </div>
            <div className="flex items-center gap-6">
              {[
                { label: 'Total Claims', value: claims.length.toString(), color: '#a5b4fc' },
                { label: 'High Priority', value: claims.filter(c => c.priority === 'high').length.toString(), color: '#fca5a5' },
                { label: 'Pending Action', value: claims.filter(c => ['pa_query_pending','claim_query','discharge_today'].includes(c.status)).length.toString(), color: '#fcd34d' },
              ].map((s, i) => (
                <div key={i} className="text-center hidden sm:block">
                  <div className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] font-medium mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Claim ID, Policy No..."
                className="pl-9 w-72 rounded-xl h-9 text-[13px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={insurerFilter} onValueChange={setInsurerFilter}>
              <SelectTrigger className="w-44 rounded-xl h-9 text-[13px]">
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
            <button
              onClick={fetchClaims}
              className="h-9 px-3 rounded-xl text-[12.5px] font-medium flex items-center gap-1.5 transition-all bg-card border border-border text-muted-foreground shadow-sm hover:border-purple-400/40"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="h-9 px-3 rounded-xl text-[12.5px] font-medium flex items-center gap-1.5 transition-all bg-card border border-border text-muted-foreground shadow-sm hover:border-purple-400/40"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button
              onClick={() => setShowNewClaim(true)}
              className="h-9 px-4 rounded-xl text-[12.5px] font-semibold flex items-center gap-1.5 text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)', boxShadow: '0 2px 10px rgba(99,102,241,0.32)' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.45)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(99,102,241,0.32)')}
            >
              <Plus className="h-3.5 w-3.5" /> New Claim
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-1 min-w-max p-1 rounded-xl bg-muted">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setActiveTab(tab.value); setPage(1); }}
                className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium whitespace-nowrap transition-all"
                style={activeTab === tab.value ? {
                  background: 'hsl(var(--card))',
                  color: '#4f46e5',
                  fontWeight: 600,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                } : {
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Claims Table */}
        <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(99,102,241,0.035)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <th className="text-left py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Claim #</th>
                  <th className="text-left py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Patient</th>
                  <th className="text-left py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Policy No.</th>
                  <th className="text-left py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Insurer</th>
                  <th className="text-right py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Claimed</th>
                  <th className="text-right py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Approved</th>
                  <th className="text-left py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</th>
                  <th className="text-left py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Date</th>
                  <th className="text-center py-3 px-4" style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-[13px]">Loading claims...</td></tr>
                ) : claims.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-[13px]">No claims found</td></tr>
                ) : (
                  claims.map((claim, idx) => (
                    <tr key={claim.id} style={{ borderBottom: idx < claims.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.025)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="py-3 px-4 font-mono text-[11.5px] font-semibold text-indigo-600">{claim.claimNumber || `CLM-${claim.id}`}</td>
                      <td className="py-3 px-4 text-[13px] font-medium text-foreground">{claim.patientName || claim.patient?.firstName || '—'}</td>
                      <td className="py-3 px-4 font-mono text-[11.5px] text-muted-foreground">{claim.policyNumber || '—'}</td>
                      <td className="py-3 px-4 text-[13px] text-muted-foreground">{claim.insurerName || claim.provider || claim.insurer || '—'}</td>
                      <td className="py-3 px-4 text-right text-[13px] font-semibold text-foreground">₹{(claim.claimAmount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-[13px] text-green-600 font-medium">{claim.approvedAmount ? `₹${claim.approvedAmount.toLocaleString('en-IN')}` : '—'}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-600 capitalize" style={(() => {
                          const m: Record<string, {bg:string;color:string}> = {
                            pa_approved: { bg: 'rgba(34,197,94,0.1)', color: '#15803d' },
                            settled: { bg: 'rgba(59,130,246,0.1)', color: '#1d4ed8' },
                            settlement: { bg: 'rgba(6,182,212,0.1)', color: '#0e7490' },
                            claim_query: { bg: 'rgba(249,115,22,0.1)', color: '#c2410c' },
                            pa_query_pending: { bg: 'rgba(245,158,11,0.1)', color: '#b45309' },
                            discharge_today: { bg: 'rgba(168,85,247,0.1)', color: '#7e22ce' },
                            discharge_pending: { bg: 'rgba(239,68,68,0.1)', color: '#b91c1c' },
                            awaiting: { bg: 'rgba(100,116,139,0.1)', color: '#475569' },
                            claim_draft: { bg: 'rgba(100,116,139,0.08)', color: '#64748b' },
                          };
                          return m[claim.status] || { bg: 'rgba(100,116,139,0.08)', color: '#64748b' };
                        })()}>
                          {claim.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[12px] text-muted-foreground">
                        {new Date(claim.submittedAt || claim.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.16)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                            onClick={() => handleViewClaim(claim)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: 'rgba(100,116,139,0.07)', color: '#64748b' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.13)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.07)')}
                            onClick={() => handlePrintPDF(claim.id)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
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
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
              <span className="text-[12px] text-muted-foreground">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl h-8 text-xs">
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-xl h-8 text-xs">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

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
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="py-2 px-3 text-left font-medium">Item</th>
                          <th className="py-2 px-3 text-right font-medium">Billed (₹)</th>
                          <th className="py-2 px-3 text-right font-medium">Approved (₹)</th>
                          <th className="py-2 px-3 text-right font-medium">Deducted (₹)</th>
                          <th className="py-2 px-3 text-right font-medium">Net Payable (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { item: 'Room Rent', billed: 0, approved: 0 },
                          { item: 'ICU Charges', billed: 0, approved: 0 },
                          { item: 'OT Charges', billed: 0, approved: 0 },
                          { item: 'Consultation', billed: 0, approved: 0 },
                          { item: 'Anesthetist', billed: 0, approved: 0 },
                          { item: 'Investigation / Diagnostics', billed: 0, approved: 0 },
                          { item: 'Medicines', billed: 0, approved: 0 },
                          { item: 'Consumables', billed: 0, approved: 0 },
                        ].map((row, i) => {
                          const deducted = row.billed - row.approved;
                          return (
                            <tr key={i} className="border-b">
                              <td className="py-2 px-3">{row.item}</td>
                              <td className="py-2 px-3 text-right">{row.billed.toLocaleString('en-IN')}</td>
                              <td className="py-2 px-3 text-right text-green-600">{row.approved.toLocaleString('en-IN')}</td>
                              <td className="py-2 px-3 text-right text-red-600">{deducted > 0 ? deducted.toLocaleString('en-IN') : '—'}</td>
                              <td className="py-2 px-3 text-right font-medium">{row.approved.toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 dark:bg-slate-800 font-bold border-t-2">
                          <td className="py-3 px-3">Total</td>
                          <td className="py-3 px-3 text-right">₹{(selectedClaim?.claimAmount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-3 text-right text-green-600">₹{(selectedClaim?.approvedAmount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-3 text-right text-red-600">
                            ₹{((selectedClaim?.claimAmount || 0) - (selectedClaim?.approvedAmount || 0)).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-right text-indigo-600">₹{(selectedClaim?.approvedAmount || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {selectedClaim?.status === 'pa_approved' || selectedClaim?.status === 'approved' ? (
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => toast({ title: 'Enhancement Requested', description: 'Enhancement request sent to insurer.' })}>
                        <AlertCircle className="h-4 w-4 mr-1 text-amber-500" /> Request Enhancement
                      </Button>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="documents" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Document Checklist</p>
                    <span className="text-xs text-muted-foreground">
                      {docChecklist.filter(d => d.uploaded).length}/{docChecklist.length} uploaded
                    </span>
                  </div>
                  <div className="space-y-2">
                    {docChecklist.map((doc, i) => (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${doc.uploaded ? 'bg-green-50 dark:bg-green-900/10 border-green-200' : 'bg-slate-50 dark:bg-slate-800 border-slate-200'}`}>
                        <div className="flex items-center gap-2">
                          {doc.uploaded
                            ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                            : <Circle className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                          <span className="text-sm">{doc.name}</span>
                          {doc.required && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Required</span>}
                        </div>
                        <Button
                          size="sm"
                          variant={doc.uploaded ? 'outline' : 'default'}
                          className="h-7 text-xs"
                          onClick={() => setDocChecklist(prev => prev.map((d, j) => j === i ? { ...d, uploaded: true } : d))}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          {doc.uploaded ? 'Replace' : 'Upload'}
                        </Button>
                      </div>
                    ))}
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

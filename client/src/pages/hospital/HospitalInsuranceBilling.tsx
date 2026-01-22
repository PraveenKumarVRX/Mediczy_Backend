import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import api from '@/utils/api';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { 
  Shield, Activity, Bell, Plus, Search, ArrowLeft, Edit, 
  Trash2, Eye, CheckCircle, XCircle, AlertCircle, RefreshCw,
  FileText, DollarSign, CreditCard, Clock, Download, Upload,
  Printer, Building2, User, Calendar, Receipt, AlertTriangle,
  CheckCircle2, FileCheck, FileClock, FileX, Send, Phone,
  Mail, IndianRupee, TrendingUp, TrendingDown, PieChart,
  BarChart3, Filter, MoreVertical, Copy, ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface InsuranceClaim {
  id: string;
  claimNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  insurerId: string;
  insurerName: string;
  tpaName?: string;
  policyNumber: string;
  admissionDate: string;
  dischargeDate?: string;
  claimType: 'Cashless' | 'Reimbursement' | 'Pre-Auth';
  estimatedAmount: number;
  approvedAmount?: number;
  settledAmount?: number;
  status: 'Draft' | 'Submitted' | 'Pre-Auth Pending' | 'Pre-Auth Approved' | 'Pre-Auth Rejected' | 'Under Review' | 'Query Raised' | 'Approved' | 'Partially Approved' | 'Rejected' | 'Settled' | 'Closed';
  priority: 'Normal' | 'Urgent' | 'Emergency';
  diagnosis: string;
  procedureCodes: string[];
  documents: string[];
  remarks?: string;
  queryDetails?: string;
  createdAt: string;
  updatedAt: string;
  timeline: ClaimTimeline[];
}

interface ClaimTimeline {
  date: string;
  status: string;
  remarks: string;
  updatedBy: string;
}

interface PreAuthorization {
  id: string;
  preAuthNumber: string;
  patientName: string;
  insurerName: string;
  procedureName: string;
  estimatedCost: number;
  approvedAmount?: number;
  validFrom?: string;
  validTo?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
  requestDate: string;
  responseDate?: string;
}

interface BillingCode {
  id: string;
  code: string;
  type: 'ICD-10' | 'CPT' | 'HCPCS' | 'Custom';
  description: string;
  category: string;
  baseRate: number;
  insuranceRate?: number;
  isActive: boolean;
}

interface InsuranceStats {
  totalClaims: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  totalClaimValue: number;
  totalSettled: number;
  avgProcessingDays: number;
  approvalRate: number;
}

const HospitalInsuranceBilling = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('claims');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterInsurer, setFilterInsurer] = useState('all');
  const [showNewClaimDialog, setShowNewClaimDialog] = useState(false);
  const [showPreAuthDialog, setShowPreAuthDialog] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<InsuranceClaim | null>(null);
  const [editingClaim, setEditingClaim] = useState<InsuranceClaim | null>(null);
  const [claimForm, setClaimForm] = useState<{ status: InsuranceClaim['status']; approvedAmount?: number; remarks?: string }>({
    status: 'Under Review',
    approvedAmount: undefined,
    remarks: ''
  });
  const [selectedPreAuth, setSelectedPreAuth] = useState<PreAuthorization | null>(null);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [codeForm, setCodeForm] = useState<BillingCode>({
    id: '',
    code: '',
    type: 'ICD-10',
    description: '',
    category: 'Consultation',
    baseRate: 0,
    insuranceRate: undefined,
    isActive: true,
  });
  const initialClaims: InsuranceClaim[] = [
    {
      id: 'CLM001',
      claimNumber: 'MED-2024-001234',
      patientId: 'P001',
      patientName: 'Rajesh Kumar',
      uhid: 'UHID001234',
      insurerId: 'INS001',
      insurerName: 'Star Health Insurance',
      tpaName: 'Medi Assist',
      policyNumber: 'SH-2024-567890',
      admissionDate: '2024-12-01',
      dischargeDate: '2024-12-04',
      claimType: 'Cashless',
      estimatedAmount: 185000,
      approvedAmount: 175000,
      status: 'Approved',
      priority: 'Normal',
      diagnosis: 'Acute Myocardial Infarction',
      procedureCodes: ['ICD-I21.9', 'CPT-92928'],
      documents: ['Discharge Summary', 'Bills', 'Investigation Reports'],
      createdAt: '2024-12-01',
      updatedAt: '2024-12-04',
      timeline: [
        { date: '2024-12-01', status: 'Submitted', remarks: 'Claim submitted for pre-auth', updatedBy: 'Admin' },
        { date: '2024-12-02', status: 'Pre-Auth Approved', remarks: 'Pre-authorization approved', updatedBy: 'TPA' },
        { date: '2024-12-04', status: 'Approved', remarks: 'Final claim approved', updatedBy: 'Insurer' },
      ]
    },
    {
      id: 'CLM002',
      claimNumber: 'MED-2024-001235',
      patientId: 'P002',
      patientName: 'Priya Singh',
      uhid: 'UHID001235',
      insurerId: 'INS002',
      insurerName: 'HDFC Ergo',
      policyNumber: 'HE-2024-123456',
      admissionDate: '2024-12-02',
      claimType: 'Cashless',
      estimatedAmount: 95000,
      status: 'Pre-Auth Pending',
      priority: 'Urgent',
      diagnosis: 'Cesarean Section',
      procedureCodes: ['ICD-O82.0', 'CPT-59510'],
      documents: ['Admission Form', 'Pre-Auth Request'],
      createdAt: '2024-12-02',
      updatedAt: '2024-12-03',
      timeline: [
        { date: '2024-12-02', status: 'Submitted', remarks: 'Emergency pre-auth request', updatedBy: 'Admin' },
      ]
    },
    {
      id: 'CLM003',
      claimNumber: 'MED-2024-001236',
      patientId: 'P003',
      patientName: 'Amit Verma',
      uhid: 'UHID001236',
      insurerId: 'INS003',
      insurerName: 'ICICI Lombard',
      tpaName: 'Paramount TPA',
      policyNumber: 'IL-2024-789012',
      admissionDate: '2024-11-28',
      dischargeDate: '2024-12-02',
      claimType: 'Cashless',
      estimatedAmount: 320000,
      approvedAmount: 280000,
      settledAmount: 280000,
      status: 'Settled',
      priority: 'Normal',
      diagnosis: 'Lumbar Disc Herniation',
      procedureCodes: ['ICD-M51.16', 'CPT-63030'],
      documents: ['Discharge Summary', 'Final Bill', 'Investigation Reports', 'Surgery Notes'],
      createdAt: '2024-11-28',
      updatedAt: '2024-12-04',
      timeline: [
        { date: '2024-11-28', status: 'Pre-Auth Pending', remarks: 'Submitted for pre-authorization', updatedBy: 'Admin' },
        { date: '2024-11-29', status: 'Pre-Auth Approved', remarks: 'Approved for ₹3,00,000', updatedBy: 'TPA' },
        { date: '2024-12-02', status: 'Under Review', remarks: 'Final claim under review', updatedBy: 'Admin' },
        { date: '2024-12-04', status: 'Settled', remarks: 'Payment received', updatedBy: 'Finance' },
      ]
    },
    {
      id: 'CLM004',
      claimNumber: 'MED-2024-001237',
      patientId: 'P004',
      patientName: 'Neha Gupta',
      uhid: 'UHID001237',
      insurerId: 'INS001',
      insurerName: 'Star Health Insurance',
      policyNumber: 'SH-2024-345678',
      admissionDate: '2024-12-03',
      claimType: 'Cashless',
      estimatedAmount: 45000,
      status: 'Query Raised',
      priority: 'Normal',
      diagnosis: 'Dengue Fever',
      procedureCodes: ['ICD-A90'],
      documents: ['Admission Form', 'Lab Reports'],
      queryDetails: 'Please provide dengue NS1 antigen test report and platelet count trend',
      createdAt: '2024-12-03',
      updatedAt: '2024-12-04',
      timeline: [
        { date: '2024-12-03', status: 'Submitted', remarks: 'Claim submitted', updatedBy: 'Admin' },
        { date: '2024-12-04', status: 'Query Raised', remarks: 'Additional documents required', updatedBy: 'TPA' },
      ]
    },
    {
      id: 'CLM005',
      claimNumber: 'MED-2024-001238',
      patientId: 'P005',
      patientName: 'Suresh Patel',
      uhid: 'UHID001238',
      insurerId: 'INS004',
      insurerName: 'Max Bupa',
      tpaName: 'Health India TPA',
      policyNumber: 'MB-2024-901234',
      admissionDate: '2024-11-25',
      dischargeDate: '2024-11-30',
      claimType: 'Reimbursement',
      estimatedAmount: 150000,
      status: 'Under Review',
      priority: 'Normal',
      diagnosis: 'Total Knee Replacement',
      procedureCodes: ['ICD-M17.11', 'CPT-27447'],
      documents: ['Discharge Summary', 'Bills', 'Surgery Notes', 'Implant Invoice'],
      createdAt: '2024-12-01',
      updatedAt: '2024-12-03',
      timeline: [
        { date: '2024-12-01', status: 'Submitted', remarks: 'Reimbursement claim submitted', updatedBy: 'Patient' },
        { date: '2024-12-03', status: 'Under Review', remarks: 'Documents being verified', updatedBy: 'Admin' },
      ]
    },
  ];
  const [claims, setClaims] = useState<InsuranceClaim[]>(
    () => loadHospitalStore('insurance-claims', initialClaims)
  );
  const [newClaimForm, setNewClaimForm] = useState({
    uhid: '',
    patientName: '',
    policyNumber: '',
    insurerName: '',
    claimType: 'Cashless' as InsuranceClaim['claimType'],
    priority: 'Normal' as InsuranceClaim['priority'],
    admissionDate: '',
    estimatedAmount: '',
    diagnosis: '',
    procedureCodes: '',
    remarks: ''
  });

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
    setLoading(false);
  }, [navigate]);


  const preAuthorizations: PreAuthorization[] = [
    { id: 'PA001', preAuthNumber: 'PA-2024-5001', patientName: 'Vijay Sharma', insurerName: 'Star Health', procedureName: 'Angioplasty', estimatedCost: 250000, approvedAmount: 240000, validFrom: '2024-12-05', validTo: '2024-12-15', status: 'Approved', requestDate: '2024-12-03', responseDate: '2024-12-04' },
    { id: 'PA002', preAuthNumber: 'PA-2024-5002', patientName: 'Meena Devi', insurerName: 'HDFC Ergo', procedureName: 'Hysterectomy', estimatedCost: 120000, status: 'Pending', requestDate: '2024-12-04' },
    { id: 'PA003', preAuthNumber: 'PA-2024-5003', patientName: 'Rakesh Jain', insurerName: 'ICICI Lombard', procedureName: 'Appendectomy', estimatedCost: 65000, status: 'Rejected', requestDate: '2024-12-02', responseDate: '2024-12-03' },
  ];

  const billingCodes: BillingCode[] = [
    { id: 'BC001', code: 'ICD-I21.9', type: 'ICD-10', description: 'Acute Myocardial Infarction, unspecified', category: 'Cardiology', baseRate: 50000, insuranceRate: 45000, isActive: true },
    { id: 'BC002', code: 'CPT-92928', type: 'CPT', description: 'Percutaneous Coronary Intervention', category: 'Cardiology', baseRate: 150000, insuranceRate: 135000, isActive: true },
    { id: 'BC003', code: 'ICD-O82.0', type: 'ICD-10', description: 'Cesarean Section', category: 'Obstetrics', baseRate: 60000, insuranceRate: 55000, isActive: true },
    { id: 'BC004', code: 'CPT-27447', type: 'CPT', description: 'Total Knee Replacement', category: 'Orthopedics', baseRate: 200000, insuranceRate: 180000, isActive: true },
    { id: 'BC005', code: 'ROOM-PRIV', type: 'Custom', description: 'Private Room Per Day', category: 'Room Charges', baseRate: 5000, insuranceRate: 4500, isActive: true },
  ];

  const escapeCsvCell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportClaims = () => {
    downloadCsv(
      'claims.csv',
      ['Claim #', 'Patient', 'UHID', 'Insurer', 'Type', 'Status', 'Estimated', 'Approved'],
      claims.map(c => [
        c.claimNumber,
        c.patientName,
        c.uhid,
        c.insurerName,
        c.claimType,
        c.status,
        c.estimatedAmount,
        c.approvedAmount || ''
      ])
    );
    toast({ title: 'Export started', description: 'Claims CSV downloaded.' });
  };

  const handlePrintClaim = (claim: InsuranceClaim) => {
    const win = window.open('', '_blank');
    if (!win) {
      toast({ title: 'Popup blocked', description: 'Allow popups to print claim.', variant: 'destructive' });
      return;
    }
    win.document.write(`
      <html><head><title>Claim ${claim.claimNumber}</title></head>
      <body style="font-family:Arial;padding:16px">
        <h2>Claim ${claim.claimNumber}</h2>
        <p><strong>Patient:</strong> ${claim.patientName} (${claim.uhid})</p>
        <p><strong>Insurer:</strong> ${claim.insurerName}</p>
        <p><strong>Type:</strong> ${claim.claimType}</p>
        <p><strong>Status:</strong> ${claim.status}</p>
        <p><strong>Amount:</strong> ₹${claim.estimatedAmount.toLocaleString()}</p>
        ${claim.approvedAmount ? `<p><strong>Approved:</strong> ₹${claim.approvedAmount.toLocaleString()}</p>` : ''}
      </body></html>
    `);
    win.document.close();
    win.print();
    win.close();
  };

  const handleDownloadDoc = (doc: string, claim?: InsuranceClaim) => {
    const blob = new Blob([`Document: ${doc}\nClaim: ${claim?.claimNumber || ''}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.replace(/\\s+/g, '_') || 'document'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Download started', description: `${doc} is downloading.` });
  };

  const openEditClaim = (claim: InsuranceClaim) => {
    setEditingClaim(claim);
    setClaimForm({
      status: claim.status,
      approvedAmount: claim.approvedAmount ?? claim.estimatedAmount,
      remarks: claim.remarks || '',
    });
  };

  const handleSaveClaim = async () => {
    if (!editingClaim) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const updatedClaim = {
        status: claimForm.status,
        approvedAmount: claimForm.approvedAmount,
        remarks: claimForm.remarks,
        updatedAt: today,
      };

      let updated = { ...editingClaim, ...updatedClaim } as InsuranceClaim;
      try {
        const { data } = await api.patch(
          `/hospital/insurance/claims/${editingClaim.id}`,
          updatedClaim,
          { headers: hospitalHeaders() }
        );
        updated = data?.data || updated;
      } catch {
        // Allow local persistence if API is unavailable
      }

      setClaims(prev => {
        const next = prev.map(c => c.id === editingClaim.id ? updated : c);
        saveHospitalStore('insurance-claims', next);
        return next;
      });
      toast({ title: 'Claim updated', description: `${editingClaim.claimNumber} updated with new status.` });
      setEditingClaim(null);
    } catch (error: any) {
      toast({ 
        title: 'Failed to update claim', 
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const handleSubmitClaim = async () => {
    if (!newClaimForm.uhid || !newClaimForm.patientName || !newClaimForm.insurerName || !newClaimForm.estimatedAmount) {
      toast({
        title: 'Missing fields',
        description: 'UHID, patient name, insurer, and estimated amount are required.',
        variant: 'destructive'
      });
      return;
    }

    const claimPayload = {
      patientId: newClaimForm.uhid,
      policyNumber: newClaimForm.policyNumber,
      insuranceProvider: newClaimForm.insurerName,
      claimAmount: parseFloat(newClaimForm.estimatedAmount)
    };

    try {
      try {
        await api.post(
          '/hospital/insurance/claims',
          claimPayload,
          { headers: hospitalHeaders() }
        );
      } catch {
        // Allow local persistence if API is unavailable
      }

      const today = new Date().toISOString().split('T')[0];
      const created: InsuranceClaim = {
        id: `CLM-${Date.now()}`,
        claimNumber: `MED-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
        patientId: newClaimForm.uhid,
        patientName: newClaimForm.patientName,
        uhid: newClaimForm.uhid,
        insurerId: newClaimForm.insurerName.replace(/\s+/g, '-').toUpperCase(),
        insurerName: newClaimForm.insurerName,
        policyNumber: newClaimForm.policyNumber,
        admissionDate: newClaimForm.admissionDate || today,
        claimType: newClaimForm.claimType,
        estimatedAmount: parseFloat(newClaimForm.estimatedAmount),
        status: 'Submitted',
        priority: newClaimForm.priority,
        diagnosis: newClaimForm.diagnosis || 'Pending',
        procedureCodes: newClaimForm.procedureCodes
          ? newClaimForm.procedureCodes.split(',').map(code => code.trim()).filter(Boolean)
          : [],
        documents: [],
        remarks: newClaimForm.remarks || '',
        createdAt: today,
        updatedAt: today,
        timeline: [
          {
            date: today,
            status: 'Submitted',
            remarks: newClaimForm.remarks || 'Claim submitted',
            updatedBy: 'Hospital Desk'
          }
        ]
      };

      setClaims(prev => {
        const next = [created, ...prev];
        saveHospitalStore('insurance-claims', next);
        return next;
      });

      setNewClaimForm({
        uhid: '',
        patientName: '',
        policyNumber: '',
        insurerName: '',
        claimType: 'Cashless',
        priority: 'Normal',
        admissionDate: '',
        estimatedAmount: '',
        diagnosis: '',
        procedureCodes: '',
        remarks: ''
      });
      setShowNewClaimDialog(false);

      toast({
        title: 'Claim submitted',
        description: `${created.claimNumber} has been created.`
      });
    } catch (error: any) {
      toast({
        title: 'Failed to submit claim',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const handleOpenPreAuth = (pa: PreAuthorization) => setSelectedPreAuth(pa);
  const handleFollowUp = (pa: PreAuthorization) => {
    toast({ title: 'Follow-up created', description: `Reminder set for ${pa.preAuthNumber}` });
  };

  const handleSaveCode = () => {
    if (!codeForm.code || !codeForm.description) {
      toast({ title: 'Missing fields', description: 'Code and description are required.', variant: 'destructive' });
      return;
    }
    if (editingCodeId) {
      const updated = billingCodes.map(c => c.id === editingCodeId ? { ...codeForm, id: editingCodeId } : c);
      billingCodes.splice(0, billingCodes.length, ...updated);
      toast({ title: 'Code updated', description: `${codeForm.code} saved.` });
    } else {
      const newCode: BillingCode = { ...codeForm, id: `CODE-${Date.now()}` };
      billingCodes.unshift(newCode);
      toast({ title: 'Code added', description: `${newCode.code} created.` });
    }
    setShowCodeDialog(false);
    setEditingCodeId(null);
    setCodeForm({ id: '', code: '', type: 'ICD-10', description: '', category: 'Consultation', baseRate: 0, insuranceRate: undefined, isActive: true });
  };

  const insurers = ['Star Health Insurance', 'HDFC Ergo', 'ICICI Lombard', 'Max Bupa', 'Bajaj Allianz', 'New India Assurance'];

  const stats: InsuranceStats = useMemo(() => {
    const pending = claims.filter(c => ['Submitted', 'Pre-Auth Pending', 'Under Review', 'Query Raised'].includes(c.status)).length;
    const approved = claims.filter(c => ['Approved', 'Partially Approved', 'Settled'].includes(c.status)).length;
    const rejected = claims.filter(c => ['Rejected', 'Pre-Auth Rejected'].includes(c.status)).length;
    const totalValue = claims.reduce((sum, c) => sum + c.estimatedAmount, 0);
    const totalSettled = claims.reduce((sum, c) => sum + (c.settledAmount || 0), 0);
    const approvalRate = claims.length ? Math.round((approved / claims.length) * 1000) / 10 : 0;
    return {
      totalClaims: claims.length,
      pendingClaims: pending,
      approvedClaims: approved,
      rejectedClaims: rejected,
      totalClaimValue: totalValue,
      totalSettled,
      avgProcessingDays: claims.length ? 5.2 : 0,
      approvalRate,
    };
  }, [claims]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-gray-100 text-gray-800';
      case 'Submitted': return 'bg-teal-100 text-teal-800';
      case 'Pre-Auth Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Pre-Auth Approved': return 'bg-green-100 text-green-800';
      case 'Pre-Auth Rejected': return 'bg-red-100 text-red-800';
      case 'Under Review': return 'bg-purple-100 text-purple-800';
      case 'Query Raised': return 'bg-orange-100 text-orange-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Partially Approved': return 'bg-lime-100 text-lime-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Settled': return 'bg-emerald-100 text-emerald-800';
      case 'Closed': return 'bg-gray-100 text-gray-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
      case 'Pre-Auth Approved':
      case 'Settled':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'Rejected':
      case 'Pre-Auth Rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'Query Raised':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'Under Review':
        return <FileClock className="h-4 w-4 text-purple-600" />;
      default:
        return <Clock className="h-4 w-4 text-teal-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <HospitalLayout title="Insurance & Billing" subtitle="Claims Management, Pre-Auth & Billing Codes">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white">
            <CardContent className="p-4 text-center">
              <FileText className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.totalClaims}</p>
              <p className="text-xs opacity-80">Total Claims</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingClaims}</p>
              <p className="text-xs opacity-80">Pending</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.approvedClaims}</p>
              <p className="text-xs opacity-80">Approved</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardContent className="p-4 text-center">
              <XCircle className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.rejectedClaims}</p>
              <p className="text-xs opacity-80">Rejected</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white">
            <CardContent className="p-4 text-center">
              <IndianRupee className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-xl font-bold">₹{(stats.totalClaimValue / 100000).toFixed(1)}L</p>
              <p className="text-xs opacity-80">Claim Value</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
            <CardContent className="p-4 text-center">
              <CreditCard className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-xl font-bold">₹{(stats.totalSettled / 100000).toFixed(1)}L</p>
              <p className="text-xs opacity-80">Settled</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4 text-center">
              <Calendar className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.avgProcessingDays}</p>
              <p className="text-xs opacity-80">Avg Days</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-teal-500 to-emerald-500 text-white">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.approvalRate}%</p>
              <p className="text-xs opacity-80">Approval Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList className="grid grid-cols-4 w-auto">
              <TabsTrigger value="claims" className="gap-2">
                <FileText className="h-4 w-4" /> Claims
              </TabsTrigger>
              <TabsTrigger value="preauth" className="gap-2">
                <FileCheck className="h-4 w-4" /> Pre-Auth
              </TabsTrigger>
              <TabsTrigger value="codes" className="gap-2">
                <Receipt className="h-4 w-4" /> Billing Codes
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2">
                <BarChart3 className="h-4 w-4" /> Reports
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search claims..." 
                  className="pl-9 w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="query">Query Raised</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterInsurer} onValueChange={setFilterInsurer}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Insurer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Insurers</SelectItem>
                  {insurers.map(ins => (
                    <SelectItem key={ins} value={ins}>{ins}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Claims Tab */}
          <TabsContent value="claims" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Insurance Claims</h2>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={exportClaims}>
                  <Download className="h-4 w-4" /> Export
                </Button>
                <Dialog open={showNewClaimDialog} onOpenChange={setShowNewClaimDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600">
                      <Plus className="h-4 w-4" /> New Claim
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Create New Insurance Claim</DialogTitle>
                      <DialogDescription>Submit a new insurance claim for processing</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Patient UHID</Label>
                        <Input
                          placeholder="Enter UHID"
                          value={newClaimForm.uhid}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, uhid: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Patient Name</Label>
                        <Input
                          placeholder="Patient name"
                          value={newClaimForm.patientName}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, patientName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Policy Number</Label>
                        <Input
                          placeholder="Policy number"
                          value={newClaimForm.policyNumber}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, policyNumber: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Insurance Company</Label>
                        <Select
                          value={newClaimForm.insurerName}
                          onValueChange={(value) => setNewClaimForm(prev => ({ ...prev, insurerName: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select insurer" />
                          </SelectTrigger>
                          <SelectContent>
                            {insurers.map(ins => (
                              <SelectItem key={ins} value={ins}>{ins}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Claim Type</Label>
                        <Select
                          value={newClaimForm.claimType}
                          onValueChange={(value) => setNewClaimForm(prev => ({ ...prev, claimType: value as InsuranceClaim['claimType'] }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cashless">Cashless</SelectItem>
                            <SelectItem value="Reimbursement">Reimbursement</SelectItem>
                            <SelectItem value="Pre-Auth">Pre-Authorization</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select
                          value={newClaimForm.priority}
                          onValueChange={(value) => setNewClaimForm(prev => ({ ...prev, priority: value as InsuranceClaim['priority'] }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Normal">Normal</SelectItem>
                            <SelectItem value="Urgent">Urgent</SelectItem>
                            <SelectItem value="Emergency">Emergency</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Admission Date</Label>
                        <Input
                          type="date"
                          value={newClaimForm.admissionDate}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, admissionDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Estimated Amount</Label>
                        <Input
                          type="number"
                          placeholder="Amount in ₹"
                          value={newClaimForm.estimatedAmount}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, estimatedAmount: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Diagnosis</Label>
                        <Input
                          placeholder="Primary diagnosis"
                          value={newClaimForm.diagnosis}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-3 space-y-2">
                        <Label>Procedure Codes (ICD/CPT)</Label>
                        <Input
                          placeholder="Enter codes separated by comma"
                          value={newClaimForm.procedureCodes}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, procedureCodes: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-3 space-y-2">
                        <Label>Remarks</Label>
                        <Textarea
                          placeholder="Additional notes..."
                          value={newClaimForm.remarks}
                          onChange={(e) => setNewClaimForm(prev => ({ ...prev, remarks: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-3 space-y-2">
                        <Label>Attach Documents</Label>
                        <div className="border-2 border-dashed rounded-lg p-6 text-center">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Drag & drop files or click to browse</p>
                          <p className="text-xs text-muted-foreground mt-1">Supported: PDF, JPG, PNG (Max 10MB each)</p>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewClaimDialog(false)}>Cancel</Button>
                      <Button className="bg-gradient-to-r from-green-600 to-emerald-600" onClick={handleSubmitClaim}>Submit Claim</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Insurer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map((claim) => (
                      <TableRow key={claim.id} className="cursor-pointer hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(claim.status)}
                            <span className="font-mono text-sm">{claim.claimNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{claim.patientName}</p>
                            <p className="text-sm text-muted-foreground">{claim.uhid}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{claim.insurerName}</p>
                            {claim.tpaName && <p className="text-sm text-muted-foreground">{claim.tpaName}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{claim.claimType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">₹{claim.estimatedAmount.toLocaleString()}</p>
                            {claim.approvedAmount && (
                              <p className="text-sm text-green-600">Approved: ₹{claim.approvedAmount.toLocaleString()}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(claim.status)}>{claim.status}</Badge>
                          {claim.status === 'Query Raised' && (
                            <p className="text-xs text-orange-600 mt-1">Action Required</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{claim.createdAt}</p>
                            <p className="text-muted-foreground">Updated: {claim.updatedAt}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedClaim(claim)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditClaim(claim)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handlePrintClaim(claim)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Claim Detail Dialog */}
            {selectedClaim && (
              <Dialog open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      Claim Details - {selectedClaim.claimNumber}
                      <Badge className={getStatusColor(selectedClaim.status)}>{selectedClaim.status}</Badge>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-6 py-4">
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold mb-2">Patient Information</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Name:</span> {selectedClaim.patientName}</p>
                          <p><span className="text-muted-foreground">UHID:</span> {selectedClaim.uhid}</p>
                          <p><span className="text-muted-foreground">Admission:</span> {selectedClaim.admissionDate}</p>
                          {selectedClaim.dischargeDate && (
                            <p><span className="text-muted-foreground">Discharge:</span> {selectedClaim.dischargeDate}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Insurance Details</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Insurer:</span> {selectedClaim.insurerName}</p>
                          {selectedClaim.tpaName && <p><span className="text-muted-foreground">TPA:</span> {selectedClaim.tpaName}</p>}
                          <p><span className="text-muted-foreground">Policy:</span> {selectedClaim.policyNumber}</p>
                          <p><span className="text-muted-foreground">Type:</span> {selectedClaim.claimType}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Financial Summary</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Estimated:</span> <span className="font-bold">₹{selectedClaim.estimatedAmount.toLocaleString()}</span></p>
                          {selectedClaim.approvedAmount && (
                            <p><span className="text-muted-foreground">Approved:</span> <span className="font-bold text-green-600">₹{selectedClaim.approvedAmount.toLocaleString()}</span></p>
                          )}
                          {selectedClaim.settledAmount && (
                            <p><span className="text-muted-foreground">Settled:</span> <span className="font-bold text-emerald-600">₹{selectedClaim.settledAmount.toLocaleString()}</span></p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold mb-2">Medical Information</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Diagnosis:</span> {selectedClaim.diagnosis}</p>
                          <p><span className="text-muted-foreground">Procedure Codes:</span></p>
                          <div className="flex flex-wrap gap-2">
                            {selectedClaim.procedureCodes.map(code => (
                              <Badge key={code} variant="outline">{code}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      {selectedClaim.queryDetails && (
                        <div>
                          <h3 className="font-semibold mb-2 text-orange-600">Query Details</h3>
                          <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                            <p className="text-sm">{selectedClaim.queryDetails}</p>
                          </div>
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold mb-2">Documents</h3>
                        <div className="space-y-2">
                          {selectedClaim.documents.map((doc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 border rounded">
                              <span className="text-sm">{doc}</span>
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadDoc(doc, selectedClaim)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Timeline</h3>
                        <ScrollArea className="h-40">
                          <div className="space-y-3">
                            {selectedClaim.timeline.map((item, idx) => (
                              <div key={idx} className="flex gap-3 text-sm">
                                <div className="w-20 text-muted-foreground">{item.date}</div>
                                <div className="flex-1">
                                  <Badge className={getStatusColor(item.status)} variant="outline">{item.status}</Badge>
                                  <p className="mt-1">{item.remarks}</p>
                                  <p className="text-xs text-muted-foreground">by {item.updatedBy}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedClaim(null)}>Close</Button>
                    {selectedClaim.status === 'Query Raised' && (
                      <Button className="bg-orange-600 hover:bg-orange-700">Respond to Query</Button>
                    )}
                    <Button variant="outline" className="gap-2" onClick={() => handlePrintClaim(selectedClaim)}>
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {editingClaim && (
              <Dialog open={!!editingClaim} onOpenChange={(open) => { if (!open) setEditingClaim(null); }}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Edit Claim - {editingClaim.claimNumber}</DialogTitle>
                    <DialogDescription>Update status, approved amount, or remarks.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={claimForm.status} onValueChange={(v) => setClaimForm(prev => ({ ...prev, status: v as InsuranceClaim['status'] }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Draft', 'Submitted', 'Pre-Auth Pending', 'Pre-Auth Approved', 'Pre-Auth Rejected', 'Under Review', 'Query Raised', 'Approved', 'Partially Approved', 'Rejected', 'Settled', 'Closed'].map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Approved Amount</Label>
                      <Input
                        type="number"
                        value={claimForm.approvedAmount ?? ''}
                        onChange={(e) => setClaimForm(prev => ({ ...prev, approvedAmount: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        placeholder="₹"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea
                        value={claimForm.remarks ?? ''}
                        onChange={(e) => setClaimForm(prev => ({ ...prev, remarks: e.target.value }))}
                        placeholder="Notes for insurer or internal team"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingClaim(null)}>Cancel</Button>
                    <Button onClick={handleSaveClaim}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          {/* Pre-Auth Tab */}
          <TabsContent value="preauth" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Pre-Authorization Requests</h2>
              <Dialog open={showPreAuthDialog} onOpenChange={setShowPreAuthDialog}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600">
                    <Plus className="h-4 w-4" /> New Pre-Auth
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Request Pre-Authorization</DialogTitle>
                    <DialogDescription>Submit a pre-authorization request to the insurance company</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Patient UHID</Label>
                      <Input placeholder="Enter UHID" />
                    </div>
                    <div className="space-y-2">
                      <Label>Insurance Company</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select insurer" />
                        </SelectTrigger>
                        <SelectContent>
                          {insurers.map(ins => (
                            <SelectItem key={ins} value={ins}>{ins}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Policy Number</Label>
                      <Input placeholder="Policy number" />
                    </div>
                    <div className="space-y-2">
                      <Label>Planned Procedure</Label>
                      <Input placeholder="Procedure name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Cost</Label>
                      <Input type="number" placeholder="Amount in ₹" />
                    </div>
                    <div className="space-y-2">
                      <Label>Planned Date</Label>
                      <Input type="date" />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Clinical Justification</Label>
                      <Textarea placeholder="Provide clinical justification for the procedure..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPreAuthDialog(false)}>Cancel</Button>
                    <Button className="bg-gradient-to-r from-green-600 to-emerald-600">Submit Request</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {preAuthorizations.map((pa) => (
                <Card key={pa.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="outline" className="font-mono">{pa.preAuthNumber}</Badge>
                      <Badge className={getStatusColor(pa.status)}>{pa.status}</Badge>
                    </div>
                    <h3 className="font-bold text-lg mb-1">{pa.patientName}</h3>
                    <p className="text-muted-foreground mb-3">{pa.insurerName}</p>
                    <div className="bg-gray-50 p-3 rounded-lg mb-4">
                      <p className="font-medium">{pa.procedureName}</p>
                      <p className="text-lg font-bold text-green-600">₹{pa.estimatedCost.toLocaleString()}</p>
                      {pa.approvedAmount && (
                        <p className="text-sm text-emerald-600">Approved: ₹{pa.approvedAmount.toLocaleString()}</p>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mb-4">
                      <p>Requested: {pa.requestDate}</p>
                      {pa.responseDate && <p>Response: {pa.responseDate}</p>}
                      {pa.validTo && <p className="text-green-600">Valid until: {pa.validTo}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => handleOpenPreAuth(pa)}>View</Button>
                      {pa.status === 'Pending' && (
                        <Button variant="outline" className="flex-1" onClick={() => handleFollowUp(pa)}>Follow Up</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedPreAuth && (
              <Dialog open={!!selectedPreAuth} onOpenChange={() => setSelectedPreAuth(null)}>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Pre-Auth {selectedPreAuth.preAuthNumber}</DialogTitle>
                    <DialogDescription>{selectedPreAuth.patientName} • {selectedPreAuth.insurerName}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 text-sm">
                    <p><strong>Procedure:</strong> {selectedPreAuth.procedureName}</p>
                    <p><strong>Estimate:</strong> ₹{selectedPreAuth.estimatedCost.toLocaleString()}</p>
                    {selectedPreAuth.approvedAmount && <p><strong>Approved:</strong> ₹{selectedPreAuth.approvedAmount.toLocaleString()}</p>}
                    <p><strong>Status:</strong> {selectedPreAuth.status}</p>
                    <p><strong>Request Date:</strong> {selectedPreAuth.requestDate}</p>
                    {selectedPreAuth.responseDate && <p><strong>Response:</strong> {selectedPreAuth.responseDate}</p>}
                    {selectedPreAuth.validTo && <p><strong>Valid To:</strong> {selectedPreAuth.validTo}</p>}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedPreAuth(null)}>Close</Button>
                    <Button onClick={() => { handleFollowUp(selectedPreAuth); setSelectedPreAuth(null); }}>Follow Up</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          {/* Billing Codes Tab */}
          <TabsContent value="codes" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Billing Codes (ICD-10, CPT, HCPCS)</h2>
              <Button className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600" onClick={() => { setEditingCodeId(null); setCodeForm({ id: '', code: '', type: 'ICD-10', description: '', category: 'Consultation', baseRate: 0, insuranceRate: undefined, isActive: true }); setShowCodeDialog(true); }}>
                <Plus className="h-4 w-4" /> Add Code
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Base Rate</TableHead>
                      <TableHead>Insurance Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingCodes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono font-medium">{code.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{code.type}</Badge>
                        </TableCell>
                        <TableCell>{code.description}</TableCell>
                        <TableCell>{code.category}</TableCell>
                        <TableCell>₹{code.baseRate.toLocaleString()}</TableCell>
                        <TableCell>{code.insuranceRate ? `₹${code.insuranceRate.toLocaleString()}` : '-'}</TableCell>
                        <TableCell>
                          <Badge className={code.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {code.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingCodeId(code.id); setCodeForm({ ...code }); setShowCodeDialog(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setEditingCodeId(null); setCodeForm({ ...code, id: '', code: `${code.code}-COPY` }); setShowCodeDialog(true); }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCodeId ? 'Edit Code' : 'Add Code'}</DialogTitle>
                  <DialogDescription>ICD/CPT/Custom billing codes</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-3">
                  <div className="space-y-1">
                    <Label>Code</Label>
                    <Input value={codeForm.code} onChange={(e) => setCodeForm(prev => ({ ...prev, code: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={codeForm.type} onValueChange={(v) => setCodeForm(prev => ({ ...prev, type: v as BillingCode['type'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ICD-10">ICD-10</SelectItem>
                        <SelectItem value="CPT">CPT</SelectItem>
                        <SelectItem value="HCPCS">HCPCS</SelectItem>
                        <SelectItem value="Custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>Description</Label>
                    <Input value={codeForm.description} onChange={(e) => setCodeForm(prev => ({ ...prev, description: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input value={codeForm.category} onChange={(e) => setCodeForm(prev => ({ ...prev, category: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Base Rate</Label>
                    <Input type="number" value={codeForm.baseRate} onChange={(e) => setCodeForm(prev => ({ ...prev, baseRate: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Insurance Rate</Label>
                    <Input type="number" value={codeForm.insuranceRate ?? ''} onChange={(e) => setCodeForm(prev => ({ ...prev, insuranceRate: e.target.value ? Number(e.target.value) : undefined }))} />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Checkbox checked={codeForm.isActive} onCheckedChange={(v) => setCodeForm(prev => ({ ...prev, isActive: !!v }))} />
                    <span className="text-sm">Active</span>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCodeDialog(false)}>Cancel</Button>
                  <Button onClick={handleSaveCode}>{editingCodeId ? 'Save Changes' : 'Add Code'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Insurance Reports & Analytics</h2>
              <Button variant="outline" className="gap-2" onClick={exportClaims}>
                <Download className="h-4 w-4" /> Export Report
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Claim Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Approved</span>
                      <div className="flex items-center gap-2">
                        <Progress value={60} className="w-32 h-2" />
                        <span className="text-sm font-medium">60%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pending</span>
                      <div className="flex items-center gap-2">
                        <Progress value={25} className="w-32 h-2" />
                        <span className="text-sm font-medium">25%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Rejected</span>
                      <div className="flex items-center gap-2">
                        <Progress value={10} className="w-32 h-2" />
                        <span className="text-sm font-medium">10%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Query</span>
                      <div className="flex items-center gap-2">
                        <Progress value={5} className="w-32 h-2" />
                        <span className="text-sm font-medium">5%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Insurers by Claims</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {insurers.slice(0, 5).map((insurer, idx) => (
                      <div key={insurer} className="flex items-center justify-between">
                        <span>{insurer}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">₹{((5 - idx) * 2.5).toFixed(1)}L</span>
                          <Badge variant="outline">{15 - idx * 2} claims</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Monthly Claim Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-end justify-between gap-2">
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, idx) => (
                      <div key={month} className="flex flex-col items-center flex-1">
                        <div 
                          className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t"
                          style={{ height: `${40 + idx * 15}%` }}
                        />
                        <span className="text-xs mt-2">{month}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Reports</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="h-4 w-4" /> Claims Summary Report
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <DollarSign className="h-4 w-4" /> Settlement Report
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Clock className="h-4 w-4" /> TAT Analysis Report
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <AlertTriangle className="h-4 w-4" /> Rejection Analysis
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <PieChart className="h-4 w-4" /> Insurer-wise Analysis
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </HospitalLayout>
  );
};

export default HospitalInsuranceBilling;

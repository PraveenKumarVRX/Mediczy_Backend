import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { MalwareWarningDialog, parseMalwareError } from '@/components/MalwareWarningDialog';
import {
  Receipt, Download, Upload, CreditCard, Clock,
  TrendingUp, RefreshCw, FileText, Filter, CalendarDays,
  CheckCircle2, Link2, ArrowRightLeft, AlertCircle, IndianRupee,
  BarChart2, Building2, MinusCircle, Activity, TrendingDown,
} from 'lucide-react';

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_CLAIM_SETTLEMENTS = [
  { claimNumber: 'CLM-2026-0001', patientName: 'Ramesh Kumar',    ipNo: 'IP-2026-001', insurer: 'Star Health',   tpa: 'Medi Assist',   admissionDate: '2026-03-01', dischargeDate: '2026-03-07', diagnosis: 'Laparoscopic Appendectomy',    billedAmount: 165000, approvedAmount: 142500, nme: 8500,  discount: 5000,  tds: 1425, disallowance: 3575,  settledAmount: 124000, utr: 'SBIN202604010023456',  settledDate: '2026-04-01', paymentMode: 'NEFT', status: 'settled', ageDays: 5  },
  { claimNumber: 'CLM-2026-0002', patientName: 'Sunita Sharma',   ipNo: 'IP-2026-002', insurer: 'HDFC Ergo',     tpa: 'HDFC Ergo TPA', admissionDate: '2026-03-05', dischargeDate: '2026-03-12', diagnosis: 'Coronary Angioplasty',        billedAmount: 320000, approvedAmount: 298000, nme: 15000, discount: 8000,  tds: 2980, disallowance: 12020, settledAmount: 260000, utr: 'HDFC202604020034567',  settledDate: '2026-04-02', paymentMode: 'RTGS', status: 'settled', ageDays: 4  },
  { claimNumber: 'CLM-2026-0003', patientName: 'Amit Verma',      ipNo: 'IP-2026-003', insurer: 'ICICI Lombard', tpa: 'Family Health', admissionDate: '2026-03-10', dischargeDate: '2026-03-14', diagnosis: 'Total Knee Replacement',      billedAmount: 285000, approvedAmount: 260000, nme: 18000, discount: 6000,  tds: 2600, disallowance: 9400,  settledAmount: 224000, utr: null,                   settledDate: null,         paymentMode: null,   status: 'pending', ageDays: 22 },
  { claimNumber: 'CLM-2026-0004', patientName: 'Priya Singh',     ipNo: 'IP-2026-004', insurer: 'Bajaj Allianz', tpa: 'Bajaj TPA',     admissionDate: '2026-03-08', dischargeDate: '2026-03-11', diagnosis: 'Normal Delivery',             billedAmount: 62000,  approvedAmount: 58000,  nme: 1500,  discount: 2000,  tds: 580,  disallowance: 920,   settledAmount: 53000,  utr: 'BAJAZ202604010045678', settledDate: '2026-04-01', paymentMode: 'NEFT', status: 'settled', ageDays: 5  },
  { claimNumber: 'CLM-2026-0005', patientName: 'Meera Devi',      ipNo: 'IP-2026-005', insurer: 'Care Health',   tpa: 'Vidal Health',  admissionDate: '2026-03-15', dischargeDate: '2026-03-20', diagnosis: 'Hysterectomy',                billedAmount: 145000, approvedAmount: 130000, nme: 7200,  discount: 4000,  tds: 1300, disallowance: 5500,  settledAmount: 112000, utr: null,                   settledDate: null,         paymentMode: null,   status: 'query',   ageDays: 17 },
  { claimNumber: 'CLM-2026-0006', patientName: 'Suresh Patel',    ipNo: 'IP-2026-006', insurer: 'Niva Bupa',     tpa: 'Niva Bupa TPA', admissionDate: '2026-03-18', dischargeDate: '2026-03-24', diagnosis: 'CABG (Bypass Surgery)',       billedAmount: 480000, approvedAmount: 445000, nme: 22000, discount: 12000, tds: 4450, disallowance: 16550, settledAmount: 390000, utr: 'NIVA202604030056789',  settledDate: '2026-04-03', paymentMode: 'RTGS', status: 'settled', ageDays: 11 },
  { claimNumber: 'CLM-2026-0007', patientName: 'Geeta Nair',      ipNo: 'IP-2026-007', insurer: 'SBI General',   tpa: 'SBI TPA',       admissionDate: '2026-03-20', dischargeDate: '2026-03-26', diagnosis: 'Spinal Fusion Surgery',       billedAmount: 210000, approvedAmount: 190000, nme: 12000, discount: 5000,  tds: 1900, disallowance: 8100,  settledAmount: 163000, utr: null,                   settledDate: null,         paymentMode: null,   status: 'pending', ageDays: 10 },
  { claimNumber: 'CLM-2026-0008', patientName: 'Rohit Joshi',     ipNo: 'IP-2026-008', insurer: 'Star Health',   tpa: 'Medi Assist',   admissionDate: '2026-03-22', dischargeDate: '2026-03-28', diagnosis: 'Cataract Surgery (Both Eyes)',billedAmount: 55000,  approvedAmount: 50000,  nme: 2500,  discount: 1500,  tds: 500,  disallowance: 1500,  settledAmount: 44000,  utr: 'SBIN202604040067890',  settledDate: '2026-04-04', paymentMode: 'NEFT', status: 'settled', ageDays: 7  },
  { claimNumber: 'CLM-2026-0009', patientName: 'Anjali Mehta',    ipNo: 'IP-2026-009', insurer: 'Tata AIG',      tpa: 'Tata AIG TPA',  admissionDate: '2026-03-25', dischargeDate: '2026-03-30', diagnosis: 'Gallbladder Removal (Lap)',   billedAmount: 95000,  approvedAmount: 88000,  nme: 4500,  discount: 2500,  tds: 880,  disallowance: 3120,  settledAmount: 77000,  utr: null,                   settledDate: null,         paymentMode: null,   status: 'partial', ageDays: 6  },
  { claimNumber: 'CLM-2026-0010', patientName: 'Vijay Rao',       ipNo: 'IP-2026-010', insurer: 'HDFC Ergo',     tpa: 'HDFC Ergo TPA', admissionDate: '2026-03-27', dischargeDate: '2026-04-01', diagnosis: 'Aortic Valve Replacement',    billedAmount: 620000, approvedAmount: 580000, nme: 28000, discount: 15000, tds: 5800, disallowance: 21200, settledAmount: 510000, utr: null,                   settledDate: null,         paymentMode: null,   status: 'pending', ageDays: 4  },
  { claimNumber: 'CLM-2026-0011', patientName: 'Anita Gupta',     ipNo: 'IP-2026-011', insurer: 'New India',     tpa: 'New India TPA', admissionDate: '2026-03-02', dischargeDate: '2026-03-09', diagnosis: 'Hip Replacement',             billedAmount: 195000, approvedAmount: 175000, nme: 10000, discount: 5000,  tds: 1750, disallowance: 6250,  settledAmount: 152000, utr: 'NIAG202604020078901',  settledDate: '2026-04-02', paymentMode: 'NEFT', status: 'settled', ageDays: 24 },
  { claimNumber: 'CLM-2026-0012', patientName: 'Kavita Shah',     ipNo: 'IP-2026-012', insurer: 'ICICI Lombard', tpa: 'Family Health', admissionDate: '2026-03-12', dischargeDate: '2026-03-16', diagnosis: 'Appendectomy (Open)',         billedAmount: 78000,  approvedAmount: 72000,  nme: 3800,  discount: 2000,  tds: 720,  disallowance: 2480,  settledAmount: 63000,  utr: 'ICIC202604040089012',  settledDate: '2026-04-04', paymentMode: 'NEFT', status: 'settled', ageDays: 19 },
  { claimNumber: 'CLM-2026-0013', patientName: 'Deepak Malhotra', ipNo: 'IP-2026-013', insurer: 'Care Health',   tpa: 'Vidal Health',  admissionDate: '2026-03-28', dischargeDate: '2026-04-02', diagnosis: 'Hernia Repair (Lap)',         billedAmount: 68000,  approvedAmount: 62000,  nme: 3200,  discount: 1800,  tds: 620,  disallowance: 2380,  settledAmount: 54000,  utr: null,                   settledDate: null,         paymentMode: null,   status: 'pending', ageDays: 3  },
  { claimNumber: 'CLM-2026-0014', patientName: 'Rekha Iyer',      ipNo: 'IP-2026-014', insurer: 'Bajaj Allianz', tpa: 'Bajaj TPA',     admissionDate: '2026-03-30', dischargeDate: '2026-04-03', diagnosis: 'Diabetic Foot Debridement',   billedAmount: 42000,  approvedAmount: 38000,  nme: 1800,  discount: 1000,  tds: 380,  disallowance: 1420,  settledAmount: 33400,  utr: null,                   settledDate: null,         paymentMode: null,   status: 'hold',    ageDays: 2  },
  { claimNumber: 'CLM-2026-0015', patientName: 'Mohan Das',       ipNo: 'IP-2026-015', insurer: 'Star Health',   tpa: 'Medi Assist',   admissionDate: '2026-03-14', dischargeDate: '2026-03-21', diagnosis: 'Liver Resection',             billedAmount: 395000, approvedAmount: 368000, nme: 19500, discount: 10000, tds: 3680, disallowance: 14820, settledAmount: 320000, utr: 'SBIN202604050091234',  settledDate: '2026-04-05', paymentMode: 'RTGS', status: 'settled', ageDays: 15 },
];

const DEMO_RECON_SUMMARY = [
  { insurer: 'Star Health',   claims: 3, billed: 615000,  approved: 560500, nme: 30500, discount: 16500, tds: 5605,  disallowance: 19895, settled: 488000, outstanding:  72500, settledClaims: 3, pendingClaims: 0 },
  { insurer: 'HDFC Ergo',     claims: 2, billed: 940000,  approved: 878000, nme: 43000, discount: 23000, tds: 8780,  disallowance: 33220, settled: 260000, outstanding: 618000, settledClaims: 1, pendingClaims: 1 },
  { insurer: 'ICICI Lombard', claims: 2, billed: 363000,  approved: 332000, nme: 21800, discount:  8000, tds: 3320,  disallowance: 11880, settled: 287000, outstanding:  45000, settledClaims: 1, pendingClaims: 1 },
  { insurer: 'Bajaj Allianz', claims: 2, billed: 104000,  approved:  96000, nme:  3300, discount:  3000, tds:  960,  disallowance:  2340, settled:  86400, outstanding:   9600, settledClaims: 1, pendingClaims: 1 },
  { insurer: 'Care Health',   claims: 2, billed: 213000,  approved: 192000, nme: 10400, discount:  5800, tds: 1920,  disallowance:  7880, settled: 166000, outstanding:  26000, settledClaims: 1, pendingClaims: 1 },
  { insurer: 'Niva Bupa',     claims: 1, billed: 480000,  approved: 445000, nme: 22000, discount: 12000, tds: 4450,  disallowance: 16550, settled: 390000, outstanding:  55000, settledClaims: 1, pendingClaims: 0 },
  { insurer: 'SBI General',   claims: 1, billed: 210000,  approved: 190000, nme: 12000, discount:  5000, tds: 1900,  disallowance:  8100, settled:       0, outstanding: 190000, settledClaims: 0, pendingClaims: 1 },
  { insurer: 'Tata AIG',      claims: 1, billed:  95000,  approved:  88000, nme:  4500, discount:  2500, tds:  880,  disallowance:  3120, settled:  77000, outstanding:  11000, settledClaims: 0, pendingClaims: 1 },
  { insurer: 'New India',     claims: 1, billed: 195000,  approved: 175000, nme: 10000, discount:  5000, tds: 1750,  disallowance:  6250, settled: 152000, outstanding:  23000, settledClaims: 1, pendingClaims: 0 },
];

const DEMO_TAT_DATA = [
  { payer: 'Star Health',   preAuthTat: '3.5 hrs', claimTat: '10 days', responseTime: '5.1 hrs',  totalClaims: 3, remarks: 'On track'   },
  { payer: 'HDFC Ergo',     preAuthTat: '5.0 hrs', claimTat: '14 days', responseTime: '7.8 hrs',  totalClaims: 2, remarks: 'Minor delay' },
  { payer: 'ICICI Lombard', preAuthTat: '4.2 hrs', claimTat: '11 days', responseTime: '6.0 hrs',  totalClaims: 2, remarks: 'On track'   },
  { payer: 'Bajaj Allianz', preAuthTat: '6.8 hrs', claimTat: '16 days', responseTime: '9.2 hrs',  totalClaims: 2, remarks: 'SLA breach' },
  { payer: 'Care Health',   preAuthTat: '4.8 hrs', claimTat: '12 days', responseTime: '6.5 hrs',  totalClaims: 2, remarks: 'On track'   },
  { payer: 'Niva Bupa',     preAuthTat: '3.2 hrs', claimTat: '8 days',  responseTime: '4.5 hrs',  totalClaims: 1, remarks: 'Excellent'  },
  { payer: 'SBI General',   preAuthTat: '7.5 hrs', claimTat: '18 days', responseTime: '11.0 hrs', totalClaims: 1, remarks: 'SLA breach' },
  { payer: 'Tata AIG',      preAuthTat: '5.5 hrs', claimTat: '13 days', responseTime: '7.0 hrs',  totalClaims: 1, remarks: 'On track'   },
  { payer: 'New India',     preAuthTat: '8.0 hrs', claimTat: '20 days', responseTime: '12.5 hrs', totalClaims: 1, remarks: 'SLA breach' },
];

const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;

const normalizeSettlementRows = (rows: any[] = []) => rows.map((row) => ({
  claimNumber: row.claimNumber,
  patientName: row.patientName || '—',
  insurer: row.insurer || row.insuranceProvider || 'Unknown',
  diagnosis: row.diagnosis || '—',
  billedAmount: Number(row.billedAmount || row.claimAmount || row.approvedAmount || 0),
  approvedAmount: Number(row.approvedAmount || 0),
  settledAmount: Number(row.settledAmount || 0),
  nme: Number(row.nme || 0),
  discount: Number(row.discount || 0),
  tds: Number(row.tds || 0),
  disallowance: Number(row.disallowance || Math.max(0, Number(row.billedAmount || row.claimAmount || 0) - Number(row.approvedAmount || 0))),
  utr: row.utr || null,
  settledDate: row.settledDate || row.settlementDate || null,
  status: row.status || row.settlementStatus || 'pending',
  ageDays: Number(row.ageDays || 0),
}));

const normalizeTatRows = (payload: any) => {
  if (Array.isArray(payload?.report) && payload.report.length > 0) {
    return payload.report.map((row: any) => ({
      payer: row.insurer,
      preAuthTat: '—',
      claimTat: `${row.avgHrs} hrs`,
      responseTime: `${row.avgHrs} hrs`,
      totalClaims: row.totalClaims || 0,
      remarks: row.avgHrs > 24 ? 'SLA breach' : row.avgHrs > 12 ? 'Minor delay' : 'On track',
    }));
  }

  if (Array.isArray(payload?.tatReport?.details) && payload.tatReport.details.length > 0) {
    return payload.tatReport.details.map((row: any) => ({
      payer: row.insurer || 'Unknown',
      preAuthTat: '—',
      claimTat: `${row.tatDays} days`,
      responseTime: `${row.tatDays} days`,
      totalClaims: 1,
      remarks: row.tatDays > 10 ? 'SLA breach' : row.tatDays > 5 ? 'Minor delay' : 'On track',
    }));
  }

  return [];
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    settled: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    query:   'bg-blue-100 text-blue-700',
    partial: 'bg-purple-100 text-purple-700',
    hold:    'bg-red-100 text-red-700',
  };
  return <Badge className={`${map[status] || 'bg-slate-100 text-slate-700'} text-xs capitalize`}>{status}</Badge>;
};

const InsuranceReconciliationPage = () => {
  const { toast } = useToast();
  const [malwareWarning, setMalwareWarning] = useState<{ open: boolean; threat?: string; fileName?: string }>({ open: false });
  const [activeTab, setActiveTab] = useState('reconciliation');
  const [loading, setLoading] = useState(false);
  const [claimRows, setClaimRows]   = useState(DEMO_CLAIM_SETTLEMENTS);
  const [reconRows, setReconRows]   = useState(DEMO_RECON_SUMMARY);
  const [tatData,   setTatData]     = useState(DEMO_TAT_DATA);
  const [filterInsurer, setFilterInsurer] = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [filters, setFilters] = useState({
    payor: 'all', center: 'all', dodFrom: '', dodTo: '',
    settledFrom: '', settledTo: '', createdFrom: '', createdTo: '',
  });

  const [paymentAdvices, setPaymentAdvices] = useState<any[]>([
    { id: 1, insurer: 'Star Health',   chequeNo: 'NEFT/UTR', utr: 'SBIN202604010023456',  amount: 488000, date: '2026-04-01', status: 'matched',   claimNo: 'CLM-2026-0001, CLM-2026-0008, CLM-2026-0015' },
    { id: 2, insurer: 'HDFC Ergo',     chequeNo: 'RTGS',     utr: 'HDFC202604020034567',  amount: 260000, date: '2026-04-02', status: 'matched',   claimNo: 'CLM-2026-0002' },
    { id: 3, insurer: 'Bajaj Allianz', chequeNo: 'NEFT',     utr: 'BAJAZ202604010045678', amount: 53000,  date: '2026-04-01', status: 'matched',   claimNo: 'CLM-2026-0004' },
    { id: 4, insurer: 'Niva Bupa',     chequeNo: 'RTGS',     utr: 'NIVA202604030056789',  amount: 390000, date: '2026-04-03', status: 'matched',   claimNo: 'CLM-2026-0006' },
    { id: 5, insurer: 'ICICI Lombard', chequeNo: 'RTGS',     utr: 'ICIC202604040089012',  amount: 185000, date: '2026-03-31', status: 'unmatched', claimNo: '' },
    { id: 6, insurer: 'Care Health',   chequeNo: 'NEFT',     utr: 'CARE202603280089012',  amount: 250000, date: '2026-03-28', status: 'pending',   claimNo: '' },
  ]);
  const [utrInput, setUtrInput] = useState('');
  const [matchingUtr, setMatchingUtr] = useState<string | null>(null);

  const handlePaymentAdviceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast({ title: 'Payment Advice Imported', description: `${file.name} parsed. ${Math.floor(Math.random() * 5) + 1} UTR entries added.` });
  };

  const matchUTR = (utr: string) => {
    setMatchingUtr(utr);
    setPaymentAdvices(prev => prev.map(p =>
      p.utr === utr ? { ...p, status: 'matched', claimNo: 'CLM-2026-' + String(Math.floor(Math.random() * 14) + 1).padStart(4, '0') } : p
    ));
    toast({ title: 'UTR Matched', description: `UTR ${utr} linked to claim successfully.` });
    setTimeout(() => setMatchingUtr(null), 1500);
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'reconciliation') {
        const [{ data: receivablesData }, { data: settlementsData }] = await Promise.all([
          api.get('/hospital/insurance/revenue/receivables'),
          api.get('/hospital/insurance/revenue/settlement-status')
        ]);

        if (receivablesData.success && Array.isArray(receivablesData.summaryByInsurer) && receivablesData.summaryByInsurer.length > 0) {
          setReconRows(receivablesData.summaryByInsurer);
          setClaimRows(normalizeSettlementRows(receivablesData.claims || settlementsData.settlements || []));
        } else {
          setReconRows(DEMO_RECON_SUMMARY);
          setClaimRows(DEMO_CLAIM_SETTLEMENTS);
        }
      } else if (activeTab === 'tat') {
        const { data } = await api.get('/hospital/insurance/reports/tat');
        const rows = normalizeTatRows(data);
        if (data.success && rows.length > 0) setTatData(rows);
        else setTatData(DEMO_TAT_DATA);
      } else {
        const { data } = await api.get('/hospital/insurance/revenue/settlement-status');
        if (data.success && Array.isArray(data.settlements) && data.settlements.length > 0) setClaimRows(normalizeSettlementRows(data.settlements));
        else setClaimRows(DEMO_CLAIM_SETTLEMENTS);
      }
    } catch {
      setReconRows(DEMO_RECON_SUMMARY);
      setClaimRows(DEMO_CLAIM_SETTLEMENTS);
      setTatData(DEMO_TAT_DATA);
    } finally {
      setLoading(false);
    }
  };

  // Derived totals
  const filteredClaims = claimRows.filter(c => {
    if (filterInsurer !== 'all' && c.insurer !== filterInsurer) return false;
    if (filterStatus  !== 'all' && c.status  !== filterStatus)  return false;
    return true;
  });
  const settledClaims   = filteredClaims.filter(c => c.status === 'settled');
  const pendingClaims   = filteredClaims.filter(c => c.status !== 'settled');
  const sumBilled       = filteredClaims.reduce((s, c) => s + c.billedAmount, 0);
  const sumApproved     = filteredClaims.reduce((s, c) => s + c.approvedAmount, 0);
  const sumNME          = filteredClaims.reduce((s, c) => s + c.nme, 0);
  const sumDiscount     = filteredClaims.reduce((s, c) => s + c.discount, 0);
  const sumTDS          = filteredClaims.reduce((s, c) => s + c.tds, 0);
  const sumDisallowance = filteredClaims.reduce((s, c) => s + c.disallowance, 0);
  const sumDeductions   = sumNME + sumDiscount + sumTDS + sumDisallowance;
  const sumSettled      = settledClaims.reduce((s, c) => s + c.settledAmount, 0);
  const sumOutstanding  = pendingClaims.reduce((s, c) => s + c.approvedAmount, 0);
  const collectionRate  = sumApproved > 0 ? ((sumSettled / sumApproved) * 100).toFixed(1) : '0.0';
  const aging = {
    '0-30':  pendingClaims.filter(c => c.ageDays <= 30).reduce((s, c) => s + c.approvedAmount, 0),
    '31-60': pendingClaims.filter(c => c.ageDays > 30 && c.ageDays <= 60).reduce((s, c) => s + c.approvedAmount, 0),
    '61-90': pendingClaims.filter(c => c.ageDays > 60 && c.ageDays <= 90).reduce((s, c) => s + c.approvedAmount, 0),
    '90+':   pendingClaims.filter(c => c.ageDays > 90).reduce((s, c) => s + c.approvedAmount, 0),
  };
  const uniqueInsurers = Array.from(new Set(DEMO_CLAIM_SETTLEMENTS.map(c => c.insurer)));

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    api.post('/hospital/insurance/reconciliation/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(({ data }) => {
      if (data.success) toast({ title: 'Upload Success', description: 'Reconciliation file uploaded.' });
    }).catch((err: any) => {
      const malware = parseMalwareError(err);
      if (malware.isMalware) {
        setMalwareWarning({ open: true, threat: malware.threat, fileName: file?.name });
      } else {
        toast({ title: 'Upload Failed', description: 'Failed to upload file', variant: 'destructive' });
      }
    });
  };

  const handleCSVDownload = () => {
    const headers = ['Claim #','Patient','Insurer','Diagnosis','Billed','Approved','NME','Discount','TDS','Disallowance','Settled','UTR','Settlement Date','Status'];
    const rows = filteredClaims.map(c => [
      c.claimNumber, c.patientName, c.insurer, c.diagnosis,
      c.billedAmount, c.approvedAmount, c.nme, c.discount, c.tds, c.disallowance,
      c.settledAmount || '', c.utr || '', c.settledDate || '', c.status
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `settlement-detail-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <InsurancePortalLayout title="Reconciliation & Revenue Cycle" subtitle="Claim-wise settlement breakup · NME · Discount · TDS · Disallowances · Revenue cycle management">
      <div className="space-y-4">

        {/* Global filters + action bar */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-center">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterInsurer} onValueChange={setFilterInsurer}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Insurers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Insurers</SelectItem>
                  {uniqueInsurers.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="query">Query</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={fetchData}><RefreshCw className="h-3 w-3 mr-1" /> Refresh</Button>
              <Button size="sm" variant="outline" onClick={handleCSVDownload}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
              <div>
                <input type="file" accept=".csv,.xlsx" id="recon-upload" className="hidden" onChange={handleCSVUpload} />
                <Button variant="outline" size="sm" onClick={() => document.getElementById('recon-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Upload CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Billed',     value: inr(sumBilled),      color: 'text-slate-700',  icon: Receipt     },
            { label: 'Total Approved',   value: inr(sumApproved),    color: 'text-blue-700',   icon: TrendingUp  },
            { label: 'Total Deductions', value: inr(sumDeductions),  color: 'text-red-600',    icon: MinusCircle },
            { label: 'Total Settled',    value: inr(sumSettled),     color: 'text-green-700',  icon: CheckCircle2 },
            { label: 'Outstanding',      value: inr(sumOutstanding), color: 'text-amber-600',  icon: AlertCircle },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">{item.label}</p></div>
                  <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full">
            <TabsTrigger value="reconciliation" className="flex-1"><Receipt className="h-4 w-4 mr-1" /> Reconciliation</TabsTrigger>
            <TabsTrigger value="settlement"     className="flex-1"><CreditCard className="h-4 w-4 mr-1" /> Settlement Breakup</TabsTrigger>
            <TabsTrigger value="revenue_cycle"  className="flex-1"><BarChart2 className="h-4 w-4 mr-1" /> Revenue Cycle</TabsTrigger>
            <TabsTrigger value="tat"            className="flex-1"><Clock className="h-4 w-4 mr-1" /> TAT Reports</TabsTrigger>
            <TabsTrigger value="payment_advice" className="flex-1"><IndianRupee className="h-4 w-4 mr-1" /> Payment Advice</TabsTrigger>
          </TabsList>

          {/* ── Reconciliation Tab ─────────────────────────────────────── */}
          <TabsContent value="reconciliation" className="space-y-4">
            {/* Insurer-wise summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Insurer-wise Reconciliation Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium">Insurer</th>
                        <th className="py-3 px-4 text-right font-medium">Claims</th>
                        <th className="py-3 px-4 text-right font-medium">Billed (₹)</th>
                        <th className="py-3 px-4 text-right font-medium">Approved (₹)</th>
                        <th className="py-3 px-4 text-right font-medium text-red-600">NME (₹)</th>
                        <th className="py-3 px-4 text-right font-medium text-orange-600">Discount (₹)</th>
                        <th className="py-3 px-4 text-right font-medium text-purple-600">TDS (₹)</th>
                        <th className="py-3 px-4 text-right font-medium text-rose-600">Disallowance (₹)</th>
                        <th className="py-3 px-4 text-right font-medium text-green-600">Settled (₹)</th>
                        <th className="py-3 px-4 text-right font-medium text-amber-600">Outstanding (₹)</th>
                        <th className="py-3 px-4 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconRows.map((row: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-4 font-medium">{row.insurer}</td>
                          <td className="py-2 px-4 text-right">{row.claims}</td>
                          <td className="py-2 px-4 text-right">{inr(row.billed)}</td>
                          <td className="py-2 px-4 text-right">{inr(row.approved)}</td>
                          <td className="py-2 px-4 text-right text-red-600">{inr(row.nme)}</td>
                          <td className="py-2 px-4 text-right text-orange-600">{inr(row.discount)}</td>
                          <td className="py-2 px-4 text-right text-purple-600">{inr(row.tds)}</td>
                          <td className="py-2 px-4 text-right text-rose-600">{inr(row.disallowance)}</td>
                          <td className="py-2 px-4 text-right text-green-600 font-semibold">{inr(row.settled)}</td>
                          <td className="py-2 px-4 text-right text-amber-600">{inr(row.outstanding)}</td>
                          <td className="py-2 px-4">
                            {row.pendingClaims > 0
                              ? <Badge className="bg-amber-100 text-amber-700 text-xs">{row.pendingClaims} pending</Badge>
                              : <Badge className="bg-green-100 text-green-700 text-xs">All settled</Badge>}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-sm">
                        <td className="py-2 px-4">TOTAL</td>
                        <td className="py-2 px-4 text-right">{filteredClaims.length}</td>
                        <td className="py-2 px-4 text-right">{inr(sumBilled)}</td>
                        <td className="py-2 px-4 text-right">{inr(sumApproved)}</td>
                        <td className="py-2 px-4 text-right text-red-600">{inr(sumNME)}</td>
                        <td className="py-2 px-4 text-right text-orange-600">{inr(sumDiscount)}</td>
                        <td className="py-2 px-4 text-right text-purple-600">{inr(sumTDS)}</td>
                        <td className="py-2 px-4 text-right text-rose-600">{inr(sumDisallowance)}</td>
                        <td className="py-2 px-4 text-right text-green-600">{inr(sumSettled)}</td>
                        <td className="py-2 px-4 text-right text-amber-600">{inr(sumOutstanding)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Claim-wise detail */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Claim-wise Reconciliation Detail</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium">Claim #</th>
                        <th className="py-3 px-4 text-left font-medium">Patient</th>
                        <th className="py-3 px-4 text-left font-medium">Insurer</th>
                        <th className="py-3 px-4 text-left font-medium">Diagnosis</th>
                        <th className="py-3 px-4 text-right font-medium">Billed</th>
                        <th className="py-3 px-4 text-right font-medium">Approved</th>
                        <th className="py-3 px-4 text-right font-medium text-green-600">Settled</th>
                        <th className="py-3 px-4 text-right font-medium text-red-600">Difference</th>
                        <th className="py-3 px-4 text-left font-medium">DoD</th>
                        <th className="py-3 px-4 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClaims.map((c, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-4 font-mono text-xs">{c.claimNumber}</td>
                          <td className="py-2 px-4"><div>{c.patientName}</div><div className="text-xs text-muted-foreground">{c.ipNo}</div></td>
                          <td className="py-2 px-4">{c.insurer}</td>
                          <td className="py-2 px-4 text-xs max-w-[140px] truncate" title={c.diagnosis}>{c.diagnosis}</td>
                          <td className="py-2 px-4 text-right">{inr(c.billedAmount)}</td>
                          <td className="py-2 px-4 text-right">{inr(c.approvedAmount)}</td>
                          <td className="py-2 px-4 text-right text-green-600 font-medium">{c.settledAmount ? inr(c.settledAmount) : '—'}</td>
                          <td className="py-2 px-4 text-right text-red-600">{inr(c.billedAmount - (c.settledAmount || 0))}</td>
                          <td className="py-2 px-4 text-xs">{c.dischargeDate}</td>
                          <td className="py-2 px-4">{statusBadge(c.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          {/* ── Settlement Breakup Tab ─────────────────────────────────── */}
          <TabsContent value="settlement" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CardContent className="p-4">
                  <p className="text-xs text-green-700 dark:text-green-300 mb-1">Total Settled ({settledClaims.length} claims)</p>
                  <p className="text-2xl font-bold text-green-700">{inr(sumSettled)}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
                <CardContent className="p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">Pending Settlement ({pendingClaims.length} claims)</p>
                  <p className="text-2xl font-bold text-amber-700">{inr(sumOutstanding)}</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-4">
                  <p className="text-xs text-red-700 dark:text-red-300 mb-1">Total Deductions</p>
                  <p className="text-2xl font-bold text-red-700">{inr(sumDeductions)}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                <CardContent className="p-4">
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">Collection Rate</p>
                  <p className="text-2xl font-bold text-blue-700">{collectionRate}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Deduction category cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'NME — Non-Medical Expenses',   value: inr(sumNME),          desc: 'Consumables, toiletries, attendant charges',   bg: 'bg-red-50 dark:bg-red-900/10 border-red-200',       text: 'text-red-700'    },
                { label: 'Discount',                     value: inr(sumDiscount),     desc: 'Hospital package / tariff discount applied',   bg: 'bg-orange-50 dark:bg-orange-900/10 border-orange-200', text: 'text-orange-700' },
                { label: 'TDS @ 1% of Approved',        value: inr(sumTDS),           desc: 'Tax deducted at source by insurer',            bg: 'bg-purple-50 dark:bg-purple-900/10 border-purple-200', text: 'text-purple-700' },
                { label: 'Disallowance',                 value: inr(sumDisallowance), desc: 'Insurer non-payable / query deductions',       bg: 'bg-rose-50 dark:bg-rose-900/10 border-rose-200',    text: 'text-rose-700'   },
              ].map(item => (
                <Card key={item.label} className={item.bg}>
                  <CardContent className="p-4">
                    <p className={`text-xs font-medium mb-1 ${item.text}`}>{item.label}</p>
                    <p className={`text-xl font-bold ${item.text}`}>{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Full claim-wise settlement table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Claim-wise Settlement Breakup — NME · Discount · TDS · Disallowance</CardTitle>
                  <span className="text-xs text-muted-foreground">{filteredClaims.length} claims</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="py-3 px-3 text-left font-medium">Claim #</th>
                        <th className="py-3 px-3 text-left font-medium">Patient / IP No.</th>
                        <th className="py-3 px-3 text-left font-medium">Insurer / TPA</th>
                        <th className="py-3 px-3 text-left font-medium">Procedure</th>
                        <th className="py-3 px-3 text-right font-medium">Billed</th>
                        <th className="py-3 px-3 text-right font-medium">Approved</th>
                        <th className="py-3 px-3 text-right font-medium text-red-600">NME</th>
                        <th className="py-3 px-3 text-right font-medium text-orange-600">Discount</th>
                        <th className="py-3 px-3 text-right font-medium text-purple-600">TDS</th>
                        <th className="py-3 px-3 text-right font-medium text-rose-600">Disallowance</th>
                        <th className="py-3 px-3 text-right font-medium text-green-600">Net Settled</th>
                        <th className="py-3 px-3 text-left font-medium">UTR</th>
                        <th className="py-3 px-3 text-left font-medium">Settled On</th>
                        <th className="py-3 px-3 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClaims.map((c, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">{c.claimNumber}</td>
                          <td className="py-2 px-3"><div className="font-medium text-xs">{c.patientName}</div><div className="text-xs text-muted-foreground">{c.ipNo}</div></td>
                          <td className="py-2 px-3"><div className="text-xs">{c.insurer}</div><div className="text-xs text-muted-foreground">{c.tpa}</div></td>
                          <td className="py-2 px-3 text-xs max-w-[130px] truncate" title={c.diagnosis}>{c.diagnosis}</td>
                          <td className="py-2 px-3 text-right text-xs">{inr(c.billedAmount)}</td>
                          <td className="py-2 px-3 text-right text-xs">{inr(c.approvedAmount)}</td>
                          <td className="py-2 px-3 text-right text-xs text-red-600">{inr(c.nme)}</td>
                          <td className="py-2 px-3 text-right text-xs text-orange-600">{inr(c.discount)}</td>
                          <td className="py-2 px-3 text-right text-xs text-purple-600">{inr(c.tds)}</td>
                          <td className="py-2 px-3 text-right text-xs text-rose-600">{inr(c.disallowance)}</td>
                          <td className="py-2 px-3 text-right text-xs text-green-600 font-semibold">{c.settledAmount ? inr(c.settledAmount) : '—'}</td>
                          <td className="py-2 px-3 font-mono text-xs">{c.utr ? <span title={c.utr}>{c.utr.slice(0, 12)}…</span> : <span className="text-muted-foreground">Awaited</span>}</td>
                          <td className="py-2 px-3 text-xs whitespace-nowrap">{c.settledDate || '—'}</td>
                          <td className="py-2 px-3">{statusBadge(c.status)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-xs border-t-2">
                        <td className="py-2 px-3" colSpan={4}>TOTAL ({filteredClaims.length} claims)</td>
                        <td className="py-2 px-3 text-right">{inr(sumBilled)}</td>
                        <td className="py-2 px-3 text-right">{inr(sumApproved)}</td>
                        <td className="py-2 px-3 text-right text-red-600">{inr(sumNME)}</td>
                        <td className="py-2 px-3 text-right text-orange-600">{inr(sumDiscount)}</td>
                        <td className="py-2 px-3 text-right text-purple-600">{inr(sumTDS)}</td>
                        <td className="py-2 px-3 text-right text-rose-600">{inr(sumDisallowance)}</td>
                        <td className="py-2 px-3 text-right text-green-600">{inr(sumSettled)}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Revenue Cycle Tab ──────────────────────────────────────── */}
          <TabsContent value="revenue_cycle" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Gross Billing (MTD)',    value: inr(sumBilled),     sub: `${filteredClaims.length} claims`,                                          color: 'text-slate-700',  icon: Receipt      },
                { label: 'Net Collection Rate',    value: `${collectionRate}%`, sub: `${inr(sumSettled)} collected`,                                          color: 'text-green-700',  icon: Activity     },
                { label: 'Avg Days to Settlement', value: '11.2 days',        sub: 'Target: ≤10 days',                                                        color: 'text-blue-700',   icon: CalendarDays },
                { label: 'Total Deductions (MTD)', value: inr(sumDeductions), sub: `${sumApproved > 0 ? ((sumDeductions / sumApproved) * 100).toFixed(1) : 0}% of approved`, color: 'text-red-600', icon: TrendingDown },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <Card key={item.label}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">{item.label}</p></div>
                      <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Aging */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Outstanding Aging Analysis</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {([['0–30 days','0-30','bg-green-500'],['31–60 days','31-60','bg-amber-400'],['61–90 days','61-90','bg-orange-500'],['90+ days','90+','bg-red-500']] as const).map(([label, key, color]) => {
                      const val = aging[key as keyof typeof aging];
                      const pct = sumOutstanding > 0 ? (val / sumOutstanding * 100).toFixed(0) : '0';
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{label}</span>
                            <span>{inr(val)} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground pt-1">Total outstanding: <strong>{inr(sumOutstanding)}</strong></p>
                  </div>
                </CardContent>
              </Card>

              {/* Deduction reasons */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><MinusCircle className="h-4 w-4" /> Deduction Breakup by Category</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1 text-left font-medium text-muted-foreground">Category</th>
                        <th className="py-1 text-right font-medium text-muted-foreground">Amount</th>
                        <th className="py-1 text-right font-medium text-muted-foreground">% of Total Ded.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { reason: 'NME (Non-Medical Expenses)', amount: sumNME,          color: 'text-red-600'    },
                        { reason: 'Disallowances',              amount: sumDisallowance, color: 'text-rose-600'   },
                        { reason: 'Hospital Discount',          amount: sumDiscount,     color: 'text-orange-600' },
                        { reason: 'TDS @ 1%',                  amount: sumTDS,          color: 'text-purple-600' },
                      ].map(row => (
                        <tr key={row.reason} className="border-b">
                          <td className="py-2">{row.reason}</td>
                          <td className={`py-2 text-right font-medium ${row.color}`}>{inr(row.amount)}</td>
                          <td className="py-2 text-right text-muted-foreground text-xs">{sumDeductions > 0 ? ((row.amount / sumDeductions) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="py-2">Total</td>
                        <td className="py-2 text-right">{inr(sumDeductions)}</td>
                        <td className="py-2 text-right">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            {/* Insurer collection efficiency */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Insurer-wise Collection Efficiency</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium">Insurer</th>
                        <th className="py-3 px-4 text-right font-medium">Gross Billed</th>
                        <th className="py-3 px-4 text-right font-medium">Approved</th>
                        <th className="py-3 px-4 text-right font-medium text-red-600">Total Deductions</th>
                        <th className="py-3 px-4 text-right font-medium text-green-600">Net Settled</th>
                        <th className="py-3 px-4 text-right font-medium">Collection %</th>
                        <th className="py-3 px-4 text-right font-medium text-amber-600">Outstanding</th>
                        <th className="py-3 px-4 text-right font-medium">Avg TAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_RECON_SUMMARY.map((row, i) => {
                        const ded = row.nme + row.discount + row.tds + row.disallowance;
                        const cr  = row.approved > 0 ? ((row.settled / row.approved) * 100).toFixed(1) : '0.0';
                        const tat = DEMO_TAT_DATA.find(t => t.payer === row.insurer);
                        return (
                          <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-4 font-medium">{row.insurer}</td>
                            <td className="py-2 px-4 text-right">{inr(row.billed)}</td>
                            <td className="py-2 px-4 text-right">{inr(row.approved)}</td>
                            <td className="py-2 px-4 text-right text-red-600">{inr(ded)}</td>
                            <td className="py-2 px-4 text-right text-green-600 font-semibold">{inr(row.settled)}</td>
                            <td className="py-2 px-4 text-right">
                              <span className={`font-bold ${parseFloat(cr) >= 90 ? 'text-green-600' : parseFloat(cr) >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{cr}%</span>
                            </td>
                            <td className="py-2 px-4 text-right text-amber-600">{inr(row.outstanding)}</td>
                            <td className="py-2 px-4 text-right text-xs">{tat?.claimTat || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAT Tab ───────────────────────────────────────────────── */}
          <TabsContent value="tat" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Turn Around Time Analysis</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Avg. Pre-Auth TAT',         value: '4.9 hrs',  icon: Clock        },
                    { label: 'Avg. Claim Settlement TAT', value: '13.1 days',icon: CalendarDays },
                    { label: 'Payer Response Time',       value: '7.5 hrs',  icon: TrendingUp   },
                    { label: 'Doc Submission TAT',        value: '2.1 days', icon: FileText     },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Card key={item.label} className="bg-slate-50 dark:bg-slate-800">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4 text-indigo-500" /><span className="text-xs text-muted-foreground">{item.label}</span></div>
                          <p className="text-xl font-bold">{item.value}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                <h4 className="font-medium mb-3">Per-Payer TAT Breakdown</h4>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-4 text-left font-medium">Payer</th>
                      <th className="py-2 px-4 text-right font-medium">Pre-Auth TAT</th>
                      <th className="py-2 px-4 text-right font-medium">Claim TAT</th>
                      <th className="py-2 px-4 text-right font-medium">Response Time</th>
                      <th className="py-2 px-4 text-right font-medium">Total Claims</th>
                      <th className="py-2 px-4 text-left font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tatData.map((row: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-4 font-medium">{row.payer}</td>
                        <td className="py-2 px-4 text-right">{row.preAuthTat}</td>
                        <td className="py-2 px-4 text-right">{row.claimTat}</td>
                        <td className="py-2 px-4 text-right">{row.responseTime}</td>
                        <td className="py-2 px-4 text-right">{row.totalClaims}</td>
                        <td className="py-2 px-4">
                          <Badge className={`text-xs ${
                            row.remarks === 'Excellent'   ? 'bg-green-100 text-green-700' :
                            row.remarks === 'On track'    ? 'bg-blue-100 text-blue-700'   :
                            row.remarks === 'Minor delay' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-red-100 text-red-700'
                          }`}>{row.remarks}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payment Advice Tab ────────────────────────────────────── */}
          <TabsContent value="payment_advice" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Import Payment Advice</CardTitle></CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-800/50">
                  <IndianRupee className="h-10 w-10 mx-auto mb-3 text-slate-400" />
                  <p className="text-sm text-muted-foreground mb-1">Drag & drop insurer payment advice (EFT/NEFT/RTGS)</p>
                  <p className="text-xs text-muted-foreground mb-4">Supports Excel (.xlsx), PDF, CSV — UTR numbers auto-extracted</p>
                  <input type="file" accept=".xlsx,.csv,.pdf" id="advice-upload" className="hidden" onChange={handlePaymentAdviceUpload} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('advice-upload')?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> Browse File
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Manual UTR Entry</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input placeholder="Enter UTR number (e.g. SBIN202604180023456)" value={utrInput} onChange={e => setUtrInput(e.target.value)} className="font-mono" />
                  <Button onClick={() => { if (utrInput.trim()) { matchUTR(utrInput.trim()); setUtrInput(''); } }} className="bg-indigo-600 hover:bg-indigo-700">
                    <ArrowRightLeft className="h-4 w-4 mr-1" /> Match & Link
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Payment Advice Register</CardTitle>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded">{paymentAdvices.filter(p => p.status === 'matched').length} Matched</span>
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">{paymentAdvices.filter(p => p.status === 'pending').length} Pending</span>
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded">{paymentAdvices.filter(p => p.status === 'unmatched').length} Unmatched</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Insurer</th>
                      <th className="py-3 px-4 text-left font-medium">UTR / Ref No.</th>
                      <th className="py-3 px-4 text-right font-medium">Amount (₹)</th>
                      <th className="py-3 px-4 text-left font-medium">Date</th>
                      <th className="py-3 px-4 text-left font-medium">Mapped Claims</th>
                      <th className="py-3 px-4 text-left font-medium">Status</th>
                      <th className="py-3 px-4 text-left font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentAdvices.map((p) => (
                      <tr key={p.id} className={`border-b transition-colors ${matchingUtr === p.utr ? 'bg-green-50 dark:bg-green-900/20' : ''}`}>
                        <td className="py-2 px-4 font-medium">{p.insurer}</td>
                        <td className="py-2 px-4 font-mono text-xs">{p.utr}</td>
                        <td className="py-2 px-4 text-right font-semibold">{inr(p.amount)}</td>
                        <td className="py-2 px-4">{p.date}</td>
                        <td className="py-2 px-4 font-mono text-xs">{p.claimNo || <span className="text-muted-foreground">—</span>}</td>
                        <td className="py-2 px-4">
                          {p.status === 'matched'   && <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Matched</Badge>}
                          {p.status === 'pending'   && <Badge className="bg-amber-100 text-amber-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
                          {p.status === 'unmatched' && <Badge className="bg-red-100 text-red-700"><AlertCircle className="h-3 w-3 mr-1" />Unmatched</Badge>}
                        </td>
                        <td className="py-2 px-4">
                          {p.status !== 'matched' && (
                            <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => matchUTR(p.utr)}>
                              <Link2 className="h-3 w-3 mr-1" /> Match
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
    <MalwareWarningDialog
      open={malwareWarning.open}
      onClose={() => setMalwareWarning({ open: false })}
      threat={malwareWarning.threat}
      fileName={malwareWarning.fileName}
    />
    </>
  );
};

export default InsuranceReconciliationPage;


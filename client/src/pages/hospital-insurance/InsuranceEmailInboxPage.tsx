import { useState, useEffect, useCallback } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Mail, MailOpen, Send, Inbox, Star, Trash2, RefreshCw, Search,
  Plus, Settings, Shield, CheckCircle2, AlertCircle, Clock,
  IndianRupee, Link2, Reply, Forward, Paperclip, ChevronRight,
  Zap, Archive, Tag, Filter, Download, Upload, Eye, Server,
  Key, Bell, TrendingUp, FileText, Building2, Activity,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Email Provider Presets ───────────────────────────────────────────────────
const EMAIL_PROVIDERS = {
  'zoho-pro': { name: 'Zoho Pro Mail',   smtpHost: 'smtppro.zoho.in',        imapHost: 'imappro.zoho.in',   port: 465, imapPort: 993, enc: 'SSL', icon: '🏢' },
  'zoho':     { name: 'Zoho Mail',       smtpHost: 'smtp.zoho.com',          imapHost: 'imap.zoho.com',    port: 587, imapPort: 993, enc: 'TLS', icon: '📧' },
  'gmail':    { name: 'Gmail',           smtpHost: 'smtp.gmail.com',         imapHost: 'imap.gmail.com',   port: 587, imapPort: 993, enc: 'TLS', icon: '📬' },
  'outlook':  { name: 'Outlook/Hotmail', smtpHost: 'smtp-mail.outlook.com',  imapHost: 'outlook.office365.com', port: 587, imapPort: 993, enc: 'TLS', icon: '📮' },
  'custom':   { name: 'Custom SMTP',     smtpHost: '',                       imapHost: '',                 port: 587, imapPort: 993, enc: 'TLS', icon: '⚙️' },
};

// ─── Demo Inbox Emails ────────────────────────────────────────────────────────
interface InboxEmail {
  id: string;
  from: string;
  fromName: string;
  fromOrg: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  label: 'pre-auth' | 'payment' | 'query' | 'rejection' | 'general';
  attachments: string[];
  claimRef?: string;
  autoCapture?: { type: 'payment'; utr?: string; amount?: number; insurer?: string } | { type: 'pre-auth'; status: string; claimNo: string };
}

const DEMO_INBOX: InboxEmail[] = [
  {
    id: 'EM001',
    from: 'claims@starhealth.in',
    fromName: 'Star Health Claims Dept',
    fromOrg: 'Star Health And Allied Insurance Co Ltd',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Pre-Auth Approval — CLM-2026-0001 | Ramesh Kumar | Rs. 1,42,500',
    body: `Dear Hospital Insurance Team,

We are pleased to inform you that the Pre-Authorization request has been APPROVED for the following patient:

Patient Name   : Ramesh Kumar
IP Number      : IP/2026/0318
Claim Number   : CLM-2026-0001
Diagnosis      : Coronary Artery Disease (CAD)
Procedure      : PTCA with Stenting
Approved Amount: Rs. 1,42,500/-
TPA Reference  : SH-TPA-2026-45821
Validity       : 7 days from date of admission

Please submit all discharge documents within 30 days of discharge. Ensure itemized bill and discharge summary are attached.

For queries, contact: claims.support@starhealth.in or call 1800-425-2255

Regards,
Star Health Claims Processing Team`,
    date: '2026-04-04T09:32:00',
    read: false,
    starred: true,
    label: 'pre-auth',
    attachments: ['PreAuth_Approval_CLM-2026-0001.pdf'],
    claimRef: 'CLM-2026-0001',
    autoCapture: { type: 'pre-auth', status: 'approved', claimNo: 'CLM-2026-0001' },
  },
  {
    id: 'EM002',
    from: 'tpa-payments@hdfcergo.com',
    fromName: 'HDFC ERGO TPA Settlement',
    fromOrg: 'HDFC ERGO General Insurance',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Payment Advice — UTR HDFC202604030078234 — Rs. 2,15,000 NEFT Credit',
    body: `Dear Accounts Team,

This is to inform you that the following payment has been processed via NEFT:

Hospital Name   : Mediczy Demo Hospital
Beneficiary A/C : XXXX XXXX 4521
UTR Number      : HDFC202604030078234
Amount          : Rs. 2,15,000/-
Payment Date    : 03-Apr-2026
Mode            : NEFT
IFSC            : HDFC0001234

Claims Covered:
1. CLM-2026-0003 | Amit Verma     | Rs. 1,23,000 | Knee Replacement
2. CLM-2026-0007 | Geeta Nair     | Rs. 92,000   | Hysterectomy

Deductions applied:
- NME (Non-Medical Expenses): Rs. 12,000
- TDS @ 1%                  : Rs. 2,150
- Disallowance               : Rs. 4,850

Please reconcile and acknowledge receipt within 48 hours.

Regards,
HDFC ERGO TPA Settlement Desk
Email: tpa.settlement@hdfcergo.com`,
    date: '2026-04-03T16:10:00',
    read: false,
    starred: false,
    label: 'payment',
    attachments: ['PaymentAdvice_HDFC202604030078234.pdf', 'ClaimWise_Breakup_Apr2026.xlsx'],
    claimRef: 'CLM-2026-0003',
    autoCapture: { type: 'payment', utr: 'HDFC202604030078234', amount: 215000, insurer: 'HDFC Ergo' },
  },
  {
    id: 'EM003',
    from: 'preauth@icicilombard.com',
    fromName: 'ICICI Lombard Pre-Auth Cell',
    fromOrg: 'ICICI Lombard General Insurance',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Query on Pre-Auth — CLM-2026-0005 | Meera Devi — Additional Documents Required',
    body: `Dear Sir/Madam,

We have received the pre-authorization request for the above patient. We require the following additional documents to process the request:

Patient     : Meera Devi
IP No.      : IP/2026/0321
Claim Ref   : CLM-2026-0005
Diagnosis   : Acute Appendicitis
Queried By  : Dr. (TPA) R.K. Singh — Chief Medical Officer

DOCUMENTS REQUIRED:
1. Latest Lab Reports (CBC, CRP, Ultrasound Abdomen)
2. Surgeon's Pre-Op Note with justification for laparoscopic approach
3. Previous medical records (if any, last 6 months)
4. Pharmacy prescriptions with doctor's signature

Please submit within 24 hours to avoid delay in treatment. Upload at: portal.icicilombard.com/tpa-upload or reply to this email.

Query Reference : ICI-QRY-2026-8821

ICICI Lombard Pre-Auth Team`,
    date: '2026-04-03T11:45:00',
    read: true,
    starred: false,
    label: 'query',
    attachments: [],
    claimRef: 'CLM-2026-0005',
    autoCapture: { type: 'pre-auth', status: 'query', claimNo: 'CLM-2026-0005' },
  },
  {
    id: 'EM004',
    from: 'settlements@bajajallianz.co.in',
    fromName: 'Bajaj Allianz Claim Settlement',
    fromOrg: 'Bajaj Allianz General Insurance',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Payment Advice — UTR BJAZ202604020034567 — Rs. 89,550 Settlement',
    body: `Dear Hospital Accounts Department,

Please find below the payment details for the settled claims:

UTR Number   : BJAZ202604020034567
Amount       : Rs. 89,550/-
Payment Date : 02-Apr-2026
Mode         : RTGS
Bank         : State Bank of India

Claim Details:
1. CLM-2026-0002 | Sunita Sharma | Rs. 89,550 | Type 2 Diabetes Management

Deductions:
- Discount       : Rs. 7,500
- TDS @ 1%       : Rs. 950
- Disallowance   : Rs. 3,000

Net Payable: Rs. 89,550

Bajaj Allianz Settlement Team`,
    date: '2026-04-02T14:22:00',
    read: true,
    starred: false,
    label: 'payment',
    attachments: ['BajajAllianz_PayAdvice_Apr2026.pdf'],
    claimRef: 'CLM-2026-0002',
    autoCapture: { type: 'payment', utr: 'BJAZ202604020034567', amount: 89550, insurer: 'Bajaj Allianz' },
  },
  {
    id: 'EM005',
    from: 'tpaoperations@carehealth.in',
    fromName: 'Care Health TPA Operations',
    fromOrg: 'Care Health Insurance Ltd',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Pre-Auth PARTIAL APPROVAL — CLM-2026-0008 | Rohit Joshi | Rs. 72,000 of Rs. 98,500',
    body: `Dear Hospital,

Please note that Pre-Authorization for the following patient has been PARTIALLY APPROVED:

Patient      : Rohit Joshi (IP/2026/0325)
Claim Ref    : CLM-2026-0008
Diagnosis    : Chronic Kidney Disease Stage 3
Billed Amount: Rs. 98,500
Approved Amt : Rs. 72,000 (reason: Deduction of Rs. 26,500 — NME and consumables not covered)

Non-Payable Items:
- Gloves, syringes, saline bottles marked as NME: Rs. 8,500
- Attendant / diet charges: Rs. 6,000
- Higher room differential: Rs. 12,000

Hospital may collect the difference (Rs. 26,500) from patient.

Regards,
Care Health TPA Operations`,
    date: '2026-04-01T17:05:00',
    read: false,
    starred: true,
    label: 'pre-auth',
    attachments: ['CareHealth_PartialApproval_CLM-2026-0008.pdf'],
    claimRef: 'CLM-2026-0008',
    autoCapture: { type: 'pre-auth', status: 'partial', claimNo: 'CLM-2026-0008' },
  },
  {
    id: 'EM006',
    from: 'claims-rejection@nibupa.com',
    fromName: 'Niva Bupa Claims Team',
    fromOrg: 'Niva Bupa Health Insurance Co Ltd',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Claim Repudiation Notice — CLM-2026-0010 | Vijay Rao — Pre-existing Condition',
    body: `Dear Hospital Administration,

This is to inform you that after careful consideration, the claim for the below patient has been REPUDIATED:

Patient     : Vijay Rao (IP/2026/0327)
Claim No.   : CLM-2026-0010
Diagnosis   : Cirrhosis of Liver
Amount      : Rs. 1,85,000

Reason for Repudiation:
The condition has been found to be pre-existing and was not disclosed at the time of policy inception. As per policy terms Section 4.3, pre-existing diseases are not covered for the first 48 months.

Relevant Policy Clause: Section 4.3 — Pre-Existing Disease Waiting Period

You may appeal this decision within 15 days by writing to: grievance@nibupa.com
IRDA Ombudsman contact: 1800-4254-732

Niva Bupa Claims Processing`,
    date: '2026-03-31T10:18:00',
    read: true,
    starred: false,
    label: 'rejection',
    attachments: ['NivaBupa_RepudiationLetter_CLM-2026-0010.pdf'],
    claimRef: 'CLM-2026-0010',
  },
  {
    id: 'EM007',
    from: 'settlement@sbigeneral.co.in',
    fromName: 'SBI General Insurance Settlement',
    fromOrg: 'SBI General Insurance Company',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Payment Advice — UTR SBIN202604010023456 — Rs. 1,24,000 Credit',
    body: `Dear Finance Team,

Payment transferred via NEFT as per details below:

UTR Number : SBIN202604010023456
Amount     : Rs. 1,24,000/-
Date       : 01-Apr-2026
Mode       : NEFT

Claim: CLM-2026-0001 | Ramesh Kumar | Rs. 1,24,000 (Post deductions from approved Rs. 1,42,500)

SBI General Settlement Desk`,
    date: '2026-04-01T12:00:00',
    read: true,
    starred: false,
    label: 'payment',
    attachments: ['SBI_PaymentAdvice_Apr2026.pdf'],
    claimRef: 'CLM-2026-0001',
    autoCapture: { type: 'payment', utr: 'SBIN202604010023456', amount: 124000, insurer: 'SBI General' },
  },
  {
    id: 'EM008',
    from: 'preauth.tataaig@tataaiginsu.com',
    fromName: 'Tata AIG Pre-Auth Desk',
    fromOrg: 'Tata AIG General Insurance Co Ltd',
    to: 'insurance@mediczy-demo-hospital.com',
    subject: 'Pre-Auth APPROVED — CLM-2026-0011 | Anita Gupta | Rs. 1,15,000 for Gallbladder Surgery',
    body: `Dear Hospital Team,

Pre-Authorization APPROVED:

Patient    : Anita Gupta (IP/2026/0329)
Claim Ref  : CLM-2026-0011
Diagnosis  : Cholelithiasis (Gallstones)
Procedure  : Laparoscopic Cholecystectomy
Approved   : Rs. 1,15,000

Tata AIG Pre-Auth Cell`,
    date: '2026-03-30T09:55:00',
    read: true,
    starred: false,
    label: 'pre-auth',
    attachments: ['TataAIG_PreAuth_CLM-2026-0011.pdf'],
    claimRef: 'CLM-2026-0011',
    autoCapture: { type: 'pre-auth', status: 'approved', claimNo: 'CLM-2026-0011' },
  },
];

// ─── Demo Pre-Auth Threads ────────────────────────────────────────────────────
const DEMO_PREAUTH_THREADS = [
  {
    claimNo: 'CLM-2026-0001',
    patient: 'Ramesh Kumar',
    insurer: 'Star Health',
    status: 'settled' as const,
    messages: [
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-03-28T10:00:00', subject: 'Pre-Auth Request — Ramesh Kumar — PTCA with Stenting' },
      { dir: 'in',  from: 'claims@starhealth.in',                date: '2026-03-29T14:30:00', subject: 'Acknowledgement — Pre-Auth CLM-2026-0001' },
      { dir: 'in',  from: 'claims@starhealth.in',                date: '2026-04-01T09:00:00', subject: 'Pre-Auth APPROVED — Rs. 1,42,500 ✓', highlight: true },
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-04-01T11:00:00', subject: 'Acknowledgement of Pre-Auth + Discharge Summary Submitted' },
    ],
  },
  {
    claimNo: 'CLM-2026-0005',
    patient: 'Meera Devi',
    insurer: 'ICICI Lombard',
    status: 'query' as const,
    messages: [
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-04-02T09:00:00', subject: 'Pre-Auth Request — Meera Devi — Acute Appendicitis' },
      { dir: 'in',  from: 'preauth@icicilombard.com',            date: '2026-04-03T11:45:00', subject: 'QUERY — Additional Documents Required', highlight: true },
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-04-04T08:30:00', subject: 'Re: Documents Submitted — Lab Reports + Surgeon Note' },
    ],
  },
  {
    claimNo: 'CLM-2026-0008',
    patient: 'Rohit Joshi',
    insurer: 'Care Health',
    status: 'partial' as const,
    messages: [
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-03-30T10:30:00', subject: 'Pre-Auth Request — Rohit Joshi — CKD Stage 3' },
      { dir: 'in',  from: 'tpaoperations@carehealth.in',         date: '2026-04-01T17:05:00', subject: 'PARTIAL APPROVAL — Rs. 72,000 of Rs. 98,500', highlight: true },
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-04-02T09:00:00', subject: 'Re: Appeal against NME deductions — Evidence attached' },
    ],
  },
  {
    claimNo: 'CLM-2026-0010',
    patient: 'Vijay Rao',
    insurer: 'Niva Bupa',
    status: 'rejected' as const,
    messages: [
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-03-28T11:00:00', subject: 'Pre-Auth Request — Vijay Rao — Cirrhosis of Liver' },
      { dir: 'in',  from: 'claims-rejection@nibupa.com',         date: '2026-03-31T10:18:00', subject: 'REPUDIATION — Pre-existing Condition (Section 4.3)', highlight: true },
      { dir: 'out', from: 'insurance@mediczy-demo-hospital.com', date: '2026-04-01T09:00:00', subject: 'Grievance Appeal — Supporting Specialist Reports Enclosed' },
    ],
  },
];

// ─── Auto-captured Payments ───────────────────────────────────────────────────
const DEMO_CAPTURED = [
  { emailId: 'EM002', utr: 'HDFC202604030078234', amount: 215000, insurer: 'HDFC Ergo',    date: '2026-04-03', status: 'linked',   claims: 'CLM-2026-0003, CLM-2026-0007' },
  { emailId: 'EM004', utr: 'BJAZ202604020034567', amount: 89550,  insurer: 'Bajaj Allianz', date: '2026-04-02', status: 'linked',   claims: 'CLM-2026-0002' },
  { emailId: 'EM007', utr: 'SBIN202604010023456', amount: 124000, insurer: 'SBI General',  date: '2026-04-01', status: 'linked',   claims: 'CLM-2026-0001' },
];

// ─── Email Templates ──────────────────────────────────────────────────────────
const DEMO_TEMPLATES = [
  { id: 'T01', name: 'Pre-Auth Request',            category: 'pre-auth',  subject: 'Pre-Authorization Request — {{patientName}} — {{diagnosis}}' },
  { id: 'T02', name: 'Additional Docs Submission',  category: 'pre-auth',  subject: 'Re: Additional Documents Submitted — {{claimNo}}' },
  { id: 'T03', name: 'Pre-Auth Appeal',             category: 'pre-auth',  subject: 'Appeal — Pre-Auth Decision — {{claimNo}} — {{patientName}}' },
  { id: 'T04', name: 'Payment Acknowledgement',     category: 'payment',   subject: 'Payment Receipt Acknowledgement — UTR {{utr}} — {{insurer}}' },
  { id: 'T05', name: 'Reconciliation Query',        category: 'payment',   subject: 'Reconciliation Query — Claims {{claimNos}} — {{insurer}}' },
  { id: 'T06', name: 'Discharge Summary Submission',category: 'claims',    subject: 'Discharge Documents Submitted — {{claimNo}} — {{patientName}}' },
  { id: 'T07', name: 'Grievance Escalation',        category: 'escalation',subject: 'Grievance Escalation — Claim {{claimNo}} — IRDA Notice' },
];

const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;

const labelColors: Record<string, string> = {
  'pre-auth': 'bg-blue-100 text-blue-700',
  'payment':  'bg-green-100 text-green-700',
  'query':    'bg-amber-100 text-amber-700',
  'rejection':'bg-red-100 text-red-700',
  'general':  'bg-slate-100 text-slate-600',
};

const statusColor = (s: string) =>
  s === 'approved' || s === 'settled' ? 'bg-green-100 text-green-700' :
  s === 'partial'                     ? 'bg-orange-100 text-orange-700' :
  s === 'query'                       ? 'bg-amber-100 text-amber-700' :
  s === 'rejected'                    ? 'bg-red-100 text-red-700'    : 'bg-slate-100 text-slate-600';

// ─── API helper ───────────────────────────────────────────────────────────────
const API = '/api/hospital/insurance/emails';
const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('hospitalInsuranceToken') || ''}`,
  'Content-Type': 'application/json',
});

// ═════════════════════════════════════════════════════════════════════════════
const InsuranceEmailInboxPage = () => {
  const [activeTab, setActiveTab] = useState('inbox');
  const [emails, setEmails]       = useState<any[]>(DEMO_INBOX);
  const [captures, setCaptures]   = useState<any[]>(DEMO_CAPTURED);
  const [stats, setStats]         = useState({ total: DEMO_INBOX.length, unread: DEMO_INBOX.filter(e=>!e.read).length, payments: 3, preauths: 3, queries: 1, captures: 3 });
  const [selected, setSelected]   = useState<any | null>(null);
  const [search, setSearch]       = useState('');
  const [labelFilter, setLabelFilter] = useState('all');
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose]     = useState({ to: '', subject: '', body: '', template: '' });
  const [syncing, setSyncing]     = useState(false);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [smtpConfig, setSmtpConfig] = useState({
    provider: 'zoho-pro',
    smtpHost: 'smtppro.zoho.in', smtpPort: '465',
    imapHost: 'imappro.zoho.in', imapPort: '993',
    email: '', password: '', fromName: '', encryption: 'SSL',
    autoCapture: true, autoLinkPayments: true, notifyPreAuth: true,
  });
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [testing, setTesting]       = useState(false);

  // ── Fetch inbox from API ───────────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (labelFilter !== 'all') params.set('label', labelFilter);
      if (search) params.set('search', search);
      const res  = await fetch(`${API}/inbox?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success && data.data?.length) setEmails(data.data);
    } catch { /* keep demo data on network error */ }
  }, [labelFilter, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/stats`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch { /* keep defaults */ }
  }, []);

  const fetchCaptures = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/captures`, { headers: authHeader() });
      const data = await res.json();
      if (data.success && data.data?.length) setCaptures(data.data);
    } catch { /* keep demo */ }
  }, []);

  useEffect(() => {
    fetchInbox();
    fetchStats();
    fetchCaptures();
  }, [fetchInbox, fetchStats, fetchCaptures]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const filteredEmails = emails.filter((e: any) => {
    const emailLabel = e.label || e.aiCategory;
    const matchLabel  = labelFilter === 'all' || emailLabel === labelFilter;
    const matchSearch = !search ||
      (e.subject || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.fromName || e.from_name || '').toLowerCase().includes(search.toLowerCase());
    return matchLabel && matchSearch;
  });
  const unread = emails.filter((e: any) => !e.read && !e.isRead).length;

  // ── Actions ────────────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    setEmails(prev => prev.map((e: any) => e.id === id ? { ...e, read: true, isRead: true } : e));
    try { await fetch(`${API}/${id}`, { headers: authHeader() }); } catch { /* ignore */ }
  };

  const toggleStar = async (id: string) => {
    setEmails(prev => prev.map((e: any) => e.id === id ? { ...e, starred: !e.starred, isStarred: !e.isStarred } : e));
    try { await fetch(`${API}/${id}/star`, { method: 'PUT', headers: authHeader() }); } catch { /* ignore */ }
  };

  const applyTemplate = (id: string) => {
    const t = DEMO_TEMPLATES.find(t => t.id === id);
    if (t) setCompose(c => ({ ...c, subject: t.subject, template: id }));
  };

  const handleSync = async () => {
    if (!smtpConfig.email || !smtpConfig.password || !smtpConfig.imapHost) {
      toast.error('Configure IMAP credentials in the SMTP/IMAP tab first');
      setActiveTab('smtp');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`${API}/sync`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          email:    smtpConfig.email,
          password: smtpConfig.password,
          imapHost: smtpConfig.imapHost,
          imapPort: parseInt(smtpConfig.imapPort),
          tls:      smtpConfig.encryption !== 'None',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Synced ${data.synced ?? 0} new emails — AI parsing complete`);
        await fetchInbox();
        await fetchStats();
        await fetchCaptures();
      } else {
        toast.error(data.message || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed — check IMAP settings');
    } finally {
      setSyncing(false);
    }
  };

  const handleAiReply = async () => {
    if (!selected) return;
    setAiDraftLoading(true);
    try {
      const res  = await fetch(`${API}/${selected.id}/ai-reply`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        const draft = data.data?.draft || data.draft || '';
        setCompose(c => ({
          ...c,
          to:      selected.fromEmail || selected.from,
          subject: `Re: ${selected.subject}`,
          body:    draft,
        }));
        setShowCompose(true);
      } else {
        toast.error('AI reply generation failed');
      }
    } catch {
      toast.error('AI reply failed');
    } finally {
      setAiDraftLoading(false);
    }
  };

  const handleSend = async () => {
    if (!compose.to || !compose.subject) { toast.error('Fill in recipient and subject'); return; }
    try {
      const res = await fetch(`${API}/send`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          to:        compose.to,
          subject:   compose.subject,
          body:      compose.body,
          replyToId: selected?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Email sent to ${compose.to}`);
        setShowCompose(false);
        setCompose({ to: '', subject: '', body: '', template: '' });
      } else {
        toast.error(data.message || 'Failed to send email — check SMTP settings');
      }
    } catch {
      toast.error('Failed to send email');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/smtp-test`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          smtpHost: smtpConfig.smtpHost,
          smtpPort: parseInt(smtpConfig.smtpPort),
          email:    smtpConfig.email,
          password: smtpConfig.password,
        }),
      });
      const data = await res.json();
      setTestResult({ ok: data.success, msg: data.message || (data.success ? 'Connection successful' : 'Connection failed') });
    } catch {
      setTestResult({ ok: false, msg: 'Network error — could not reach server' });
    } finally {
      setTesting(false);
    }
  };

  const handleBatchReparse = async () => {
    try {
      const res  = await fetch(`${API}/batch-reparse`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        toast.success(`Re-parsed ${data.processed ?? 0} emails with AI`);
        await fetchInbox();
        await fetchStats();
      } else {
        toast.error(data.message || 'Batch reparse failed');
      }
    } catch {
      toast.error('Batch reparse failed');
    }
  };

  const providerKeys = Object.keys(EMAIL_PROVIDERS) as (keyof typeof EMAIL_PROVIDERS)[];
  const prov = EMAIL_PROVIDERS[smtpConfig.provider as keyof typeof EMAIL_PROVIDERS];

  return (
    <InsurancePortalLayout>
      <div className="p-6 space-y-4 max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-6 w-6 text-indigo-600" /> TPA Email Inbox
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Auto-capture payments &amp; pre-auth communications from insurers / TPAs
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleBatchReparse}>
              <Zap className="h-4 w-4 mr-1" /> Batch AI
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync Inbox'}
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowCompose(true)}>
              <Plus className="h-4 w-4 mr-1" /> Compose
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
          { label: 'Unread',          value: unread,                  icon: Mail,       color: 'text-indigo-700' },
            { label: 'Pre-Auth Emails', value: stats.preauths,           icon: Shield,     color: 'text-blue-700'   },
            { label: 'Payment Advices', value: stats.payments,           icon: IndianRupee,color: 'text-green-700'  },
            { label: 'Queries',         value: stats.queries,            icon: AlertCircle,color: 'text-amber-700'  },
            { label: 'Auto-Captured',   value: stats.captures,           icon: Zap,        color: 'text-purple-700' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="border">
                <CardContent className="p-3 flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${item.color} opacity-80`} />
                  <div>
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="inbox"     className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Inbox {unread > 0 && <span className="ml-1 bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5">{unread}</span>}
            </TabsTrigger>
            <TabsTrigger value="preauth"   className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Pre-Auth Threads</TabsTrigger>
            <TabsTrigger value="capture"   className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Payment Capture</TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Templates</TabsTrigger>
            <TabsTrigger value="smtp"      className="flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" /> SMTP / IMAP</TabsTrigger>
          </TabsList>

          {/* ── Inbox ──────────────────────────────────────────────────── */}
          <TabsContent value="inbox" className="mt-4">
            <div className="flex gap-4">
              {/* Sidebar labels */}
              <div className="w-44 flex-shrink-0 space-y-1">
                {[
                  { key: 'all',       label: 'All Mail',      icon: Mail,        count: emails.length },
                  { key: 'pre-auth',  label: 'Pre-Auth',      icon: Shield,      count: emails.filter((e:any)=>e.label==='pre-auth'||e.aiCategory?.startsWith('pre_auth')).length },
                  { key: 'payment',   label: 'Payments',      icon: IndianRupee, count: emails.filter((e:any)=>e.label==='payment'||e.aiCategory==='payment_advice').length },
                  { key: 'query',     label: 'Queries',       icon: AlertCircle, count: emails.filter((e:any)=>e.label==='query'||e.aiCategory==='pre_auth_query').length },
                  { key: 'rejection', label: 'Rejections',    icon: Trash2,      count: emails.filter((e:any)=>e.label==='rejection'||e.aiCategory==='claim_repudiation'||e.aiCategory==='pre_auth_rejection').length },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setLabelFilter(item.key)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        labelFilter === item.key
                          ? 'bg-indigo-100 text-indigo-700 font-medium dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Email list + viewer */}
              <div className="flex-1 min-w-0">
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-9"
                    placeholder="Search emails…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>

                <div className="grid md:grid-cols-5 gap-3">
                  {/* List */}
                  <div className="md:col-span-2 space-y-1 overflow-y-auto max-h-[600px]">
                    {filteredEmails.length === 0 && (
                      <p className="text-center py-12 text-muted-foreground text-sm">No emails found</p>
                    )}
                    {filteredEmails.map((email: any) => {
                      const isRead     = email.read || email.isRead;
                      const isStarred  = email.starred || email.isStarred;
                      const dispName   = email.fromName || email.from_name || email.fromEmail || email.from;
                      const emailLabel = email.label || (email.aiCategory?.startsWith('pre_auth') ? 'pre-auth' : email.aiCategory === 'payment_advice' ? 'payment' : email.aiCategory === 'claim_repudiation' ? 'rejection' : email.aiCategory === 'pre_auth_query' ? 'query' : 'general');
                      const hasCapture = email.utr || email.autoCapture;
                      return (
                      <div
                        key={email.id}
                        onClick={() => { setSelected(email); markRead(email.id); }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selected?.id === email.id
                            ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-300 dark:border-purple-700'
                            : 'hover:bg-muted/40 border-transparent'
                        } ${!isRead ? 'bg-card' : 'bg-muted/20'}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {!isRead && <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" />}
                            <span className={`text-xs truncate ${!isRead ? 'font-semibold' : ''}`}>{dispName}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={ev => { ev.stopPropagation(); toggleStar(email.id); }}
                              className={`text-xs ${isStarred ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-300'}`}
                            >★</button>
                          </div>
                        </div>
                        <p className={`text-xs mt-0.5 leading-tight line-clamp-2 ${!isRead ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {email.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${labelColors[emailLabel] || labelColors['general']}`}>{emailLabel}</Badge>
                          {hasCapture && <Zap className="h-3 w-3 text-purple-500" aria-label="Auto-captured" />}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(email.date || email.receivedAt || email.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                          </span>
                        </div>
                      </div>
                    );})}

                  </div>

                  {/* Viewer */}
                  <div className="md:col-span-3">
                    {!selected ? (
                      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-border rounded-lg bg-card shadow-sm">
                        <MailOpen className="h-12 w-12 mb-3 opacity-30" />
                        <p className="text-sm">Select an email to read</p>
                      </div>
                    ) : (
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-sm font-semibold leading-snug">{selected.subject}</CardTitle>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {(() => {
                                  const lbl = selected.label || (selected.aiCategory?.startsWith('pre_auth') ? 'pre-auth' : selected.aiCategory === 'payment_advice' ? 'payment' : selected.aiCategory === 'claim_repudiation' ? 'rejection' : 'general');
                                  return <Badge className={`text-[10px] px-2 py-0.5 ${labelColors[lbl] || labelColors['general']}`}>{lbl}</Badge>;
                                })()}
                                {(selected.utr || selected.autoCapture) && (
                                  <Badge className="text-[10px] px-2 py-0.5 bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300">
                                    <Zap className="h-3 w-3 mr-0.5" />Auto-captured
                                  </Badge>
                                )}
                                {selected.aiCategory && (
                                  <Badge className="text-[10px] px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300">
                                    AI: {selected.aiCategory}
                                  </Badge>
                                )}
                                {(selected.claimRef || (selected.claimNumbers && selected.claimNumbers[0])) && (
                                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-mono">{selected.claimRef || selected.claimNumbers[0]}</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                size="sm" variant="outline"
                                className="h-7 px-2 text-xs bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                onClick={handleAiReply}
                                disabled={aiDraftLoading}
                              >
                                {aiDraftLoading ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                                AI Reply
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setCompose({ to: selected.fromEmail || selected.from, subject: `Re: ${selected.subject}`, body: '', template: '' }); setShowCompose(true); }}>
                                <Reply className="h-3 w-3 mr-1" />Reply
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"><Forward className="h-3 w-3 mr-1" />Fwd</Button>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                            <div><span className="font-medium">From:</span> {selected.fromName || selected.from_name || ''} &lt;{selected.fromEmail || selected.from}&gt;</div>
                            <div><span className="font-medium">To:</span> {selected.to || selected.toEmail || ''}</div>
                            <div><span className="font-medium">Date:</span> {new Date(selected.date || selected.receivedAt || selected.createdAt).toLocaleString('en-IN')}</div>
                          </div>
                          {/* AI Summary strip */}
                          {selected.aiSummary && (
                            <div className="mt-2 rounded-md bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300">
                              <span className="font-semibold">AI Summary: </span>{selected.aiSummary}
                              {selected.aiSuggestedAction && (
                                <span className="ml-2 text-indigo-600">→ <span className="font-medium">{selected.aiSuggestedAction}</span></span>
                              )}
                            </div>
                          )}
                        </CardHeader>
                        <CardContent>
                          <pre className="text-xs leading-relaxed font-sans whitespace-pre-wrap bg-muted/40 rounded-lg p-4 max-h-64 overflow-y-auto text-foreground">
                            {selected.bodyText || selected.body}
                          </pre>
                          {(selected.attachments?.length > 0) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(selected.attachments as any[]).map((a: any, i: number) => {
                                const name = typeof a === 'string' ? a : a.filename || a.name || 'attachment';
                                return (
                                  <div key={i} className="flex items-center gap-1.5 text-xs border border-border rounded px-2 py-1 bg-muted/40 cursor-pointer hover:bg-muted">
                                    <Paperclip className="h-3 w-3" />{name}
                                    <Download className="h-3 w-3 text-indigo-500 ml-1" />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Auto-capture banner — payment */}
                          {(selected.utr || selected.autoCapture?.type === 'payment') && (
                            <div className="mt-3 rounded-lg p-3 text-xs flex items-start gap-2 bg-green-50 border border-green-200 dark:bg-green-900/20">
                              <Zap className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
                              <div>
                                <p className="font-semibold text-green-700">Payment Auto-Captured</p>
                                <p className="text-green-700">
                                  UTR: <span className="font-mono font-bold">{selected.utr || selected.autoCapture?.utr}</span>
                                  {(selected.paymentAmount || selected.autoCapture?.amount) && ` — ${inr(selected.paymentAmount || selected.autoCapture?.amount)}`}
                                  {(selected.insurerName || selected.autoCapture?.insurer || selected.fromOrg) && ` from ${selected.insurerName || selected.autoCapture?.insurer || selected.fromOrg}`}
                                </p>
                                {(selected.nmeAmount || selected.tdsAmount || selected.disallowanceAmount) && (
                                  <p className="text-green-600 mt-0.5">
                                    Deductions — NME: {inr(selected.nmeAmount || 0)} | TDS: {inr(selected.tdsAmount || 0)} | Disallowance: {inr(selected.disallowanceAmount || 0)}
                                  </p>
                                )}
                                <p className="text-green-600 mt-0.5">Linked to reconciliation register automatically.</p>
                              </div>
                            </div>
                          )}
                          {/* Auto-capture banner — pre-auth */}
                          {(!selected.utr && (selected.preAuthStatus || selected.autoCapture?.type === 'pre-auth')) && (
                            <div className="mt-3 rounded-lg p-3 text-xs flex items-start gap-2 bg-blue-50 border border-blue-200 dark:bg-blue-900/20">
                              <Zap className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                              <div>
                                <p className="font-semibold text-blue-700">Pre-Auth Status Captured</p>
                                <p className="text-blue-700">
                                  {(selected.claimNumbers?.[0] || selected.autoCapture?.claimNo || selected.claimRef) && (
                                    <>Claim <span className="font-mono font-bold">{selected.claimNumbers?.[0] || selected.autoCapture?.claimNo || selected.claimRef}</span> → </>
                                  )}
                                  Status updated to <span className="font-semibold capitalize">{selected.preAuthStatus || selected.autoCapture?.status}</span>
                                  {selected.approvedAmount ? ` — Approved: ${inr(selected.approvedAmount)}` : ''}
                                </p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Pre-Auth Threads ───────────────────────────────────────── */}
          <TabsContent value="preauth" className="mt-4 space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" /> Pre-Auth Communication Threads
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {DEMO_PREAUTH_THREADS.map(thread => (
                    <div key={thread.claimNo} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{thread.claimNo}</span>
                          <span className="font-medium text-sm">{thread.patient}</span>
                          <span className="text-xs text-muted-foreground">— {thread.insurer}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${statusColor(thread.status)}`}>
                            {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
                          </Badge>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                            setCompose({ to: '', subject: `Re: Pre-Auth — ${thread.claimNo} — ${thread.patient}`, body: '', template: '' });
                            setShowCompose(true);
                          }}>
                            <Reply className="h-3 w-3 mr-1" /> Reply
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                        {thread.messages.map((msg, i) => (
                          <div key={i} className={`flex items-start gap-2 text-xs ${msg.dir === 'out' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold ${
                              msg.dir === 'out' ? 'bg-indigo-500' : 'bg-slate-500'
                            }`}>
                              {msg.dir === 'out' ? 'H' : 'I'}
                            </div>
                            <div className={`rounded-lg px-3 py-2 max-w-md ${
                              msg.dir === 'out'
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-right'
                                : (msg as any).highlight
                                  ? 'bg-amber-50 border border-amber-200 dark:bg-amber-900/20 font-medium'
                                  : 'bg-slate-50 dark:bg-slate-800'
                            }`}>
                              <p className="leading-snug">{msg.subject}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(msg.date).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payment Auto-Capture ───────────────────────────────────── */}
          <TabsContent value="capture" className="mt-4 space-y-4">
            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
              <CardContent className="p-4 flex items-start gap-3">
                <Zap className="h-8 w-8 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-purple-800 dark:text-purple-300">Automatic Payment Capture is Active</p>
                  <p className="text-sm text-purple-700 dark:text-purple-400 mt-0.5">
                    The system scans incoming emails for NEFT/RTGS payment advice patterns, auto-extracts UTR numbers and amounts,
                    and links them to open claims in the reconciliation register.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-green-600" />
                  Auto-Captured Payment Advices — {captures.length} entries
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Source Email</th>
                      <th className="py-3 px-4 text-left font-medium">UTR Number</th>
                      <th className="py-3 px-4 text-right font-medium">Amount</th>
                      <th className="py-3 px-4 text-left font-medium">Insurer</th>
                      <th className="py-3 px-4 text-left font-medium">Date</th>
                      <th className="py-3 px-4 text-left font-medium">Claims Linked</th>
                      <th className="py-3 px-4 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {captures.map((row: any, i: number) => {
                      const utr     = row.utr;
                      const amount  = row.paymentAmount || row.amount;
                      const insurer = row.insurerName  || row.insurer || row.fromOrg;
                      const date    = row.paymentDate  || row.date || row.receivedAt;
                      const claims  = Array.isArray(row.claimNumbers) ? row.claimNumbers.join(', ') : (row.claims || row.claimRef || '—');
                      const emailId = row.emailId || row.id;
                      return (
                      <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-4 font-mono text-xs text-indigo-600 cursor-pointer hover:underline"
                          onClick={() => { const e = emails.find((em:any)=>em.id===emailId); if(e){setSelected(e);setActiveTab('inbox');} }}
                        >{emailId}</td>
                        <td className="py-2 px-4 font-mono text-xs">{utr}</td>
                        <td className="py-2 px-4 text-right font-semibold text-green-700">{amount ? inr(amount) : '—'}</td>
                        <td className="py-2 px-4">{insurer || '—'}</td>
                        <td className="py-2 px-4">{date ? new Date(date).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="py-2 px-4 font-mono text-xs">{claims}</td>
                        <td className="py-2 px-4">
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            <Link2 className="h-3 w-3 mr-1" />Linked
                          </Badge>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Capture Rules */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Auto-Capture Rules</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {[
                    { rule: 'Extract UTR from NEFT/RTGS payment advice emails',          active: true  },
                    { rule: 'Match UTR to open claims in reconciliation register',        active: true  },
                    { rule: 'Update Pre-Auth status on approval/rejection email receipt', active: true  },
                    { rule: 'Auto-reply acknowledgement on payment receipt',              active: false },
                    { rule: 'Flag repudiation notices for appeal within SLA period',     active: true  },
                    { rule: 'Extract NME/TDS/Disallowance from payment advice body',     active: true  },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span className={r.active ? '' : 'text-muted-foreground'}>{r.rule}</span>
                      <Badge className={r.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                        {r.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Templates ─────────────────────────────────────────────── */}
          <TabsContent value="templates" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Email Templates for TPA Communication</h3>
              <Button size="sm" variant="outline" className="text-xs h-8">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Template
              </Button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {DEMO_TEMPLATES.map(t => (
                <Card key={t.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{t.subject}</p>
                        <Badge className={`mt-2 text-[10px] px-2 py-0.5 ${
                          t.category === 'pre-auth'  ? 'bg-blue-100 text-blue-700'   :
                          t.category === 'payment'   ? 'bg-green-100 text-green-700' :
                          t.category === 'escalation'? 'bg-red-100 text-red-700'     : 'bg-slate-100 text-slate-600'
                        }`}>{t.category}</Badge>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                          applyTemplate(t.id);
                          setShowCompose(true);
                        }}>
                          <Send className="h-3 w-3 mr-1" /> Use
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"><Eye className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── SMTP / IMAP Config ─────────────────────────────────────── */}
          <TabsContent value="smtp" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4" /> SMTP &amp; IMAP Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Provider picker */}
                <div>
                  <Label className="text-sm mb-2 block">Email Provider</Label>
                  <div className="flex flex-wrap gap-2">
                    {providerKeys.map(key => {
                      const p = EMAIL_PROVIDERS[key];
                      return (
                        <button
                          key={key}
                          onClick={() => setSmtpConfig(c => ({
                            ...c,
                            provider: key,
                            smtpHost: p.smtpHost,
                            smtpPort: String(p.port),
                            imapHost: p.imapHost,
                            imapPort: String(p.imapPort),
                            encryption: p.enc,
                          }))}
                          className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                            smtpConfig.provider === key
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-medium dark:bg-indigo-900/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200'
                          }`}
                        >
                          <span>{p.icon}</span> {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* SMTP */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm flex items-center gap-2"><Send className="h-4 w-4 text-indigo-500" /> Outgoing (SMTP)</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">SMTP Host</Label>
                        <Input value={smtpConfig.smtpHost} onChange={e=>setSmtpConfig(c=>({...c,smtpHost:e.target.value}))} className="h-8 text-sm font-mono" />
                      </div>
                      <div>
                        <Label className="text-xs">Port</Label>
                        <Input value={smtpConfig.smtpPort} onChange={e=>setSmtpConfig(c=>({...c,smtpPort:e.target.value}))} className="h-8 text-sm font-mono" />
                      </div>
                    </div>
                  </div>

                  {/* IMAP */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm flex items-center gap-2"><Inbox className="h-4 w-4 text-green-500" /> Incoming (IMAP)</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">IMAP Host</Label>
                        <Input value={smtpConfig.imapHost} onChange={e=>setSmtpConfig(c=>({...c,imapHost:e.target.value}))} className="h-8 text-sm font-mono" />
                      </div>
                      <div>
                        <Label className="text-xs">Port</Label>
                        <Input value={smtpConfig.imapPort} onChange={e=>setSmtpConfig(c=>({...c,imapPort:e.target.value}))} className="h-8 text-sm font-mono" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Credentials */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Insurance Desk Email</Label>
                    <Input
                      type="email"
                      placeholder="insurance@yourhospital.com"
                      value={smtpConfig.email}
                      onChange={e=>setSmtpConfig(c=>({...c,email:e.target.value}))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Password / App Password</Label>
                    <Input
                      type="password"
                      placeholder="••••••••••••"
                      value={smtpConfig.password}
                      onChange={e=>setSmtpConfig(c=>({...c,password:e.target.value}))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Display Name (From Name)</Label>
                    <Input
                      placeholder="Insurance Desk — Mediczy Hospital"
                      value={smtpConfig.fromName}
                      onChange={e=>setSmtpConfig(c=>({...c,fromName:e.target.value}))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Encryption</Label>
                    <Select value={smtpConfig.encryption} onValueChange={v=>setSmtpConfig(c=>({...c,encryption:v}))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SSL">SSL</SelectItem>
                        <SelectItem value="TLS">STARTTLS/TLS</SelectItem>
                        <SelectItem value="None">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Auto-features */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-purple-500" /> Automation Settings</h4>
                  {[
                    { key: 'autoCapture',       label: 'Auto-capture payment UTR from incoming emails',         desc: 'Scans NEFT/RTGS payment advice emails and extracts UTR + amount automatically' },
                    { key: 'autoLinkPayments',  label: 'Auto-link captured payments to claims',                desc: 'Matches UTR with open claims and updates reconciliation status' },
                    { key: 'notifyPreAuth',     label: 'Update Pre-Auth status from insurer emails',           desc: 'Detects approval / rejection / query from email content and updates claim status' },
                  ].map(item => (
                    <div key={item.key} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={smtpConfig[item.key as keyof typeof smtpConfig] as boolean}
                        onCheckedChange={v => setSmtpConfig(c=>({...c,[item.key]:v}))}
                      />
                    </div>
                  ))}
                </div>

                {/* Test + Save */}
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={handleTest} disabled={testing} className="min-w-[140px]">
                    {testing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
                    {testing ? 'Testing…' : 'Test Connection'}
                  </Button>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => toast.success('SMTP/IMAP settings saved')}>
                    Save Configuration
                  </Button>
                  {testResult && (
                    <div className={`flex items-center gap-1.5 text-sm ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {testResult.msg}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Provider guide */}
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" /> Indian Provider Quick Reference</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left">Provider</th>
                      <th className="py-2 px-3 text-left">SMTP Host</th>
                      <th className="py-2 px-3 text-left">SMTP Port</th>
                      <th className="py-2 px-3 text-left">IMAP Host</th>
                      <th className="py-2 px-3 text-left">Encryption</th>
                      <th className="py-2 px-3 text-left">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Zoho Pro Mail', smtp: 'smtppro.zoho.in', port: '465', imap: 'imappro.zoho.in', enc: 'SSL', note: 'Recommended for hospitals' },
                      { name: 'Zoho Mail',     smtp: 'smtp.zoho.com',   port: '587', imap: 'imap.zoho.com',  enc: 'TLS', note: 'Free / paid zoho accounts' },
                      { name: 'Gmail',         smtp: 'smtp.gmail.com',  port: '587', imap: 'imap.gmail.com', enc: 'TLS', note: 'Enable 2FA + App Password' },
                      { name: 'Outlook 365',   smtp: 'smtp.office365.com', port: '587', imap: 'outlook.office365.com', enc: 'TLS', note: 'Use App Password' },
                      { name: 'Rediffmail',    smtp: 'smtp.rediffmail.com', port: '587', imap: 'imap.rediffmail.com', enc: 'TLS', note: 'For legacy setups' },
                    ].map((r,i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1.5 px-3 font-medium">{r.name}</td>
                        <td className="py-1.5 px-3 font-mono">{r.smtp}</td>
                        <td className="py-1.5 px-3 font-mono">{r.port}</td>
                        <td className="py-1.5 px-3 font-mono">{r.imap}</td>
                        <td className="py-1.5 px-3">{r.enc}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Compose Dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Compose Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Template</Label>
                <Select value={compose.template} onValueChange={applyTemplate}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optional template…" /></SelectTrigger>
                  <SelectContent>
                    {DEMO_TEMPLATES.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                placeholder="claims@insurer.com"
                value={compose.to}
                onChange={e=>setCompose(c=>({...c,to:e.target.value}))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subject</Label>
              <Input
                placeholder="Subject…"
                value={compose.subject}
                onChange={e=>setCompose(c=>({...c,subject:e.target.value}))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body</Label>
              <Textarea
                placeholder="Type your message here…"
                rows={10}
                value={compose.body}
                onChange={e=>setCompose(c=>({...c,body:e.target.value}))}
                className="text-sm font-mono resize-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Paperclip className="h-3.5 w-3.5 mr-1" /> Attach
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCompose(false)}>Cancel</Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSend}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Send
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </InsurancePortalLayout>
  );
};

export default InsuranceEmailInboxPage;

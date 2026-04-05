import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useSearchParams, useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Plus, CheckCircle2, ArrowRight, Search, ChevronRight,
  User, FileText, Upload, AlertCircle, Clock, ArrowUpRight,
  RefreshCw, TrendingUp, XCircle, ChevronDown, Download
} from 'lucide-react';

const STEPS = ['Patient & Policy', 'Clinical Details', 'Cost Estimate', 'Documents & Submit'];

// ─── All IRDAI-registered TPAs ────────────────────────────────────────────────
const TPA_REGISTRY: Record<string, {
  name: string;
  portal: string;
  portalLabel: string;
  authRefLabel: string;
  authRefPlaceholder: string;
  extraFields?: { key: string; label: string; placeholder: string }[];
  insurers: string[];
  govtScheme?: boolean;
}> = {
  medi_assist:        { name: 'Medi Assist India TPA',             portal: 'https://macs.mediassist.in',       portalLabel: 'MACS Portal',            authRefLabel: 'MACS Auth/Ref ID',       authRefPlaceholder: 'MA-XXXXXXXX',               extraFields: [{ key: 'providerCode', label: 'Provider Code (Medi Assist)', placeholder: 'HOSP-XXXX' }],                         insurers: ['star_health','care_health','niva_bupa','bajaj_allianz','icici_lombard','sbi_general'] },
  health_india:       { name: 'Health India TPA Services',         portal: 'https://healthindiatpa.com',        portalLabel: 'HITPA Portal',            authRefLabel: 'Claim Intimation No.',  authRefPlaceholder: 'HI-YYYYMMDD-XXXX',          extraFields: [], insurers: ['new_india','united_india','oriental'] },
  vidal_health:       { name: 'Vidal Health TPA',                  portal: 'https://vidalhealth.in',            portalLabel: 'Vidal Portal',            authRefLabel: 'Auth Reference No.',    authRefPlaceholder: 'VH-XXXXXXXX',               extraFields: [{ key: 'eAuthNo', label: 'e-Auth Number (Vidal)', placeholder: 'EA-XXXXXXXX' }],                               insurers: ['care_health','future_generali','iffco_tokio'] },
  paramount:          { name: 'Paramount Health Services TPA',     portal: 'https://paramounttpa.com',          portalLabel: 'Paramount Portal',        authRefLabel: 'PHS Auth No.',          authRefPlaceholder: 'PHS-XXXXXXXX',              extraFields: [], insurers: ['hdfc_ergo','reliance','royal_sundaram'] },
  raksha:             { name: 'Raksha Health Insurance TPA',        portal: 'https://rakshatpa.com',             portalLabel: 'Raksha Portal',           authRefLabel: 'Raksha Ref. No.',       authRefPlaceholder: 'RH-XXXXXXXX',               extraFields: [], insurers: ['star_health','tata_aig'] },
  fhpl:               { name: 'Family Health Plan (TPA) Ltd',      portal: 'https://fhpl.net.in',               portalLabel: 'FHPL Portal',             authRefLabel: 'FHPL Auth Code',        authRefPlaceholder: 'FHPL-XXXXXXXX',             extraFields: [{ key: 'fhplMemberId', label: 'FHPL Member ID', placeholder: 'FHPL-MID-XXXX' }],                             insurers: ['icici_lombard','cholamandalam','liberty'] },
  safeway:            { name: 'Safeway Insurance TPA',              portal: 'https://safewaytpa.in',             portalLabel: 'Safeway Portal',          authRefLabel: 'Safeway Ref. No.',      authRefPlaceholder: 'SW-XXXXXXXX',               extraFields: [], insurers: ['new_india','national'] },
  medsave:            { name: 'Medsave Health Insurance TPA',       portal: 'https://medsaveindia.com',          portalLabel: 'Medsave Portal',          authRefLabel: 'Medsave Auth ID',       authRefPlaceholder: 'MS-XXXXXXXX',               extraFields: [], insurers: ['national','united_india','tata_aig'] },
  ttk:                { name: 'TTK Healthcare TPA',                 portal: 'https://ttkhealthcare.com',         portalLabel: 'TTK Portal',              authRefLabel: 'TTK Pre-Auth No.',      authRefPlaceholder: 'TTK-XXXXXXXX',              extraFields: [{ key: 'ttkMemberId', label: 'TTK Member ID', placeholder: 'TTK-EM-XXXX' }],                               insurers: ['bajaj_allianz','aditya_birla','manipal_cigna'] },
  east_west:          { name: 'East West Assist TPA',               portal: 'https://eastwestassist.com',        portalLabel: 'EWA Portal',              authRefLabel: 'EWA Auth Code',         authRefPlaceholder: 'EWA-XXXXXXXX',              extraFields: [], insurers: ['oriental','united_india'] },
  heritage:           { name: 'Heritage Health TPA',                portal: 'https://heritagethpa.com',          portalLabel: 'Heritage Portal',         authRefLabel: 'Heritage Auth No.',     authRefPlaceholder: 'HH-XXXXXXXX',               extraFields: [], insurers: ['star_health','niva_bupa','care_health'] },
  dedicated:          { name: 'Dedicated Healthcare Services TPA',  portal: 'https://dedicatedhealthcare.com',   portalLabel: 'DHS Portal',              authRefLabel: 'DHS Pre-Auth No.',      authRefPlaceholder: 'DHS-XXXXXXXX',              extraFields: [], insurers: ['icici_lombard','reliance'] },
  ericson:            { name: 'Ericson Insurance TPA Services',     portal: 'https://ericsoninsurance.com',      portalLabel: 'Ericson Portal',          authRefLabel: 'Ericson Auth ID',       authRefPlaceholder: 'ERI-XXXXXXXX',              extraFields: [], insurers: ['manipal_cigna','go_digit'] },
  good_health:        { name: 'Good Health TPA Services',           portal: 'https://goodhealthtpa.com',         portalLabel: 'Good Health Portal',      authRefLabel: 'Good Health Auth No.',  authRefPlaceholder: 'GH-XXXXXXXX',               extraFields: [], insurers: ['hdfc_ergo','reliance'] },
  alankit:            { name: 'Alankit Assignments Ltd (TPA)',      portal: 'https://alankit.com',               portalLabel: 'Alankit Portal',          authRefLabel: 'Alankit Ref. No.',      authRefPlaceholder: 'AL-XXXXXXXX',               extraFields: [{ key: 'cghs_id', label: 'CGHS Beneficiary ID', placeholder: 'CGHS-XXXXXXXX' }],   govtScheme: true, insurers: ['cghs','esic'] },
  md_india:           { name: 'MD India Health Insurance TPA',      portal: 'https://mdindia.co.in',             portalLabel: 'MD India Portal',         authRefLabel: 'MD India Auth No.',     authRefPlaceholder: 'MDI-XXXXXXXX',              extraFields: [], insurers: ['niva_bupa','aditya_birla','go_digit'] },
};

const INSURER_LIST = [
  // Private Health Insurers
  { value: 'star_health',     label: 'Star Health & Allied Insurance', category: 'Private' },
  { value: 'care_health',     label: 'Care Health Insurance',           category: 'Private' },
  { value: 'niva_bupa',       label: 'Niva Bupa Health Insurance',      category: 'Private' },
  { value: 'hdfc_ergo',       label: 'HDFC ERGO General Insurance',     category: 'Private' },
  { value: 'icici_lombard',   label: 'ICICI Lombard General Insurance', category: 'Private' },
  { value: 'bajaj_allianz',   label: 'Bajaj Allianz General Insurance', category: 'Private' },
  { value: 'tata_aig',        label: 'Tata AIG General Insurance',      category: 'Private' },
  { value: 'sbi_general',     label: 'SBI General Insurance',           category: 'Private' },
  { value: 'reliance',        label: 'Reliance General Insurance',      category: 'Private' },
  { value: 'aditya_birla',    label: 'Aditya Birla Health Insurance',   category: 'Private' },
  { value: 'manipal_cigna',   label: 'Manipal Cigna Health Insurance',  category: 'Private' },
  { value: 'iffco_tokio',     label: 'IFFCO Tokio General Insurance',   category: 'Private' },
  { value: 'future_generali', label: 'Future Generali India Insurance', category: 'Private' },
  { value: 'go_digit',        label: 'Go Digit General Insurance',      category: 'Private' },
  { value: 'acko',            label: 'Acko General Insurance',          category: 'Private' },
  { value: 'royal_sundaram',  label: 'Royal Sundaram General Insurance',category: 'Private' },
  { value: 'liberty',         label: 'Liberty General Insurance',       category: 'Private' },
  { value: 'cholamandalam',   label: 'Cholamandalam MS General Ins.',   category: 'Private' },
  { value: 'kotak',           label: 'Kotak Mahindra General Insurance',category: 'Private' },
  { value: 'magma',           label: 'Magma HDI General Insurance',     category: 'Private' },
  // PSU Insurers
  { value: 'new_india',       label: 'The New India Assurance',         category: 'PSU' },
  { value: 'united_india',    label: 'United India Insurance',          category: 'PSU' },
  { value: 'oriental',        label: 'Oriental Insurance Company',      category: 'PSU' },
  { value: 'national',        label: 'National Insurance Company',      category: 'PSU' },
  // Government Schemes
  { value: 'cghs',            label: 'CGHS (Central Govt Health Scheme)', category: 'Govt Scheme' },
  { value: 'esic',            label: 'ESIC (Employees State Insurance)',   category: 'Govt Scheme' },
  { value: 'pmjay',           label: "PM-JAY / Ayushman Bharat",          category: 'Govt Scheme' },
  { value: 'echs',            label: 'ECHS (Ex-Servicemen Contributory)', category: 'Govt Scheme' },
  { value: 'state_scheme',    label: 'State Government Health Scheme',    category: 'Govt Scheme' },
];

// Auto-suggest TPA based on selected insurer
const INSURER_DEFAULT_TPA: Record<string, string> = {
  star_health: 'medi_assist', care_health: 'medi_assist', niva_bupa: 'medi_assist',
  new_india: 'health_india', united_india: 'health_india', oriental: 'east_west',
  hdfc_ergo: 'paramount', icici_lombard: 'fhpl', bajaj_allianz: 'ttk',
  tata_aig: 'ttk', sbi_general: 'medi_assist', national: 'safeway',
  aditya_birla: 'ttk', manipal_cigna: 'ttk', future_generali: 'vidal_health',
  reliance: 'paramount', go_digit: 'md_india', cghs: 'alankit', esic: 'alankit',
};

const icdCodes = [
  { code: 'J44.1', desc: 'COPD with acute exacerbation' },
  { code: 'I21.0', desc: 'Acute ST elevation MI, anterior wall' },
  { code: 'I21.1', desc: 'Acute ST elevation MI, inferior wall' },
  { code: 'I25.1', desc: 'Atherosclerotic heart disease' },
  { code: 'K35.8', desc: 'Acute appendicitis, other' },
  { code: 'K80.2', desc: 'Calculus of gallbladder, acute cholecystitis' },
  { code: 'S82.0', desc: 'Fracture of patella' },
  { code: 'N20.0', desc: 'Calculus of kidney' },
  { code: 'C34.1', desc: 'Malignant neoplasm, upper lobe bronchus' },
  { code: 'G43.3', desc: 'Complicated migraine' },
  { code: 'M17.1', desc: 'Primary osteoarthritis of knee' },
  { code: 'E11.9', desc: 'Type 2 diabetes, without complication' },
];

const procedureCodes = [
  { code: 'CABG', desc: 'Coronary artery bypass grafting' },
  { code: 'PTCA', desc: 'Percutaneous coronary intervention' },
  { code: 'APPY', desc: 'Appendectomy' },
  { code: 'CHOL', desc: 'Laparoscopic cholecystectomy' },
  { code: 'TKR', desc: 'Total knee replacement' },
  { code: 'URS', desc: 'Ureteroscopy & stone removal' },
  { code: 'HYST', desc: 'Hysterectomy' },
  { code: 'CRANI', desc: 'Craniotomy' },
  { code: 'DIALYSIS', desc: 'Hemodialysis session' },
  { code: 'CHEMO', desc: 'Chemotherapy infusion' },
];

const docChecklist = [
  { id: 'consent', label: 'Patient Consent Form', required: true },
  { id: 'id_proof', label: 'Patient ID Proof (Aadhaar/PAN)', required: true },
  { id: 'policy_card', label: 'Insurance Policy Card / E-card', required: true },
  { id: 'referral', label: 'Doctor Referral / Treating Physician Letter', required: true },
  { id: 'investigation', label: 'Investigation Reports (Lab / Imaging)', required: false },
  { id: 'previous_records', label: 'Previous Medical Records (if any)', required: false },
  { id: 'discharge_summary', label: 'Previous Discharge Summary', required: false },
];

const DEMO_PRE_AUTHS = [
  { id: 'PA-2026-0001', preAuthNumber: 'PA-2026-0001', patientName: 'Ramesh Kumar', memberName: 'Ramesh Kumar', policyNumber: 'SH-2024-789123', insurer: 'Star Health', tpa: 'Medi Assist', procedure: 'Laparoscopic Appendectomy', procedureCode: 'APPY', diagnosis: 'Acute Appendicitis', icdCode: 'K35.8', estimatedAmount: 95000, approvedAmount: 90000, requestedDate: '2026-04-01', expiryDate: '2026-04-15', status: 'approved', ward: 'General', admissionType: 'emergency', doctorName: 'Dr. Arjun Mehta', authRef: 'MA-APP-20260401-001' },
  { id: 'PA-2026-0002', preAuthNumber: 'PA-2026-0002', patientName: 'Sunita Sharma', memberName: 'Sunita Sharma', policyNumber: 'HDFC-2023-456789', insurer: 'HDFC Ergo', tpa: 'Paramount', procedure: 'PTCA - Angioplasty', procedureCode: 'PTCA', diagnosis: 'Coronary Artery Disease', icdCode: 'I25.1', estimatedAmount: 320000, approvedAmount: null, requestedDate: '2026-04-02', expiryDate: null, status: 'pending', ward: 'ICU', admissionType: 'emergency', doctorName: 'Dr. Vikram Nair', authRef: null },
  { id: 'PA-2026-0003', preAuthNumber: 'PA-2026-0003', patientName: 'Amit Verma', memberName: 'Amit Verma', policyNumber: 'ICICI-2024-321654', insurer: 'ICICI Lombard', tpa: 'FHPL', procedure: 'Laparoscopic Cholecystectomy', procedureCode: 'CHOL', diagnosis: 'Cholecystitis', icdCode: 'K80.2', estimatedAmount: 85000, approvedAmount: null, requestedDate: '2026-04-01', expiryDate: null, status: 'query', ward: 'Private', admissionType: 'planned', doctorName: 'Dr. Priya Desai', authRef: null, queryText: 'Please provide previous USG reports and duration of symptoms.' },
  { id: 'PA-2026-0004', preAuthNumber: 'PA-2026-0004', patientName: 'Meera Devi', memberName: 'Meera Devi', policyNumber: 'CARE-2024-112233', insurer: 'Care Health', tpa: 'Medi Assist', procedure: 'Total Knee Replacement', procedureCode: 'TKR', diagnosis: 'Knee Osteoarthritis', icdCode: 'M17.1', estimatedAmount: 260000, approvedAmount: 250000, requestedDate: '2026-03-28', expiryDate: '2026-04-10', status: 'approved', ward: 'Private', admissionType: 'planned', doctorName: 'Dr. Sandeep Rao', authRef: 'MA-TKR-20260328-002' },
  { id: 'PA-2026-0005', preAuthNumber: 'PA-2026-0005', patientName: 'Vijay Rao', memberName: 'Vijay Rao', policyNumber: 'HDFC-2022-334455', insurer: 'HDFC Ergo', tpa: 'Paramount', procedure: 'CABG - Triple Vessel', procedureCode: 'CABG', diagnosis: 'Coronary Artery Disease - Triple Vessel', icdCode: 'I25.1', estimatedAmount: 580000, approvedAmount: null, requestedDate: '2026-03-20', expiryDate: null, status: 'pending', ward: 'ICU', admissionType: 'emergency', doctorName: 'Dr. Vikram Nair', authRef: null },
  { id: 'PA-2026-0006', preAuthNumber: 'PA-2026-0006', patientName: 'Anita Gupta', memberName: 'Anita Gupta', policyNumber: 'NIV-2023-667788', insurer: 'Niva Bupa', tpa: 'Medi Assist', procedure: 'Hysterectomy', procedureCode: 'HYST', diagnosis: 'Uterine Fibroid', icdCode: 'D25.9', estimatedAmount: 130000, approvedAmount: null, requestedDate: '2026-04-03', expiryDate: null, status: 'rejected', rejectionReason: 'Pre-existing condition not covered under policy terms.', ward: 'Private', admissionType: 'planned', doctorName: 'Dr. Neha Singh', authRef: null },
];

const formatLabelFromValue = (value?: string | null) => {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getInsurerLabel = (value?: string | null) => {
  if (!value) return '';
  return INSURER_LIST.find((insurer) => insurer.value === value)?.label || value;
};

const findInsurerValue = (value?: string | null) => {
  if (!value) return '';
  const normalized = value.trim().toLowerCase();
  const match = INSURER_LIST.find((insurer) => {
    const label = insurer.label.toLowerCase();
    const insurerValue = insurer.value.toLowerCase();
    return insurerValue === normalized || label === normalized || label.includes(normalized) || normalized.includes(label);
  });
  return match?.value || '';
};

const normalizeSearchResults = (payload: any) => {
  const items = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.patients)
    ? payload.patients
    : [];

  return items
    .map((item: any) => {
      const patient = item?.patient || item;
      return {
        ...patient,
        id: patient?.id ?? item?.patientId ?? item?.id,
        firstName: patient?.firstName || item?.firstName || '',
        lastName: patient?.lastName || item?.lastName || '',
        phoneNumber: patient?.phoneNumber || item?.phoneNumber || '',
        abhaId: patient?.abhaId || item?.abhaId || '',
        policyNumber: item?.policyNumber || patient?.policyNumber || '',
        insurerName: item?.insurerName || item?.insuranceProvider || '',
      };
    })
    .filter((item: any) => item.id);
};

const normalizePreAuthRecord = (record: any) => {
  const admissionDetails = record?.admissionDetails || {};
  const plannedProcedure = Array.isArray(record?.plannedProcedures)
    ? record.plannedProcedures[0] || {}
    : record?.plannedProcedures || {};
  const patientName = record?.patientName
    || record?.memberName
    || [record?.patient?.firstName, record?.patient?.lastName].filter(Boolean).join(' ').trim();
  const insurer = record?.insurer
    || record?.provider
    || record?.insuranceProvider?.name
    || admissionDetails?.insurerName
    || getInsurerLabel(admissionDetails?.insurerCode)
    || (record?.insuranceProviderId ? String(record.insuranceProviderId) : '');
  const tpa = record?.tpa
    || admissionDetails?.tpaName
    || formatLabelFromValue(admissionDetails?.tpaCode);
  const estimatedAmount = Number(record?.estimatedAmount ?? record?.estimatedCost ?? record?.amount ?? 0);
  const approvedAmount = record?.approvedAmount == null ? null : Number(record.approvedAmount);

  return {
    ...record,
    patientName: patientName || '—',
    memberName: record?.memberName || patientName || '—',
    policyNumber: record?.policyNumber || admissionDetails?.policyNumber || '',
    insurer: insurer || '—',
    tpa: tpa || '',
    procedure: record?.procedure
      || plannedProcedure?.description
      || plannedProcedure?.procedure
      || admissionDetails?.procedure
      || admissionDetails?.proposedTreatment
      || '',
    procedureCode: record?.procedureCode || plannedProcedure?.code || admissionDetails?.procedureCode || '',
    diagnosis: record?.diagnosis || admissionDetails?.diagnosis || plannedProcedure?.diagnosis || '',
    icdCode: record?.icdCode || admissionDetails?.icdCode || plannedProcedure?.icdCode || '',
    estimatedAmount,
    estimatedCost: estimatedAmount,
    approvedAmount,
  };
};

const InsurancePreAuthPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const base = `/hospital/${slug || localStorage.getItem('hospitalInsuranceSlug') || 'hospital'}/insurance`;
  const { toast } = useToast();
  const statusFilter = searchParams.get('status') || 'pending';
  const isNewMode = location.pathname.endsWith('/new');

  const [preAuths, setPreAuths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardStep, setWizardStep] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [icdSearch, setIcdSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
  const [showEnhancement, setShowEnhancement] = useState(false);
  const [showExtension, setShowExtension] = useState(false);
  const [selectedPreAuth, setSelectedPreAuth] = useState<any>(null);
  const [submittedPreAuth, setSubmittedPreAuth] = useState<any>(null);

  // Pre-auth form
  const [form, setForm] = useState({
    memberId: '', memberName: '', policyNumber: '',
    insurer: '', tpa: '', sumInsured: '', ward: '',
    procedure: '', procedureCode: '', plannedDate: '',
    diagnosis: '', icdCode: '', admissionType: 'planned',
    proposedTreatment: '', surgicalManagement: '', doctorName: '',
    estimatedDays: '', clinicalJustification: '',
    roomType: 'private', roomRatePerDay: '', icuDays: '', icuRate: '',
    procedureCost: '', medicinesCost: '', diagnosticsCost: '',
    // TPA-specific fields
    tpaAuthRef: '', providerCode: '', eAuthNo: '', fhplMemberId: '',
    ttkMemberId: '', cghs_id: '', govtBeneficiaryId: '', stateSchemeCardNo: '',
  });

  const selectedTPA = form.tpa && form.tpa !== 'direct' ? TPA_REGISTRY[form.tpa] : null;
  const isGovtScheme = ['cghs', 'esic', 'pmjay', 'echs', 'state_scheme'].includes(form.insurer);
  const insurersByCategory = INSURER_LIST.reduce((acc: Record<string, typeof INSURER_LIST>, ins) => {
    (acc[ins.category] = acc[ins.category] || []).push(ins);
    return acc;
  }, {});

  const estimatedTotal = () => {
    const days = parseInt(form.estimatedDays) || 0;
    const icuDays = parseInt(form.icuDays) || 0;
    const room = (parseFloat(form.roomRatePerDay) || 0) * days;
    const icu = (parseFloat(form.icuRate) || 0) * icuDays;
    const proc = parseFloat(form.procedureCost) || 0;
    const meds = parseFloat(form.medicinesCost) || 0;
    const diag = parseFloat(form.diagnosticsCost) || 0;
    return room + icu + proc + meds + diag;
  };

  useEffect(() => {
    if (!isNewMode) fetchPreAuths();
  }, [statusFilter, isNewMode]);

  const fetchPreAuths = async () => {
    setLoading(true);
    try {
      const endpoint = statusFilter === 'approved'
        ? '/hospital/insurance/pre-auth/approved'
        : statusFilter === 'rejected'
        ? '/hospital/insurance/pre-auth/rejected'
        : '/hospital/insurance/pre-auth/pending';
      const { data } = await api.get(endpoint);
      if (data.success) {
        const records = data.preAuths || data.data || [];
        setPreAuths(records.map(normalizePreAuthRecord));
      }
    } catch {
      const filtered = statusFilter === 'approved'
        ? DEMO_PRE_AUTHS.filter(p => p.status === 'approved')
        : statusFilter === 'rejected'
        ? DEMO_PRE_AUTHS.filter(p => p.status === 'rejected')
        : DEMO_PRE_AUTHS.filter(p => p.status === 'pending' || p.status === 'query');
      const fallback = filtered.length > 0 ? filtered : DEMO_PRE_AUTHS;
      setPreAuths(fallback.map(normalizePreAuthRecord));
    }
    finally { setLoading(false); }
  };

  const handleSearchMember = async () => {
    if (!searchTerm.trim()) return;
    try {
      const prioritizedSearchTypes = Array.from(new Set([
        searchTerm.trim().toUpperCase().startsWith('UH-') ? 'uhid' : 'policy',
        'policy',
        'abha',
        /^\d{10}$/.test(searchTerm.trim()) ? 'mobile' : 'name',
        'name',
      ]));

      let matchedType = '';
      let matches: any[] = [];

      for (const searchType of prioritizedSearchTypes) {
        const { data } = await api.post('/hospital/insurance/patient/search', { searchTerm: searchTerm.trim(), searchType });
        const normalizedResults = normalizeSearchResults(data);
        if (data.success && normalizedResults.length > 0) {
          matches = normalizedResults;
          matchedType = searchType;
          break;
        }
      }

      if (matches.length > 0) {
        const m = matches[0];
        const insurerCode = findInsurerValue(m.insurerName);
        setSelectedMember(m);
        setForm(f => ({
          ...f,
          memberId: String(m.id),
          memberName: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
          policyNumber: m.policyNumber || (matchedType === 'policy' ? searchTerm.trim() : f.policyNumber),
          insurer: insurerCode || f.insurer,
          tpa: insurerCode ? (INSURER_DEFAULT_TPA[insurerCode] || f.tpa) : f.tpa,
        }));
        toast({ title: 'Member Found', description: `${m.firstName || 'Patient'} located.` });
      } else {
        toast({ title: 'Not Found', description: 'No member found.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Search failed', variant: 'destructive' });
    }
  };

  const handleSubmitPreAuth = async () => {
    const requiredDocs = docChecklist.filter((doc) => doc.required);
    const missingDocs = requiredDocs.filter((doc) => !uploadedDocs.has(doc.id));
    const patientId = Number(form.memberId);

    if (!patientId) {
      toast({ title: 'Patient required', description: 'Search and select a patient before submitting.', variant: 'destructive' });
      return;
    }

    if (!form.policyNumber.trim()) {
      toast({ title: 'Policy number required', description: 'Provide a valid policy number before submitting.', variant: 'destructive' });
      return;
    }

    if (missingDocs.length > 0) {
      toast({
        title: 'Required documents missing',
        description: `Attach ${missingDocs.map((doc) => doc.label).join(', ')} before submitting.`,
        variant: 'destructive'
      });
      return;
    }

    const selectedDocuments = docChecklist
      .filter((doc) => uploadedDocs.has(doc.id))
      .map((doc) => ({
        type: doc.id,
        label: doc.label,
        required: doc.required,
        status: 'attached'
      }));

    const admissionDetails = {
      admissionType: form.admissionType,
      admissionDate: form.plannedDate || null,
      expectedDuration: Number(form.estimatedDays) || null,
      ward: form.ward || null,
      roomType: form.roomType || null,
      roomRatePerDay: Number(form.roomRatePerDay) || 0,
      icuDays: Number(form.icuDays) || 0,
      icuRate: Number(form.icuRate) || 0,
      doctorName: form.doctorName || null,
      proposedTreatment: form.proposedTreatment || null,
      surgicalManagement: form.surgicalManagement || null,
      clinicalJustification: form.clinicalJustification || null,
      insurerCode: form.insurer || null,
      insurerName: getInsurerLabel(form.insurer),
      policyNumber: form.policyNumber,
      tpaCode: form.tpa || null,
      tpaName: selectedTPA?.name || (form.tpa === 'direct' ? 'Direct' : null),
      tpaAuthRef: form.tpaAuthRef || null,
      sumInsured: Number(form.sumInsured) || null,
      diagnosis: form.diagnosis || null,
      icdCode: form.icdCode || null,
      procedure: form.procedure || null,
      procedureCode: form.procedureCode || null,
      extraFields: {
        providerCode: form.providerCode || null,
        eAuthNo: form.eAuthNo || null,
        fhplMemberId: form.fhplMemberId || null,
        ttkMemberId: form.ttkMemberId || null,
        cghsId: form.cghs_id || null,
        govtBeneficiaryId: form.govtBeneficiaryId || null,
        stateSchemeCardNo: form.stateSchemeCardNo || null,
      },
    };

    try {
      const { data } = await api.post('/hospital/insurance/pre-auth/new', {
        patientId,
        policyNumber: form.policyNumber,
        estimatedAmount: estimatedTotal(),
        diagnosis: `${form.icdCode ? `${form.icdCode} - ` : ''}${form.diagnosis || form.clinicalJustification || form.procedure || 'Diagnosis not specified'}`,
        admissionDetails,
        plannedProcedures: [{
          code: form.procedureCode || null,
          description: form.procedure || null,
          diagnosis: form.diagnosis || null,
          icdCode: form.icdCode || null,
          proposedTreatment: form.proposedTreatment || null,
          surgicalManagement: form.surgicalManagement || null,
        }],
        estimatedDuration: Number(form.estimatedDays) || null,
        documents: selectedDocuments,
      });
      if (data.success) {
        setSubmittedPreAuth(normalizePreAuthRecord(data.preAuth));
        setWizardStep(4);
        toast({ title: 'Pre-Auth Submitted', description: 'Request sent to insurer for review.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Submission failed', variant: 'destructive' });
    }
  };

  const resetWizard = () => {
    setWizardStep(0); setSelectedMember(null); setUploadedDocs(new Set());
    setSubmittedPreAuth(null);
    setForm({ memberId: '', memberName: '', policyNumber: '', insurer: '', tpa: '', sumInsured: '', ward: '',
      procedure: '', procedureCode: '', plannedDate: '', diagnosis: '', icdCode: '', admissionType: 'planned',
      proposedTreatment: '', surgicalManagement: '', doctorName: '', estimatedDays: '', clinicalJustification: '',
      roomType: 'private', roomRatePerDay: '', icuDays: '', icuRate: '', procedureCost: '', medicinesCost: '', diagnosticsCost: '',
      tpaAuthRef: '', providerCode: '', eAuthNo: '', fhplMemberId: '', ttkMemberId: '', cghs_id: '', govtBeneficiaryId: '', stateSchemeCardNo: '' });
  };

  const handleGenerateTPAForm = async (preAuthId: string | number, preAuthNumber?: string) => {
    try {
      toast({ title: 'Generating TPA Form…', description: 'Please wait while the PDF is prepared.' });
      const { data } = await api.get(`/hospital/insurance/pre-auth/${preAuthId}/pdf`);
      if (data.success && data.pdfUrl) {
        const link = document.createElement('a');
        link.href = data.pdfUrl.startsWith('http') ? data.pdfUrl : `${import.meta.env.VITE_API_BASE_URL || ''}/api${data.pdfUrl}`;
        link.download = `PreAuth-Form-${preAuthNumber || preAuthId}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: 'TPA Form Ready', description: `${preAuthNumber || 'Pre-auth'} form downloaded.` });
      }
    } catch {
      toast({ title: 'Download Failed', description: 'Could not generate TPA form. Try again.', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700', query: 'bg-blue-100 text-blue-700',
      expired: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const filteredICD = icdCodes.filter(c =>
    !icdSearch || c.code.toLowerCase().includes(icdSearch.toLowerCase()) || c.desc.toLowerCase().includes(icdSearch.toLowerCase())
  );

  // ─── Wizard ─────────────────────────────────────────────────────────────────
  if (isNewMode) {
    return (
      <InsurancePortalLayout title="New Pre-Authorization" subtitle="4-step cashless admission request">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Step indicator */}
          <div className="flex items-center justify-between bg-white rounded-2xl px-5 py-4" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold transition-all`}
                    style={i < wizardStep ? {
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white', boxShadow: '0 2px 8px rgba(34,197,94,0.25)'
                    } : i === wizardStep ? {
                      background: 'linear-gradient(135deg, #6366f1, #7c3aed)', color: 'white', boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                    } : {
                      background: 'rgba(0,0,0,0.05)', color: '#94a3b8'
                    }}>
                    {i < wizardStep ? '✓' : i + 1}
                  </div>
                  <span className={`text-[12px] font-medium hidden md:block ${i <= wizardStep ? 'text-slate-700' : 'text-slate-400'}`}>{step}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300 mx-2 flex-shrink-0" />}
              </div>
            ))}
          </div>

          {/* Step 0: Patient & Policy */}
          {wizardStep === 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Patient & Policy Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Search Patient (UHID / Policy No / ABHA ID)</label>
                  <div className="flex gap-2">
                    <Input placeholder="Enter UHID / Policy no / ABHA ID" value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchMember()} className="flex-1" />
                    <Button onClick={handleSearchMember}><Search className="h-4 w-4 mr-1" />Search</Button>
                  </div>
                </div>
                {selectedMember && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="bg-green-100 rounded-full p-2"><User className="h-5 w-5 text-green-600" /></div>
                    <div>
                      <p className="font-semibold">{form.memberName}</p>
                      <p className="text-xs text-muted-foreground">Policy: {form.policyNumber}</p>
                    </div>
                    <Badge className="ml-auto bg-green-100 text-green-700">Verified</Badge>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Policy Number</label>
                    <Input placeholder="Policy number" value={form.policyNumber} onChange={e => setForm({...form, policyNumber: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Insurer / Scheme</label>
                    <Select value={form.insurer} onValueChange={v => {
                      const autoTPA = INSURER_DEFAULT_TPA[v] || '';
                      setForm({...form, insurer: v, tpa: autoTPA});
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select insurer" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(insurersByCategory).map(([cat, list]) => (
                          <div key={cat}>
                            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-slate-50">{cat}</div>
                            {list.map(i => (
                              <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      TPA
                      {form.tpa && form.tpa !== 'direct' && TPA_REGISTRY[form.tpa] && (
                        <a href={TPA_REGISTRY[form.tpa].portal} target="_blank" rel="noopener noreferrer"
                          className="ml-2 text-[10px] text-indigo-500 underline font-normal">
                          {TPA_REGISTRY[form.tpa].portalLabel} ↗
                        </a>
                      )}
                    </label>
                    <Select value={form.tpa} onValueChange={v => setForm({...form, tpa: v})}>
                      <SelectTrigger><SelectValue placeholder="Select TPA" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TPA_REGISTRY).map(([key, tpa]) => (
                          <SelectItem key={key} value={key}>
                            {tpa.name}
                            {tpa.govtScheme ? ' 🏛' : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="direct">Direct (No TPA)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Sum Insured (₹)</label>
                    <Input type="number" placeholder="500000" value={form.sumInsured} onChange={e => setForm({...form, sumInsured: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Ward / Room Preference</label>
                    <Select value={form.ward} onValueChange={v => setForm({...form, ward: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Ward</SelectItem>
                        <SelectItem value="semi_private">Semi-Private</SelectItem>
                        <SelectItem value="private">Private Room</SelectItem>
                        <SelectItem value="deluxe">Deluxe Room</SelectItem>
                        <SelectItem value="icu">ICU</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ── TPA-Specific Additional Fields ── */}
                {selectedTPA && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      {selectedTPA.name} — Specific Fields
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium block mb-1">{selectedTPA.authRefLabel} *</label>
                        <Input placeholder={selectedTPA.authRefPlaceholder} value={form.tpaAuthRef}
                          onChange={e => setForm({...form, tpaAuthRef: e.target.value})} className="text-sm" />
                      </div>
                      {selectedTPA.extraFields?.map(ef => (
                        <div key={ef.key}>
                          <label className="text-xs font-medium block mb-1">{ef.label}</label>
                          <Input placeholder={ef.placeholder}
                            value={(form as any)[ef.key] || ''}
                            onChange={e => setForm({...form, [ef.key]: e.target.value})} className="text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Govt Scheme Extra Fields ── */}
                {isGovtScheme && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-amber-700">
                      🏛 Government Scheme — Additional Details
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {form.insurer === 'cghs' && (
                        <div>
                          <label className="text-xs font-medium block mb-1">CGHS Beneficiary ID *</label>
                          <Input placeholder="CGHS-XXXXXXXX" value={form.cghs_id}
                            onChange={e => setForm({...form, cghs_id: e.target.value})} className="text-sm" />
                        </div>
                      )}
                      {form.insurer === 'esic' && (
                        <div>
                          <label className="text-xs font-medium block mb-1">ESIC Insurance No. *</label>
                          <Input placeholder="31-XX-XXXXXXXXXX-XXX-XXXX" value={form.govtBeneficiaryId}
                            onChange={e => setForm({...form, govtBeneficiaryId: e.target.value})} className="text-sm" />
                        </div>
                      )}
                      {form.insurer === 'pmjay' && (
                        <>
                          <div>
                            <label className="text-xs font-medium block mb-1">Ayushman Bharat ID *</label>
                            <Input placeholder="AB-PMJAY-XXXXXXXXXXXXXXXX" value={form.govtBeneficiaryId}
                              onChange={e => setForm({...form, govtBeneficiaryId: e.target.value})} className="text-sm" />
                          </div>
                          <div>
                            <label className="text-xs font-medium block mb-1">NHA Transaction ID</label>
                            <Input placeholder="NHA-TXN-XXXXXXXX" value={form.tpaAuthRef}
                              onChange={e => setForm({...form, tpaAuthRef: e.target.value})} className="text-sm" />
                          </div>
                        </>
                      )}
                      {form.insurer === 'echs' && (
                        <div>
                          <label className="text-xs font-medium block mb-1">ECHS Card No. *</label>
                          <Input placeholder="ECHS-XXXXXXXXXX" value={form.govtBeneficiaryId}
                            onChange={e => setForm({...form, govtBeneficiaryId: e.target.value})} className="text-sm" />
                        </div>
                      )}
                      {form.insurer === 'state_scheme' && (
                        <div>
                          <label className="text-xs font-medium block mb-1">State Card No. *</label>
                          <Input placeholder="STATE-SCHEME-XXXXXXXXXX" value={form.stateSchemeCardNo}
                            onChange={e => setForm({...form, stateSchemeCardNo: e.target.value})} className="text-sm" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button disabled={!selectedMember} onClick={() => setWizardStep(1)}>
                    Next: Clinical Details <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Clinical Details */}
          {wizardStep === 1 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Clinical Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm font-medium block mb-1">ICD-10 Diagnosis Code</label>
                    <Input placeholder="Search ICD-10 code or description..." value={icdSearch}
                      onChange={e => setIcdSearch(e.target.value)} />
                    {icdSearch && (
                      <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto bg-white shadow-lg z-10">
                        {filteredICD.map(c => (
                          <div key={c.code} className="px-3 py-2 hover:bg-indigo-50 cursor-pointer flex justify-between"
                            onClick={() => { setForm({...form, icdCode: c.code, diagnosis: c.desc}); setIcdSearch(''); }}>
                            <span className="font-mono text-sm font-bold text-indigo-600">{c.code}</span>
                            <span className="text-sm text-muted-foreground ml-2">{c.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {form.icdCode && (
                      <div className="mt-1 text-sm bg-indigo-50 rounded px-3 py-1">
                        Selected: <strong>{form.icdCode}</strong> — {form.diagnosis}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Procedure</label>
                    <Select value={form.procedureCode} onValueChange={v => {
                      const p = procedureCodes.find(x => x.code === v);
                      setForm({...form, procedureCode: v, procedure: p?.desc || v});
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select procedure" /></SelectTrigger>
                      <SelectContent>
                        {procedureCodes.map(p => (
                          <SelectItem key={p.code} value={p.code}>{p.code} – {p.desc}</SelectItem>
                        ))}
                        <SelectItem value="other">Other (specify below)</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.procedureCode === 'other' && (
                      <Input className="mt-2" placeholder="Specify procedure" value={form.procedure}
                        onChange={e => setForm({...form, procedure: e.target.value})} />
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Admission Type</label>
                    <Select value={form.admissionType} onValueChange={v => setForm({...form, admissionType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="day_care">Day Care</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Planned Admission Date</label>
                    <Input type="date" value={form.plannedDate} onChange={e => setForm({...form, plannedDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Estimated Stay (days)</label>
                    <Input type="number" placeholder="5" value={form.estimatedDays} onChange={e => setForm({...form, estimatedDays: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Treating Doctor</label>
                    <Input placeholder="Dr. Name" value={form.doctorName} onChange={e => setForm({...form, doctorName: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium block mb-1">Proposed Line of Treatment</label>
                    <Textarea rows={2} value={form.proposedTreatment} onChange={e => setForm({...form, proposedTreatment: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium block mb-1">Surgical Management Details</label>
                    <Textarea rows={2} value={form.surgicalManagement} onChange={e => setForm({...form, surgicalManagement: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium block mb-1">Clinical Justification</label>
                    <Textarea rows={2} value={form.clinicalJustification} onChange={e => setForm({...form, clinicalJustification: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setWizardStep(0)}>Back</Button>
                  <Button onClick={() => setWizardStep(2)}>Next: Cost Estimate <ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Cost Estimate */}
          {wizardStep === 2 && (
            <Card>
              <CardHeader><CardTitle>Cost Estimate (₹)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Room Type</label>
                    <Select value={form.roomType} onValueChange={v => setForm({...form, roomType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General (₹1,500/day)</SelectItem>
                        <SelectItem value="semi_private">Semi-Private (₹3,000/day)</SelectItem>
                        <SelectItem value="private">Private (₹5,000/day)</SelectItem>
                        <SelectItem value="deluxe">Deluxe (₹8,000/day)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Room Rate/Day (₹)</label>
                    <Input type="number" placeholder="5000" value={form.roomRatePerDay} onChange={e => setForm({...form, roomRatePerDay: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Expected Days</label>
                    <Input type="number" value={form.estimatedDays} onChange={e => setForm({...form, estimatedDays: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">ICU Days</label>
                    <Input type="number" placeholder="0" value={form.icuDays} onChange={e => setForm({...form, icuDays: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">ICU Rate/Day (₹)</label>
                    <Input type="number" placeholder="12000" value={form.icuRate} onChange={e => setForm({...form, icuRate: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Procedure Cost (₹)</label>
                    <Input type="number" placeholder="0" value={form.procedureCost} onChange={e => setForm({...form, procedureCost: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Medicines (₹)</label>
                    <Input type="number" placeholder="0" value={form.medicinesCost} onChange={e => setForm({...form, medicinesCost: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Diagnostics (₹)</label>
                    <Input type="number" placeholder="0" value={form.diagnosticsCost} onChange={e => setForm({...form, diagnosticsCost: e.target.value})} />
                  </div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Total</p>
                    <p className="text-3xl font-bold text-indigo-700">₹{estimatedTotal().toLocaleString('en-IN')}</p>
                  </div>
                  {form.sumInsured && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Sum Insured</p>
                      <p className="text-xl font-semibold">₹{parseInt(form.sumInsured).toLocaleString('en-IN')}</p>
                      {estimatedTotal() > parseInt(form.sumInsured) && (
                        <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                          <AlertCircle className="h-3 w-3" />Exceeds sum insured
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setWizardStep(1)}>Back</Button>
                  <Button onClick={() => setWizardStep(3)}>Next: Document Upload <ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Documents & Submit */}
          {wizardStep === 3 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Documents & Submit</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload required documents. Required docs marked with *</p>
                <div className="space-y-2">
                  {docChecklist.map(doc => (
                    <div key={doc.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                      uploadedDocs.has(doc.id) ? 'bg-green-50 border-green-200' : 'bg-white'
                    }`}>
                      <div className="flex items-center gap-3">
                        {uploadedDocs.has(doc.id)
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <div className="h-4 w-4 rounded border-2 border-gray-300" />}
                        <span className="text-sm">{doc.label}{doc.required && <span className="text-red-500 ml-0.5">*</span>}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => {
                        const n = new Set(uploadedDocs);
                        if (!n.has(doc.id)) n.add(doc.id);
                        setUploadedDocs(n);
                      }}>
                        <Upload className="h-3 w-3 mr-1" />{uploadedDocs.has(doc.id) ? 'Uploaded' : 'Upload'}
                      </Button>
                    </div>
                  ))}
                </div>
                {/* Summary card */}
                <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-semibold text-xs text-muted-foreground uppercase mb-2">Submission Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Patient</span><span className="font-medium">{form.memberName || '—'}</span>
                    <span className="text-muted-foreground">Policy</span><span className="font-medium">{form.policyNumber || '—'}</span>
                    <span className="text-muted-foreground">Insurer</span><span className="font-medium">{INSURER_LIST.find(i => i.value === form.insurer)?.label || form.insurer?.replace(/_/g, ' ') || '—'}</span>
                    <span className="text-muted-foreground">TPA</span><span className="font-medium">{selectedTPA?.name || (form.tpa === 'direct' ? 'Direct' : '—')}</span>
                    {form.tpaAuthRef && <><span className="text-muted-foreground">{selectedTPA?.authRefLabel || 'Auth Ref'}</span><span className="font-medium font-mono text-indigo-600">{form.tpaAuthRef}</span></>}
                    {form.govtBeneficiaryId && <><span className="text-muted-foreground">Beneficiary ID</span><span className="font-medium font-mono">{form.govtBeneficiaryId}</span></>}
                    <span className="text-muted-foreground">Diagnosis</span><span className="font-medium">{form.diagnosis || '—'}</span>
                    <span className="text-muted-foreground">Procedure</span><span className="font-medium">{form.procedure || '—'}</span>
                    <span className="text-muted-foreground">Est. Total</span><span className="font-bold text-indigo-600">₹{estimatedTotal().toLocaleString('en-IN')}</span>
                  </div>
                  {selectedTPA && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs text-muted-foreground">
                        Submit to TPA portal:{' '}
                        <a href={selectedTPA.portal} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-medium">
                          {selectedTPA.portalLabel} ↗
                        </a>
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setWizardStep(2)}>Back</Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={handleSubmitPreAuth}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />Submit Pre-Authorization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Confirmation */}
          {wizardStep === 4 && (
            <Card className="text-center">
              <CardContent className="py-12">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Pre-Authorization Submitted!</h3>
                {submittedPreAuth?.preAuthNumber && (
                  <p className="text-sm font-semibold text-indigo-600 mb-2">Reference: {submittedPreAuth.preAuthNumber}</p>
                )}
                <p className="text-muted-foreground mb-2">Your request has been sent to {INSURER_LIST.find(i => i.value === form.insurer)?.label || form.insurer?.replace(/_/g, ' ')}{selectedTPA ? ` via ${selectedTPA.name}` : ''} for review.</p>
                <p className="text-sm text-muted-foreground mb-6">Typical response time: 2–4 hours (emergency: 30 mins). You'll be notified via SMS & Portal.</p>
                {selectedTPA && (
                  <p className="text-xs text-indigo-600 mb-4">
                    Track at:{' '}
                    <a href={selectedTPA.portal} target="_blank" rel="noopener noreferrer" className="underline font-bold">{selectedTPA.portalLabel}</a>
                  </p>
                )}
                <div className="flex justify-center gap-3 flex-wrap">
                  <Button variant="outline" onClick={resetWizard}>New Pre-Auth</Button>
                  {submittedPreAuth?.id && (
                    <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => handleGenerateTPAForm(submittedPreAuth.id, submittedPreAuth.preAuthNumber)}>
                      <Download className="h-4 w-4 mr-1" />Download TPA Form PDF
                    </Button>
                  )}
                  <Button onClick={() => { resetWizard(); navigate(`${base}/pre-auth?status=pending`); }}>View Pending</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Enhancement Dialog */}
        <Dialog open={showEnhancement} onOpenChange={setShowEnhancement}>
          <DialogContent>
            <DialogHeader><DialogTitle>Enhancement Request</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Additional Amount Requested (₹)</label>
                <Input type="number" placeholder="50000" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Reason</label>
                <Textarea placeholder="Clinical justification for enhancement..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEnhancement(false)}>Cancel</Button>
              <Button onClick={() => { toast({ title: 'Enhancement Submitted' }); setShowEnhancement(false); }}>Submit Enhancement</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extension Dialog */}
        <Dialog open={showExtension} onOpenChange={setShowExtension}>
          <DialogContent>
            <DialogHeader><DialogTitle>Extension Request</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Additional Days</label>
                <Input type="number" placeholder="3" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Medical Justification</label>
                <Textarea placeholder="Reason for extending hospital stay..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExtension(false)}>Cancel</Button>
              <Button onClick={() => { toast({ title: 'Extension Submitted' }); setShowExtension(false); }}>Submit Extension</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </InsurancePortalLayout>
    );
  }

  // ─── List View ───────────────────────────────────────────────────────────────
  return (
    <InsurancePortalLayout title="Pre-Authorization" subtitle={`${statusFilter} pre-auth requests`}>
      <div className="space-y-4">

        {/* Page Hero */}
        <div className="rounded-2xl overflow-hidden relative" style={{ background: 'linear-gradient(130deg, #0b0f1e 0%, #1e1b4b 55%, #1e3a5f 100%)', minHeight: 108 }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-30px] left-[-20px] w-52 h-52 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
            <div className="absolute bottom-[-20px] right-10 w-40 h-40 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }} />
          </div>
          <div className="relative z-10 flex items-center justify-between px-6 py-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.3)' }}>
                  <Shield className="h-4 w-4 text-indigo-300" />
                </div>
                <h2 className="text-[17px] font-bold text-white tracking-tight">Pre-Authorization</h2>
              </div>
              <p className="text-[12px]" style={{ color: 'rgba(148,163,184,0.8)' }}>Manage cashless admission requests across all insurers</p>
            </div>
            <div className="flex items-center gap-6">
              {[
                { label: 'Pending', value: preAuths.filter(p => p.status === 'pending' || p.status === 'query').length.toString(), color: '#fcd34d' },
                { label: 'Approved', value: preAuths.filter(p => p.status === 'approved').length.toString(), color: '#6ee7b7' },
                { label: 'Rejected', value: preAuths.filter(p => p.status === 'rejected').length.toString(), color: '#fca5a5' },
              ].map((s, i) => (
                <div key={i} className="text-center hidden sm:block">
                  <div className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] font-medium mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1 p-1 rounded-xl bg-muted">
            {['pending', 'approved', 'rejected'].map((s) => (
              <button
                key={s}
                onClick={() => navigate(`${base}/pre-auth?status=${s}`)}
                className="capitalize flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={statusFilter === s ? {
                  background: 'hsl(var(--card))', color: '#4f46e5', fontWeight: 600, boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                } : { color: 'hsl(var(--muted-foreground))' }}
              >
                {s === 'pending' && <Clock className="h-3.5 w-3.5" />}
                {s === 'approved' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {s === 'rejected' && <XCircle className="h-3.5 w-3.5" />}
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate(`${base}/pre-auth/new`)}
            className="h-9 px-4 rounded-xl text-[12.5px] font-semibold flex items-center gap-1.5 text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)', boxShadow: '0 2px 10px rgba(99,102,241,0.32)' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.45)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(99,102,241,0.32)')}
          >
            <Plus className="h-3.5 w-3.5" /> New Pre-Auth
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <p className="text-muted-foreground text-[13px] col-span-3 text-center py-12">Loading...</p>
          ) : preAuths.length === 0 ? (
            <div className="col-span-3 text-center py-16">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(99,102,241,0.08)' }}>
                <Shield className="h-7 w-7 text-indigo-300" />
              </div>
              <p className="text-muted-foreground text-[13px]">No {statusFilter} pre-authorization requests</p>
            </div>
          ) : (
            preAuths.map((pa: any) => (
              <div
                key={pa.id}
                className="bg-card border border-border shadow-sm rounded-2xl p-4 space-y-3 transition-all"
                style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.09)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.15)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.06)'; }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-indigo-600">{pa.preAuthNumber || `PA-${pa.id}`}</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-600 capitalize" style={(() => {
                    const m: Record<string, {bg:string;color:string}> = {
                      approved: { bg: 'rgba(34,197,94,0.1)', color: '#15803d' },
                      rejected: { bg: 'rgba(239,68,68,0.1)', color: '#b91c1c' },
                      query: { bg: 'rgba(99,102,241,0.1)', color: '#4338ca' },
                      pending: { bg: 'rgba(245,158,11,0.1)', color: '#b45309' },
                      expired: { bg: 'rgba(100,116,139,0.1)', color: '#475569' },
                    };
                    return m[pa.status] || { bg: 'rgba(100,116,139,0.08)', color: '#64748b' };
                  })()}>
                    {pa.status}
                  </span>
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold text-foreground">{pa.patientName || '—'}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">{pa.insurer || pa.provider || '—'} {pa.tpa ? `· ${pa.tpa}` : ''}</p>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">Estimated</span>
                  <span className="font-bold text-foreground">₹{(pa.estimatedCost || pa.estimatedAmount || pa.amount || 0).toLocaleString('en-IN')}</span>
                </div>
                {pa.approvedAmount && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted-foreground">Approved</span>
                    <span className="font-bold text-green-600">₹{pa.approvedAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <p className="text-[11.5px] text-muted-foreground truncate">{pa.procedure || pa.diagnosis || '—'}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    className="flex-1 h-8 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all"
                    style={{ background: 'rgba(16,185,129,0.07)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}
                    onClick={() => handleGenerateTPAForm(pa.id, pa.preAuthNumber)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.14)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.07)')}
                  >
                    <Download className="h-3 w-3" /> TPA Form
                  </button>
                  {pa.status === 'approved' && (
                    <>
                      <button
                        className="flex-1 h-8 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all"
                        style={{ background: 'rgba(99,102,241,0.07)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.15)' }}
                        onClick={() => { setSelectedPreAuth(pa); setShowEnhancement(true); }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.13)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.07)')}
                      >
                        <TrendingUp className="h-3 w-3" /> Enhancement
                      </button>
                      <button
                        className="flex-1 h-8 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all"
                        style={{ background: 'rgba(100,116,139,0.07)', color: '#475569', border: '1px solid rgba(0,0,0,0.08)' }}
                        onClick={() => { setSelectedPreAuth(pa); setShowExtension(true); }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.13)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.07)')}
                      >
                        <RefreshCw className="h-3 w-3" /> Extension
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Enhancement Dialog */}
      <Dialog open={showEnhancement} onOpenChange={setShowEnhancement}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enhancement for {selectedPreAuth?.preAuthNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium block mb-1">Additional Amount (₹)</label><Input type="number" placeholder="50000" /></div>
            <div><label className="text-sm font-medium block mb-1">Clinical Justification</label><Textarea placeholder="Reason for enhancement..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnhancement(false)}>Cancel</Button>
            <Button onClick={() => { toast({ title: 'Enhancement Submitted' }); setShowEnhancement(false); }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExtension} onOpenChange={setShowExtension}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extension for {selectedPreAuth?.preAuthNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium block mb-1">Additional Days</label><Input type="number" placeholder="3" /></div>
            <div><label className="text-sm font-medium block mb-1">Medical Justification</label><Textarea placeholder="Reason for extending stay..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtension(false)}>Cancel</Button>
            <Button onClick={() => { toast({ title: 'Extension Submitted' }); setShowExtension(false); }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InsurancePortalLayout>
  );
};

export default InsurancePreAuthPage;

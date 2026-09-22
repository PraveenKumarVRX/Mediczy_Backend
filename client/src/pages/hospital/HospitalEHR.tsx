import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { loadHospitalStore } from '@/utils/hospitalStorage';
import { downloadReport } from '@/utils/reportActions';
import {
  patientService,
  ehrService,
  vitalSignsService,
  medicalRecordService,
  labOrderService,
  imagingOrderService,
  prescriptionService,
  procedureService,
  orderStatusService,
} from '@/services/hospital.service';
import { 
  FileHeart, Activity, Bell, Plus, Search, ArrowLeft, Edit, 
  Trash2, Eye, CheckCircle, XCircle, AlertCircle, RefreshCw,
  FileText, Download, Upload, Printer, Building2, User, 
  Calendar, Clock, History, Lock, Unlock, Heart, Thermometer,
  Droplets, Scale, Ruler, Brain, Pill, Syringe, Stethoscope,
  AlertTriangle, ClipboardList, FilePlus, FileCheck, Send,
  Image, Paperclip, MessageSquare, Share2, MoreVertical,
  ChevronRight, ChevronDown, BarChart3, LineChart, TrendingUp,
  TrendingDown, Zap, Shield, UserCog, HeartPulse, Bone, Baby,
  FileImage, Loader2
} from 'lucide-react';

// Types
interface PatientEHR {
  id: string;
  uhid: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: string;
  phone: string;
  email?: string;
  address: string;
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  allergies: string[];
  chronicConditions: string[];
  currentMedications: Medication[];
  vitals: VitalSigns[];
  encounters: Encounter[];
  labResults: LabResult[];
  imagingStudies: ImagingStudy[];
  prescriptions: Prescription[];
  procedures: Procedure[];
  immunizations: Immunization[];
  familyHistory: FamilyHistory[];
  socialHistory: SocialHistory;
  notes: ClinicalNote[];
  createdAt: string;
  updatedAt: string;
}

interface VitalSigns {
  id: string;
  recordedAt: string;
  recordedBy: string;
  bloodPressure: { systolic: number; diastolic: number };
  heartRate: number;
  temperature: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  weight: number;
  height: number;
  bmi: number;
  painLevel?: number;
  notes?: string;
}

interface Encounter {
  id: string;
  type: 'OPD' | 'IPD' | 'Emergency' | 'Telemedicine' | 'Home Visit';
  date: string;
  department: string;
  doctor: string;
  chiefComplaint: string;
  presentIllness: string;
  examination: string;
  diagnosis: string[];
  treatmentPlan: string;
  followUp?: string;
  status: 'In-Progress' | 'Completed' | 'Follow-up Required';
}

interface LabResult {
  id: string;
  testName: string;
  category: string;
  orderedBy: string;
  orderedDate: string;
  resultDate?: string;
  results: {
    parameter: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag?: 'Normal' | 'High' | 'Low' | 'Critical';
  }[];
  status: 'Ordered' | 'Collected' | 'Processing' | 'Completed';
  attachmentUrl?: string;
  notes?: string;
}

interface ImagingStudy {
  id: string;
  studyType: 'X-Ray' | 'CT Scan' | 'MRI' | 'Ultrasound' | 'ECG' | 'Echo' | 'PET Scan';
  bodyPart: string;
  orderedBy: string;
  orderedDate: string;
  performedDate?: string;
  findings?: string;
  impression?: string;
  radiologist?: string;
  status: 'Ordered' | 'Scheduled' | 'Completed';
  imageUrls?: string[];
}

interface Prescription {
  id: string;
  prescribedDate: string;
  prescribedBy: string;
  diagnosis: string;
  medications: Medication[];
  instructions: string;
  validity: string;
  status: 'Active' | 'Completed' | 'Discontinued';
}

interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions?: string;
}

interface Procedure {
  id: string;
  name: string;
  type: 'Surgical' | 'Non-Surgical' | 'Diagnostic';
  date: string;
  performedBy: string;
  anesthesia?: string;
  findings?: string;
  complications?: string;
  outcome: string;
  notes?: string;
}

interface Immunization {
  id: string;
  vaccineName: string;
  dose: string;
  administeredDate: string;
  administeredBy: string;
  batchNumber: string;
  nextDueDate?: string;
  site: string;
  notes?: string;
}

interface FamilyHistory {
  relation: string;
  condition: string;
  ageOfOnset?: string;
  status: 'Alive' | 'Deceased';
  notes?: string;
}

interface SocialHistory {
  occupation: string;
  smokingStatus: 'Never' | 'Former' | 'Current';
  alcoholUse: 'None' | 'Occasional' | 'Moderate' | 'Heavy';
  exerciseFrequency: string;
  diet: string;
  stressLevel: 'Low' | 'Moderate' | 'High';
  sleepHours: number;
}

interface ClinicalNote {
  id: string;
  type: 'Progress Note' | 'Consultation Note' | 'Discharge Summary' | 'Procedure Note' | 'Nursing Note';
  author: string;
  authorRole: string;
  createdAt: string;
  content: string;
  attachments?: string[];
  signedBy?: string;
  signedAt?: string;
}

interface PatientReport {
  id: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  reportType: string;
  description: string | null;
  testName: string | null;
  labName: string | null;
  reportDate: string | null;
  analysisStatus: string;
  aiSummary: string | null;
  aiCategory: string | null;
  keyFindings: string[];
  uploadedAt: string;
  createdAt: string;
}

const HospitalEHR = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientEHR | null>(null);
  const [showAddVitalsDialog, setShowAddVitalsDialog] = useState(false);
  const [showAddNoteDialog, setShowAddNoteDialog] = useState(false);
  const [showNewEncounterDialog, setShowNewEncounterDialog] = useState(false);
  const [showLabTestDialog, setShowLabTestDialog] = useState(false);
  const [showImagingDialog, setShowImagingDialog] = useState(false);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [showProcedureDialog, setShowProcedureDialog] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['vitals', 'encounters', 'medications']);
  const [patientReports, setPatientReports] = useState<PatientReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [orderStatus, setOrderStatus] = useState<{
    labOrders: Array<{ id: number; order_number?: string; status?: string; test_type?: string }>;
    prescriptions: Array<{ id: number; status?: string; pharmacy_status?: string }>;
    billingCharges: Array<{ id: number; charge_type?: string; amount?: number; status?: string }>;
  } | null>(null);
  const [loadingOrderStatus, setLoadingOrderStatus] = useState(false);
  const { toast } = useToast();
  const [noteForm, setNoteForm] = useState({
    type: 'Progress Note' as ClinicalNote['type'],
    author: 'Dr. On Call',
    authorRole: 'Physician',
    subject: '',
    content: ''
  });
  const [vitalsForm, setVitalsForm] = useState({
    systolic: '',
    diastolic: '',
    heartRate: '',
    temperature: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    weight: '',
    height: '',
    painLevel: '',
    notes: ''
  });
  const [encounterForm, setEncounterForm] = useState({
    type: 'OPD' as Encounter['type'],
    dateTime: new Date().toISOString().slice(0, 16),
    department: '',
    doctor: '',
    chiefComplaint: '',
    presentIllness: '',
    examination: '',
    diagnosis: '',
    treatmentPlan: '',
    followUp: ''
  });
  const [labForm, setLabForm] = useState({
    category: 'blood',
    priority: 'routine',
    testName: '',
    indication: '',
    instructions: ''
  });
  const [imagingForm, setImagingForm] = useState({
    type: 'xray',
    priority: 'routine',
    bodyPart: '',
    contrast: 'no',
    notes: ''
  });
  const [prescriptionForm, setPrescriptionForm] = useState({
    medication: '',
    dosage: '',
    frequency: 'bd',
    duration: '',
    route: 'oral',
    instructions: ''
  });
  const [procedureForm, setProcedureForm] = useState({
    type: 'surgical',
    name: '',
    dateTime: new Date().toISOString().slice(0, 16),
    performedBy: '',
    anesthesia: '',
    findings: '',
    complications: '',
    outcome: 'Successful',
    notes: ''
  });

  // Sample data - defined before useEffect that depends on patients
  const initialPatients: PatientEHR[] = [
    {
      id: 'P001',
      uhid: 'UHID001234',
      name: 'Rajesh Kumar',
      age: 45,
      gender: 'Male',
      bloodGroup: 'B+',
      phone: '9876543210',
      email: 'rajesh@email.com',
      address: '123 MG Road, Delhi',
      emergencyContact: { name: 'Sunita Kumar', relation: 'Wife', phone: '9876543211' },
      allergies: ['Penicillin', 'Sulfa drugs'],
      chronicConditions: ['Hypertension', 'Type 2 Diabetes'],
      currentMedications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', duration: 'Ongoing', route: 'Oral' },
        { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', duration: 'Ongoing', route: 'Oral' },
        { name: 'Aspirin', dosage: '75mg', frequency: 'Once daily', duration: 'Ongoing', route: 'Oral' },
      ],
      vitals: [
        { id: 'V001', recordedAt: '2024-12-04 09:30', recordedBy: 'Nurse Sunita', bloodPressure: { systolic: 138, diastolic: 88 }, heartRate: 78, temperature: 98.4, respiratoryRate: 16, oxygenSaturation: 98, weight: 78, height: 172, bmi: 26.4 },
        { id: 'V002', recordedAt: '2024-12-03 14:00', recordedBy: 'Nurse Priya', bloodPressure: { systolic: 142, diastolic: 92 }, heartRate: 82, temperature: 98.6, respiratoryRate: 18, oxygenSaturation: 97, weight: 78, height: 172, bmi: 26.4 },
        { id: 'V003', recordedAt: '2024-12-02 08:00', recordedBy: 'Nurse Sunita', bloodPressure: { systolic: 148, diastolic: 94 }, heartRate: 88, temperature: 99.2, respiratoryRate: 20, oxygenSaturation: 96, weight: 78, height: 172, bmi: 26.4, painLevel: 4, notes: 'Patient complained of chest discomfort' },
      ],
      encounters: [
        { id: 'E001', type: 'IPD', date: '2024-12-01', department: 'Cardiology', doctor: 'Dr. Rajiv Sharma', chiefComplaint: 'Chest pain and shortness of breath', presentIllness: 'Patient presented with sudden onset chest pain radiating to left arm, associated with sweating and breathlessness.', examination: 'BP: 160/100, HR: 92, Chest - bilateral clear, CVS - S1S2 heard, no murmurs', diagnosis: ['Acute Myocardial Infarction', 'Hypertension'], treatmentPlan: 'Primary PCI performed, Dual antiplatelet therapy started, Statin, ACE inhibitor', followUp: '2 weeks', status: 'Completed' },
        { id: 'E002', type: 'OPD', date: '2024-11-15', department: 'Cardiology', doctor: 'Dr. Rajiv Sharma', chiefComplaint: 'Routine follow-up for hypertension', presentIllness: 'Patient on regular antihypertensive medication, no new complaints', examination: 'BP: 134/86, HR: 76', diagnosis: ['Hypertension - controlled'], treatmentPlan: 'Continue current medications', followUp: '3 months', status: 'Completed' },
      ],
      labResults: [
        { id: 'L001', testName: 'Cardiac Markers', category: 'Biochemistry', orderedBy: 'Dr. Sharma', orderedDate: '2024-12-01', resultDate: '2024-12-01', results: [
          { parameter: 'Troponin I', value: '2.8', unit: 'ng/mL', referenceRange: '<0.04', flag: 'Critical' },
          { parameter: 'CK-MB', value: '45', unit: 'U/L', referenceRange: '<25', flag: 'High' },
        ], status: 'Completed' },
        { id: 'L002', testName: 'Lipid Profile', category: 'Biochemistry', orderedBy: 'Dr. Sharma', orderedDate: '2024-12-02', resultDate: '2024-12-02', results: [
          { parameter: 'Total Cholesterol', value: '245', unit: 'mg/dL', referenceRange: '<200', flag: 'High' },
          { parameter: 'LDL', value: '165', unit: 'mg/dL', referenceRange: '<100', flag: 'High' },
          { parameter: 'HDL', value: '38', unit: 'mg/dL', referenceRange: '>40', flag: 'Low' },
          { parameter: 'Triglycerides', value: '180', unit: 'mg/dL', referenceRange: '<150', flag: 'High' },
        ], status: 'Completed' },
        { id: 'L003', testName: 'HbA1c', category: 'Biochemistry', orderedBy: 'Dr. Sharma', orderedDate: '2024-12-02', resultDate: '2024-12-02', results: [
          { parameter: 'HbA1c', value: '7.8', unit: '%', referenceRange: '<6.5', flag: 'High' },
        ], status: 'Completed' },
      ],
      imagingStudies: [
        { id: 'I001', studyType: 'ECG', bodyPart: 'Heart', orderedBy: 'Dr. Sharma', orderedDate: '2024-12-01', performedDate: '2024-12-01', findings: 'ST elevation in leads V1-V4, Q waves in V1-V3', impression: 'Anterior wall STEMI', radiologist: 'Dr. Singh', status: 'Completed' },
        { id: 'I002', studyType: 'Echo', bodyPart: 'Heart', orderedBy: 'Dr. Sharma', orderedDate: '2024-12-02', performedDate: '2024-12-02', findings: 'LVEF 45%, Regional wall motion abnormality in LAD territory', impression: 'Moderate LV systolic dysfunction', radiologist: 'Dr. Gupta', status: 'Completed' },
      ],
      prescriptions: [
        { id: 'RX001', prescribedDate: '2024-12-04', prescribedBy: 'Dr. Rajiv Sharma', diagnosis: 'Post-MI, Hypertension, Diabetes', medications: [
          { name: 'Aspirin', dosage: '75mg', frequency: 'Once daily', duration: 'Lifelong', route: 'Oral', instructions: 'After breakfast' },
          { name: 'Clopidogrel', dosage: '75mg', frequency: 'Once daily', duration: '1 year', route: 'Oral', instructions: 'After lunch' },
          { name: 'Atorvastatin', dosage: '40mg', frequency: 'Once daily', duration: 'Lifelong', route: 'Oral', instructions: 'At bedtime' },
          { name: 'Ramipril', dosage: '5mg', frequency: 'Once daily', duration: 'Ongoing', route: 'Oral', instructions: 'Morning' },
          { name: 'Metoprolol', dosage: '25mg', frequency: 'Twice daily', duration: 'Ongoing', route: 'Oral' },
          { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', duration: 'Ongoing', route: 'Oral', instructions: 'With meals' },
        ], instructions: 'Regular follow-up, Cardiac rehabilitation recommended, Low salt and low fat diet', validity: '3 months', status: 'Active' },
      ],
      procedures: [
        { id: 'PR001', name: 'Primary Percutaneous Coronary Intervention (PCI)', type: 'Surgical', date: '2024-12-01', performedBy: 'Dr. Rajiv Sharma', anesthesia: 'Local', findings: 'Complete occlusion of LAD, successful stent placement', outcome: 'Successful', notes: 'Drug-eluting stent deployed' },
      ],
      immunizations: [
        { id: 'IM001', vaccineName: 'Influenza', dose: 'Annual', administeredDate: '2024-10-15', administeredBy: 'Nurse Priya', batchNumber: 'FLU2024-A1', nextDueDate: '2025-10-15', site: 'Left deltoid' },
        { id: 'IM002', vaccineName: 'Pneumococcal', dose: 'Single', administeredDate: '2024-10-15', administeredBy: 'Nurse Priya', batchNumber: 'PCV2024-B2', site: 'Right deltoid' },
      ],
      familyHistory: [
        { relation: 'Father', condition: 'Coronary Artery Disease', ageOfOnset: '55', status: 'Deceased', notes: 'MI at age 55' },
        { relation: 'Mother', condition: 'Type 2 Diabetes', ageOfOnset: '50', status: 'Alive' },
        { relation: 'Brother', condition: 'Hypertension', ageOfOnset: '40', status: 'Alive' },
      ],
      socialHistory: {
        occupation: 'Business owner',
        smokingStatus: 'Former',
        alcoholUse: 'Occasional',
        exerciseFrequency: 'Rarely',
        diet: 'High fat, high salt',
        stressLevel: 'High',
        sleepHours: 5,
      },
      notes: [],
      createdAt: '2020-05-15',
      updatedAt: '2024-12-04',
    },
  ];

  const [patients, setPatients] = useState<PatientEHR[]>(
    () => loadHospitalStore('ehr-patients', initialPatients)
  );

  // Auth check + initial patient load from API
  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
    // Try to load real patients from API; fall back to sample data on error
    patientService.getAll()
      .then((res: any) => {
        const apiPatients: any[] = Array.isArray(res) ? res : (res?.data ?? res?.patients ?? []);
        if (apiPatients.length > 0) {
          const mapped: PatientEHR[] = apiPatients.map((p: any) => ({
            id: String(p.id),
            uhid: p.uhid || `UHID-${p.id}`,
            name: p.name || p.patientName || 'Unknown',
            age: p.age ?? (p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)) : 0),
            gender: p.gender || 'Unknown',
            dateOfBirth: p.dateOfBirth || '',
            phone: p.phone || p.contactNumber || '',
            email: p.email || '',
            bloodGroup: p.bloodGroup || p.bloodType || 'Unknown',
            address: p.address || '',
            chronicConditions: Array.isArray(p.chronicConditions) ? p.chronicConditions : (Array.isArray(p.chronicDiseases) ? p.chronicDiseases : []),
            allergies: Array.isArray(p.allergies) ? p.allergies : [],
            currentMedications: Array.isArray(p.currentMedications) ? p.currentMedications : (Array.isArray(p.medications) ? p.medications : []),
            vitals: [],
            encounters: [],
            labResults: [],
            imagingStudies: [],
            prescriptions: [],
            procedures: [],
            immunizations: [],
            familyHistory: [],
            socialHistory: {
              occupation: p.occupation || '',
              smokingStatus: 'Never' as const,
              alcoholUse: 'None' as const,
              exerciseFrequency: '',
              diet: '',
              stressLevel: 'Low' as const,
              sleepHours: 8,
            },
            notes: [],
            createdAt: p.createdAt || new Date().toISOString(),
            updatedAt: p.updatedAt || new Date().toISOString(),
          }));
          setPatients(mapped);
          saveHospitalStore('ehr-patients', mapped);
        }
      })
      .catch(() => {
        // Keep sample / localStorage data on API error
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  // Auto-select first patient
  useEffect(() => {
    if (!selectedPatient && patients.length > 0) {
      setSelectedPatient(patients[0]);
    }
  }, [patients, selectedPatient]);

  // Fetch patient reports when patient is selected
  useEffect(() => {
    if (!selectedPatient) {
      setPatientReports([]);
      return;
    }
    const fetchReports = async () => {
      setLoadingReports(true);
      try {
        const response = await api.get(`/ehr/reports/${selectedPatient.id}`);
        setPatientReports(response.data?.reports || []);
      } catch (err) {
        console.error('Failed to fetch patient reports:', err);
        setPatientReports([]);
      } finally {
        setLoadingReports(false);
      }
    };
    fetchReports();
  }, [selectedPatient]);

  useEffect(() => {
    if (!selectedPatient) {
      setOrderStatus(null);
      return;
    }
    const fetchOrderStatus = async () => {
      setLoadingOrderStatus(true);
      try {
        const response = await orderStatusService.getForPatient(selectedPatient.id);
        setOrderStatus(response?.data || null);
      } catch (err) {
        console.error('Failed to fetch order status:', err);
        setOrderStatus(null);
      } finally {
        setLoadingOrderStatus(false);
      }
    };
    fetchOrderStatus();
  }, [selectedPatient]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const getVitalStatus = (vital: VitalSigns) => {
    const issues = [];
    if (vital.bloodPressure.systolic > 140 || vital.bloodPressure.diastolic > 90) issues.push('BP High');
    if (vital.heartRate > 100) issues.push('Tachycardia');
    if (vital.temperature > 99.5) issues.push('Fever');
    if (vital.oxygenSaturation < 95) issues.push('Low SpO2');
    return issues;
  };

  const getLabFlagColor = (flag?: string) => {
    switch (flag) {
      case 'Critical': return 'bg-red-600 text-white dark:bg-red-500';
      case 'High': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200';
      case 'Low': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200';
      default: return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
    }
  };

  const handlePrintChart = () => {
    window.print();
    toast({ title: 'Print started', description: 'EHR print dialog opened.' });
  };

  const handleShareChart = async () => {
    const sharePayload = {
      title: 'Patient EHR',
      text: selectedPatient ? `Sharing chart for ${selectedPatient.name}` : 'Sharing patient chart',
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
        toast({ title: 'Shared', description: 'Chart shared successfully.' });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharePayload.url);
        toast({ title: 'Link copied', description: 'Shareable link copied to clipboard.' });
      } else {
        toast({ title: 'Share unavailable', description: 'Sharing not supported in this browser.', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Share failed', err);
      toast({ title: 'Share failed', description: 'Unable to share chart right now.', variant: 'destructive' });
    }
  };

  const updateSelectedPatient = (updater: (patient: PatientEHR) => PatientEHR) => {
    if (!selectedPatient) return;
    const updatedPatient = updater(selectedPatient);
    setSelectedPatient(updatedPatient);
    setPatients((prev) => {
      const next = prev.map((patient) =>
        patient.id === selectedPatient.id ? updatedPatient : patient
      );
      saveHospitalStore('ehr-patients', next);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-orange-600" />
      </div>
    );
  }

  const patient = selectedPatient;

  return (
    <HospitalLayout title="Electronic Health Records" subtitle="Patient Charts & Clinical Documentation">
      {patient && (
        <div className="space-y-6">
          {/* Patient Banner */}
          <Card className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20 border-4 border-orange-300">
                    <AvatarFallback className="bg-gradient-to-br from-orange-500 to-amber-600 text-white text-2xl">
                      {patient.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-2xl font-bold">{patient.name}</h2>
                    <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="font-mono">{patient.uhid}</Badge>
                      </span>
                      <span>{patient.age} yrs • {patient.gender}</span>
                      <span className="flex items-center gap-1">
                        <Droplets className="h-4 w-4 text-red-500" /> {patient.bloodGroup}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span>📞 {patient.phone}</span>
                      {patient.email && <span>✉️ {patient.email}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {patient.allergies.length > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-red-100 dark:bg-red-950/40 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-800 dark:text-red-200">
                        Allergies: {patient.allergies.join(', ')}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintChart}>
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleShareChart}>
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                    <Button 
                      size="sm" 
                      className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600"
                      onClick={() => setShowAddNoteDialog(true)}
                    >
                      <FilePlus className="h-4 w-4" /> New Note
                    </Button>
                  </div>
                </div>
              </div>
              {/* Quick Stats */}
              <div className="grid grid-cols-6 gap-4 mt-6">
                <div className="text-center p-3 bg-card border border-border rounded-lg shadow-sm">
                  <HeartPulse className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.bloodPressure.systolic}/{patient.vitals[0]?.bloodPressure.diastolic}</p>
                  <p className="text-xs text-muted-foreground">BP</p>
                </div>
                <div className="text-center p-3 bg-card border border-border rounded-lg shadow-sm">
                  <Heart className="h-5 w-5 mx-auto mb-1 text-pink-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.heartRate}</p>
                  <p className="text-xs text-muted-foreground">Pulse</p>
                </div>
                <div className="text-center p-3 bg-card border border-border rounded-lg shadow-sm">
                  <Thermometer className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.temperature}°F</p>
                  <p className="text-xs text-muted-foreground">Temp</p>
                </div>
                <div className="text-center p-3 bg-card border border-border rounded-lg shadow-sm">
                  <Zap className="h-5 w-5 mx-auto mb-1 text-teal-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.oxygenSaturation}%</p>
                  <p className="text-xs text-muted-foreground">SpO2</p>
                </div>
                <div className="text-center p-3 bg-card border border-border rounded-lg shadow-sm">
                  <Scale className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.weight} kg</p>
                  <p className="text-xs text-muted-foreground">Weight</p>
                </div>
                <div className="text-center p-3 bg-card border border-border rounded-lg shadow-sm">
                  <BarChart3 className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.bmi}</p>
                  <p className="text-xs text-muted-foreground">BMI</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Lab & Pharmacy Order Status
              </CardTitle>
              <CardDescription>Live routing from EMR to lab and pharmacy portals</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingOrderStatus ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading order status…
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Lab Orders</p>
                    {(orderStatus?.labOrders || []).slice(0, 4).map((order) => (
                      <div key={order.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <span className="truncate">{order.order_number || order.test_type || `Order #${order.id}`}</span>
                        <Badge variant="outline">{order.status || 'ordered'}</Badge>
                      </div>
                    ))}
                    {(orderStatus?.labOrders || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No routed lab orders</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Pharmacy Rx</p>
                    {(orderStatus?.prescriptions || []).slice(0, 4).map((rx) => (
                      <div key={rx.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <span>Rx #{rx.id}</span>
                        <Badge variant="outline">{rx.pharmacy_status || rx.status || 'active'}</Badge>
                      </div>
                    ))}
                    {(orderStatus?.prescriptions || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No pharmacy prescriptions</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Billing Charges</p>
                    {(orderStatus?.billingCharges || []).slice(0, 4).map((charge) => (
                      <div key={charge.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <span>{charge.charge_type} · ₹{charge.amount}</span>
                        <Badge variant="outline">{charge.status || 'pending'}</Badge>
                      </div>
                    ))}
                    {(orderStatus?.billingCharges || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No billing charges yet</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-9 w-auto">
              <TabsTrigger value="summary" className="gap-1 text-xs">
                <ClipboardList className="h-4 w-4" /> Summary
              </TabsTrigger>
              <TabsTrigger value="vitals" className="gap-1 text-xs">
                <HeartPulse className="h-4 w-4" /> Vitals
              </TabsTrigger>
              <TabsTrigger value="encounters" className="gap-1 text-xs">
                <Stethoscope className="h-4 w-4" /> Encounters
              </TabsTrigger>
              <TabsTrigger value="labs" className="gap-1 text-xs">
                <Droplets className="h-4 w-4" /> Labs
              </TabsTrigger>
              <TabsTrigger value="imaging" className="gap-1 text-xs">
                <Image className="h-4 w-4" /> Imaging
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-1 text-xs">
                <FileImage className="h-4 w-4" /> Reports
              </TabsTrigger>
              <TabsTrigger value="medications" className="gap-1 text-xs">
                <Pill className="h-4 w-4" /> Medications
              </TabsTrigger>
              <TabsTrigger value="procedures" className="gap-1 text-xs">
                <Syringe className="h-4 w-4" /> Procedures
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1 text-xs">
                <History className="h-4 w-4" /> History
              </TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Active Problems */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      Active Problems
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {patient.chronicConditions.map((condition, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded">
                          <span>{condition}</span>
                          <Badge variant="outline">Active</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Current Medications */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-teal-500" />
                      Current Medications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {patient.currentMedications.slice(0, 5).map((med, idx) => (
                        <div key={idx} className="p-2 bg-teal-50 dark:bg-teal-950/30 rounded">
                          <p className="font-medium">{med.name} {med.dosage}</p>
                          <p className="text-sm text-muted-foreground">{med.frequency}</p>
                        </div>
                      ))}
                      {patient.currentMedications.length > 5 && (
                        <Button variant="link" className="w-full">View All ({patient.currentMedications.length})</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Allergies */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      Allergies & Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {patient.allergies.map((allergy, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/30 rounded">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span>{allergy}</span>
                        </div>
                      ))}
                      {patient.allergies.length === 0 && (
                        <p className="text-muted-foreground text-center py-4">No known allergies</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Encounters */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Encounters</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {patient.encounters.map((encounter) => (
                      <div key={encounter.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Badge>{encounter.type}</Badge>
                            <span className="font-semibold">{encounter.department}</span>
                            <span className="text-muted-foreground">• {encounter.doctor}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{encounter.date}</span>
                            <Badge className={encounter.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'}>
                              {encounter.status}
                            </Badge>
                          </div>
                        </div>
                        <p className="font-medium">{encounter.chiefComplaint}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {encounter.diagnosis.map((dx, idx) => (
                            <Badge key={idx} variant="outline">{dx}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Lab Results */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Lab Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {patient.labResults.slice(0, 3).map((lab) => (
                      <div key={lab.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{lab.testName}</h4>
                          <Badge className={lab.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'}>
                            {lab.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{lab.resultDate}</p>
                        <div className="space-y-2">
                          {lab.results.slice(0, 3).map((result, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span>{result.parameter}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{result.value} {result.unit}</span>
                                {result.flag && result.flag !== 'Normal' && (
                                  <Badge className={getLabFlagColor(result.flag)} variant="outline">
                                    {result.flag === 'High' ? '↑' : result.flag === 'Low' ? '↓' : '!!'}
                                  </Badge>
                                )}
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

            {/* Vitals Tab */}
            <TabsContent value="vitals" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Vital Signs History</h2>
                <Dialog open={showAddVitalsDialog} onOpenChange={setShowAddVitalsDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600">
                      <Plus className="h-4 w-4" /> Record Vitals
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Record Vital Signs</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Blood Pressure (Systolic)</Label>
                        <Input
                          type="number"
                          placeholder="mmHg"
                          value={vitalsForm.systolic}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, systolic: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Blood Pressure (Diastolic)</Label>
                        <Input
                          type="number"
                          placeholder="mmHg"
                          value={vitalsForm.diastolic}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, diastolic: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Heart Rate</Label>
                        <Input
                          type="number"
                          placeholder="bpm"
                          value={vitalsForm.heartRate}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, heartRate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Temperature</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="°F"
                          value={vitalsForm.temperature}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, temperature: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Respiratory Rate</Label>
                        <Input
                          type="number"
                          placeholder="/min"
                          value={vitalsForm.respiratoryRate}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>SpO2</Label>
                        <Input
                          type="number"
                          placeholder="%"
                          value={vitalsForm.oxygenSaturation}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, oxygenSaturation: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Weight</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="kg"
                          value={vitalsForm.weight}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, weight: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Height</Label>
                        <Input
                          type="number"
                          placeholder="cm"
                          value={vitalsForm.height}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, height: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pain Level (0-10)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="10"
                          placeholder="0-10"
                          value={vitalsForm.painLevel}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, painLevel: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-3 space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          placeholder="Additional observations..."
                          value={vitalsForm.notes}
                          onChange={(e) => setVitalsForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddVitalsDialog(false)}>Cancel</Button>
                      <Button
                        className="bg-gradient-to-r from-orange-600 to-amber-600"
                        onClick={() => {
                          if (!selectedPatient) return;
                          const systolic = parseInt(vitalsForm.systolic || '0', 10);
                          const diastolic = parseInt(vitalsForm.diastolic || '0', 10);
                          const hr = parseInt(vitalsForm.heartRate || '0', 10);
                          const temp = parseFloat(vitalsForm.temperature || '0');
                          const rr = parseInt(vitalsForm.respiratoryRate || '0', 10);
                          const spo2 = parseInt(vitalsForm.oxygenSaturation || '0', 10);
                          const wt = parseFloat(vitalsForm.weight || '0');
                          const ht = parseFloat(vitalsForm.height || '0');
                          const bmiVal = ht && wt ? Math.round((wt / Math.pow(ht / 100, 2)) * 10) / 10 : 0;
                          const vital: VitalSigns = {
                            id: `V-${Date.now()}`,
                            recordedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
                            recordedBy: 'Nurse Station',
                            bloodPressure: { systolic, diastolic },
                            heartRate: hr,
                            temperature: temp,
                            respiratoryRate: rr,
                            oxygenSaturation: spo2,
                            weight: wt,
                            height: ht,
                            bmi: bmiVal,
                            painLevel: vitalsForm.painLevel ? parseInt(vitalsForm.painLevel, 10) : undefined,
                            notes: vitalsForm.notes || undefined
                          };
                          updateSelectedPatient((patient) => ({ ...patient, vitals: [vital, ...patient.vitals] }));
                          // Fire API call alongside local state update
                          vitalSignsService.create({
                            patientId: selectedPatient.id,
                            systolic,
                            diastolic,
                            heartRate: hr,
                            temperature: temp,
                            respiratoryRate: rr,
                            oxygenSaturation: spo2,
                            weight: wt,
                            height: ht,
                            notes: vitalsForm.notes || undefined,
                          }).catch((e: unknown) => console.error('Vitals API error', e));
                          setVitalsForm({
                            systolic: '',
                            diastolic: '',
                            heartRate: '',
                            temperature: '',
                            respiratoryRate: '',
                            oxygenSaturation: '',
                            weight: '',
                            height: '',
                            painLevel: '',
                            notes: ''
                          });
                          toast({
                            title: "Vitals Saved",
                            description: "New vital signs recorded.",
                          });
                          setShowAddVitalsDialog(false);
                        }}
                      >
                        Save Vitals
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date/Time</TableHead>
                        <TableHead>BP (mmHg)</TableHead>
                        <TableHead>HR (bpm)</TableHead>
                        <TableHead>Temp (°F)</TableHead>
                        <TableHead>RR (/min)</TableHead>
                        <TableHead>SpO2 (%)</TableHead>
                        <TableHead>Weight (kg)</TableHead>
                        <TableHead>Pain</TableHead>
                        <TableHead>Recorded By</TableHead>
                        <TableHead>Alerts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patient.vitals.map((vital) => {
                        const issues = getVitalStatus(vital);
                        return (
                          <TableRow key={vital.id}>
                            <TableCell className="font-mono text-sm">{vital.recordedAt}</TableCell>
                            <TableCell className={vital.bloodPressure.systolic > 140 ? 'text-red-600 font-medium' : ''}>
                              {vital.bloodPressure.systolic}/{vital.bloodPressure.diastolic}
                            </TableCell>
                            <TableCell className={vital.heartRate > 100 ? 'text-red-600 font-medium' : ''}>
                              {vital.heartRate}
                            </TableCell>
                            <TableCell className={vital.temperature > 99.5 ? 'text-orange-600 font-medium' : ''}>
                              {vital.temperature}
                            </TableCell>
                            <TableCell>{vital.respiratoryRate}</TableCell>
                            <TableCell className={vital.oxygenSaturation < 95 ? 'text-red-600 font-medium' : ''}>
                              {vital.oxygenSaturation}
                            </TableCell>
                            <TableCell>{vital.weight}</TableCell>
                            <TableCell>{vital.painLevel ?? '-'}</TableCell>
                            <TableCell>{vital.recordedBy}</TableCell>
                            <TableCell>
                              {issues.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {issues.map((issue, idx) => (
                                    <Badge key={idx} variant="destructive" className="text-xs">{issue}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Normal</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Encounters Tab */}
            <TabsContent value="encounters" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Patient Encounters</h2>
                <Dialog open={showNewEncounterDialog} onOpenChange={setShowNewEncounterDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600">
                      <Plus className="h-4 w-4" /> New Encounter
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Encounter</DialogTitle>
                      <DialogDescription>Document a new patient encounter</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Encounter Type</Label>
                        <Select
                          value={encounterForm.type.toLowerCase()}
                          onValueChange={(value) =>
                            setEncounterForm(prev => ({ ...prev, type: value.toUpperCase() as Encounter['type'] }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="opd">OPD Visit</SelectItem>
                            <SelectItem value="ipd">IPD Admission</SelectItem>
                            <SelectItem value="emergency">Emergency</SelectItem>
                            <SelectItem value="telemedicine">Telemedicine</SelectItem>
                            <SelectItem value="home-visit">Home Visit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select
                          value={encounterForm.department}
                          onValueChange={(value) => setEncounterForm(prev => ({ ...prev, department: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cardiology">Cardiology</SelectItem>
                            <SelectItem value="neurology">Neurology</SelectItem>
                            <SelectItem value="orthopedics">Orthopedics</SelectItem>
                            <SelectItem value="gynecology">Gynecology</SelectItem>
                            <SelectItem value="pediatrics">Pediatrics</SelectItem>
                            <SelectItem value="general-medicine">General Medicine</SelectItem>
                            <SelectItem value="surgery">Surgery</SelectItem>
                            <SelectItem value="emergency">Emergency</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Doctor</Label>
                        <Select
                          value={encounterForm.doctor}
                          onValueChange={(value) => setEncounterForm(prev => ({ ...prev, doctor: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dr-sharma">Dr. Rajiv Sharma</SelectItem>
                            <SelectItem value="dr-mehta">Dr. Anjali Mehta</SelectItem>
                            <SelectItem value="dr-patel">Dr. Anjali Patel</SelectItem>
                            <SelectItem value="dr-verma">Dr. Rajesh Verma</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Date & Time</Label>
                        <Input type="datetime-local" />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Chief Complaint</Label>
                        <Textarea
                          placeholder="Patient's main complaint..."
                          value={encounterForm.chiefComplaint}
                          onChange={(e) => setEncounterForm(prev => ({ ...prev, chiefComplaint: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Present Illness</Label>
                        <Textarea
                          placeholder="History of present illness..."
                          value={encounterForm.presentIllness}
                          onChange={(e) => setEncounterForm(prev => ({ ...prev, presentIllness: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Examination Findings</Label>
                        <Textarea
                          placeholder="Physical examination findings..."
                          value={encounterForm.examination}
                          onChange={(e) => setEncounterForm(prev => ({ ...prev, examination: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Diagnosis</Label>
                        <Textarea
                          placeholder="Provisional/final diagnosis..."
                          value={encounterForm.diagnosis}
                          onChange={(e) => setEncounterForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Treatment Plan</Label>
                        <Textarea
                          placeholder="Treatment plan and instructions..."
                          value={encounterForm.treatmentPlan}
                          onChange={(e) => setEncounterForm(prev => ({ ...prev, treatmentPlan: e.target.value }))}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewEncounterDialog(false)}>Cancel</Button>
                      <Button
                        className="bg-gradient-to-r from-orange-600 to-amber-600"
                        onClick={() => {
                          if (!selectedPatient) return;
                          if (!encounterForm.doctor.trim()) {
                            toast({ title: 'Doctor required', description: 'Enter the treating doctor before completing this encounter.', variant: 'destructive' });
                            return;
                          }
                          updateSelectedPatient((patient) => {
                            const encounter: Encounter = {
                              id: `E-${Date.now()}`,
                              type: encounterForm.type,
                              date: new Date().toISOString().split('T')[0],
                              department: encounterForm.department || 'General Medicine',
                              doctor: encounterForm.doctor,
                              chiefComplaint: encounterForm.chiefComplaint || 'General Consultation',
                              presentIllness: encounterForm.presentIllness || '',
                              examination: encounterForm.examination || '',
                              diagnosis: encounterForm.diagnosis ? [encounterForm.diagnosis] : ['Pending'],
                              treatmentPlan: encounterForm.treatmentPlan || '',
                              followUp: encounterForm.followUp || '',
                              status: 'Completed'
                            };
                            return { ...patient, encounters: [encounter, ...patient.encounters] };
                          });
                          setEncounterForm({
                            type: 'OPD',
                            department: '',
                            doctor: '',
                            chiefComplaint: '',
                            presentIllness: '',
                            examination: '',
                            diagnosis: '',
                            treatmentPlan: '',
                            followUp: ''
                          });
                          toast({
                            title: "Encounter Created",
                            description: "New clinical encounter has been recorded.",
                          });
                          setShowNewEncounterDialog(false);
                        }}
                      >
                        Save Encounter
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4">
                {patient.encounters.map((encounter) => (
                  <Card key={encounter.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Stethoscope className="h-5 w-5" />
                            {encounter.type} Encounter
                          </CardTitle>
                          <CardDescription>
                            {encounter.department} • {encounter.doctor} • {encounter.date}
                          </CardDescription>
                        </div>
                        <Badge className={encounter.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'}>
                          {encounter.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Chief Complaint</h4>
                        <p className="text-muted-foreground">{encounter.chiefComplaint}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Present Illness</h4>
                        <p className="text-muted-foreground">{encounter.presentIllness}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Examination</h4>
                        <p className="text-muted-foreground">{encounter.examination}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Diagnosis</h4>
                        <div className="flex flex-wrap gap-2">
                          {encounter.diagnosis.map((diag, idx) => (
                            <Badge key={idx} variant="outline">{diag}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Treatment Plan</h4>
                        <p className="text-muted-foreground">{encounter.treatmentPlan}</p>
                      </div>
                      {encounter.followUp && (
                        <div>
                          <h4 className="font-semibold mb-2">Follow-up</h4>
                          <p className="text-muted-foreground">{encounter.followUp}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Labs Tab */}
            <TabsContent value="labs" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Laboratory Results</h2>
                <Button 
                  className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600"
                  onClick={() => setShowLabTestDialog(true)}
                >
                  <Plus className="h-4 w-4" /> Order Lab Test
                </Button>
              </div>

              <div className="space-y-4">
                {patient.labResults.map((lab) => (
                  <Card key={lab.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{lab.testName}</CardTitle>
                          <CardDescription>{lab.category} • Ordered by {lab.orderedBy} • {lab.resultDate}</CardDescription>
                        </div>
                        <Badge className={lab.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'}>
                          {lab.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Parameter</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Reference Range</TableHead>
                            <TableHead>Flag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lab.results.map((result, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{result.parameter}</TableCell>
                              <TableCell className={result.flag && result.flag !== 'Normal' ? 'font-bold' : ''}>
                                {result.value}
                              </TableCell>
                              <TableCell>{result.unit}</TableCell>
                              <TableCell className="text-muted-foreground">{result.referenceRange}</TableCell>
                              <TableCell>
                                {result.flag && (
                                  <Badge className={getLabFlagColor(result.flag)}>{result.flag}</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Imaging Tab */}
            <TabsContent value="imaging" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Imaging Studies</h2>
                <Button 
                  className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600"
                  onClick={() => setShowImagingDialog(true)}
                >
                  <Plus className="h-4 w-4" /> Order Imaging
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {patient.imagingStudies.map((study) => (
                  <Card key={study.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{study.studyType} - {study.bodyPart}</CardTitle>
                          <CardDescription>Ordered by {study.orderedBy} • {study.performedDate || study.orderedDate}</CardDescription>
                        </div>
                        <Badge className={study.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'}>
                          {study.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {study.findings && (
                        <div className="mb-3">
                          <p className="text-sm font-medium text-muted-foreground">Findings:</p>
                          <p>{study.findings}</p>
                        </div>
                      )}
                      {study.impression && (
                        <div className="p-3 bg-muted/60 rounded-lg">
                          <p className="text-sm font-medium text-muted-foreground">Impression:</p>
                          <p className="font-medium">{study.impression}</p>
                        </div>
                      )}
                      {study.radiologist && (
                        <p className="text-sm text-muted-foreground mt-2">Reported by: {study.radiologist}</p>
                      )}
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" className="gap-2">
                          <Image className="h-4 w-4" /> View Images
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Download className="h-4 w-4" /> Download
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Patient Reports Tab */}
            <TabsContent value="reports" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Patient Reports</h2>
                <Badge variant="outline">{patientReports.length} reports</Badge>
              </div>
              {loadingReports ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading reports...</span>
                </div>
              ) : patientReports.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileImage className="w-12 h-12 mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground">No reports uploaded by this patient</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {patientReports.map((report) => (
                    <Card key={report.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${
                              report.reportType === 'lab' ? 'bg-blue-100 dark:bg-blue-900/30' :
                              report.reportType === 'imaging' ? 'bg-purple-100 dark:bg-purple-900/30' :
                              report.reportType === 'prescription' ? 'bg-green-100 dark:bg-green-900/30' :
                              'bg-gray-100 dark:bg-gray-800'
                            }`}>
                              <FileImage className={`h-5 w-5 ${
                                report.reportType === 'lab' ? 'text-blue-600' :
                                report.reportType === 'imaging' ? 'text-purple-600' :
                                report.reportType === 'prescription' ? 'text-green-600' :
                                'text-gray-600'
                              }`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{report.testName || report.fileName}</CardTitle>
                              <CardDescription>
                                {report.labName && `${report.labName} • `}
                                {report.reportDate || new Date(report.uploadedAt).toLocaleDateString()}
                                {' • '}{(report.fileSize / 1024).toFixed(0)} KB
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">{report.reportType}</Badge>
                            {report.analysisStatus === 'completed' && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">AI Analyzed</Badge>
                            )}
                            {report.analysisStatus === 'pending' && (
                              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">Pending</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {report.description && (
                          <p className="text-sm text-muted-foreground mb-3">{report.description}</p>
                        )}
                        {report.aiSummary && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-3">
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">AI Analysis Summary</p>
                            <p className="text-sm">{report.aiSummary}</p>
                            {report.keyFindings && report.keyFindings.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {report.keyFindings.map((finding, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{finding}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => downloadReport({ reportId: report.id, fileName: report.fileName || `report-${report.id}` })}
                          >
                            <Download className="h-4 w-4" /> Download
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Medications Tab */}
            <TabsContent value="medications" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Medications & Prescriptions</h2>
                <Button 
                  className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600"
                  onClick={() => setShowPrescriptionDialog(true)}
                >
                  <Plus className="h-4 w-4" /> New Prescription
                </Button>
              </div>

              {patient.prescriptions.map((rx) => (
                <Card key={rx.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Prescription - {rx.prescribedDate}</CardTitle>
                        <CardDescription>{rx.prescribedBy} • {rx.diagnosis}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={rx.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200'}>
                          {rx.status}
                        </Badge>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Printer className="h-4 w-4" /> Print
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Medication</TableHead>
                          <TableHead>Dosage</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Instructions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rx.medications.map((med, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{med.name}</TableCell>
                            <TableCell>{med.dosage}</TableCell>
                            <TableCell>{med.frequency}</TableCell>
                            <TableCell>{med.duration}</TableCell>
                            <TableCell>{med.route}</TableCell>
                            <TableCell className="text-muted-foreground">{med.instructions || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {rx.instructions && (
                      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                        <p className="text-sm font-medium">Instructions:</p>
                        <p className="text-sm">{rx.instructions}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Procedures Tab */}
            <TabsContent value="procedures" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Procedures & Surgeries</h2>
                <Button 
                  className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600"
                  onClick={() => setShowProcedureDialog(true)}
                >
                  <Plus className="h-4 w-4" /> Add Procedure
                </Button>
              </div>

              <div className="space-y-4">
                {patient.procedures.map((proc) => (
                  <Card key={proc.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{proc.name}</CardTitle>
                          <CardDescription>{proc.type} • {proc.date} • {proc.performedBy}</CardDescription>
                        </div>
                        <Badge className={proc.outcome === 'Successful' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'}>
                          {proc.outcome}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {proc.anesthesia && (
                        <p className="mb-2"><span className="font-medium">Anesthesia:</span> {proc.anesthesia}</p>
                      )}
                      {proc.findings && (
                        <div className="mb-3">
                          <p className="font-medium">Findings:</p>
                          <p className="text-muted-foreground">{proc.findings}</p>
                        </div>
                      )}
                      {proc.notes && (
                        <p className="text-sm text-muted-foreground">{proc.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Family History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" /> Family History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {patient.familyHistory.map((fh, idx) => (
                        <div key={idx} className="p-3 bg-muted/60 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{fh.relation}</span>
                            <Badge variant="outline">{fh.status}</Badge>
                          </div>
                          <p>{fh.condition}</p>
                          {fh.ageOfOnset && <p className="text-sm text-muted-foreground">Onset: {fh.ageOfOnset} years</p>}
                          {fh.notes && <p className="text-sm text-muted-foreground">{fh.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Social History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCog className="h-5 w-5" /> Social History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Occupation</span>
                        <span className="font-medium">{patient.socialHistory.occupation}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Smoking Status</span>
                        <Badge variant="outline">{patient.socialHistory.smokingStatus}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Alcohol Use</span>
                        <Badge variant="outline">{patient.socialHistory.alcoholUse}</Badge>
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Exercise</span>
                        <span>{patient.socialHistory.exerciseFrequency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Diet</span>
                        <span>{patient.socialHistory.diet}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stress Level</span>
                        <Badge className={patient.socialHistory.stressLevel === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'}>
                          {patient.socialHistory.stressLevel}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sleep</span>
                        <span>{patient.socialHistory.sleepHours} hours/night</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Immunizations */}
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Syringe className="h-5 w-5" /> Immunizations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vaccine</TableHead>
                          <TableHead>Dose</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Administered By</TableHead>
                          <TableHead>Batch #</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Next Due</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {patient.immunizations.map((imm) => (
                          <TableRow key={imm.id}>
                            <TableCell className="font-medium">{imm.vaccineName}</TableCell>
                            <TableCell>{imm.dose}</TableCell>
                            <TableCell>{imm.administeredDate}</TableCell>
                            <TableCell>{imm.administeredBy}</TableCell>
                            <TableCell className="font-mono text-sm">{imm.batchNumber}</TableCell>
                            <TableCell>{imm.site}</TableCell>
                            <TableCell>{imm.nextDueDate || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

          </Tabs>
        </div>
      )}

      {/* Add Note Dialog */}
      <Dialog open={showAddNoteDialog} onOpenChange={setShowAddNoteDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Clinical Note</DialogTitle>
            <DialogDescription>Record a new clinical note for this patient</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Note Type</Label>
                <Select
                  value={noteForm.type}
                  onValueChange={(value) => setNoteForm(prev => ({ ...prev, type: value as ClinicalNote['type'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Progress Note">Progress Note</SelectItem>
                    <SelectItem value="Consultation Note">Consultation Note</SelectItem>
                    <SelectItem value="Discharge Summary">Discharge Summary</SelectItem>
                    <SelectItem value="Procedure Note">Procedure Note</SelectItem>
                    <SelectItem value="Nursing Note">Nursing Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Brief subject of the note"
                value={noteForm.subject}
                onChange={(e) => setNoteForm(prev => ({ ...prev, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Clinical Note</Label>
              <Textarea
                rows={8}
                placeholder="Enter detailed clinical note..."
                value={noteForm.content}
                onChange={(e) => setNoteForm(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNoteDialog(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!selectedPatient) return;
              try {
                await api.post('/hospital/clinical-notes/notes', {
                  patientId: Number(selectedPatient.id),
                  noteType: noteForm.type.replace(/\s+/g, '_').toLowerCase(),
                  subject: noteForm.subject,
                  content: noteForm.content,
                  subjective: `${noteForm.subject ? `${noteForm.subject}\n\n` : ''}${noteForm.content}`.trim(),
                  authorRole: noteForm.authorRole,
                });
                updateSelectedPatient((patient) => {
                  const note: ClinicalNote = {
                    id: `N-${Date.now()}`,
                    type: noteForm.type,
                    author: noteForm.author,
                    authorRole: noteForm.authorRole,
                    createdAt: new Date().toISOString(),
                    content: `${noteForm.subject ? `${noteForm.subject}\n\n` : ''}${noteForm.content}`.trim()
                  };
                  return { ...patient, notes: [note, ...patient.notes] };
                });
                setNoteForm({
                  type: 'Progress Note',
                  author: 'Dr. On Call',
                  authorRole: 'Physician',
                  subject: '',
                  content: ''
                });
                toast({
                  title: "Note Saved",
                  description: "Clinical note saved to EHR database.",
                });
              } catch (e: any) {
                toast({
                  variant: 'destructive',
                  title: 'Save failed',
                  description: e?.response?.data?.message || 'Could not persist note',
                });
              }
              setShowAddNoteDialog(false);
            }}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Encounter Dialog */}
      <Dialog open={showNewEncounterDialog} onOpenChange={setShowNewEncounterDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Clinical Encounter</DialogTitle>
            <DialogDescription>Create a new encounter record</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Encounter Type</Label>
                <Select
                  value={encounterForm.type}
                  onValueChange={(value) => setEncounterForm(prev => ({ ...prev, type: value as Encounter['type'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPD">OPD Visit</SelectItem>
                    <SelectItem value="IPD">IPD Admission</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                    <SelectItem value="Telemedicine">Telemedicine</SelectItem>
                    <SelectItem value="Home Visit">Home Visit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={encounterForm.dateTime}
                  onChange={(e) => setEncounterForm(prev => ({ ...prev, dateTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="Department"
                  value={encounterForm.department}
                  onChange={(e) => setEncounterForm(prev => ({ ...prev, department: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Attending Doctor</Label>
                <Input
                  placeholder="Doctor name"
                  value={encounterForm.doctor}
                  onChange={(e) => setEncounterForm(prev => ({ ...prev, doctor: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Chief Complaint</Label>
              <Input
                placeholder="Primary complaint"
                value={encounterForm.chiefComplaint}
                onChange={(e) => setEncounterForm(prev => ({ ...prev, chiefComplaint: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Present Illness</Label>
              <Textarea
                rows={3}
                placeholder="Describe the present illness"
                value={encounterForm.presentIllness}
                onChange={(e) => setEncounterForm(prev => ({ ...prev, presentIllness: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Examination</Label>
              <Textarea
                rows={3}
                placeholder="Clinical examination notes"
                value={encounterForm.examination}
                onChange={(e) => setEncounterForm(prev => ({ ...prev, examination: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis</Label>
              <Input
                placeholder="Comma separated diagnoses"
                value={encounterForm.diagnosis}
                onChange={(e) => setEncounterForm(prev => ({ ...prev, diagnosis: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Treatment Plan</Label>
              <Textarea
                rows={4}
                placeholder="Enter treatment plan..."
                value={encounterForm.treatmentPlan}
                onChange={(e) => setEncounterForm(prev => ({ ...prev, treatmentPlan: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Follow Up</Label>
              <Input
                placeholder="e.g., 2 weeks"
                value={encounterForm.followUp}
                onChange={(e) => setEncounterForm(prev => ({ ...prev, followUp: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewEncounterDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedPatient) return;
              const diagnoses = encounterForm.diagnosis
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
              updateSelectedPatient((patient) => {
                const encounter: Encounter = {
                  id: `E-${Date.now()}`,
                  type: encounterForm.type,
                  date: encounterForm.dateTime || new Date().toISOString(),
                  department: encounterForm.department || 'General',
                  doctor: encounterForm.doctor || 'Dr. On Call',
                  chiefComplaint: encounterForm.chiefComplaint || 'General Checkup',
                  presentIllness: encounterForm.presentIllness || '',
                  examination: encounterForm.examination || '',
                  diagnosis: diagnoses.length > 0 ? diagnoses : ['General'],
                  treatmentPlan: encounterForm.treatmentPlan || '',
                  followUp: encounterForm.followUp || undefined,
                  status: 'In-Progress',
                };
                return { ...patient, encounters: [encounter, ...patient.encounters] };
              });
              setEncounterForm({
                type: 'OPD',
                dateTime: new Date().toISOString().slice(0, 16),
                department: '',
                doctor: '',
                chiefComplaint: '',
                presentIllness: '',
                examination: '',
                diagnosis: '',
                treatmentPlan: '',
                followUp: ''
              });
              toast({
                title: "Encounter Created",
                description: "New clinical encounter has been recorded.",
              });
              setShowNewEncounterDialog(false);
            }}>Create Encounter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Lab Test Dialog */}
      <Dialog open={showLabTestDialog} onOpenChange={setShowLabTestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Laboratory Test</DialogTitle>
            <DialogDescription>Request laboratory investigations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Test Category</Label>
                <Select
                  value={labForm.category}
                  onValueChange={(value) => setLabForm(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blood">Blood Tests</SelectItem>
                    <SelectItem value="urine">Urine Tests</SelectItem>
                    <SelectItem value="microbiology">Microbiology</SelectItem>
                    <SelectItem value="biochemistry">Biochemistry</SelectItem>
                    <SelectItem value="pathology">Pathology</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={labForm.priority}
                  onValueChange={(value) => setLabForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stat">STAT (Immediate)</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="routine">Routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Test Name</Label>
              <Input
                placeholder="e.g., Complete Blood Count (CBC)"
                value={labForm.testName}
                onChange={(e) => setLabForm(prev => ({ ...prev, testName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Clinical Indication</Label>
              <Textarea
                rows={3}
                placeholder="Reason for test..."
                value={labForm.indication}
                onChange={(e) => setLabForm(prev => ({ ...prev, indication: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                rows={2}
                placeholder="Any special instructions..."
                value={labForm.instructions}
                onChange={(e) => setLabForm(prev => ({ ...prev, instructions: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLabTestDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedPatient) return;
              const lab: LabResult = {
                id: `L-${Date.now()}`,
                testName: labForm.testName || 'Lab Test',
                category: labForm.category,
                orderedBy: 'Dr. On Call',
                orderedDate: new Date().toISOString().split('T')[0],
                results: [],
                status: 'Ordered',
                notes: labForm.indication || undefined
              };
              updateSelectedPatient((patient) => ({ ...patient, labResults: [lab, ...patient.labResults] }));
              // Fire API call alongside local state update
              labOrderService.create({
                patientId: selectedPatient.id,
                testName: labForm.testName || 'Lab Test',
                priority: labForm.priority,
                notes: labForm.indication || undefined,
              }).catch((e: unknown) => console.error('Lab order API error', e));
              setLabForm({
                category: 'blood',
                priority: 'routine',
                testName: '',
                indication: '',
                instructions: ''
              });
              toast({
                title: "Lab Test Ordered",
                description: "Laboratory test order has been saved.",
              });
              setShowLabTestDialog(false);
            }}>Order Test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Imaging Dialog */}
      <Dialog open={showImagingDialog} onOpenChange={setShowImagingDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Imaging Study</DialogTitle>
            <DialogDescription>Request radiology imaging</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Imaging Type</Label>
                <Select
                  value={imagingForm.type}
                  onValueChange={(value) => setImagingForm(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xray">X-Ray</SelectItem>
                    <SelectItem value="ct">CT Scan</SelectItem>
                    <SelectItem value="mri">MRI</SelectItem>
                    <SelectItem value="ultrasound">Ultrasound</SelectItem>
                    <SelectItem value="pet">PET Scan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={imagingForm.priority}
                  onValueChange={(value) => setImagingForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="routine">Routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Body Part / Region</Label>
              <Input
                placeholder="e.g., Chest, Abdomen, Head"
                value={imagingForm.bodyPart}
                onChange={(e) => setImagingForm(prev => ({ ...prev, bodyPart: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Clinical Indication</Label>
              <Textarea
                rows={3}
                placeholder="Clinical reason for imaging..."
                value={imagingForm.notes}
                onChange={(e) => setImagingForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Contrast Required?</Label>
              <Select
                value={imagingForm.contrast}
                onValueChange={(value) => setImagingForm(prev => ({ ...prev, contrast: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes, with contrast</SelectItem>
                  <SelectItem value="no">No contrast</SelectItem>
                  <SelectItem value="both">Both with and without</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImagingDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedPatient) return;
              const studyTypeMap: Record<string, ImagingStudy['studyType']> = {
                xray: 'X-Ray',
                ct: 'CT Scan',
                mri: 'MRI',
                ultrasound: 'Ultrasound',
                pet: 'PET Scan'
              };
              const studyType = studyTypeMap[imagingForm.type] || 'X-Ray';
              const imaging: ImagingStudy = {
                id: `I-${Date.now()}`,
                studyType,
                bodyPart: imagingForm.bodyPart || 'General',
                orderedBy: 'Dr. On Call',
                orderedDate: new Date().toISOString().split('T')[0],
                status: 'Ordered',
                findings: imagingForm.notes || undefined
              };
              updateSelectedPatient((patient) => ({ ...patient, imagingStudies: [imaging, ...patient.imagingStudies] }));
              // Fire API call alongside local state update
              imagingOrderService.create({
                patientId: selectedPatient.id,
                imagingType: studyType,
                bodyPart: imagingForm.bodyPart || 'General',
                priority: imagingForm.priority,
                contrast: imagingForm.contrast,
                clinicalIndication: imagingForm.notes || undefined,
              }).catch((e: unknown) => console.error('Imaging order API error', e));
              setImagingForm({
                type: 'xray',
                priority: 'routine',
                bodyPart: '',
                contrast: 'no',
                notes: ''
              });
              toast({
                title: "Imaging Ordered",
                description: "Imaging study order has been saved.",
              });
              setShowImagingDialog(false);
            }}>Order Imaging</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Prescription Dialog */}
      <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Prescription</DialogTitle>
            <DialogDescription>Create a new medication prescription</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Medication Name</Label>
              <Input
                placeholder="e.g., Amoxicillin 500mg"
                value={prescriptionForm.medication}
                onChange={(e) => setPrescriptionForm(prev => ({ ...prev, medication: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Dosage</Label>
                <Input
                  placeholder="e.g., 500mg"
                  value={prescriptionForm.dosage}
                  onChange={(e) => setPrescriptionForm(prev => ({ ...prev, dosage: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={prescriptionForm.frequency}
                  onValueChange={(value) => setPrescriptionForm(prev => ({ ...prev, frequency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="od">Once Daily (OD)</SelectItem>
                    <SelectItem value="bd">Twice Daily (BD)</SelectItem>
                    <SelectItem value="tds">Three Times (TDS)</SelectItem>
                    <SelectItem value="qid">Four Times (QID)</SelectItem>
                    <SelectItem value="sos">As Needed (SOS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input
                  placeholder="e.g., 7 days"
                  value={prescriptionForm.duration}
                  onChange={(e) => setPrescriptionForm(prev => ({ ...prev, duration: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Route of Administration</Label>
              <Select
                value={prescriptionForm.route}
                onValueChange={(value) => setPrescriptionForm(prev => ({ ...prev, route: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oral">Oral</SelectItem>
                  <SelectItem value="iv">Intravenous (IV)</SelectItem>
                  <SelectItem value="im">Intramuscular (IM)</SelectItem>
                  <SelectItem value="topical">Topical</SelectItem>
                  <SelectItem value="inhalation">Inhalation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                rows={3}
                placeholder="e.g., Take after meals..."
                value={prescriptionForm.instructions}
                onChange={(e) => setPrescriptionForm(prev => ({ ...prev, instructions: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrescriptionDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedPatient) return;
              const med: Medication = {
                name: prescriptionForm.medication || 'Medication',
                dosage: prescriptionForm.dosage || '',
                frequency: prescriptionForm.frequency,
                duration: prescriptionForm.duration || '',
                route: prescriptionForm.route,
                instructions: prescriptionForm.instructions || undefined
              };
              const rx: Prescription = {
                id: `RX-${Date.now()}`,
                prescribedDate: new Date().toISOString().split('T')[0],
                prescribedBy: 'Dr. On Call',
                diagnosis: 'General',
                medications: [med],
                instructions: prescriptionForm.instructions || '',
                validity: '30 days',
                status: 'Active'
              };
              updateSelectedPatient((patient) => ({
                ...patient,
                prescriptions: [rx, ...patient.prescriptions],
                currentMedications: [med, ...patient.currentMedications]
              }));
              // Fire API call alongside local state update
              prescriptionService.create({
                patientId: selectedPatient.id,
                medications: [med],
                diagnosis: 'General',
                notes: prescriptionForm.instructions || undefined,
              }).catch((e: unknown) => console.error('Prescription API error', e));
              setPrescriptionForm({
                medication: '',
                dosage: '',
                frequency: 'bd',
                duration: '',
                route: 'oral',
                instructions: ''
              });
              toast({
                title: "Prescription Created",
                description: "New prescription has been added to patient record.",
              });
              setShowPrescriptionDialog(false);
            }}>Save Prescription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Procedure Dialog */}
      <Dialog open={showProcedureDialog} onOpenChange={setShowProcedureDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Procedure</DialogTitle>
            <DialogDescription>Record a surgical or diagnostic procedure</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Procedure Type</Label>
                <Select
                  value={procedureForm.type}
                  onValueChange={(value) => setProcedureForm(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="surgical">Surgical Procedure</SelectItem>
                    <SelectItem value="diagnostic">Diagnostic Procedure</SelectItem>
                    <SelectItem value="therapeutic">Therapeutic Procedure</SelectItem>
                    <SelectItem value="minor">Minor Procedure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={procedureForm.dateTime}
                  onChange={(e) => setProcedureForm(prev => ({ ...prev, dateTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Performed By</Label>
                <Input
                  placeholder="Surgeon/Doctor"
                  value={procedureForm.performedBy}
                  onChange={(e) => setProcedureForm(prev => ({ ...prev, performedBy: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Select
                  value={procedureForm.outcome}
                  onValueChange={(value) => setProcedureForm(prev => ({ ...prev, outcome: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Successful">Successful</SelectItem>
                    <SelectItem value="Complications">Complications</SelectItem>
                    <SelectItem value="Aborted">Aborted</SelectItem>
                    <SelectItem value="Follow-up Required">Follow-up Required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Procedure Name</Label>
              <Input
                placeholder="e.g., Laparoscopic Appendectomy"
                value={procedureForm.name}
                onChange={(e) => setProcedureForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Anesthesia Type</Label>
              <Select
                value={procedureForm.anesthesia || 'general'}
                onValueChange={(value) => setProcedureForm(prev => ({ ...prev, anesthesia: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Anesthesia</SelectItem>
                  <SelectItem value="spinal">Spinal Anesthesia</SelectItem>
                  <SelectItem value="local">Local Anesthesia</SelectItem>
                  <SelectItem value="sedation">Conscious Sedation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Findings</Label>
              <Textarea
                rows={3}
                placeholder="Procedure findings..."
                value={procedureForm.findings}
                onChange={(e) => setProcedureForm(prev => ({ ...prev, findings: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Complications</Label>
              <Textarea
                rows={2}
                placeholder="Complications if any..."
                value={procedureForm.complications}
                onChange={(e) => setProcedureForm(prev => ({ ...prev, complications: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                placeholder="Additional notes..."
                value={procedureForm.notes}
                onChange={(e) => setProcedureForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProcedureDialog(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!selectedPatient) return;
              if (!procedureForm.performedBy.trim()) {
                toast({ title: 'Performing doctor required', description: 'Enter who performed this procedure before saving.', variant: 'destructive' });
                return;
              }
              const procedure: Procedure = {
                id: `P-${Date.now()}`,
                name: procedureForm.name || 'Procedure',
                type: procedureForm.type === 'diagnostic' ? 'Diagnostic' : procedureForm.type === 'therapeutic' ? 'Non-Surgical' : 'Surgical',
                date: procedureForm.dateTime || new Date().toISOString(),
                performedBy: procedureForm.performedBy,
                anesthesia: procedureForm.anesthesia || undefined,
                findings: procedureForm.findings || undefined,
                complications: procedureForm.complications || undefined,
                outcome: procedureForm.outcome,
                notes: procedureForm.notes || undefined
              };
              updateSelectedPatient((patient) => ({ ...patient, procedures: [procedure, ...patient.procedures] }));
              // Local chart update above always happens so the doctor sees it immediately; the server-side workflow
              // trigger below is reported honestly instead of being swallowed behind an unconditional success toast.
              const [schedDate, schedTime] = (procedureForm.dateTime || new Date().toISOString()).split('T');
              let workflowFailed = false;
              try {
                await procedureService.schedule({
                  patientId: selectedPatient.id,
                  procedureName: procedureForm.name || 'Procedure',
                  scheduledDate: schedDate || new Date().toISOString().split('T')[0],
                  scheduledTime: schedTime?.slice(0, 5) || '09:00',
                  anesthesiaType: procedureForm.anesthesia || undefined,
                  notes: procedureForm.notes || undefined,
                });
              } catch (e: unknown) {
                console.error('Procedure API error', e);
                workflowFailed = true;
              }
              setProcedureForm({
                type: 'surgical',
                name: '',
                dateTime: new Date().toISOString().slice(0, 16),
                performedBy: '',
                anesthesia: '',
                findings: '',
                complications: '',
                outcome: 'Successful',
                notes: ''
              });
              if (workflowFailed) {
                toast({
                  title: "Procedure recorded locally — server sync failed",
                  description: "The procedure was added to this patient's chart here, but the billing/scheduling workflow trigger did not reach the server. Refresh and confirm it synced before relying on it elsewhere.",
                  variant: "destructive",
                });
              } else {
                toast({
                  title: "Procedure Added",
                  description: "Procedure record has been added to patient file.",
                });
              }
              setShowProcedureDialog(false);
            }}>Save Procedure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospitalLayout>
  );
};

export default HospitalEHR;

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
import { 
  FileHeart, Activity, Bell, Plus, Search, ArrowLeft, Edit, 
  Trash2, Eye, CheckCircle, XCircle, AlertCircle, RefreshCw,
  FileText, Download, Upload, Printer, Building2, User, 
  Calendar, Clock, History, Lock, Unlock, Heart, Thermometer,
  Droplets, Scale, Ruler, Brain, Pill, Syringe, Stethoscope,
  AlertTriangle, ClipboardList, FilePlus, FileCheck, Send,
  Image, Paperclip, MessageSquare, Share2, MoreVertical,
  ChevronRight, ChevronDown, BarChart3, LineChart, TrendingUp,
  TrendingDown, Zap, Shield, UserCog, HeartPulse, Bone, Baby
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
}

interface ImagingStudy {
  id: string;
  studyType: 'X-Ray' | 'CT Scan' | 'MRI' | 'Ultrasound' | 'ECG' | 'Echo';
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
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
    // Auto-select first patient for demo
    setSelectedPatient(samplePatients[0]);
    setLoading(false);
  }, [navigate]);

  // Sample data
  const samplePatients: PatientEHR[] = [
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
      createdAt: '2020-05-15',
      updatedAt: '2024-12-04',
    },
  ];

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
      case 'Critical': return 'bg-red-600 text-white';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-green-100 text-green-800';
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-orange-600" />
      </div>
    );
  }

  const patient = selectedPatient;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/hospital/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-3 rounded-xl">
                <FileHeart className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                  Electronic Health Records
                </h1>
                <p className="text-sm text-muted-foreground">Patient Charts & Clinical Documentation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search patient by UHID or name..." 
                  className="pl-9 w-72"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="relative">
                <Bell className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {patient && (
        <div className="container mx-auto px-6 py-6">
          {/* Patient Banner */}
          <Card className="mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
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
                    <div className="flex items-center gap-2 p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-800">
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
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <HeartPulse className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.bloodPressure.systolic}/{patient.vitals[0]?.bloodPressure.diastolic}</p>
                  <p className="text-xs text-muted-foreground">BP</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <Heart className="h-5 w-5 mx-auto mb-1 text-pink-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.heartRate}</p>
                  <p className="text-xs text-muted-foreground">Pulse</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <Thermometer className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.temperature}°F</p>
                  <p className="text-xs text-muted-foreground">Temp</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <Zap className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.oxygenSaturation}%</p>
                  <p className="text-xs text-muted-foreground">SpO2</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <Scale className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.weight} kg</p>
                  <p className="text-xs text-muted-foreground">Weight</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <BarChart3 className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                  <p className="text-lg font-bold">{patient.vitals[0]?.bmi}</p>
                  <p className="text-xs text-muted-foreground">BMI</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-8 w-auto">
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
                        <div key={idx} className="flex items-center justify-between p-2 bg-red-50 rounded">
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
                      <Pill className="h-5 w-5 text-blue-500" />
                      Current Medications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {patient.currentMedications.slice(0, 5).map((med, idx) => (
                        <div key={idx} className="p-2 bg-blue-50 rounded">
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
                        <div key={idx} className="flex items-center gap-2 p-2 bg-orange-50 rounded">
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
                            <Badge className={encounter.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
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
                          <Badge className={lab.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
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
                        <Input type="number" placeholder="mmHg" />
                      </div>
                      <div className="space-y-2">
                        <Label>Blood Pressure (Diastolic)</Label>
                        <Input type="number" placeholder="mmHg" />
                      </div>
                      <div className="space-y-2">
                        <Label>Heart Rate</Label>
                        <Input type="number" placeholder="bpm" />
                      </div>
                      <div className="space-y-2">
                        <Label>Temperature</Label>
                        <Input type="number" step="0.1" placeholder="°F" />
                      </div>
                      <div className="space-y-2">
                        <Label>Respiratory Rate</Label>
                        <Input type="number" placeholder="/min" />
                      </div>
                      <div className="space-y-2">
                        <Label>SpO2</Label>
                        <Input type="number" placeholder="%" />
                      </div>
                      <div className="space-y-2">
                        <Label>Weight</Label>
                        <Input type="number" step="0.1" placeholder="kg" />
                      </div>
                      <div className="space-y-2">
                        <Label>Height</Label>
                        <Input type="number" placeholder="cm" />
                      </div>
                      <div className="space-y-2">
                        <Label>Pain Level (0-10)</Label>
                        <Input type="number" min="0" max="10" placeholder="0-10" />
                      </div>
                      <div className="col-span-3 space-y-2">
                        <Label>Notes</Label>
                        <Textarea placeholder="Additional observations..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddVitalsDialog(false)}>Cancel</Button>
                      <Button className="bg-gradient-to-r from-orange-600 to-amber-600">Save Vitals</Button>
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
                                <Badge className="bg-green-100 text-green-800">Normal</Badge>
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
                        <Select>
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
                        <Select>
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
                        <Select>
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
                        <Textarea placeholder="Patient's main complaint..." />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Present Illness</Label>
                        <Textarea placeholder="History of present illness..." />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Examination Findings</Label>
                        <Textarea placeholder="Physical examination findings..." />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Diagnosis</Label>
                        <Textarea placeholder="Provisional/final diagnosis..." />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Treatment Plan</Label>
                        <Textarea placeholder="Treatment plan and instructions..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewEncounterDialog(false)}>Cancel</Button>
                      <Button className="bg-gradient-to-r from-orange-600 to-amber-600">Save Encounter</Button>
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
                        <Badge className={encounter.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
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
                        <Badge className={lab.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
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
                        <Badge className={study.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
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
                        <div className="p-3 bg-gray-50 rounded-lg">
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
                        <Badge className={rx.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
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
                      <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
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
                        <Badge className={proc.outcome === 'Successful' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
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
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg">
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
                        <Badge className={patient.socialHistory.stressLevel === 'High' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
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

            {/* Encounters Tab */}
            <TabsContent value="encounters" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Clinical Encounters</h2>
                <Button 
                  className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600"
                  onClick={() => setShowNewEncounterDialog(true)}
                >
                  <Plus className="h-4 w-4" /> New Encounter
                </Button>
              </div>

              <div className="space-y-4">
                {patient.encounters.map((encounter) => (
                  <Card key={encounter.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge>{encounter.type}</Badge>
                          <span className="font-semibold text-lg">{encounter.department}</span>
                          <span className="text-muted-foreground">• {encounter.doctor}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{encounter.date}</span>
                          <Badge className={encounter.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                            {encounter.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Chief Complaint</p>
                        <p className="font-medium">{encounter.chiefComplaint}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">History of Present Illness</p>
                        <p>{encounter.presentIllness}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Examination</p>
                        <p>{encounter.examination}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Diagnosis</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {encounter.diagnosis.map((dx, idx) => (
                            <Badge key={idx} variant="outline">{dx}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Treatment Plan</p>
                        <p>{encounter.treatmentPlan}</p>
                      </div>
                      {encounter.followUp && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium">Follow-up: {encounter.followUp}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
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
                <Select defaultValue="progress">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="progress">Progress Note</SelectItem>
                    <SelectItem value="admission">Admission Note</SelectItem>
                    <SelectItem value="discharge">Discharge Summary</SelectItem>
                    <SelectItem value="consult">Consultation Note</SelectItem>
                    <SelectItem value="procedure">Procedure Note</SelectItem>
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
              <Input placeholder="Brief subject of the note" />
            </div>
            <div className="space-y-2">
              <Label>Clinical Note</Label>
              <Textarea rows={8} placeholder="Enter detailed clinical note..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNoteDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast({
                title: "Note Added",
                description: "Clinical note has been added to patient record.",
              });
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
                <Select defaultValue="OPD">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPD">OPD Visit</SelectItem>
                    <SelectItem value="IPD">IPD Admission</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                    <SelectItem value="Day Care">Day Care</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Chief Complaint</Label>
              <Input placeholder="Primary complaint" />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis</Label>
              <Input placeholder="Provisional/confirmed diagnosis" />
            </div>
            <div className="space-y-2">
              <Label>Treatment Plan</Label>
              <Textarea rows={4} placeholder="Enter treatment plan..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewEncounterDialog(false)}>Cancel</Button>
            <Button onClick={() => {
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
                <Select defaultValue="blood">
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
                <Select defaultValue="routine">
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
              <Input placeholder="e.g., Complete Blood Count (CBC)" />
            </div>
            <div className="space-y-2">
              <Label>Clinical Indication</Label>
              <Textarea rows={3} placeholder="Reason for test..." />
            </div>
            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea rows={2} placeholder="Any special instructions..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLabTestDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast({
                title: "Lab Test Ordered",
                description: "Laboratory test order has been sent.",
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
                <Select defaultValue="xray">
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
                <Select defaultValue="routine">
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
              <Input placeholder="e.g., Chest, Abdomen, Head" />
            </div>
            <div className="space-y-2">
              <Label>Clinical Indication</Label>
              <Textarea rows={3} placeholder="Clinical reason for imaging..." />
            </div>
            <div className="space-y-2">
              <Label>Contrast Required?</Label>
              <Select defaultValue="no">
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
              toast({
                title: "Imaging Ordered",
                description: "Imaging study order has been sent to radiology.",
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
              <Input placeholder="e.g., Amoxicillin 500mg" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Dosage</Label>
                <Input placeholder="e.g., 500mg" />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select defaultValue="bd">
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
                <Input placeholder="e.g., 7 days" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Route of Administration</Label>
              <Select defaultValue="oral">
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
              <Textarea rows={3} placeholder="e.g., Take after meals..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrescriptionDialog(false)}>Cancel</Button>
            <Button onClick={() => {
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
                <Select defaultValue="surgical">
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
                <Input type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Procedure Name</Label>
              <Input placeholder="e.g., Laparoscopic Appendectomy" />
            </div>
            <div className="space-y-2">
              <Label>Anesthesia Type</Label>
              <Select defaultValue="general">
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
              <Textarea rows={3} placeholder="Procedure findings..." />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={3} placeholder="Additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProcedureDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast({
                title: "Procedure Added",
                description: "Procedure record has been added to patient file.",
              });
              setShowProcedureDialog(false);
            }}>Save Procedure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HospitalEHR;

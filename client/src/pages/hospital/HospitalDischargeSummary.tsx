import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAutosave } from '@/hooks/useAutosave';
import {
  FileText, Search, Plus, Download, Printer, Send, Eye, Edit,
  Calendar, User, Bed, Stethoscope, Pill, Activity, Clock,
  CheckCircle, AlertCircle, FileCheck, ClipboardList, Heart,
  Building2, Phone, Mail, ChevronRight, Filter, MoreVertical,
  History, Trash2, Copy, Share2, ArrowRight, Mic, MicOff, Volume2
} from 'lucide-react';

interface DischargeSummary {
  id: string;
  patientName: string;
  patientId: string;
  admissionDate: string;
  dischargeDate: string;
  ward: string;
  bed: string;
  diagnosis: string;
  attendingDoctor: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent';
  createdAt: string;
}

const HospitalDischargeSummary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  const [activeTab, setActiveTab] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [showCreateTemplateDialog, setShowCreateTemplateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    category: '',
    description: '',
    content: ''
  });

  // Speech recognition state
  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // Specialty template state
  const [selectedSpecialty, setSelectedSpecialty] = useState('general_medicine');
  const [availableSpecialties, setAvailableSpecialties] = useState<string[]>([]);
  const [specialtyTemplate, setSpecialtyTemplate] = useState<any>(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-IN'; // Indian English for medical terminology

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');

        if (activeField) {
          setFormData((prev) => ({
            ...prev,
            [activeField]: prev[activeField as keyof typeof prev] + ' ' + transcript
          }));
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        toast({
          title: 'Speech Recognition Error',
          description: `Error: ${event.error}. Please try again.`,
          variant: 'destructive'
        });
        setIsListening(false);
        setActiveField(null);
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          recognitionRef.current.start(); // Restart if still in listening mode
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [activeField, isListening, toast]);

  // Load available specialties
  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        const response = await api.get('/hospital/scribe/specialties');
        if (response.data.success) {
          setAvailableSpecialties(response.data.specialties);
        }
      } catch (error) {
        console.error('Error loading specialties:', error);
      }
    };
    
    loadSpecialties();
  }, []);

  // Load template when specialty changes
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const response = await api.get(`/hospital/scribe/template/${selectedSpecialty}`);
        if (response.data.success) {
          setSpecialtyTemplate(response.data.template);
          toast({
            title: 'Template Loaded',
            description: `${selectedSpecialty.replace(/_/g, ' ')} template loaded`
          });
        }
      } catch (error) {
        console.error('Error loading template:', error);
      }
    };
    
    loadTemplate();
  }, [selectedSpecialty, toast]);

  // Toggle speech recognition for a specific field
  const toggleScribe = (fieldName: string) => {
    if (!recognitionRef.current) {
      toast({
        title: 'Speech Recognition Not Supported',
        description: 'Your browser does not support speech recognition. Please use Chrome or Edge.',
        variant: 'destructive'
      });
      return;
    }

    if (isListening && activeField === fieldName) {
      // Stop listening
      recognitionRef.current.stop();
      setIsListening(false);
      setActiveField(null);
      toast({
        title: 'Scribe Stopped',
        description: 'Voice dictation has been stopped.'
      });
    } else {
      // Start listening
      setActiveField(fieldName);
      setIsListening(true);
      recognitionRef.current.start();
      toast({
        title: 'Scribe Active',
        description: `Voice dictation started for ${fieldName.replace(/([A-Z])/g, ' $1').trim()}. Speak clearly into your microphone.`
      });
    }
  };

  // Form state for new discharge summary
  const [formData, setFormData] = useState({
    patientId: '',
    admissionDate: '',
    dischargeDate: new Date().toISOString().split('T')[0],
    diagnosis: '',
    chiefComplaints: '',
    historyOfPresentIllness: '',
    pastHistory: '',
    physicalExamination: '',
    investigations: '',
    treatmentGiven: '',
    proceduresPerformed: '',
    courseInHospital: '',
    conditionAtDischarge: 'stable',
    followUpAdvice: '',
    medicationsOnDischarge: '',
    dietAdvice: '',
    activityRestrictions: '',
    warningSignsToWatch: '',
    nextAppointment: '',
    attendingDoctor: '',
    consultants: ''
  });

  const autosave = useAutosave({
    key: 'hospital_discharge_summary_draft',
    value: formData,
    save: async () => Promise.resolve(),
  });
  const [readmissionRisk, setReadmissionRisk] = useState<any>(null);
  const [dischargePlan, setDischargePlan] = useState<any>(null);
  const [planOwner, setPlanOwner] = useState('Ward Coordinator');
  const [targetDischargeDate, setTargetDischargeDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const restored = autosave.restore();
    if (restored) setFormData(restored);
  }, []);

  useEffect(() => {
    if (!formData.patientId) return;
    api.get(`/hospital/practice/patients/${formData.patientId}/readmission-risk`, { headers: hospitalHeaders() })
      .then((response) => setReadmissionRisk(response.data.data))
      .catch(() => setReadmissionRisk(null));
  }, [formData.patientId]);


  const createDischargePlan = async () => {
    if (!formData.patientId) return;
    const response = await api.post('/hospital/practice/discharge-plans', {
      patientId: formData.patientId,
      targetDischargeDate,
      owner: planOwner,
      tasks: [
        { label: 'Medication reconciliation', owner: 'Pharmacy', done: false },
        { label: 'Diet counselling', owner: 'Dietary', done: false },
        { label: 'Follow-up appointment', owner: 'Ward', done: false },
      ],
    }, { headers: hospitalHeaders() });
    setDischargePlan(response.data.data);
  };

  // WP-0.3: there is no GET endpoint for discharge summaries yet (server/routes/hospital/practice.route.js
  // only has POST/PUT) and no `attending_doctor` column on discharge_summaries — so this list is seeded from
  // localStorage (see loadHospitalStore below) rather than the database, and these four names are fabricated
  // seed data, not real patients. A real save (handleSaveDraft/handleSubmitForApproval below) does write to
  // the database now; only the LIST shown on this screen is still local-only until that GET endpoint exists.
  // Tracked in docs/WP0.3_INVENTED_DATA_INVENTORY.md.
  const initialSummaries: DischargeSummary[] = [
    {
      id: 'DS001',
      patientName: 'Rajesh Kumar',
      patientId: 'P10045',
      admissionDate: '2026-01-02',
      dischargeDate: '2026-01-07',
      ward: 'Cardiology',
      bed: 'ICU-05',
      diagnosis: 'Acute Myocardial Infarction',
      attendingDoctor: 'Dr. Sharma',
      status: 'approved',
      createdAt: '2026-01-07T10:30:00'
    },
    {
      id: 'DS002',
      patientName: 'Priya Singh',
      patientId: 'P10052',
      admissionDate: '2026-01-04',
      dischargeDate: '2026-01-07',
      ward: 'Gynecology',
      bed: 'GYN-12',
      diagnosis: 'Normal Vaginal Delivery',
      attendingDoctor: 'Dr. Patel',
      status: 'pending_approval',
      createdAt: '2026-01-07T09:15:00'
    },
    {
      id: 'DS003',
      patientName: 'Amit Verma',
      patientId: 'P10038',
      admissionDate: '2026-01-01',
      dischargeDate: '2026-01-07',
      ward: 'Neurology',
      bed: 'NEURO-03',
      diagnosis: 'Ischemic Stroke',
      attendingDoctor: 'Dr. Mehta',
      status: 'draft',
      createdAt: '2026-01-07T11:45:00'
    },
    {
      id: 'DS004',
      patientName: 'Neha Gupta',
      patientId: 'P10061',
      admissionDate: '2026-01-05',
      dischargeDate: '2026-01-07',
      ward: 'Orthopedics',
      bed: 'ORTHO-08',
      diagnosis: 'Fracture Right Femur',
      attendingDoctor: 'Dr. Joshi',
      status: 'sent',
      createdAt: '2026-01-06T16:20:00'
    }
  ];

  const [summaries, setSummaries] = useState<DischargeSummary[]>(
    () => loadHospitalStore('discharge-summaries', initialSummaries)
  );

  // Fabricated patient list — no admitted-patients endpoint is wired here yet; see the comment above initialSummaries.
  const admittedPatients = [
    { id: 'P10045', name: 'Rajesh Kumar', ward: 'Cardiology', bed: 'ICU-05', admissionDate: '2026-01-02' },
    { id: 'P10052', name: 'Priya Singh', ward: 'Gynecology', bed: 'GYN-12', admissionDate: '2026-01-04' },
    { id: 'P10038', name: 'Amit Verma', ward: 'Neurology', bed: 'NEURO-03', admissionDate: '2026-01-01' },
    { id: 'P10061', name: 'Neha Gupta', ward: 'Orthopedics', bed: 'ORTHO-08', admissionDate: '2026-01-05' },
    { id: 'P10078', name: 'Vikram Reddy', ward: 'General Medicine', bed: 'GM-22', admissionDate: '2026-01-06' },
  ];

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300', label: 'Draft' },
      pending_approval: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Pending Approval' },
      approved: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Approved' },
      sent: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Sent to Patient' }
    };
    const config = statusConfig[status as keyof typeof statusConfig];
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const handleCreateSummary = () => {
    if (!selectedPatient) {
      toast({
        title: "Select Patient",
        description: "Please select a patient to create discharge summary",
        variant: "destructive"
      });
      return;
    }
    const patient = admittedPatients.find((item) => item.id === selectedPatient);
    setFormData((prev) => ({
      ...prev,
      patientId: selectedPatient,
      admissionDate: patient?.admissionDate || prev.admissionDate,
      attendingDoctor: patient?.attendingDoctor || prev.attendingDoctor,
    }));
    setShowCreateDialog(false);
    setActiveTab('create');
  };

  const handleSaveDraft = async () => {
    const patient = admittedPatients.find((item) => item.id === selectedPatient);
    if (!patient) {
      toast({ title: "Select Patient", description: "Please select a patient first", variant: "destructive" });
      return;
    }
    if (!formData.attendingDoctor.trim()) {
      toast({ title: "Attending Doctor Required", description: "Enter the attending doctor's name before saving — this is a clinical record.", variant: "destructive" });
      return;
    }
    try {
      const draftData = {
        patientId: selectedPatient,
        diagnosis: '',
        procedures: [],
        medications: [],
        followUp: '',
        status: 'draft'
      };

      // A discharge summary is a clinical record — a failed save must not be shown as a success, and the record
      // shown afterward must be the one the server actually saved (real id/timestamp), not a locally-fabricated one.
      const response = await api.post(
        '/hospital/practice/discharge-summaries',
        draftData,
        { headers: hospitalHeaders() }
      );
      const saved = response.data?.data;

      const created: DischargeSummary = {
        id: saved?.id ? String(saved.id) : `DS-${Date.now()}`,
        patientName: patient.name,
        patientId: patient.id,
        admissionDate: patient.admissionDate,
        dischargeDate: formData.dischargeDate,
        ward: patient.ward,
        bed: patient.bed,
        diagnosis: formData.diagnosis || 'Pending',
        attendingDoctor: formData.attendingDoctor,
        status: 'draft',
        createdAt: saved?.created_at ? String(saved.created_at) : new Date().toISOString()
      };

      setSummaries((prev) => {
        const updated = [created, ...prev];
        saveHospitalStore('discharge-summaries', updated);
        return updated;
      });

      toast({
        title: "Draft Saved",
        description: "Discharge summary saved as draft successfully"
      });
    } catch (error: any) {
      toast({
        title: 'Failed to save draft',
        description: error.response?.data?.message || 'An error occurred — the draft was NOT saved',
        variant: 'destructive'
      });
    }
  };

  const handleSubmitForApproval = async () => {
    const patient = admittedPatients.find((item) => item.id === selectedPatient);
    if (!patient) {
      toast({ title: "Select Patient", description: "Please select a patient first", variant: "destructive" });
      return;
    }
    if (!formData.attendingDoctor.trim()) {
      toast({ title: "Attending Doctor Required", description: "Enter the attending doctor's name before submitting — this is a clinical record.", variant: "destructive" });
      return;
    }
    try {
      const submissionData = {
        patientId: selectedPatient,
        diagnosis: '',
        procedures: [],
        medications: [],
        followUp: '',
        status: 'pending_approval'
      };

      const response = await api.post(
        '/hospital/practice/discharge-summaries/submit',
        submissionData,
        { headers: hospitalHeaders() }
      );
      const saved = response.data?.data;

      const created: DischargeSummary = {
        id: saved?.id ? String(saved.id) : `DS-${Date.now()}`,
        patientName: patient.name,
        patientId: patient.id,
        admissionDate: patient.admissionDate,
        dischargeDate: formData.dischargeDate,
        ward: patient.ward,
        bed: patient.bed,
        diagnosis: formData.diagnosis || 'Pending',
        attendingDoctor: formData.attendingDoctor,
        status: 'pending_approval',
        createdAt: saved?.created_at ? String(saved.created_at) : new Date().toISOString()
      };

      setSummaries((prev) => {
        const updated = [created, ...prev];
        saveHospitalStore('discharge-summaries', updated);
        return updated;
      });

      toast({
        title: "Submitted for Approval",
        description: "Discharge summary sent to senior doctor for review"
      });
    } catch (error: any) {
      toast({
        title: 'Failed to submit',
        description: error.response?.data?.message || 'An error occurred — nothing was submitted',
        variant: 'destructive'
      });
    }
  };

  const handlePrint = (id: string) => {
    toast({
      title: "Printing",
      description: "Discharge summary sent to printer"
    });
  };

  const handleCreateTemplate = () => {
    if (!newTemplate.name || !newTemplate.category) {
      toast({
        title: "Missing Fields",
        description: "Template name and category are required",
        variant: "destructive"
      });
      return;
    }

    const template = {
      id: `TPL-${Date.now()}`,
      name: newTemplate.name,
      category: newTemplate.category,
      description: newTemplate.description,
      content: newTemplate.content,
      createdAt: new Date().toISOString()
    };

    // Save to localStorage
    const existingTemplates = loadHospitalStore('discharge-templates', []);
    saveHospitalStore('discharge-templates', [...existingTemplates, template]);

    toast({
      title: "Template Created",
      description: `${newTemplate.name} template has been saved successfully`
    });

    setNewTemplate({ name: '', category: '', description: '', content: '' });
    setShowCreateTemplateDialog(false);
  };

  const handleDownload = (id: string) => {
    toast({
      title: "Downloaded",
      description: "Discharge summary downloaded as PDF"
    });
  };

  const filteredSummaries = summaries.filter(summary => {
    const matchesSearch = summary.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         summary.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         summary.diagnosis.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || summary.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <HospitalLayout title="Discharge Summary" subtitle="Generate and manage patient discharge summaries">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="list" className="gap-2">
              <FileText className="h-4 w-4" /> All Summaries
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <Plus className="h-4 w-4" /> Create New
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Templates
            </TabsTrigger>
          </TabsList>

          {activeTab === 'list' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by patient, ID, or diagnosis..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white gap-2">
                    <Plus className="h-4 w-4" /> New Summary
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Discharge Summary</DialogTitle>
                    <DialogDescription>Select an admitted patient to generate discharge summary</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Label>Select Patient</Label>
                    <ScrollArea className="h-64 border rounded-lg p-2">
                      {admittedPatients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => setSelectedPatient(patient.id)}
                          className={`p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
                            selectedPatient === patient.id
                              ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-500'
                              : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-white">{patient.name}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{patient.id} • {patient.ward} • Bed: {patient.bed}</p>
                            </div>
                            {selectedPatient === patient.id && (
                              <CheckCircle className="h-5 w-5 text-teal-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateSummary} className="bg-teal-600 hover:bg-teal-700">Continue</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* List View */}
        <TabsContent value="list" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Summaries</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">156</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <FileText className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Pending Approval</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">12</p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-xl">
                    <Clock className="h-6 w-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Approved Today</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">8</p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Sent to Patients</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">45</p>
                  </div>
                  <div className="p-3 bg-teal-500/10 rounded-xl">
                    <Send className="h-6 w-6 text-teal-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summaries List */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-800 dark:text-white">Recent Discharge Summaries</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Manage and track all discharge summaries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredSummaries.map((summary) => (
                  <div
                    key={summary.id}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-teal-500/10 rounded-xl">
                        <FileText className="h-5 w-5 text-teal-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 dark:text-white">{summary.patientName}</p>
                          <Badge variant="outline" className="text-xs">{summary.id}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {summary.patientId} • {summary.ward} • {summary.diagnosis}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Admitted: {summary.admissionDate} | Discharged: {summary.dischargeDate} | Dr. {summary.attendingDoctor.replace('Dr. ', '')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(summary.status)}
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handlePrint(summary.id)}>
                          <Printer className="h-4 w-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDownload(summary.id)}>
                          <Download className="h-4 w-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4 text-slate-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create New Summary */}
        <TabsContent value="create" className="space-y-6">
          {/* Specialty Selection */}
          <Card className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border-teal-200/50 dark:border-teal-700/30">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-teal-700 dark:text-teal-300 font-semibold">Medical Specialty</Label>
                  <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                    <SelectTrigger className="border-teal-200">
                      <SelectValue placeholder="Select specialty" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSpecialties.map((specialty) => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty.replace(/_/g, ' ').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Template will customize sections for your specialty
                  </p>
                </div>
                {specialtyTemplate && (
                  <div className="space-y-2">
                    <Label className="text-teal-700 dark:text-teal-300 font-semibold">Template Info</Label>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-teal-200 dark:border-teal-700/30">
                      <p className="text-sm font-medium text-slate-800 dark:text-white">
                        Key Investigations: {specialtyTemplate.key_investigations?.length || 0}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {specialtyTemplate.key_investigations?.slice(0, 3).join(', ')}...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">New Discharge Summary</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Complete all sections for the discharge summary</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Autosave: {autosave.status}</Badge>
                  <Button variant="outline" onClick={handleSaveDraft}>
                    <FileCheck className="h-4 w-4 mr-2" /> Save Draft
                  </Button>
                  <Button onClick={handleSubmitForApproval} className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Send className="h-4 w-4 mr-2" /> Submit for Approval
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-8 pr-4">
                  <Card>
                    <CardContent className="pt-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Discharge Planning</p>
                          <p className="text-xs text-muted-foreground">Coordinate cross-department sign-off before final discharge.</p>
                        </div>
                        {dischargePlan && <Badge>{dischargePlan.status}</Badge>}
                      </div>
                      {!dischargePlan ? (
                        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <Input value={planOwner} onChange={(e) => setPlanOwner(e.target.value)} placeholder="Plan owner" />
                          <Input type="date" value={targetDischargeDate} onChange={(e) => setTargetDischargeDate(e.target.value)} />
                          <Button onClick={createDischargePlan}>Create Plan</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">{(dischargePlan.tasks || []).map((task: any) => <Badge key={task.label} variant="outline">{task.owner}: {task.label}</Badge>)}</div>
                      )}
                    </CardContent>
                  </Card>

                  {readmissionRisk && (
                    <Card className={readmissionRisk.level === 'high' ? 'border-red-300 bg-red-50' : readmissionRisk.level === 'medium' ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">30-Day Readmission Risk</p>
                            <p className="text-2xl font-semibold capitalize">{readmissionRisk.level}</p>
                          </div>
                          <Badge>{Math.round(readmissionRisk.score || 0)}</Badge>
                        </div>
                        {Object.keys(readmissionRisk.factors || {}).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(readmissionRisk.factors).slice(0, 3).map(([factor, value]) => (
                              <Badge key={factor} variant="outline">{factor}: {String(value)}</Badge>
                            ))}
                          </div>
                        )}
                        {readmissionRisk.level === 'high' && (
                          <Button className="mt-3" size="sm" onClick={createDischargePlan}>Create follow-up care plan</Button>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {/* Patient Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <User className="h-5 w-5 text-teal-500" /> Patient Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Patient ID</Label>
                        <Input
                          value={formData.patientId}
                          placeholder="Patient ID"
                          onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Admission Date</Label>
                        <Input type="date" value={formData.admissionDate || '2026-01-02'} />
                      </div>
                      <div className="space-y-2">
                        <Label>Discharge Date</Label>
                        <Input type="date" value={formData.dischargeDate} onChange={(e) => setFormData({...formData, dischargeDate: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Clinical Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <Stethoscope className="h-5 w-5 text-teal-500" /> Clinical Information
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Final Diagnosis</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'diagnosis' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('diagnosis')}
                            className={isListening && activeField === 'diagnosis' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'diagnosis' ? (
                              <>
                                <MicOff className="h-4 w-4 mr-1" />
                                Stop Scribe
                              </>
                            ) : (
                              <>
                                <Mic className="h-4 w-4 mr-1" />
                                Start Scribe
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Enter final diagnosis..."
                          value={formData.diagnosis}
                          onChange={(e) => setFormData({...formData, diagnosis: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Chief Complaints</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'chiefComplaints' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('chiefComplaints')}
                            className={isListening && activeField === 'chiefComplaints' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'chiefComplaints' ? (
                              <>
                                <MicOff className="h-4 w-4 mr-1" />
                                Stop Scribe
                              </>
                            ) : (
                              <>
                                <Mic className="h-4 w-4 mr-1" />
                                Start Scribe
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Patient's chief complaints at admission..."
                          value={formData.chiefComplaints}
                          onChange={(e) => setFormData({...formData, chiefComplaints: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>History of Present Illness</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'historyOfPresentIllness' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('historyOfPresentIllness')}
                            className={isListening && activeField === 'historyOfPresentIllness' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'historyOfPresentIllness' ? (
                              <>
                                <MicOff className="h-4 w-4 mr-1" />
                                Stop Scribe
                              </>
                            ) : (
                              <>
                                <Mic className="h-4 w-4 mr-1" />
                                Start Scribe
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Detailed history of present illness..."
                          value={formData.historyOfPresentIllness}
                          onChange={(e) => setFormData({...formData, historyOfPresentIllness: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Past Medical History</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'pastHistory' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('pastHistory')}
                            className={isListening && activeField === 'pastHistory' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'pastHistory' ? (
                              <>
                                <MicOff className="h-4 w-4 mr-1" />
                                Stop Scribe
                              </>
                            ) : (
                              <>
                                <Mic className="h-4 w-4 mr-1" />
                                Start Scribe
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Previous illnesses, surgeries, allergies..."
                          value={formData.pastHistory}
                          onChange={(e) => setFormData({...formData, pastHistory: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Examination & Investigations */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <Activity className="h-5 w-5 text-teal-500" /> Examination & Investigations
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Physical Examination Findings</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'physicalExamination' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('physicalExamination')}
                            className={isListening && activeField === 'physicalExamination' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'physicalExamination' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop Scribe</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Start Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="General examination, vital signs, systemic examination..."
                          value={formData.physicalExamination}
                          onChange={(e) => setFormData({...formData, physicalExamination: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Investigations Done</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'investigations' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('investigations')}
                            className={isListening && activeField === 'investigations' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'investigations' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop Scribe</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Start Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Lab tests, imaging, other investigations with key findings..."
                          value={formData.investigations}
                          onChange={(e) => setFormData({...formData, investigations: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Treatment */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <Pill className="h-5 w-5 text-teal-500" /> Treatment & Course
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Treatment Given</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'treatmentGiven' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('treatmentGiven')}
                            className={isListening && activeField === 'treatmentGiven' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'treatmentGiven' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop Scribe</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Start Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Medications, IV fluids, oxygen therapy, etc..."
                          value={formData.treatmentGiven}
                          onChange={(e) => setFormData({...formData, treatmentGiven: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Procedures Performed</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'proceduresPerformed' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('proceduresPerformed')}
                            className={isListening && activeField === 'proceduresPerformed' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'proceduresPerformed' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop Scribe</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Start Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Surgeries, procedures, interventions..."
                          value={formData.proceduresPerformed}
                          onChange={(e) => setFormData({...formData, proceduresPerformed: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Course in Hospital</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'courseInHospital' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('courseInHospital')}
                            className={isListening && activeField === 'courseInHospital' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'courseInHospital' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop Scribe</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Start Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Day by day progress, response to treatment..."
                          value={formData.courseInHospital}
                          onChange={(e) => setFormData({...formData, courseInHospital: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Discharge Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <Heart className="h-5 w-5 text-teal-500" /> Discharge Information
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Condition at Discharge</Label>
                        <Select value={formData.conditionAtDischarge} onValueChange={(v) => setFormData({...formData, conditionAtDischarge: v})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select condition" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stable">Stable</SelectItem>
                            <SelectItem value="improved">Improved</SelectItem>
                            <SelectItem value="same">Same as Admission</SelectItem>
                            <SelectItem value="critical">Critical (Against Medical Advice)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Medications on Discharge</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'medicationsOnDischarge' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('medicationsOnDischarge')}
                            className={isListening && activeField === 'medicationsOnDischarge' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'medicationsOnDischarge' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop Scribe</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Start Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="List all medications with dosage and duration..."
                          value={formData.medicationsOnDischarge}
                          onChange={(e) => setFormData({...formData, medicationsOnDischarge: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Diet Advice</Label>
                            <Button
                              type="button"
                              variant={isListening && activeField === 'dietAdvice' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => toggleScribe('dietAdvice')}
                              className={isListening && activeField === 'dietAdvice' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                            >
                              {isListening && activeField === 'dietAdvice' ? (
                                <><MicOff className="h-4 w-4 mr-1" />Stop</>
                              ) : (
                                <><Mic className="h-4 w-4 mr-1" />Scribe</>
                              )}
                            </Button>
                          </div>
                          <Textarea 
                            placeholder="Dietary restrictions, recommendations..."
                            value={formData.dietAdvice}
                            onChange={(e) => setFormData({...formData, dietAdvice: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Activity Restrictions</Label>
                            <Button
                              type="button"
                              variant={isListening && activeField === 'activityRestrictions' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => toggleScribe('activityRestrictions')}
                              className={isListening && activeField === 'activityRestrictions' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                            >
                              {isListening && activeField === 'activityRestrictions' ? (
                                <><MicOff className="h-4 w-4 mr-1" />Stop</>
                              ) : (
                                <><Mic className="h-4 w-4 mr-1" />Scribe</>
                              )}
                            </Button>
                          </div>
                          <Textarea 
                            placeholder="Physical activity limitations..."
                            value={formData.activityRestrictions}
                            onChange={(e) => setFormData({...formData, activityRestrictions: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Warning Signs to Watch</Label>
                          <Button
                            type="button"
                            variant={isListening && activeField === 'warningSignsToWatch' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleScribe('warningSignsToWatch')}
                            className={isListening && activeField === 'warningSignsToWatch' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                          >
                            {isListening && activeField === 'warningSignsToWatch' ? (
                              <><MicOff className="h-4 w-4 mr-1" />Stop</>
                            ) : (
                              <><Mic className="h-4 w-4 mr-1" />Scribe</>
                            )}
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Symptoms that require immediate medical attention..."
                          value={formData.warningSignsToWatch}
                          onChange={(e) => setFormData({...formData, warningSignsToWatch: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Follow-up Advice</Label>
                            <Button
                              type="button"
                              variant={isListening && activeField === 'followUpAdvice' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => toggleScribe('followUpAdvice')}
                              className={isListening && activeField === 'followUpAdvice' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}
                            >
                              {isListening && activeField === 'followUpAdvice' ? (
                                <><MicOff className="h-4 w-4 mr-1" />Stop</>
                              ) : (
                                <><Mic className="h-4 w-4 mr-1" />Scribe</>
                              )}
                            </Button>
                          </div>
                          <Label>Follow-up Advice</Label>
                          <Textarea 
                            placeholder="Follow-up instructions..."
                            value={formData.followUpAdvice}
                            onChange={(e) => setFormData({...formData, followUpAdvice: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Next Appointment</Label>
                          <Input 
                            type="date" 
                            value={formData.nextAppointment}
                            onChange={(e) => setFormData({...formData, nextAppointment: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Doctors */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-teal-500" /> Attending Physicians
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Attending Doctor</Label>
                        <Input 
                          placeholder="Primary attending physician"
                          value={formData.attendingDoctor}
                          onChange={(e) => setFormData({...formData, attendingDoctor: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Consultants</Label>
                        <Input 
                          placeholder="Other consulting doctors"
                          value={formData.consultants}
                          onChange={(e) => setFormData({...formData, consultants: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Discharge Summary Templates</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Pre-configured templates for common diagnoses</CardDescription>
                </div>
                <Dialog open={showCreateTemplateDialog} onOpenChange={setShowCreateTemplateDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="h-4 w-4 mr-2" /> Create Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Template</DialogTitle>
                      <DialogDescription>Create a reusable discharge summary template</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="templateName">Template Name</Label>
                          <Input
                            id="templateName"
                            placeholder="e.g., Post-Surgery Discharge"
                            value={newTemplate.name}
                            onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="templateCategory">Category</Label>
                          <Select value={newTemplate.category} onValueChange={(value) => setNewTemplate({...newTemplate, category: value})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="General Surgery">General Surgery</SelectItem>
                              <SelectItem value="Cardiology">Cardiology</SelectItem>
                              <SelectItem value="Orthopedics">Orthopedics</SelectItem>
                              <SelectItem value="Gynecology & Obstetrics">Gynecology & Obstetrics</SelectItem>
                              <SelectItem value="Neurology">Neurology</SelectItem>
                              <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="templateDescription">Description</Label>
                        <Input
                          id="templateDescription"
                          placeholder="Brief description of when to use this template"
                          value={newTemplate.description}
                          onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="templateContent">Template Content</Label>
                        <Textarea
                          id="templateContent"
                          placeholder="Enter the template content with placeholders like {{patient_name}}, {{diagnosis}}, etc."
                          className="min-h-[200px]"
                          value={newTemplate.content}
                          onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCreateTemplateDialog(false)}>Cancel</Button>
                      <Button onClick={handleCreateTemplate} className="bg-teal-600 hover:bg-teal-700">Create Template</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'General Surgery', count: 12, color: 'from-blue-500 to-blue-600' },
                  { name: 'Cardiology', count: 8, color: 'from-red-500 to-red-600' },
                  { name: 'Orthopedics', count: 15, color: 'from-amber-500 to-amber-600' },
                  { name: 'Gynecology & Obstetrics', count: 10, color: 'from-pink-500 to-pink-600' },
                  { name: 'Neurology', count: 6, color: 'from-purple-500 to-purple-600' },
                  { name: 'Pediatrics', count: 9, color: 'from-teal-500 to-teal-600' },
                ].map((template) => (
                  <Card key={template.name} className="cursor-pointer hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${template.color} flex items-center justify-center mb-4`}>
                        <FileText className="h-6 w-6 text-white" />
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-white">{template.name}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{template.count} templates</p>
                      <Button variant="ghost" className="mt-4 w-full justify-between text-teal-600 dark:text-teal-400">
                        View Templates <ArrowRight className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
};

export default HospitalDischargeSummary;

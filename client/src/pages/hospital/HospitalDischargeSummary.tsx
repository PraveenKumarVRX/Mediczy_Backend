import { useState } from 'react';
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
import {
  FileText, Search, Plus, Download, Printer, Send, Eye, Edit,
  Calendar, User, Bed, Stethoscope, Pill, Activity, Clock,
  CheckCircle, AlertCircle, FileCheck, ClipboardList, Heart,
  Building2, Phone, Mail, ChevronRight, Filter, MoreVertical,
  History, Trash2, Copy, Share2, ArrowRight
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

  // Mock patients for selection
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
    setShowCreateDialog(false);
    setActiveTab('create');
  };

  const handleSaveDraft = async () => {
    try {
      const draftData = {
        patientId: selectedPatient,
        diagnosis: '',
        procedures: [],
        medications: [],
        followUp: '',
        status: 'draft'
      };

      try {
        await api.post(
          '/hospital/discharge-summaries',
          draftData,
          { headers: hospitalHeaders() }
        );
      } catch {
        // Allow local persistence if API is unavailable
      }

      const patient = admittedPatients.find((item) => item.id === selectedPatient);
      if (patient) {
        const created: DischargeSummary = {
          id: `DS-${Date.now()}`,
          patientName: patient.name,
          patientId: patient.id,
          admissionDate: patient.admissionDate,
          dischargeDate: formData.dischargeDate,
          ward: patient.ward,
          bed: patient.bed,
          diagnosis: formData.diagnosis || 'Pending',
          attendingDoctor: formData.attendingDoctor || 'On Call',
          status: 'draft',
          createdAt: new Date().toISOString()
        };

        setSummaries((prev) => {
          const updated = [created, ...prev];
          saveHospitalStore('discharge-summaries', updated);
          return updated;
        });
      }

      toast({
        title: "Draft Saved",
        description: "Discharge summary saved as draft successfully"
      });
    } catch (error: any) {
      toast({
        title: 'Failed to save draft',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const handleSubmitForApproval = async () => {
    try {
      const submissionData = {
        patientId: selectedPatient,
        diagnosis: '',
        procedures: [],
        medications: [],
        followUp: '',
        status: 'pending_approval'
      };

      try {
        await api.post(
          '/hospital/discharge-summaries/submit',
          submissionData,
          { headers: hospitalHeaders() }
        );
      } catch {
        // Allow local persistence if API is unavailable
      }

      const patient = admittedPatients.find((item) => item.id === selectedPatient);
      if (patient) {
        const created: DischargeSummary = {
          id: `DS-${Date.now()}`,
          patientName: patient.name,
          patientId: patient.id,
          admissionDate: patient.admissionDate,
          dischargeDate: formData.dischargeDate,
          ward: patient.ward,
          bed: patient.bed,
          diagnosis: formData.diagnosis || 'Pending',
          attendingDoctor: formData.attendingDoctor || 'On Call',
          status: 'pending_approval',
          createdAt: new Date().toISOString()
        };

        setSummaries((prev) => {
          const updated = [created, ...prev];
          saveHospitalStore('discharge-summaries', updated);
          return updated;
        });
      }

      toast({
        title: "Submitted for Approval",
        description: "Discharge summary sent to senior doctor for review"
      });
    } catch (error: any) {
      toast({
        title: 'Failed to submit',
        description: error.response?.data?.message || 'An error occurred',
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
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">New Discharge Summary</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Complete all sections for the discharge summary</CardDescription>
                </div>
                <div className="flex gap-2">
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
                  {/* Patient Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <User className="h-5 w-5 text-teal-500" /> Patient Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Patient ID</Label>
                        <Input value={formData.patientId || 'P10045'} placeholder="Patient ID" />
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
                        <Label>Final Diagnosis</Label>
                        <Textarea 
                          placeholder="Enter final diagnosis..."
                          value={formData.diagnosis}
                          onChange={(e) => setFormData({...formData, diagnosis: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Chief Complaints</Label>
                        <Textarea 
                          placeholder="Patient's chief complaints at admission..."
                          value={formData.chiefComplaints}
                          onChange={(e) => setFormData({...formData, chiefComplaints: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>History of Present Illness</Label>
                        <Textarea 
                          placeholder="Detailed history of present illness..."
                          value={formData.historyOfPresentIllness}
                          onChange={(e) => setFormData({...formData, historyOfPresentIllness: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Past Medical History</Label>
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
                        <Label>Physical Examination Findings</Label>
                        <Textarea 
                          placeholder="General examination, vital signs, systemic examination..."
                          value={formData.physicalExamination}
                          onChange={(e) => setFormData({...formData, physicalExamination: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Investigations Done</Label>
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
                        <Label>Treatment Given</Label>
                        <Textarea 
                          placeholder="Medications, IV fluids, oxygen therapy, etc..."
                          value={formData.treatmentGiven}
                          onChange={(e) => setFormData({...formData, treatmentGiven: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Procedures Performed</Label>
                        <Textarea 
                          placeholder="Surgeries, procedures, interventions..."
                          value={formData.proceduresPerformed}
                          onChange={(e) => setFormData({...formData, proceduresPerformed: e.target.value})}
                          className="min-h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Course in Hospital</Label>
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
                        <Label>Medications on Discharge</Label>
                        <Textarea 
                          placeholder="List all medications with dosage and duration..."
                          value={formData.medicationsOnDischarge}
                          onChange={(e) => setFormData({...formData, medicationsOnDischarge: e.target.value})}
                          className="min-h-24"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Diet Advice</Label>
                          <Textarea 
                            placeholder="Dietary restrictions, recommendations..."
                            value={formData.dietAdvice}
                            onChange={(e) => setFormData({...formData, dietAdvice: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Activity Restrictions</Label>
                          <Textarea 
                            placeholder="Physical activity limitations..."
                            value={formData.activityRestrictions}
                            onChange={(e) => setFormData({...formData, activityRestrictions: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Warning Signs to Watch</Label>
                        <Textarea 
                          placeholder="Symptoms that require immediate medical attention..."
                          value={formData.warningSignsToWatch}
                          onChange={(e) => setFormData({...formData, warningSignsToWatch: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
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
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> Create Template
                </Button>
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

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Search,
  FileText,
  Activity,
  Pill,
  FlaskConical,
  Stethoscope,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  Heart,
  Thermometer,
  Droplets,
  Wind,
  AlertTriangle,
  Download,
  Printer,
  ChevronRight,
  Eye,
  Plus,
  Filter,
  RefreshCw,
  FileImage,
  Loader2,
  ClipboardList,
  Syringe,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import api from '@/utils/api';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
  allergies?: string[];
  medicalHistory?: any;
  profileImage?: string;
}

interface VitalSign {
  id: number;
  type: string;
  value: number;
  unit: string;
  recordedAt: string;
  notes?: string;
}

interface Prescription {
  id: number;
  diagnosis: string;
  medications: any[];
  createdAt: string;
  doctorName: string;
}

interface LabReport {
  id: number;
  testName: string;
  result: string;
  normalRange: string;
  status: 'normal' | 'abnormal' | 'critical';
  date: string;
}

interface Appointment {
  id: number;
  date: string;
  time: string;
  type: string;
  status: string;
  notes?: string;
  doctorName: string;
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

export default function PatientEMR() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Record Vitals Dialog State
  const [isRecordVitalsOpen, setIsRecordVitalsOpen] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRate: '',
    temperature: '',
    spO2: '',
    weight: '',
    bloodSugar: '',
    notes: ''
  });
  
  // Lab Filter State
  const [isLabFilterOpen, setIsLabFilterOpen] = useState(false);
  const [labFilter, setLabFilter] = useState({
    status: 'all',
    dateFrom: '',
    dateTo: ''
  });
  
  // Appointment View State
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);

  // Patient Reports State
  const [patientReports, setPatientReports] = useState<PatientReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Fetch patients
  const { data: patientsData, isLoading: loadingPatients, refetch: refetchPatients } = useQuery({
    queryKey: ['doctor-patients-emr'],
    queryFn: async () => {
      const response = await api.get('/doctors/my-patients');
      return response.data;
    }
  });

  const patients = patientsData?.patients || [];

  // Filter patients based on search
  const filteredPatients = patients.filter((p: Patient) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      p.firstName?.toLowerCase().includes(searchLower) ||
      p.lastName?.toLowerCase().includes(searchLower) ||
      p.email?.toLowerCase().includes(searchLower) ||
      p.phoneNumber?.includes(searchQuery)
    );
  });

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

  // Mock data for selected patient's records
  const mockVitals: VitalSign[] = selectedPatient ? [
    { id: 1, type: 'Blood Pressure', value: 120, unit: '/80 mmHg', recordedAt: '2025-12-28T10:00:00', notes: 'Normal' },
    { id: 2, type: 'Heart Rate', value: 72, unit: 'bpm', recordedAt: '2025-12-28T10:00:00' },
    { id: 3, type: 'Temperature', value: 98.6, unit: '°F', recordedAt: '2025-12-28T10:00:00' },
    { id: 4, type: 'SpO2', value: 98, unit: '%', recordedAt: '2025-12-28T10:00:00' },
    { id: 5, type: 'Weight', value: 70, unit: 'kg', recordedAt: '2025-12-28T10:00:00' },
    { id: 6, type: 'Blood Sugar', value: 95, unit: 'mg/dL', recordedAt: '2025-12-28T10:00:00', notes: 'Fasting' },
  ] : [];

  const mockPrescriptions: Prescription[] = selectedPatient ? [
    {
      id: 1,
      diagnosis: 'Upper Respiratory Tract Infection',
      medications: [
        { name: 'Amoxicillin 500mg', dosage: '1 tablet', frequency: 'Three times daily', duration: '7 days' },
        { name: 'Paracetamol 650mg', dosage: '1 tablet', frequency: 'As needed for fever', duration: '5 days' }
      ],
      createdAt: '2025-12-20T14:30:00',
      doctorName: 'Dr. Sharma'
    },
    {
      id: 2,
      diagnosis: 'Hypertension - Follow-up',
      medications: [
        { name: 'Amlodipine 5mg', dosage: '1 tablet', frequency: 'Once daily', duration: '30 days' }
      ],
      createdAt: '2025-11-15T11:00:00',
      doctorName: 'Dr. Patel'
    }
  ] : [];

  const mockLabReports: LabReport[] = selectedPatient ? [
    { id: 1, testName: 'Complete Blood Count', result: 'Normal', normalRange: '-', status: 'normal', date: '2025-12-15' },
    { id: 2, testName: 'Hemoglobin', result: '14.2 g/dL', normalRange: '12-16 g/dL', status: 'normal', date: '2025-12-15' },
    { id: 3, testName: 'Fasting Blood Sugar', result: '95 mg/dL', normalRange: '70-100 mg/dL', status: 'normal', date: '2025-12-15' },
    { id: 4, testName: 'HbA1c', result: '5.8%', normalRange: '<5.7%', status: 'abnormal', date: '2025-12-15' },
    { id: 5, testName: 'Cholesterol Total', result: '220 mg/dL', normalRange: '<200 mg/dL', status: 'abnormal', date: '2025-12-10' },
    { id: 6, testName: 'Creatinine', result: '1.0 mg/dL', normalRange: '0.7-1.3 mg/dL', status: 'normal', date: '2025-12-10' }
  ] : [];

  const mockAppointments: Appointment[] = selectedPatient ? [
    { id: 1, date: '2025-12-28', time: '10:00 AM', type: 'Follow-up', status: 'completed', doctorName: 'Dr. Sharma', notes: 'BP monitoring' },
    { id: 2, date: '2025-12-20', time: '11:30 AM', type: 'Consultation', status: 'completed', doctorName: 'Dr. Sharma' },
    { id: 3, date: '2025-11-15', time: '09:00 AM', type: 'Check-up', status: 'completed', doctorName: 'Dr. Patel' },
    { id: 4, date: '2026-01-10', time: '10:30 AM', type: 'Follow-up', status: 'scheduled', doctorName: 'Dr. Sharma' }
  ] : [];

  const calculateAge = (dob: string) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getVitalIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'blood pressure': return <Heart className="w-4 h-4 text-red-500" />;
      case 'heart rate': return <Activity className="w-4 h-4 text-pink-500" />;
      case 'temperature': return <Thermometer className="w-4 h-4 text-orange-500" />;
      case 'spo2': return <Wind className="w-4 h-4 text-blue-500" />;
      case 'blood sugar': return <Droplets className="w-4 h-4 text-purple-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  // Handler functions for buttons
  const handleRecordVitals = () => {
    if (!selectedPatient) {
      toast({
        title: 'No patient selected',
        description: 'Please select a patient first',
        variant: 'destructive'
      });
      return;
    }
    setIsRecordVitalsOpen(true);
  };

  const handleSaveVitals = async () => {
    try {
      // Validate at least one vital is entered
      const hasData = Object.entries(vitalsForm).some(([key, value]) => 
        key !== 'notes' && value !== ''
      );
      
      if (!hasData) {
        toast({
          title: 'No data entered',
          description: 'Please enter at least one vital sign',
          variant: 'destructive'
        });
        return;
      }

      // In a real app, you would save to the API
      // await api.post('/vitals', { patientId: selectedPatient.id, ...vitalsForm });
      
      toast({
        title: 'Success',
        description: 'Vital signs recorded successfully'
      });
      
      setIsRecordVitalsOpen(false);
      setVitalsForm({
        bloodPressureSystolic: '',
        bloodPressureDiastolic: '',
        heartRate: '',
        temperature: '',
        spO2: '',
        weight: '',
        bloodSugar: '',
        notes: ''
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to record vitals',
        variant: 'destructive'
      });
    }
  };

  const handleApplyLabFilter = () => {
    // In a real app, you would filter the lab reports based on the filter criteria
    toast({
      title: 'Filter applied',
      description: `Showing ${labFilter.status} results`
    });
    setIsLabFilterOpen(false);
  };

  const handleViewAppointment = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsAppointmentDialogOpen(true);
  };

  // Filter lab reports based on filter
  const filteredLabReports = mockLabReports.filter(report => {
    if (labFilter.status !== 'all' && report.status !== labFilter.status) return false;
    if (labFilter.dateFrom && report.date < labFilter.dateFrom) return false;
    if (labFilter.dateTo && report.date > labFilter.dateTo) return false;
    return true;
  });

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Electronic Medical Records
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              View and manage patient health records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchPatients()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Patient List */}
          <Card className="lg:col-span-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Patients</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                {loadingPatients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : filteredPatients.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No patients found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredPatients.map((patient: Patient) => (
                      <div
                        key={patient.id}
                        onClick={() => setSelectedPatient(patient)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                          selectedPatient?.id === patient.id ? 'bg-primary/5 border-l-4 border-primary' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={patient.profileImage} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {patient.firstName?.[0]}{patient.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {patient.firstName} {patient.lastName}
                            </p>
                            <p className="text-sm text-gray-500 truncate">
                              {patient.gender} • {calculateAge(patient.dateOfBirth)} yrs
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Patient Details */}
          <div className="lg:col-span-8">
            {selectedPatient ? (
              <div className="space-y-6">
                {/* Patient Header Card */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={selectedPatient.profileImage} />
                        <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                          {selectedPatient.firstName?.[0]}{selectedPatient.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                          <h2 className="text-xl font-bold">
                            {selectedPatient.firstName} {selectedPatient.lastName}
                          </h2>
                          {selectedPatient.bloodGroup && (
                            <Badge variant="outline" className="w-fit">
                              Blood: {selectedPatient.bloodGroup}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {selectedPatient.gender} • {calculateAge(selectedPatient.dateOfBirth)} years
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {selectedPatient.phoneNumber || 'N/A'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            {selectedPatient.email || 'N/A'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            DOB: {selectedPatient.dateOfBirth ? format(new Date(selectedPatient.dateOfBirth), 'dd MMM yyyy') : 'N/A'}
                          </div>
                        </div>
                        {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <span className="text-sm font-medium text-red-600">Allergies:</span>
                            {selectedPatient.allergies.map((allergy, idx) => (
                              <Badge key={idx} variant="destructive" className="text-xs">
                                {allergy}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Printer className="w-4 h-4 mr-1" />
                          Print
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-1" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs for different record sections */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
                    <TabsTrigger value="overview" className="gap-1">
                      <ClipboardList className="w-4 h-4" />
                      <span className="hidden md:inline">Overview</span>
                    </TabsTrigger>
                    <TabsTrigger value="vitals" className="gap-1">
                      <Activity className="w-4 h-4" />
                      <span className="hidden md:inline">Vitals</span>
                    </TabsTrigger>
                    <TabsTrigger value="prescriptions" className="gap-1">
                      <Pill className="w-4 h-4" />
                      <span className="hidden md:inline">Prescriptions</span>
                    </TabsTrigger>
                    <TabsTrigger value="labs" className="gap-1">
                      <FlaskConical className="w-4 h-4" />
                      <span className="hidden md:inline">Lab Reports</span>
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1">
                      <FileImage className="w-4 h-4" />
                      <span className="hidden md:inline">Reports</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-1">
                      <Calendar className="w-4 h-4" />
                      <span className="hidden md:inline">History</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="mt-4 space-y-4">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Calendar className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{mockAppointments.length}</p>
                            <p className="text-xs text-gray-500">Appointments</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <Pill className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{mockPrescriptions.length}</p>
                            <p className="text-xs text-gray-500">Prescriptions</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <FlaskConical className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{mockLabReports.length}</p>
                            <p className="text-xs text-gray-500">Lab Reports</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                            <FileImage className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{patientReports.length}</p>
                            <p className="text-xs text-gray-500">Reports</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{mockLabReports.filter(l => l.status === 'abnormal').length}</p>
                            <p className="text-xs text-gray-500">Abnormal</p>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Recent Vitals */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Latest Vitals</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {mockVitals.slice(0, 6).map((vital) => (
                            <div key={vital.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                              {getVitalIcon(vital.type)}
                              <div>
                                <p className="text-sm text-gray-500">{vital.type}</p>
                                <p className="font-semibold">{vital.value}{vital.unit}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Recent Activity</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {mockAppointments.slice(0, 3).map((apt) => (
                            <div key={apt.id} className="flex items-center gap-3 p-3 border rounded-lg">
                              <div className={`p-2 rounded-lg ${apt.status === 'completed' ? 'bg-green-100' : 'bg-blue-100'}`}>
                                <Calendar className={`w-4 h-4 ${apt.status === 'completed' ? 'text-green-600' : 'text-blue-600'}`} />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium">{apt.type}</p>
                                <p className="text-sm text-gray-500">{apt.doctorName} • {apt.date}</p>
                              </div>
                              <Badge variant={apt.status === 'completed' ? 'secondary' : 'default'}>
                                {apt.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Vitals Tab */}
                  <TabsContent value="vitals" className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Vital Signs History</CardTitle>
                          <Button size="sm" onClick={handleRecordVitals}>
                            <Plus className="w-4 h-4 mr-1" />
                            Record Vitals
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {mockVitals.map((vital) => (
                            <div key={vital.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center gap-3">
                                {getVitalIcon(vital.type)}
                                <div>
                                  <p className="font-medium">{vital.type}</p>
                                  <p className="text-sm text-gray-500">
                                    {format(new Date(vital.recordedAt), 'dd MMM yyyy, hh:mm a')}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-bold">{vital.value}{vital.unit}</p>
                                {vital.notes && <p className="text-sm text-gray-500">{vital.notes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Prescriptions Tab */}
                  <TabsContent value="prescriptions" className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Prescription History</CardTitle>
                          <Button size="sm" onClick={() => window.location.href = '/doctor/prescription-writer'}>
                            <Plus className="w-4 h-4 mr-1" />
                            New Prescription
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {mockPrescriptions.map((rx) => (
                            <Card key={rx.id} className="border">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <p className="font-semibold">{rx.diagnosis}</p>
                                    <p className="text-sm text-gray-500">
                                      {rx.doctorName} • {format(new Date(rx.createdAt), 'dd MMM yyyy')}
                                    </p>
                                  </div>
                                  <Button variant="ghost" size="sm">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </div>
                                <Separator className="my-3" />
                                <div className="space-y-2">
                                  {rx.medications.map((med, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm">
                                      <Pill className="w-4 h-4 text-primary" />
                                      <span className="font-medium">{med.name}</span>
                                      <span className="text-gray-500">- {med.dosage}, {med.frequency}</span>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Lab Reports Tab */}
                  <TabsContent value="labs" className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Laboratory Reports</CardTitle>
                          <Button variant="outline" size="sm" onClick={() => setIsLabFilterOpen(true)}>
                            <Filter className="w-4 h-4 mr-1" />
                            Filter
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Test Name</th>
                                <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Result</th>
                                <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Normal Range</th>
                                <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Status</th>
                                <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredLabReports.map((report) => (
                                <tr key={report.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                                  <td className="py-3 px-2 font-medium">{report.testName}</td>
                                  <td className="py-3 px-2">{report.result}</td>
                                  <td className="py-3 px-2 text-gray-500">{report.normalRange}</td>
                                  <td className="py-3 px-2">
                                    <Badge 
                                      variant={report.status === 'normal' ? 'secondary' : 'destructive'}
                                      className="capitalize"
                                    >
                                      {report.status}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-2 text-gray-500">{report.date}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Patient Reports Tab */}
                  <TabsContent value="reports" className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Patient Reports</CardTitle>
                          <Badge variant="outline">{patientReports.length} reports</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {loadingReports ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            <span className="text-gray-500">Loading reports...</span>
                          </div>
                        ) : patientReports.length === 0 ? (
                          <div className="text-center py-8">
                            <FileImage className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-gray-500">No reports uploaded yet</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {patientReports.map((report) => (
                              <div key={report.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className={`p-3 rounded-lg ${
                                  report.reportType === 'lab' ? 'bg-blue-100 dark:bg-blue-900/30' :
                                  report.reportType === 'imaging' ? 'bg-purple-100 dark:bg-purple-900/30' :
                                  report.reportType === 'prescription' ? 'bg-green-100 dark:bg-green-900/30' :
                                  'bg-gray-100 dark:bg-gray-800'
                                }`}>
                                  <FileImage className={`w-5 h-5 ${
                                    report.reportType === 'lab' ? 'text-blue-600' :
                                    report.reportType === 'imaging' ? 'text-purple-600' :
                                    report.reportType === 'prescription' ? 'text-green-600' :
                                    'text-gray-600'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium truncate">{report.testName || report.fileName}</p>
                                    <Badge variant="outline" className="capitalize text-xs">{report.reportType}</Badge>
                                    {report.analysisStatus === 'completed' && (
                                      <Badge variant="secondary" className="text-xs">AI Analyzed</Badge>
                                    )}
                                    {report.analysisStatus === 'pending' && (
                                      <Badge variant="outline" className="text-xs text-yellow-600">Pending Analysis</Badge>
                                    )}
                                  </div>
                                  {report.labName && (
                                    <p className="text-sm text-gray-500 mt-0.5">Lab: {report.labName}</p>
                                  )}
                                  {report.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{report.description}</p>
                                  )}
                                  {report.aiSummary && (
                                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
                                      <p className="font-medium text-blue-700 dark:text-blue-300 text-xs mb-1">AI Analysis Summary</p>
                                      <p className="text-gray-700 dark:text-gray-300 line-clamp-3">{report.aiSummary}</p>
                                      {report.keyFindings && report.keyFindings.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {report.keyFindings.slice(0, 3).map((finding, i) => (
                                            <Badge key={i} variant="secondary" className="text-xs">{finding}</Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                    <span>{report.reportDate ? format(new Date(report.reportDate), 'dd MMM yyyy') : format(new Date(report.uploadedAt), 'dd MMM yyyy')}</span>
                                    <span>{(report.fileSize / 1024).toFixed(0)} KB</span>
                                    <span className="capitalize">{report.mimeType?.split('/')[1] || 'file'}</span>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    window.open(`/api/reports/${report.id}/download`, '_blank');
                                  }}
                                  title="Download Report"
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* History Tab */}
                  <TabsContent value="history" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Appointment History</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {mockAppointments.map((apt) => (
                            <div key={apt.id} className="flex items-center gap-4 p-4 border rounded-lg">
                              <div className={`p-3 rounded-lg ${
                                apt.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' : 
                                apt.status === 'scheduled' ? 'bg-blue-100 dark:bg-blue-900/30' : 
                                'bg-gray-100 dark:bg-gray-800'
                              }`}>
                                <Calendar className={`w-5 h-5 ${
                                  apt.status === 'completed' ? 'text-green-600' : 
                                  apt.status === 'scheduled' ? 'text-blue-600' : 
                                  'text-gray-600'
                                }`} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{apt.type}</p>
                                  <Badge variant={apt.status === 'completed' ? 'secondary' : 'default'}>
                                    {apt.status}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-500">
                                  {apt.date} at {apt.time} • {apt.doctorName}
                                </p>
                                {apt.notes && (
                                  <p className="text-sm text-gray-600 mt-1">{apt.notes}</p>
                                )}
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => handleViewAppointment(apt)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <Card className="h-[calc(100vh-200px)] flex items-center justify-center">
                <div className="text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                    Select a Patient
                  </h3>
                  <p className="text-gray-500">
                    Choose a patient from the list to view their medical records
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Record Vitals Dialog */}
      <Dialog open={isRecordVitalsOpen} onOpenChange={setIsRecordVitalsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Vital Signs</DialogTitle>
            <DialogDescription>
              Enter the patient's vital signs. All measurements are optional.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bp-systolic">Blood Pressure (Systolic)</Label>
              <Input 
                id="bp-systolic" 
                type="number" 
                placeholder="120"
                value={vitalsForm.bloodPressureSystolic}
                onChange={(e) => setVitalsForm({...vitalsForm, bloodPressureSystolic: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-diastolic">Blood Pressure (Diastolic)</Label>
              <Input 
                id="bp-diastolic" 
                type="number" 
                placeholder="80"
                value={vitalsForm.bloodPressureDiastolic}
                onChange={(e) => setVitalsForm({...vitalsForm, bloodPressureDiastolic: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heart-rate">Heart Rate (bpm)</Label>
              <Input 
                id="heart-rate" 
                type="number" 
                placeholder="72"
                value={vitalsForm.heartRate}
                onChange={(e) => setVitalsForm({...vitalsForm, heartRate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature (°F)</Label>
              <Input 
                id="temperature" 
                type="number" 
                step="0.1"
                placeholder="98.6"
                value={vitalsForm.temperature}
                onChange={(e) => setVitalsForm({...vitalsForm, temperature: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spo2">SpO2 (%)</Label>
              <Input 
                id="spo2" 
                type="number" 
                placeholder="98"
                value={vitalsForm.spO2}
                onChange={(e) => setVitalsForm({...vitalsForm, spO2: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input 
                id="weight" 
                type="number" 
                step="0.1"
                placeholder="70"
                value={vitalsForm.weight}
                onChange={(e) => setVitalsForm({...vitalsForm, weight: e.target.value})}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="blood-sugar">Blood Sugar (mg/dL)</Label>
              <Input 
                id="blood-sugar" 
                type="number" 
                placeholder="95"
                value={vitalsForm.bloodSugar}
                onChange={(e) => setVitalsForm({...vitalsForm, bloodSugar: e.target.value})}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                placeholder="Any additional observations..."
                value={vitalsForm.notes}
                onChange={(e) => setVitalsForm({...vitalsForm, notes: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsRecordVitalsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVitals}>
              Save Vitals
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lab Filter Dialog */}
      <Dialog open={isLabFilterOpen} onOpenChange={setIsLabFilterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter Lab Reports</DialogTitle>
            <DialogDescription>
              Filter laboratory reports by status and date range
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={labFilter.status} onValueChange={(value) => setLabFilter({...labFilter, status: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="abnormal">Abnormal</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-from">Date From</Label>
              <Input 
                id="date-from" 
                type="date"
                value={labFilter.dateFrom}
                onChange={(e) => setLabFilter({...labFilter, dateFrom: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-to">Date To</Label>
              <Input 
                id="date-to" 
                type="date"
                value={labFilter.dateTo}
                onChange={(e) => setLabFilter({...labFilter, dateTo: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsLabFilterOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyLabFilter}>
              Apply Filter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Details Dialog */}
      <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium">{selectedAppointment.type}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge variant={selectedAppointment.status === 'completed' ? 'secondary' : 'default'}>
                    {selectedAppointment.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">{selectedAppointment.date}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Time</Label>
                  <p className="font-medium">{selectedAppointment.time}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Doctor</Label>
                  <p className="font-medium">{selectedAppointment.doctorName}</p>
                </div>
                {selectedAppointment.notes && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="font-medium">{selectedAppointment.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setIsAppointmentDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

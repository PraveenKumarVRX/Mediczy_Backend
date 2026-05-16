import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import MainLayoutdoctor from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Users,
  Phone,
  Mail,
  Calendar,
  FileText,
  MessageSquare,
  UserPlus,
  LayoutGrid,
  List,
  RefreshCw,
  Eye,
  Loader2,
  CheckCircle,
  Copy,
} from 'lucide-react';
import api from "@/utils/api";
import { toast } from 'sonner';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth?: string;
  gender?: string;
  profilePicture?: string;
  createdAt: string;
  lastLogin?: string;
  status?: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
}

interface NewPatientForm {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  address: string;
  emergencyContact: string;
  medicalHistory: string;
  allergies: string;
}

const initialFormState: NewPatientForm = {
  firstName: '',
  lastName: '',
  phoneNumber: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  address: '',
  emergencyContact: '',
  medicalHistory: '',
  allergies: '',
};

const DoctorPatients = () => {
  const { currentDoctor } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [cohortQuery, setCohortQuery] = useState('');
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortSummary, setCohortSummary] = useState<string | null>(null);
  const [carePatientId, setCarePatientId] = useState('');
  const [sdohForm, setSdohForm] = useState({ housing: 'stable', foodAccess: 'secure', transport: 'adequate', employment: 'employed', safety: 'safe' });
  const [sdohResult, setSdohResult] = useState<any>(null);
  const [trialDiagnoses, setTrialDiagnoses] = useState('');
  const [trialAge, setTrialAge] = useState('');
  const [trialMatches, setTrialMatches] = useState<any[]>([]);
  const [careLoading, setCareLoading] = useState(false);
  
  // Add Patient Modal State
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState<NewPatientForm>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdPatientInfo, setCreatedPatientInfo] = useState<{
    name: string;
    phone: string;
    email: string;
    tempPassword: string;
  } | null>(null);

  useEffect(() => {
    fetchPatients();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = patients.filter(patient =>
        `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.phoneNumber.includes(searchTerm)
      );
      setFilteredPatients(filtered);
    } else {
      setFilteredPatients(patients);
    }
  }, [searchTerm, patients]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await api.get('/doctors/my-patients');
      setPatients(response.data.patients || []);
      setError('');
    } catch (err: any) {
      console.error('Fetch patients error:', err);
      setError(err.response?.data?.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const handleCohortSearch = async () => {
    if (cohortQuery.trim().length < 3) {
      toast.error('Enter a clinical cohort question first');
      return;
    }

    try {
      setCohortLoading(true);
      const response = await api.post('/doctors/my-patients/cohort-search', { query: cohortQuery.trim() });
      const cohort = response.data.patients || [];
      setFilteredPatients(cohort.map((patient: any) => ({
        ...patient,
        firstName: patient.firstName,
        lastName: patient.lastName,
        phoneNumber: patient.phoneNumber,
        createdAt: patient.lastSeenDate || new Date().toISOString(),
        status: 'active',
      })));
      const unsupported = response.data.interpretation?.unsupportedFilters || [];
      setCohortSummary(
        `${cohort.length} patient${cohort.length === 1 ? '' : 's'} matched${unsupported.length ? `; ${unsupported.join('. ')}` : ''}`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to search cohort');
    } finally {
      setCohortLoading(false);
    }
  };

  const clearCohortSearch = () => {
    setCohortQuery('');
    setCohortSummary(null);
    setFilteredPatients(patients);
  };

  const submitSdohScreening = async () => {
    if (!carePatientId) return toast.error('Enter a patient ID for SDoH screening');
    try {
      setCareLoading(true);
      const response = await api.post('/roadmap-intelligence/sdoh/screenings', { patientId: Number(carePatientId), ...sdohForm });
      setSdohResult(response.data?.data ?? null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save SDoH screening');
    } finally { setCareLoading(false); }
  };

  const matchClinicalTrials = async () => {
    if (!trialDiagnoses.trim()) return toast.error('Enter at least one diagnosis');
    try {
      setCareLoading(true);
      const response = await api.post('/roadmap-intelligence/trials/match', { diagnoses: trialDiagnoses.split(',').map((item) => item.trim()).filter(Boolean), age: Number(trialAge || 0) });
      setTrialMatches(response.data?.data ?? []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to match clinical trials');
    } finally { setCareLoading(false); }
  };

  const handleAddPatient = async () => {
    // Validate required fields
    if (!newPatient.firstName.trim()) {
      toast.error('First name is required');
      return;
    }
    if (!newPatient.lastName.trim()) {
      toast.error('Last name is required');
      return;
    }
    if (!newPatient.phoneNumber.trim()) {
      toast.error('Phone number is required');
      return;
    }

    // Format phone number
    let formattedPhone = newPatient.phoneNumber.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone.replace(/^0/, '');
    }

    try {
      setIsSubmitting(true);
      const response = await api.post('/doctors/my-patients/create', {
        ...newPatient,
        phoneNumber: formattedPhone,
      });

      if (response.data.success) {
        setCreatedPatientInfo({
          name: `${response.data.patient.fullName}`,
          phone: response.data.patient.phoneNumber,
          email: response.data.patient.email,
          tempPassword: response.data.credentials.tempPassword,
        });
        toast.success('Patient registered successfully!');
        fetchPatients(); // Refresh the list
      }
    } catch (err: any) {
      console.error('Add patient error:', err);
      if (err.response?.status === 409) {
        toast.error(err.response?.data?.message || 'Patient already exists');
      } else {
        toast.error(err.response?.data?.message || 'Failed to register patient');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setIsAddPatientOpen(false);
    setNewPatient(initialFormState);
    setCreatedPatientInfo(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getPatientInitials = (patient: Patient) => {
    return `${patient.firstName.charAt(0)}${patient.lastName.charAt(0)}`.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Action handlers for patient table
  const handleViewPatient = (patientId: number) => {
    navigate(`/doctor/health-records?patientId=${patientId}`);
  };

  const handleChatWithPatient = (patientId: number) => {
    navigate(`/doctor/chat?patientId=${patientId}`);
  };

  const handleGeneratePDF = async (patient: Patient) => {
    try {
      toast.info('Generating patient report...');
      
      // Create a simple patient report
      const reportContent = `
        PATIENT REPORT
        
        Name: ${patient.firstName} ${patient.lastName}
        Phone: ${patient.phoneNumber}
        Email: ${patient.email}
        ${patient.dateOfBirth ? `Age: ${calculateAge(patient.dateOfBirth)} years` : ''}
        ${patient.gender ? `Gender: ${patient.gender}` : ''}
        ${patient.bloodGroup ? `Blood Group: ${patient.bloodGroup}` : ''}
        Status: ${patient.status || 'active'}
        Registered: ${formatDate(patient.createdAt)}
        
        ${patient.address ? `Address: ${patient.address}` : ''}
        ${patient.emergencyContact ? `Emergency Contact: ${patient.emergencyContact}` : ''}
      `;

      // Create blob and download
      const blob = new Blob([reportContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${patient.firstName}_${patient.lastName}_Report.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Report downloaded successfully');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate report');
    }
  };

  if (loading) {
    return (
      <MainLayoutdoctor>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading patients...</p>
          </div>
        </div>
      </MainLayoutdoctor>
    );
  }

  return (
    <MainLayoutdoctor>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Users className="h-8 w-8 text-teal-500" />
                My Patients
              </h1>
              <p className="text-muted-foreground mt-1">Manage and view your assigned patients</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchPatients} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={() => setIsAddPatientOpen(true)} className="bg-teal-600 hover:bg-teal-700">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Patient
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                <Users className="h-4 w-4 text-teal-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{patients.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {patients.filter(p => p.status === 'active').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New This Month</CardTitle>
                <Calendar className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {patients.filter(p => {
                    const lastMonth = new Date();
                    lastMonth.setMonth(lastMonth.getMonth() - 1);
                    return new Date(p.createdAt) > lastMonth;
                  }).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Male / Female</CardTitle>
                <Users className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className="text-blue-600">{patients.filter(p => p.gender?.toLowerCase() === 'male' || p.gender === 'male').length}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-pink-600">{patients.filter(p => p.gender?.toLowerCase() === 'female' || p.gender === 'female').length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Clinical Cohort Search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  value={cohortQuery}
                  onChange={(e) => setCohortQuery(e.target.value)}
                  placeholder="Show me diabetic patients not seen in 3 months"
                />
                <Button onClick={handleCohortSearch} disabled={cohortLoading} className="md:w-40">
                  {cohortLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search Cohort'}
                </Button>
                {cohortSummary && (
                  <Button variant="outline" onClick={clearCohortSearch}>Clear</Button>
                )}
              </div>
              {cohortSummary && <p className="text-sm text-muted-foreground">{cohortSummary}</p>}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader className="pb-3"><CardTitle className="text-base">SDoH Screening</CardTitle></CardHeader><CardContent className="space-y-3">
              <Input value={carePatientId} onChange={(e) => setCarePatientId(e.target.value)} placeholder="Patient ID" />
              <div className="grid grid-cols-2 gap-2">{([['housing',['stable','unstable']],['foodAccess',['secure','insecure']],['transport',['adequate','limited']],['employment',['employed','unemployed']],['safety',['safe','unsafe']]] as const).map(([field, values]) => <Select key={field} value={sdohForm[field]} onValueChange={(value) => setSdohForm({ ...sdohForm, [field]: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{values.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>)}</div>
              <Button onClick={submitSdohScreening} disabled={careLoading}>Save Screening</Button>
              {sdohResult && <div className="rounded-md border p-3 text-sm"><div className="flex justify-between"><span>Risk level</span><Badge>{sdohResult.risk_level}</Badge></div><p className="mt-2 text-muted-foreground">Referrals: {(sdohResult.referrals || []).join(', ') || 'None'}</p></div>}
            </CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="text-base">Clinical Trial Matching</CardTitle></CardHeader><CardContent className="space-y-3">
              <Textarea value={trialDiagnoses} onChange={(e) => setTrialDiagnoses(e.target.value)} placeholder="Diagnoses, comma separated" /><Input type="number" value={trialAge} onChange={(e) => setTrialAge(e.target.value)} placeholder="Patient age" /><Button onClick={matchClinicalTrials} disabled={careLoading}>Match Trials</Button>
              <div className="space-y-2">{trialMatches.map((trial) => <div key={trial.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{trial.title}</p><p className="text-muted-foreground">{trial.id}</p></div>)}{!trialMatches.length && <p className="text-sm text-muted-foreground">No matches loaded yet.</p>}</div>
            </CardContent></Card>
          </div>

          {/* Search and View Toggle */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patients by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Patients List View */}
          {viewMode === 'list' && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Patient</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Age / Gender</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={patient.profilePicture} />
                              <AvatarFallback className="text-xs">{getPatientInitials(patient)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{patient.firstName} {patient.lastName}</p>
                              <p className="text-xs text-muted-foreground">ID: {patient.id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{patient.phoneNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm truncate max-w-[150px] block">{patient.email}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {patient.dateOfBirth && (
                              <span className="text-sm">{calculateAge(patient.dateOfBirth)} yrs</span>
                            )}
                            {patient.gender && (
                              <Badge variant="outline" className="text-xs">
                                {patient.gender}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={patient.status === 'active' ? 'default' : 'secondary'}
                            className={patient.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                          >
                            {patient.status || 'inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(patient.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 w-8 p-0"
                              onClick={() => handleViewPatient(patient.id)}
                              title="View patient details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 w-8 p-0"
                              onClick={() => handleChatWithPatient(patient.id)}
                              title="Chat with patient"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 w-8 p-0"
                              onClick={() => handleGeneratePDF(patient)}
                              title="Generate PDF report"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredPatients.length === 0 && (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No patients found</h3>
                    <p className="text-muted-foreground">
                      {searchTerm ? 'Try adjusting your search terms' : 'Click "Add Patient" to register your first patient'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Patients Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPatients.map((patient) => (
                <Card key={patient.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={patient.profilePicture} alt={patient.firstName} />
                        <AvatarFallback>{getPatientInitials(patient)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">
                          {patient.firstName} {patient.lastName}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Patient since {formatDate(patient.createdAt)}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center space-x-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{patient.email}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{patient.phoneNumber}</span>
                    </div>
                    {patient.dateOfBirth && (
                      <div className="flex items-center space-x-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(patient.dateOfBirth)} ({calculateAge(patient.dateOfBirth)} yrs)</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {patient.gender && (
                        <Badge variant="secondary" className="text-xs">
                          {patient.gender}
                        </Badge>
                      )}
                      <Badge 
                        variant={patient.status === 'active' ? 'default' : 'secondary'}
                        className={patient.status === 'active' ? 'bg-green-100 text-green-700' : ''}
                      >
                        {patient.status || 'inactive'}
                      </Badge>
                    </div>

                    <div className="flex space-x-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => handleChatWithPatient(patient.id)}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Chat
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => handleViewPatient(patient.id)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Records
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State for Grid View */}
          {viewMode === 'grid' && filteredPatients.length === 0 && !loading && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No patients found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'Try adjusting your search terms' : 'Click "Add Patient" to register your first patient'}
              </p>
              <Button onClick={() => setIsAddPatientOpen(true)} className="bg-teal-600 hover:bg-teal-700">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Your First Patient
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Add Patient Dialog */}
      <Dialog open={isAddPatientOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          {!createdPatientInfo ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-teal-600" />
                  Register New Patient
                </DialogTitle>
                <DialogDescription>
                  Add a new patient to your practice. They will receive login credentials via SMS/WhatsApp.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={newPatient.firstName}
                      onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={newPatient.lastName}
                      onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number *</Label>
                    <Input
                      id="phoneNumber"
                      value={newPatient.phoneNumber}
                      onChange={(e) => setNewPatient({ ...newPatient, phoneNumber: e.target.value })}
                      placeholder="9876543210"
                    />
                    <p className="text-xs text-muted-foreground">+91 will be added automatically</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (Optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newPatient.email}
                      onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                      placeholder="patient@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={newPatient.dateOfBirth}
                      onChange={(e) => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select
                      value={newPatient.gender}
                      onValueChange={(value) => setNewPatient({ ...newPatient, gender: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bloodGroup">Blood Group</Label>
                    <Select
                      value={newPatient.bloodGroup}
                      onValueChange={(value) => setNewPatient({ ...newPatient, bloodGroup: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={newPatient.address}
                    onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                    placeholder="Enter address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyContact">Emergency Contact</Label>
                  <Input
                    id="emergencyContact"
                    value={newPatient.emergencyContact}
                    onChange={(e) => setNewPatient({ ...newPatient, emergencyContact: e.target.value })}
                    placeholder="Name and phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allergies">Known Allergies</Label>
                  <Input
                    id="allergies"
                    value={newPatient.allergies}
                    onChange={(e) => setNewPatient({ ...newPatient, allergies: e.target.value })}
                    placeholder="e.g., Penicillin, Peanuts"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medicalHistory">Medical History</Label>
                  <Textarea
                    id="medicalHistory"
                    value={newPatient.medicalHistory}
                    onChange={(e) => setNewPatient({ ...newPatient, medicalHistory: e.target.value })}
                    placeholder="Any relevant medical history..."
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddPatient} 
                  disabled={isSubmitting}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Register Patient
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  Patient Registered Successfully!
                </DialogTitle>
                <DialogDescription>
                  The patient account has been created. Share the credentials below with the patient.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Patient Name</p>
                      <p className="font-medium">{createdPatientInfo.name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{createdPatientInfo.phone}</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => copyToClipboard(createdPatientInfo.phone, 'Phone')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{createdPatientInfo.email}</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => copyToClipboard(createdPatientInfo.email, 'Email')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-950/30 rounded p-2 -mx-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Temporary Password</p>
                      <p className="font-mono font-bold text-lg">{createdPatientInfo.tempPassword}</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => copyToClipboard(createdPatientInfo.tempPassword, 'Password')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  📱 Login credentials have been sent to the patient via SMS and WhatsApp.
                </p>
              </div>

              <DialogFooter>
                <Button onClick={handleCloseModal} className="bg-teal-600 hover:bg-teal-700">
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayoutdoctor>
  );
};

export default DoctorPatients;
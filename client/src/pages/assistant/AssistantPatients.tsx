import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  Calendar,
  FileText,
  MoreVertical,
  Eye,
  Edit,
  Loader2,
  UserPlus,
  Filter
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  age: number;
  gender: string;
  bloodGroup?: string;
  lastVisit?: string;
  nextAppointment?: string;
  status: 'active' | 'inactive';
  registeredBy?: string;
  createdAt: string;
}

const AssistantPatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    if (!token) {
      navigate('/assistant/login');
      return;
    }
    fetchPatients();
  }, [navigate]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assistant/patients');
      if (data.success) {
        setPatients(data.patients);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
      // Mock data for development
      setPatients([
        {
          id: 'PAT001',
          name: 'Amit Sharma',
          email: 'amit.sharma@email.com',
          phone: '+91 98765 43210',
          age: 45,
          gender: 'Male',
          bloodGroup: 'O+',
          lastVisit: '2025-12-28',
          nextAppointment: '2025-01-05',
          status: 'active',
          registeredBy: 'assistant',
          createdAt: '2025-10-15'
        },
        {
          id: 'PAT002',
          name: 'Priya Patel',
          email: 'priya.p@email.com',
          phone: '+91 91234 56789',
          age: 32,
          gender: 'Female',
          bloodGroup: 'A+',
          lastVisit: '2025-12-25',
          status: 'active',
          registeredBy: 'assistant',
          createdAt: '2025-11-20'
        },
        {
          id: 'PAT003',
          name: 'Rajesh Kumar',
          email: 'rajesh.k@email.com',
          phone: '+91 87654 32109',
          age: 58,
          gender: 'Male',
          bloodGroup: 'B+',
          lastVisit: '2025-12-20',
          nextAppointment: '2025-01-10',
          status: 'active',
          registeredBy: 'doctor',
          createdAt: '2025-09-10'
        },
        {
          id: 'PAT004',
          name: 'Sunita Devi',
          email: 'sunita.d@email.com',
          phone: '+91 76543 21098',
          age: 41,
          gender: 'Female',
          bloodGroup: 'AB+',
          lastVisit: '2025-11-15',
          status: 'inactive',
          registeredBy: 'assistant',
          createdAt: '2025-08-05'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         patient.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         patient.phone.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || patient.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleViewPatient = (patientId: string) => {
    toast.info(`Opening patient details for ${patientId}`);
    // navigate(`/assistant/patients/${patientId}`);
  };

  const handleEditPatient = (patientId: string) => {
    toast.info(`Editing patient ${patientId}`);
  };

  const handleBookAppointment = (patientId: string, patientName: string) => {
    toast.success(`Booking appointment for ${patientName}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-purple-600" />
              My Patients
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and view patient information for your linked doctors
            </p>
          </div>
          <Button 
            onClick={() => navigate('/assistant/register-patient')}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Register New Patient
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{patients.length}</p>
                <p className="text-sm text-muted-foreground">Total Patients</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {patients.filter(p => p.status === 'active').length}
                </p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {patients.filter(p => p.nextAppointment).length}
                </p>
                <p className="text-sm text-muted-foreground">Upcoming Appointments</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">
                  {patients.filter(p => p.registeredBy === 'assistant').length}
                </p>
                <p className="text-sm text-muted-foreground">Registered by You</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Patients List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Patient Directory</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">No patients found</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => navigate('/assistant/register-patient')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Register First Patient
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPatients.map((patient) => (
                  <Card key={patient.id} className="hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="bg-purple-100 dark:bg-purple-900 p-3 rounded-full">
                            <Users className="h-5 w-5 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-lg">{patient.name}</p>
                              <Badge variant={patient.status === 'active' ? 'default' : 'secondary'}>
                                {patient.status}
                              </Badge>
                              {patient.bloodGroup && (
                                <Badge variant="outline" className="text-red-600 border-red-200">
                                  {patient.bloodGroup}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {patient.email}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {patient.phone}
                              </span>
                              <span>{patient.age} years, {patient.gender}</span>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm mt-2">
                              {patient.lastVisit && (
                                <span className="text-muted-foreground">
                                  Last visit: {new Date(patient.lastVisit).toLocaleDateString()}
                                </span>
                              )}
                              {patient.nextAppointment && (
                                <span className="text-green-600 font-medium">
                                  <Calendar className="h-3 w-3 inline mr-1" />
                                  Next: {new Date(patient.nextAppointment).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewPatient(patient.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditPatient(patient.id)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Patient
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBookAppointment(patient.id, patient.name)}>
                              <Calendar className="h-4 w-4 mr-2" />
                              Book Appointment
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <FileText className="h-4 w-4 mr-2" />
                              View Records
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssistantPatients;

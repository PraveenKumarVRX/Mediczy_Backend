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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import api from '@/utils/api';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import { 
  Building2, Calendar as CalendarIcon, Users, Clock, 
  Activity, UserCheck, Bell, Settings, LogOut, Plus, 
  Search, Filter, Bed, Stethoscope, ClipboardList,
  ArrowLeft, Edit, Trash2, Eye, CheckCircle, XCircle,
  AlertCircle, RefreshCw, UserPlus, FileText, Phone,
  Mail, MapPin, MoreVertical, Download, Upload, Printer,
  BriefcaseMedical, ArrowUpDown, Timer, DollarSign
} from 'lucide-react';
import { format } from 'date-fns';

// Types
interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  department: string;
  date: string;
  time: string;
  type: 'OPD' | 'IPD' | 'Emergency' | 'Follow-up' | 'Procedure';
  status: 'Scheduled' | 'Checked-in' | 'In-Progress' | 'Completed' | 'Cancelled' | 'No-Show';
  priority: 'Normal' | 'Urgent' | 'Emergency';
  notes?: string;
  createdAt: string;
}

interface Patient {
  id: string;
  uhid: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  email?: string;
  address: string;
  bloodGroup: string;
  admissionStatus: 'OPD' | 'IPD' | 'Discharged';
  admissionDate?: string;
  dischargeDate?: string;
  assignedDoctor?: string;
  department?: string;
  bed?: string;
  ward?: string;
  diagnosis?: string;
  insurance?: {
    provider: string;
    policyNumber: string;
    validity: string;
  };
}

interface Staff {
  id: string;
  name: string;
  role: 'Doctor' | 'Nurse' | 'Technician' | 'Admin' | 'Receptionist';
  department: string;
  specialization?: string;
  phone: string;
  email: string;
  shift: 'Morning' | 'Afternoon' | 'Night' | 'Rotating';
  status: 'On-Duty' | 'Off-Duty' | 'On-Leave' | 'Available';
  joiningDate: string;
}

interface Resource {
  id: string;
  name: string;
  type: 'Equipment' | 'Room' | 'Bed' | 'Vehicle';
  department: string;
  status: 'Available' | 'In-Use' | 'Maintenance' | 'Reserved';
  location: string;
  lastMaintenance?: string;
  nextMaintenance?: string;
}

const HospitalPracticeManagement = () => {
  const navigate = useNavigate();
  const [hospitalData, setHospitalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('patients');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [showNewAppointmentDialog, setShowNewAppointmentDialog] = useState(false);
  const [showNewPatientDialog, setShowNewPatientDialog] = useState(false);
  const [showViewAppointmentDialog, setShowViewAppointmentDialog] = useState(false);
  const [showEditAppointmentDialog, setShowEditAppointmentDialog] = useState(false);
  const [showAddStaffDialog, setShowAddStaffDialog] = useState(false);
  const [showAddResourceDialog, setShowAddResourceDialog] = useState(false);
  const [showBedAllocationDialog, setShowBedAllocationDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentForm, setAppointmentForm] = useState<Partial<Appointment> | null>(null);
  const [newAppointmentForm, setNewAppointmentForm] = useState({
    patientName: '',
    patientPhone: '',
    department: '',
    doctorId: '',
    type: 'OPD' as Appointment['type'],
    priority: 'Normal' as Appointment['priority'],
    time: '',
    notes: '',
  });
  const [patientForm, setPatientForm] = useState({
    name: '',
    age: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    admissionStatus: 'OPD' as Patient['admissionStatus'],
    department: '',
    assignedDoctor: '',
  });
  const [staffForm, setStaffForm] = useState({
    name: '',
    role: 'Doctor' as Staff['role'],
    department: '',
    specialization: '',
    phone: '',
    email: '',
    shift: 'Morning' as Staff['shift'],
    status: 'On-Duty' as Staff['status'],
  });
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [resourceForm, setResourceForm] = useState({
    name: '',
    type: 'Bed' as Resource['type'],
    department: '',
    status: 'Available' as Resource['status'],
    location: '',
  });
  const [bedAllocationForm, setBedAllocationForm] = useState({ patientId: '', resourceId: '' });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleApiError = (error: any, message: string) => {
    console.error(message, error);
    const responseMessage = error?.response?.data?.message || error?.message || message;
    toast({ title: 'Request failed', description: responseMessage, variant: 'destructive' });
  };

  const STORAGE_KEYS = {
    appointments: 'hospital-practice-appointments',
    patients: 'hospital-practice-patients',
    staff: 'hospital-practice-staff',
    resources: 'hospital-practice-resources',
  };

  const persistPractice = (payload: Partial<{ appointments: Appointment[]; patients: Patient[]; staff: Staff[]; resources: Resource[]; }>) => {
    if (payload.appointments !== undefined) saveHospitalStore(STORAGE_KEYS.appointments, payload.appointments);
    if (payload.patients !== undefined) saveHospitalStore(STORAGE_KEYS.patients, payload.patients);
    if (payload.staff !== undefined) saveHospitalStore(STORAGE_KEYS.staff, payload.staff);
    if (payload.resources !== undefined) saveHospitalStore(STORAGE_KEYS.resources, payload.resources);
  };

  const hydratePractice = (payload: Partial<{ appointments: Appointment[]; patients: Patient[]; staff: Staff[]; resources: Resource[]; }>) => {
    if (payload.appointments !== undefined) setAppointments(payload.appointments);
    if (payload.patients !== undefined) setPatients(payload.patients);
    if (payload.staff !== undefined) setStaff(payload.staff);
    if (payload.resources !== undefined) setResources(payload.resources);
    persistPractice(payload);
  };

  const fetchPracticeData = async (isInitial = false) => {
    if (!isInitial) {
      setIsRefreshing(true);
    }
    try {
      // Fetch appointments from the new endpoint
      const appointmentsRes = await api.get('/hospital/practice/appointments', { 
        headers: hospitalHeaders(),
        params: { upcoming: 'true' }
      });
      
      const appointmentsData = appointmentsRes.data?.appointments || [];
      
      // Transform appointments to match frontend format
      const transformedAppointments = appointmentsData.map((apt: any) => ({
        id: apt.id.toString(),
        patientId: apt.userId?.toString() || '',
        patientName: apt.patientName || 'Unknown',
        patientPhone: apt.patientPhone || '',
        doctorId: apt.doctorId?.toString() || '',
        doctorName: apt.doctorName || 'Dr. Unknown',
        department: apt.specialization || 'General',
        date: apt.appointmentDate || '',
        time: apt.appointmentTime?.substring(0, 5) || '',
        type: 'OPD' as const,
        status: mapStatus(apt.status),
        priority: 'Normal' as const,
        notes: apt.reason || '',
        createdAt: apt.createdAt || new Date().toISOString()
      }));
      
      hydratePractice({ appointments: transformedAppointments });

      // Fetch general practice data
      const { data } = await api.get('/hospital/practice', { headers: hospitalHeaders() });
      const practice = data?.data || data;
      
      // Only update patients, staff, resources if available
      hydratePractice({
        patients: Array.isArray(practice.patients) ? practice.patients : undefined,
        staff: Array.isArray(practice.staff) ? practice.staff : undefined,
        resources: Array.isArray(practice.resources) ? practice.resources : undefined,
      });

      // Load live OPD/IPD patients when available
      try {
        const patientsRes = await api.get('/hospital/practice/patients', { headers: hospitalHeaders() });
        const livePatients = patientsRes.data?.data;
        if (Array.isArray(livePatients) && livePatients.length > 0) {
          hydratePractice({ patients: livePatients });
        }
      } catch (_) {
        /* keep local/demo patients when API unavailable */
      }
      
    } catch (error) {
      handleApiError(error, 'Failed to fetch practice data');
    } finally {
      if (isInitial) {
        setLoading(false);
      }
      setIsRefreshing(false);
    }
  };

  // Helper function to map backend status to frontend status
  const mapStatus = (backendStatus: string): Appointment['status'] => {
    const statusMap: Record<string, Appointment['status']> = {
      'scheduled': 'Scheduled',
      'confirmed': 'Scheduled',
      'in-progress': 'In-Progress',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'no-show': 'No-Show'
    };
    return statusMap[backendStatus] || 'Scheduled';
  };

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    const data = localStorage.getItem('hospitalData');
    
    if (!token) {
      navigate('/hospital/login');
      return;
    }
    
    if (data) {
      setHospitalData(JSON.parse(data));
    }
    fetchPracticeData(true);
  }, [navigate]);

  // Sample data
  const initialAppointments: Appointment[] = [
    { id: 'APT001', patientId: 'P001', patientName: 'Rajesh Kumar', patientPhone: '9876543210', doctorId: 'D001', doctorName: 'Dr. Sharma', department: 'Cardiology', date: '2024-12-04', time: '09:00', type: 'OPD', status: 'Scheduled', priority: 'Normal', createdAt: '2024-12-03' },
    { id: 'APT002', patientId: 'P002', patientName: 'Priya Singh', patientPhone: '9876543211', doctorId: 'D002', doctorName: 'Dr. Patel', department: 'Gynecology', date: '2024-12-04', time: '09:30', type: 'Follow-up', status: 'Checked-in', priority: 'Normal', createdAt: '2024-12-02' },
    { id: 'APT003', patientId: 'P003', patientName: 'Amit Verma', patientPhone: '9876543212', doctorId: 'D003', doctorName: 'Dr. Mehta', department: 'Neurology', date: '2024-12-04', time: '10:00', type: 'Emergency', status: 'In-Progress', priority: 'Emergency', createdAt: '2024-12-04' },
    { id: 'APT004', patientId: 'P004', patientName: 'Neha Gupta', patientPhone: '9876543213', doctorId: 'D004', doctorName: 'Dr. Joshi', department: 'Orthopedics', date: '2024-12-04', time: '10:30', type: 'Procedure', status: 'Scheduled', priority: 'Urgent', createdAt: '2024-12-01' },
    { id: 'APT005', patientId: 'P005', patientName: 'Sanjay Reddy', patientPhone: '9876543214', doctorId: 'D001', doctorName: 'Dr. Sharma', department: 'Cardiology', date: '2024-12-04', time: '11:00', type: 'OPD', status: 'Completed', priority: 'Normal', createdAt: '2024-12-03' },
  ];

  const [appointments, setAppointments] = useState<Appointment[]>(
    () => loadHospitalStore(STORAGE_KEYS.appointments, initialAppointments)
  );

  const initialPatients: Patient[] = [
    { id: 'P001', uhid: 'UHID001234', name: 'Rajesh Kumar', age: 45, gender: 'Male', phone: '9876543210', email: 'rajesh@email.com', address: 'Delhi', bloodGroup: 'B+', admissionStatus: 'IPD', admissionDate: '2024-12-01', assignedDoctor: 'Dr. Sharma', department: 'Cardiology', bed: 'ICU-05', ward: 'ICU' },
    { id: 'P002', uhid: 'UHID001235', name: 'Priya Singh', age: 32, gender: 'Female', phone: '9876543211', email: 'priya@email.com', address: 'Mumbai', bloodGroup: 'A+', admissionStatus: 'OPD', assignedDoctor: 'Dr. Patel', department: 'Gynecology' },
    { id: 'P003', uhid: 'UHID001236', name: 'Amit Verma', age: 58, gender: 'Male', phone: '9876543212', address: 'Bangalore', bloodGroup: 'O+', admissionStatus: 'IPD', admissionDate: '2024-12-03', assignedDoctor: 'Dr. Mehta', department: 'Neurology', bed: 'NEURO-03', ward: 'Neurology' },
    { id: 'P004', uhid: 'UHID001237', name: 'Neha Gupta', age: 28, gender: 'Female', phone: '9876543213', email: 'neha@email.com', address: 'Chennai', bloodGroup: 'AB+', admissionStatus: 'IPD', admissionDate: '2024-12-02', assignedDoctor: 'Dr. Joshi', department: 'Orthopedics', bed: 'ORTHO-08', ward: 'Orthopedics', insurance: { provider: 'Star Health', policyNumber: 'SH123456', validity: '2025-06-30' } },
  ];

  const [patients, setPatients] = useState<Patient[]>(
    () => loadHospitalStore(STORAGE_KEYS.patients, initialPatients)
  );

  const initialStaff: Staff[] = [
    { id: 'D001', name: 'Dr. Rajiv Sharma', role: 'Doctor', department: 'Cardiology', specialization: 'Interventional Cardiology', phone: '9876543220', email: 'dr.sharma@hospital.com', shift: 'Morning', status: 'On-Duty', joiningDate: '2020-03-15' },
    { id: 'D002', name: 'Dr. Anjali Patel', role: 'Doctor', department: 'Gynecology', specialization: 'Obstetrics', phone: '9876543221', email: 'dr.patel@hospital.com', shift: 'Morning', status: 'On-Duty', joiningDate: '2019-07-20' },
    { id: 'N001', name: 'Nurse Sunita', role: 'Nurse', department: 'ICU', phone: '9876543230', email: 'sunita@hospital.com', shift: 'Night', status: 'On-Duty', joiningDate: '2021-01-10' },
    { id: 'T001', name: 'Ramesh Kumar', role: 'Technician', department: 'Radiology', phone: '9876543240', email: 'ramesh@hospital.com', shift: 'Rotating', status: 'Available', joiningDate: '2022-05-05' },
  ];

  const [staff, setStaff] = useState<Staff[]>(
    () => loadHospitalStore(STORAGE_KEYS.staff, initialStaff)
  );

  const initialResources: Resource[] = [
    { id: 'R001', name: 'MRI Scanner', type: 'Equipment', department: 'Radiology', status: 'In-Use', location: 'Block A, Floor 2', lastMaintenance: '2024-11-15', nextMaintenance: '2025-02-15' },
    { id: 'R002', name: 'ICU Bed 01', type: 'Bed', department: 'ICU', status: 'Available', location: 'ICU Wing' },
    { id: 'R003', name: 'Operation Theatre 1', type: 'Room', department: 'Surgery', status: 'Reserved', location: 'OT Block' },
    { id: 'R004', name: 'Ambulance A1', type: 'Vehicle', department: 'Emergency', status: 'Available', location: 'Parking' },
  ];

  const [resources, setResources] = useState<Resource[]>(
    () => loadHospitalStore(STORAGE_KEYS.resources, initialResources)
  );

  const departments = ['Cardiology', 'Neurology', 'Orthopedics', 'Gynecology', 'Pediatrics', 'Emergency', 'General Medicine', 'Surgery'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-teal-100 text-teal-800';
      case 'Checked-in': return 'bg-yellow-100 text-yellow-800';
      case 'In-Progress': return 'bg-purple-100 text-purple-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'No-Show': return 'bg-gray-100 text-gray-800';
      case 'On-Duty': return 'bg-green-100 text-green-800';
      case 'Off-Duty': return 'bg-gray-100 text-gray-800';
      case 'On-Leave': return 'bg-orange-100 text-orange-800';
      case 'Available': return 'bg-green-100 text-green-800';
      case 'In-Use': return 'bg-teal-100 text-teal-800';
      case 'Maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'Reserved': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Emergency': return 'bg-red-500 text-white';
      case 'Urgent': return 'bg-orange-500 text-white';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  const handleViewAppointment = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setShowViewAppointmentDialog(true);
  };

  const handleEditAppointment = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setAppointmentForm(apt);
    setShowEditAppointmentDialog(true);
  };

  const handleSaveAppointment = async () => {
    if (!appointmentForm?.id) return;
    let updated: Appointment = appointmentForm as Appointment;
    let savedLocally = false;
    try {
      const { data } = await api.patch(
        `/hospital/practice/appointments/${appointmentForm.id}`,
        appointmentForm,
        { headers: hospitalHeaders() }
      );
      updated = data?.data || updated;
    } catch (error) {
      savedLocally = true;
      console.error('Failed to update appointment via API', error);
    }

    setAppointments(prev => {
      const next = prev.map(a => a.id === updated.id ? { ...a, ...updated } as Appointment : a);
      saveHospitalStore(STORAGE_KEYS.appointments, next);
      return next;
    });

    toast({
      title: savedLocally ? 'Saved locally' : 'Appointment updated',
      description: `${updated.patientName || 'Appointment'} saved.`,
    });
    setShowEditAppointmentDialog(false);
  };

  const handleRegisterPatient = async () => {
    if (!patientForm.name || !patientForm.phone) {
      toast({ title: 'Missing details', description: 'Name and phone are required.', variant: 'destructive' });
      return;
    }

    const fallbackPatient: Patient = {
      id: `P-${Date.now()}`,
      uhid: `UHID-${Date.now().toString().slice(-6)}`,
      name: patientForm.name,
      age: Number(patientForm.age) || 0,
      gender: (patientForm.gender || 'Other') as Patient['gender'],
      phone: patientForm.phone,
      email: patientForm.email || undefined,
      address: patientForm.address || '',
      bloodGroup: 'O+',
      admissionStatus: patientForm.admissionStatus,
      admissionDate: patientForm.admissionStatus === 'IPD' ? new Date().toISOString().slice(0, 10) : undefined,
      assignedDoctor: patientForm.assignedDoctor || undefined,
      department: patientForm.department || undefined,
    };

    try {
      let newPatient: Patient = fallbackPatient;
      try {
        const { data } = await api.post(
          '/hospital/practice/patients',
          {
            name: patientForm.name,
            age: Number(patientForm.age) || undefined,
            gender: patientForm.gender as Patient['gender'],
            phone: patientForm.phone,
            email: patientForm.email,
            address: patientForm.address,
            admissionStatus: patientForm.admissionStatus,
            department: patientForm.department,
            assignedDoctor: patientForm.assignedDoctor,
            bloodGroup: 'O+',
          },
          { headers: hospitalHeaders() }
        );
        newPatient = data?.data || fallbackPatient;
      } catch (error) {
        console.error('Failed to register patient via API', error);
      }

      setPatients(prev => {
        const next = [newPatient, ...prev];
        saveHospitalStore(STORAGE_KEYS.patients, next);
        return next;
      });
      toast({ title: 'Patient registered', description: `${newPatient?.name || 'Patient'} added.` });
      setPatientForm({ name: '', age: '', gender: '', phone: '', email: '', address: '', admissionStatus: 'OPD', department: '', assignedDoctor: '' });
      setShowNewPatientDialog(false);
    } catch (error) {
      handleApiError(error, 'Failed to register patient');
    }
  };

  const handleAddStaff = async () => {
    if (!staffForm.name || !staffForm.phone) {
      toast({ title: 'Missing details', description: 'Name and phone are required for staff.', variant: 'destructive' });
      return;
    }

    try {
      if (editingStaffId) {
        let updated: Staff | undefined;
        let savedLocally = false;
        try {
          const { data } = await api.patch(
            `/hospital/practice/staff/${editingStaffId}`,
            staffForm,
            { headers: hospitalHeaders() }
          );
          updated = data?.data;
        } catch (error) {
          savedLocally = true;
          console.error('Failed to update staff via API', error);
        }
        setStaff(prev => {
          const next = prev.map(s => {
            if (s.id !== editingStaffId) return s;
            const merged = updated ? { ...s, ...updated } : { ...s, ...staffForm };
            return merged as Staff;
          });
          saveHospitalStore(STORAGE_KEYS.staff, next);
          return next;
        });
        toast({ title: savedLocally ? 'Saved locally' : 'Staff updated', description: `${staffForm.name} saved.` });
      } else {
        const fallbackStaff: Staff = {
          id: `ST-${Date.now()}`,
          name: staffForm.name,
          role: staffForm.role,
          department: staffForm.department,
          specialization: staffForm.specialization || undefined,
          phone: staffForm.phone,
          email: staffForm.email,
          shift: staffForm.shift,
          status: staffForm.status,
          joiningDate: new Date().toISOString().slice(0, 10),
        };
        let newStaff: Staff = fallbackStaff;
        try {
          const { data } = await api.post(
            '/hospital/practice/staff',
            staffForm,
            { headers: hospitalHeaders() }
          );
          newStaff = data?.data || fallbackStaff;
        } catch (error) {
          console.error('Failed to add staff via API', error);
        }
        setStaff(prev => {
          const next = [newStaff, ...prev];
          saveHospitalStore(STORAGE_KEYS.staff, next);
          return next;
        });
        toast({ title: 'Staff added', description: `${newStaff?.name || 'Staff'} created.` });
      }

      setEditingStaffId(null);
      setStaffForm({ name: '', role: 'Doctor', department: '', specialization: '', phone: '', email: '', shift: 'Morning', status: 'On-Duty' });
      setShowAddStaffDialog(false);
    } catch (error) {
      handleApiError(error, 'Failed to save staff');
    }
  };

  const handleAddResource = async () => {
    if (!resourceForm.name) {
      toast({ title: 'Missing details', description: 'Resource name is required.', variant: 'destructive' });
      return;
    }

    try {
      const fallbackResource: Resource = {
        id: `RS-${Date.now()}`,
        name: resourceForm.name,
        type: resourceForm.type,
        department: resourceForm.department,
        status: resourceForm.status,
        location: resourceForm.location,
      };
      let newResource: Resource = fallbackResource;
      try {
        const { data } = await api.post(
          '/hospital/practice/resources',
          resourceForm,
          { headers: hospitalHeaders() }
        );
        newResource = data?.data || fallbackResource;
      } catch (error) {
        console.error('Failed to add resource via API', error);
      }
      setResources(prev => {
        const next = [newResource, ...prev];
        saveHospitalStore(STORAGE_KEYS.resources, next);
        return next;
      });
      toast({ title: 'Resource added', description: `${newResource?.name || 'Resource'} added.` });
      setResourceForm({ name: '', type: 'Bed', department: '', status: 'Available', location: '' });
      setShowAddResourceDialog(false);
    } catch (error) {
      handleApiError(error, 'Failed to add resource');
    }
  };

  const handleCompleteAppointment = async (apt: Appointment) => {
    try {
      try {
        await api.post(
          `/hospital/practice/appointments/${apt.id}/status`,
          { status: 'Completed' },
          { headers: hospitalHeaders() }
        );
      } catch (error) {
        console.error('Failed to update appointment status via API', error);
      }
      setAppointments(prev => {
        const next = prev.map(a => a.id === apt.id ? { ...a, status: 'Completed' } : a);
        saveHospitalStore(STORAGE_KEYS.appointments, next);
        return next;
      });
      toast({ title: 'Appointment completed', description: `${apt.patientName} marked completed.` });
    } catch (error) {
      handleApiError(error, 'Failed to update appointment status');
    }
  };

  const handleScheduleAppointment = async () => {
    if (!newAppointmentForm.patientName || !newAppointmentForm.patientPhone || !newAppointmentForm.time || !selectedDate) {
      toast({ title: 'Missing details', description: 'Patient, phone, date, and time are required.', variant: 'destructive' });
      return;
    }

    try {
      const doctor = staff.find(s => s.id === newAppointmentForm.doctorId);
      const fallbackAppointment: Appointment = {
        id: `APT-${Date.now()}`,
        patientId: newAppointmentForm.patientName.slice(0, 2).toUpperCase(),
        patientName: newAppointmentForm.patientName,
        patientPhone: newAppointmentForm.patientPhone,
        doctorId: doctor?.id || '',
        doctorName: doctor?.name || 'On Call',
        department: newAppointmentForm.department || 'General Medicine',
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: newAppointmentForm.time,
        type: newAppointmentForm.type,
        status: 'Scheduled',
        priority: newAppointmentForm.priority,
        notes: newAppointmentForm.notes,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      let created: Appointment = fallbackAppointment;
      try {
        const { data } = await api.post(
          '/hospital/practice/appointments',
          {
            patientName: newAppointmentForm.patientName,
            patientPhone: newAppointmentForm.patientPhone,
            patientEmail: '',
            doctorId: doctor?.id,
            doctorName: doctor?.name,
            appointmentDate: format(selectedDate, 'yyyy-MM-dd'),
            appointmentTime: newAppointmentForm.time,
            consultationType: 'in-person',
            reason: newAppointmentForm.notes,
            specialization: newAppointmentForm.department || 'General Medicine',
            priority: newAppointmentForm.priority,
            notes: newAppointmentForm.notes,
          },
          { headers: hospitalHeaders() }
        );
        created = data?.data || fallbackAppointment;
      } catch (error) {
        console.error('Failed to create appointment via API', error);
      }

      setAppointments(prev => {
        const next = [created, ...prev];
        saveHospitalStore(STORAGE_KEYS.appointments, next);
        return next;
      });
      toast({ title: 'Appointment created', description: `${created?.patientName || 'Appointment'} scheduled.` });
      setShowNewAppointmentDialog(false);
      setNewAppointmentForm({ patientName: '', patientPhone: '', department: '', doctorId: '', type: 'OPD', priority: 'Normal', time: '', notes: '' });
    } catch (error) {
      handleApiError(error, 'Failed to create appointment');
    }
  };

  const handleToggleResource = async (res: Resource) => {
    const nextStatus = res.status === 'Available' ? 'In-Use' : 'Available';
    try {
      let updated: Resource = { ...res, status: nextStatus };
      try {
        const { data } = await api.patch(
          `/hospital/practice/resources/${res.id}`,
          { status: nextStatus },
          { headers: hospitalHeaders() }
        );
        updated = data?.data || updated;
      } catch (error) {
        console.error('Failed to update resource via API', error);
      }
      setResources(prev => {
        const next = prev.map(r => r.id === res.id ? updated : r);
        saveHospitalStore(STORAGE_KEYS.resources, next);
        return next;
      });
      toast({ title: 'Resource updated', description: `${updated.name} marked as ${updated.status}.` });
    } catch (error) {
      handleApiError(error, 'Failed to update resource');
    }
  };

  const handleAllocateBed = async () => {
    if (!bedAllocationForm.patientId || !bedAllocationForm.resourceId) {
      toast({ title: 'Select patient and bed', description: 'Choose a patient and an available bed.', variant: 'destructive' });
      return;
    }

    try {
      let updatedPatient: Patient | undefined;
      let updatedResource: Resource | undefined;
      try {
        const { data } = await api.post(
          '/hospital/practice/resources/allocate',
          {
            patientId: bedAllocationForm.patientId,
            resourceId: bedAllocationForm.resourceId,
          },
          { headers: hospitalHeaders() }
        );

        updatedPatient = data?.data?.patient;
        updatedResource = data?.data?.resource;
      } catch (error) {
        console.error('Failed to allocate bed via API', error);
      }

      const fallbackPatient = patients.find(p => p.id === bedAllocationForm.patientId);
      const fallbackResource = resources.find(r => r.id === bedAllocationForm.resourceId);

      if (fallbackPatient && !updatedPatient) {
        updatedPatient = {
          ...fallbackPatient,
          admissionStatus: 'IPD',
          bed: fallbackResource?.name || fallbackPatient.bed,
          ward: fallbackResource?.department || fallbackPatient.ward,
          admissionDate: fallbackPatient.admissionDate || new Date().toISOString().slice(0, 10),
        };
      }
      if (fallbackResource && !updatedResource) {
        updatedResource = { ...fallbackResource, status: 'Reserved' };
      }

      if (updatedPatient) {
        setPatients(prev => {
          const next = prev.map(p => p.id === updatedPatient?.id || p.uhid === updatedPatient?.uhid ? updatedPatient as Patient : p);
          saveHospitalStore(STORAGE_KEYS.patients, next);
          return next;
        });
      }
      if (updatedResource) {
        setResources(prev => {
          const next = prev.map(r => r.id === updatedResource?.id ? updatedResource as Resource : r);
          saveHospitalStore(STORAGE_KEYS.resources, next);
          return next;
        });
      }

      toast({ title: 'Bed allocated', description: `${updatedPatient?.name || 'Patient'} assigned to ${updatedResource?.name || 'bed'}.` });
      setBedAllocationForm({ patientId: '', resourceId: '' });
      setShowBedAllocationDialog(false);
    } catch (error) {
      handleApiError(error, 'Failed to allocate bed');
    }
  };

  const handleConvertToIPD = async (patient: Patient) => {
    const numericId = /^\d+$/.test(patient.id);
    if (numericId) {
      try {
        const { data } = await api.patch(
          `/hospital/practice/patients/${patient.id}`,
          { admissionStatus: 'IPD' },
          { headers: hospitalHeaders() }
        );
        const redirect = data?.data?.redirect;
        if (redirect) {
          navigate(redirect);
          toast({ title: 'Admission', description: `Complete admission for ${patient.name}.` });
          return;
        }
      } catch (_) {
        /* fall through to direct navigation */
      }
      navigate(
        `/hospital/adt/admit?patientId=${encodeURIComponent(patient.id)}&name=${encodeURIComponent(patient.name)}&type=op_converted`
      );
      toast({ title: 'Admission', description: `Complete admission for ${patient.name}.` });
      return;
    }
    try {
      let updated: Patient = { ...patient, admissionStatus: 'IPD' };
      try {
        const { data } = await api.patch(
          `/hospital/practice/patients/${patient.id}`,
          {
            admissionStatus: 'IPD',
            admissionDate: patient.admissionDate || new Date().toISOString().slice(0, 10),
            bed: patient.bed || 'Pending bed',
            ward: patient.ward || 'Ward'
          },
          { headers: hospitalHeaders() }
        );
        updated = data?.data || updated;
      } catch (error) {
        console.error('Failed to convert patient via API', error);
      }
      setPatients(prev => {
        const next = prev.map(p => p.id === patient.id ? updated : p);
        saveHospitalStore(STORAGE_KEYS.patients, next);
        return next;
      });
      toast({ title: 'Converted to IPD', description: `${updated.name} moved to IPD.` });
    } catch (error) {
      handleApiError(error, 'Failed to convert patient to IPD');
    }
  };

  const handleViewStaff = (member: Staff) => {
    toast({ title: member.name, description: `${member.role} • ${member.department} • ${member.phone}` });
  };

  const handleEditStaff = (member: Staff) => {
    setStaffForm({
      name: member.name,
      role: member.role,
      department: member.department,
      specialization: member.specialization || '',
      phone: member.phone,
      email: member.email,
      shift: member.shift,
      status: member.status,
    });
    setEditingStaffId(member.id);
    setShowAddStaffDialog(true);
  };

  const handleDischargePatient = async (patient: Patient) => {
    try {
      let updated: Patient = { ...patient, admissionStatus: 'Discharged' };
      try {
        const { data } = await api.post(
          `/hospital/practice/patients/${patient.id}/discharge`,
          {},
          { headers: hospitalHeaders() }
        );
        updated = data?.data || updated;
      } catch (error) {
        console.error('Failed to discharge patient via API', error);
      }
      setPatients(prev => {
        const next = prev.map(p => p.id === patient.id ? updated : p);
        saveHospitalStore(STORAGE_KEYS.patients, next);
        return next;
      });
      if (updated.bed) {
        setResources(prev => {
          const next = prev.map(r => r.name === updated.bed || r.id === updated.bed ? { ...r, status: 'Available' } : r);
          saveHospitalStore(STORAGE_KEYS.resources, next);
          return next;
        });
      }
      toast({ title: 'Patient discharged', description: `${updated.name} marked as discharged.` });
    } catch (error) {
      handleApiError(error, 'Failed to discharge patient');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <HospitalLayout title="Practice Management" subtitle="Appointments, Patient Flow & Resource Management">
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white">
            <CardContent className="p-4 text-center">
              <CalendarIcon className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{appointments.filter(a => a.status === 'Scheduled').length}</p>
              <p className="text-xs opacity-80">Scheduled</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
            <CardContent className="p-4 text-center">
              <Timer className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{appointments.filter(a => a.status === 'Checked-in').length}</p>
              <p className="text-xs opacity-80">Waiting</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4 text-center">
              <Activity className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{appointments.filter(a => a.status === 'In-Progress').length}</p>
              <p className="text-xs opacity-80">In Progress</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{appointments.filter(a => a.status === 'Completed').length}</p>
              <p className="text-xs opacity-80">Completed</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4 text-center">
              <Bed className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{patients.filter(p => p.admissionStatus === 'IPD').length}</p>
              <p className="text-xs opacity-80">IPD Patients</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-teal-500 to-emerald-500 text-white">
            <CardContent className="p-4 text-center">
              <Stethoscope className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{staff.filter(s => s.status === 'On-Duty').length}</p>
              <p className="text-xs opacity-80">On Duty</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList className="grid grid-cols-4 w-auto">
              <TabsTrigger value="appointments" className="gap-2">
                <CalendarIcon className="h-4 w-4" /> Appointments
              </TabsTrigger>
              <TabsTrigger value="patients" className="gap-2">
                <Users className="h-4 w-4" /> Patient Flow
              </TabsTrigger>
              <TabsTrigger value="staff" className="gap-2">
                <Stethoscope className="h-4 w-4" /> Staff Schedule
              </TabsTrigger>
              <TabsTrigger value="resources" className="gap-2">
                <Bed className="h-4 w-4" /> Resources
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search..." 
                  className="pl-9 w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Today's Appointments</h2>
              <Dialog open={showNewAppointmentDialog} onOpenChange={setShowNewAppointmentDialog}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600">
                    <Plus className="h-4 w-4" /> New Appointment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Schedule New Appointment</DialogTitle>
                    <DialogDescription>Fill in the details to schedule a new appointment</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Patient Name</Label>
                      <Input placeholder="Enter patient name" value={newAppointmentForm.patientName} onChange={(e) => setNewAppointmentForm(prev => ({ ...prev, patientName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input placeholder="Enter phone number" value={newAppointmentForm.patientPhone} onChange={(e) => setNewAppointmentForm(prev => ({ ...prev, patientPhone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Select value={newAppointmentForm.department} onValueChange={(value) => setNewAppointmentForm(prev => ({ ...prev, department: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Doctor</Label>
                      <Select value={newAppointmentForm.doctorId} onValueChange={(value) => setNewAppointmentForm(prev => ({ ...prev, doctorId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select doctor" />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.filter(s => s.role === 'Doctor').map(doc => (
                            <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Select value={newAppointmentForm.time} onValueChange={(value) => setNewAppointmentForm(prev => ({ ...prev, time: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00'].map(time => (
                            <SelectItem key={time} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Appointment Type</Label>
                      <Select value={newAppointmentForm.type} onValueChange={(value) => setNewAppointmentForm(prev => ({ ...prev, type: value as Appointment['type'] }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPD">OPD</SelectItem>
                          <SelectItem value="IPD">IPD</SelectItem>
                          <SelectItem value="Emergency">Emergency</SelectItem>
                          <SelectItem value="Follow-up">Follow-up</SelectItem>
                          <SelectItem value="Procedure">Procedure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={newAppointmentForm.priority} onValueChange={(value) => setNewAppointmentForm(prev => ({ ...prev, priority: value as Appointment['priority'] }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Normal">Normal</SelectItem>
                          <SelectItem value="Urgent">Urgent</SelectItem>
                          <SelectItem value="Emergency">Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Notes</Label>
                      <Textarea placeholder="Additional notes..." value={newAppointmentForm.notes} onChange={(e) => setNewAppointmentForm(prev => ({ ...prev, notes: e.target.value }))} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewAppointmentDialog(false)}>Cancel</Button>
                    <Button className="bg-gradient-to-r from-teal-500 to-teal-600" onClick={handleScheduleAppointment}>Schedule Appointment</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((apt) => (
                      <TableRow key={apt.id}>
                        <TableCell className="font-medium">{apt.time}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{apt.patientName}</p>
                            <p className="text-sm text-muted-foreground">{apt.patientPhone}</p>
                          </div>
                        </TableCell>
                        <TableCell>{apt.doctorName}</TableCell>
                        <TableCell>{apt.department}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{apt.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(apt.priority)}>{apt.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(apt.status)}>{apt.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleViewAppointment(apt)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEditAppointment(apt)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            {apt.status === 'Scheduled' && (
                              <Button variant="ghost" size="icon" className="text-green-600" onClick={() => handleCompleteAppointment(apt)}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Patient Flow Tab */}
          <TabsContent value="patients" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Patient Management</h2>
              <Dialog open={showNewPatientDialog} onOpenChange={setShowNewPatientDialog}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600">
                    <UserPlus className="h-4 w-4" /> Register Patient
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Patient Registration</DialogTitle>
                    <DialogDescription>Register a new patient in the system</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-3 gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input placeholder="Enter full name" value={patientForm.name} onChange={(e) => setPatientForm(prev => ({ ...prev, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Age</Label>
                      <Input type="number" placeholder="Age" value={patientForm.age} onChange={(e) => setPatientForm(prev => ({ ...prev, age: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Select value={patientForm.gender} onValueChange={(value) => setPatientForm(prev => ({ ...prev, gender: value as Patient['gender'] }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input placeholder="Phone number" value={patientForm.phone} onChange={(e) => setPatientForm(prev => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" placeholder="Email address" value={patientForm.email} onChange={(e) => setPatientForm(prev => ({ ...prev, email: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Blood Group</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select blood group" />
                        </SelectTrigger>
                        <SelectContent>
                          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                            <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 space-y-2">
                      <Label>Address</Label>
                      <Textarea placeholder="Full address" value={patientForm.address} onChange={(e) => setPatientForm(prev => ({ ...prev, address: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Admission Type</Label>
                      <Select value={patientForm.admissionStatus} onValueChange={(value) => setPatientForm(prev => ({ ...prev, admissionStatus: value as Patient['admissionStatus'] }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPD">OPD</SelectItem>
                          <SelectItem value="IPD">IPD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Select value={patientForm.department} onValueChange={(value) => setPatientForm(prev => ({ ...prev, department: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Assigned Doctor</Label>
                      <Select value={patientForm.assignedDoctor} onValueChange={(value) => setPatientForm(prev => ({ ...prev, assignedDoctor: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select doctor" />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.filter(s => s.role === 'Doctor').map(doc => (
                            <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewPatientDialog(false)}>Cancel</Button>
                    <Button className="bg-gradient-to-r from-teal-500 to-teal-600" onClick={handleRegisterPatient}>Register Patient</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* OPD Patients */}
              <Card>
                <CardHeader className="bg-teal-50">
                  <CardTitle className="flex items-center gap-2 text-teal-700">
                    <Users className="h-5 w-5" /> OPD Patients
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {patients.filter(p => p.admissionStatus === 'OPD').map(patient => (
                        <div key={patient.id} className="p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold">{patient.name}</p>
                            <Badge variant="outline">{patient.uhid}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>{patient.age} yrs • {patient.gender} • {patient.bloodGroup}</p>
                            <p>{patient.department} • {patient.assignedDoctor}</p>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => toast({ title: patient.name, description: `${patient.department || 'No department'} • ${patient.phone}` })}>View</Button>
                            <Button size="sm" className="flex-1" onClick={() => handleConvertToIPD(patient)}>Convert to IPD</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* IPD Patients */}
              <Card>
                <CardHeader className="bg-green-50">
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <Bed className="h-5 w-5" /> IPD Patients
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {patients.filter(p => p.admissionStatus === 'IPD').map(patient => (
                        <div key={patient.id} className="p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold">{patient.name}</p>
                            <Badge className="bg-green-100 text-green-800">{patient.bed}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>{patient.age} yrs • {patient.gender} • {patient.bloodGroup}</p>
                            <p>{patient.department} • {patient.ward}</p>
                            <p className="text-xs">Admitted: {patient.admissionDate}</p>
                          </div>
                          {patient.insurance && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              Insured: {patient.insurance.provider}
                            </Badge>
                          )}
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => toast({ title: patient.name, description: `${patient.department || 'IPD'} • Bed ${patient.bed}` })}>View</Button>
                            <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleDischargePatient(patient)}>Discharge</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => { setPatientForm({ name: '', age: '', gender: '', phone: '', email: '', address: '', admissionStatus: 'OPD', department: '', assignedDoctor: '' }); setShowNewPatientDialog(true); }}>
                    <UserPlus className="h-4 w-4" /> Walk-in Registration
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setShowBedAllocationDialog(true)}>
                    <Bed className="h-4 w-4" /> Bed Allocation
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => toast({ title: 'Transfer initiated', description: 'Patient transfer request created.' })}>
                    <ArrowUpDown className="h-4 w-4" /> Transfer Patient
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => toast({ title: 'Discharge summary', description: 'Discharge summary generated.' })}>
                    <FileText className="h-4 w-4" /> Discharge Summary
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => toast({ title: 'Export started', description: 'Patient list export in progress.' })}>
                    <Download className="h-4 w-4" /> Export Patient List
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/hospital/adt/wristband?patientId=1&name=Priya%20Singh&admissionNumber=IP2026000001&bed=GEN-11&ward=General%20Ward%20A')}>
                    <Printer className="h-4 w-4" /> Print Wristband
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Staff Schedule Tab */}
          <TabsContent value="staff" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Staff Management</h2>
              <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600" onClick={() => { setEditingStaffId(null); setStaffForm({ name: '', role: 'Doctor', department: '', specialization: '', phone: '', email: '', shift: 'Morning', status: 'On-Duty' }); setShowAddStaffDialog(true); }}>
                <Plus className="h-4 w-4" /> Add Staff
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Specialization</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{member.role}</Badge>
                        </TableCell>
                        <TableCell>{member.department}</TableCell>
                        <TableCell>{member.specialization || '-'}</TableCell>
                        <TableCell>{member.shift}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{member.phone}</p>
                            <p className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" />{member.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(member.status)}>{member.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleViewStaff(member)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEditStaff(member)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Resource Allocation</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowBedAllocationDialog(true)}>
                  <Bed className="h-4 w-4 mr-2" /> Allocate Bed
                </Button>
                <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600" onClick={() => setShowAddResourceDialog(true)}>
                  <Plus className="h-4 w-4" /> Add Resource
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {resources.map((resource) => (
                <Card key={resource.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="outline">{resource.type}</Badge>
                      <Badge className={getStatusColor(resource.status)}>{resource.status}</Badge>
                    </div>
                    <h3 className="font-bold text-lg mb-2">{resource.name}</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" /> {resource.department}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> {resource.location}
                      </p>
                      {resource.nextMaintenance && (
                        <p className="flex items-center gap-2 text-orange-600">
                          <AlertCircle className="h-4 w-4" /> Next: {resource.nextMaintenance}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => toast({ title: resource.name, description: `${resource.type} • ${resource.location}` })}>View</Button>
                      <Button size="sm" className="flex-1" onClick={() => handleToggleResource(resource)}>
                        {resource.status === 'Available' ? 'Reserve' : 'Release'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Appointment View Dialog */}
        <Dialog open={showViewAppointmentDialog} onOpenChange={setShowViewAppointmentDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Appointment Details</DialogTitle>
              <DialogDescription>Review appointment information</DialogDescription>
            </DialogHeader>
            {selectedAppointment && (
              <div className="space-y-3 text-sm">
                <p className="font-medium text-base">{selectedAppointment.patientName}</p>
                <p className="text-muted-foreground">{selectedAppointment.patientPhone}</p>
                <p>Doctor: <span className="font-medium">{selectedAppointment.doctorName}</span></p>
                <p>Department: {selectedAppointment.department}</p>
                <p>Time: {selectedAppointment.date} {selectedAppointment.time}</p>
                <p>Type: {selectedAppointment.type}</p>
                <p>Status: {selectedAppointment.status}</p>
                <p>Priority: {selectedAppointment.priority}</p>
                {selectedAppointment.notes && <p>Notes: {selectedAppointment.notes}</p>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewAppointmentDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Appointment Edit Dialog */}
        <Dialog open={showEditAppointmentDialog} onOpenChange={setShowEditAppointmentDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Appointment</DialogTitle>
              <DialogDescription>Update status or priority</DialogDescription>
            </DialogHeader>
            {appointmentForm && (
              <div className="space-y-3">
                <div>
                  <Label>Patient</Label>
                  <Input value={appointmentForm.patientName} disabled />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={appointmentForm.status} onValueChange={(value) => setAppointmentForm(prev => prev ? { ...prev, status: value as Appointment['status'] } : prev)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['Scheduled','Checked-in','In-Progress','Completed','Cancelled','No-Show'].map(status => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={appointmentForm.priority} onValueChange={(value) => setAppointmentForm(prev => prev ? { ...prev, priority: value as Appointment['priority'] } : prev)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['Normal','Urgent','Emergency'].map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input value={appointmentForm.date} onChange={(e) => setAppointmentForm(prev => prev ? { ...prev, date: e.target.value } : prev)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input value={appointmentForm.time} onChange={(e) => setAppointmentForm(prev => prev ? { ...prev, time: e.target.value } : prev)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={appointmentForm.notes || ''} onChange={(e) => setAppointmentForm(prev => prev ? { ...prev, notes: e.target.value } : prev)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditAppointmentDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveAppointment}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add/Edit Staff Dialog */}
        <Dialog open={showAddStaffDialog} onOpenChange={(open) => { setShowAddStaffDialog(open); if (!open) setEditingStaffId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingStaffId ? 'Edit Staff' : 'Add Staff'}</DialogTitle>
              <DialogDescription>Capture staff details</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={staffForm.name} onChange={(e) => setStaffForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={staffForm.role} onValueChange={(value) => setStaffForm(prev => ({ ...prev, role: value as Staff['role'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Doctor','Nurse','Technician','Admin','Receptionist'].map(role => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input value={staffForm.department} onChange={(e) => setStaffForm(prev => ({ ...prev, department: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Specialization</Label>
                <Input value={staffForm.specialization} onChange={(e) => setStaffForm(prev => ({ ...prev, specialization: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={staffForm.phone} onChange={(e) => setStaffForm(prev => ({ ...prev, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={staffForm.email} onChange={(e) => setStaffForm(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select value={staffForm.shift} onValueChange={(value) => setStaffForm(prev => ({ ...prev, shift: value as Staff['shift'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Morning','Afternoon','Night','Rotating'].map(shift => (
                      <SelectItem key={shift} value={shift}>{shift}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={staffForm.status} onValueChange={(value) => setStaffForm(prev => ({ ...prev, status: value as Staff['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['On-Duty','Off-Duty','On-Leave','Available'].map(status => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddStaffDialog(false); setEditingStaffId(null); }}>Cancel</Button>
              <Button onClick={handleAddStaff}>{editingStaffId ? 'Save Staff' : 'Add Staff'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Resource Dialog */}
        <Dialog open={showAddResourceDialog} onOpenChange={setShowAddResourceDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Resource</DialogTitle>
              <DialogDescription>Track equipment, rooms, or beds</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={resourceForm.name} onChange={(e) => setResourceForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={resourceForm.type} onValueChange={(value) => setResourceForm(prev => ({ ...prev, type: value as Resource['type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Equipment','Room','Bed','Vehicle'].map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input value={resourceForm.department} onChange={(e) => setResourceForm(prev => ({ ...prev, department: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={resourceForm.location} onChange={(e) => setResourceForm(prev => ({ ...prev, location: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={resourceForm.status} onValueChange={(value) => setResourceForm(prev => ({ ...prev, status: value as Resource['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Available','In-Use','Maintenance','Reserved'].map(status => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddResourceDialog(false)}>Cancel</Button>
              <Button onClick={handleAddResource}>Save Resource</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bed Allocation Dialog */}
        <Dialog open={showBedAllocationDialog} onOpenChange={setShowBedAllocationDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Allocate Bed</DialogTitle>
              <DialogDescription>Assign an available bed to a patient</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={bedAllocationForm.patientId} onValueChange={(value) => setBedAllocationForm(prev => ({ ...prev, patientId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.filter(p => p.admissionStatus !== 'Discharged').map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.admissionStatus})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bed</Label>
                <Select value={bedAllocationForm.resourceId} onValueChange={(value) => setBedAllocationForm(prev => ({ ...prev, resourceId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select bed" /></SelectTrigger>
                  <SelectContent>
                    {resources.filter(r => r.type === 'Bed' && r.status === 'Available').map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} • {r.department}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBedAllocationDialog(false)}>Cancel</Button>
              <Button onClick={handleAllocateBed}>Allocate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HospitalLayout>
  );
};

export default HospitalPracticeManagement;

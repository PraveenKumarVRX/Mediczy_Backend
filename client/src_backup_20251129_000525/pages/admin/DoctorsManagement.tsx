import { useState, useRef, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Upload, 
  Download, 
  Plus, 
  FileSpreadsheet, 
  Search,
  Eye,
  Edit,
  Trash2,
  Stethoscope,
  Mail,
  Phone,
  Calendar,
  Award,
  Users
} from 'lucide-react';
import api from '@/utils/api';
import { parseExcelFile, downloadExcelTemplate } from '@/utils/excelParser';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Doctor {
  id: string;
  prefix?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  specialization: string;
  experience: number;
  languages?: string[];
  about?: string;
  ugQualifications?: string[];
  pgQualifications?: string[];
  medicalCouncilName?: string;
  medicalCouncilRegistrationNumber?: string;
  registrationNumber?: string;
  doctorImage?: string;
  hospitalClinicName?: string;
  practiceAddress?: string;
  practiceCity?: string;
  practiceState?: string;
  practiceZipCode?: string;
  practiceLatitude?: number;
  practiceLongitude?: number;
  isActive?: boolean;
  // Slot duration settings (minutes)
  onlineSlotDurationMinutes?: number;
  walkinSlotDurationMinutes?: number;
  clinics?: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    walkinSlotDurationMinutes: number;
    weeklyAvailability: {
      mon: boolean;
      tue: boolean;
      wed: boolean;
      thu: boolean;
      fri: boolean;
      sat: boolean;
      sun: boolean;
    };
  }[];
  createdAt: string;
}

const specializations = [
  'General Practitioner', 'Cardiologist', 'Dermatologist', 'Pediatrician',
  'Orthopedist', 'Neurologist', 'Psychiatrist', 'Psychologist', 'Gynecologist',
  'ENT Specialist', 'Ophthalmologist', 'Rheumatologist', 'Pulmonologist',
  'Physiotherapist', 'Occupational Therapist', 'Nutritionist', 'Dietician',
  'Nephrologist', 'Urologist', 'Diabetologist', 'Intensivist',
  'Cardio Thoracic Surgeon', 'Vascular Surgeon', 'Neuro Surgeon',
  'Cardio Vascular Surgeon', 'Gastroenterologist', 'Gastro Surgeon',
  'General Surgeon', 'Proctologist', 'Podiatrician', 'Dentist',
  'Endocrinologist', 'Oncologist', 'Other'
];

const DoctorsManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // Doctors list state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialization, setSelectedSpecialization] = useState('all');
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // View dialog state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  // Qualification management
  const [ugQualifications, setUgQualifications] = useState(['']);
  const [pgQualifications, setPgQualifications] = useState(['']);

  // Multi-clinic configuration (walk-in only)
  const [clinics, setClinics] = useState([
    {
      id: 'clinic_1',
      name: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      walkinSlotDurationMinutes: 30,
      weeklyAvailability: {
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: false,
        sun: false,
      },
    },
  ]);

  // Single doctor form state
  const [newDoctor, setNewDoctor] = useState({
    prefix: 'Dr',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    specialization: '',
    experience: '',
    languages: '',
    about: '',
    
    // Education & Qualifications
    ugQualifications: [''],
    pgQualifications: [''],
    
    // Medical Council
    medicalCouncilName: '',
    medicalCouncilRegistrationNumber: '',
    registrationNumber: '',
    
    // Doctor Image
    doctorImage: '',
    
    // Practice Details
    hospitalClinicName: '',
    practiceAddress: '',
    practiceCity: '',
    practiceState: '',
    practiceZipCode: '',
    practiceLatitude: '',
    practiceLongitude: '',

    // Slot durations (minutes)
    onlineSlotDurationMinutes: '30',
    walkinSlotDurationMinutes: '30'
  });

  // Fetch doctors list
  const fetchDoctors = async () => {
    try {
      setDoctorsLoading(true);
      setError(null);
      
      const { data } = await api.get(`/admin/doctors`, {
        params: { page, limit: 20 },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const list = (data as any).data || data || [];
      const total = (data as any).total ?? list.length;

      setDoctors(list);
      setFilteredDoctors(list);
      setTotalPages(Math.ceil(total / 20));
    } catch (err: any) {
      console.error('Failed to fetch doctors:', err);
      setError(err?.response?.data?.message || 'Failed to fetch doctors');
      // Set sample data for demo
      const sampleDoctors: Doctor[] = [
        {
          id: 'dr_001',
          prefix: 'Dr',
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah.johnson@mediczy.com',
          phoneNumber: '+1-234-567-8901',
          specialization: 'Cardiologist',
          experience: 12,
          languages: ['English', 'Spanish'],
          about: 'Experienced cardiologist specializing in heart surgery and cardiac care.',
          ugQualifications: ['MBBS', 'MD'],
          pgQualifications: ['DM Cardiology', 'Fellowship in Interventional Cardiology'],
          medicalCouncilName: 'Medical Council of India',
          medicalCouncilRegistrationNumber: 'MCI-67890',
          hospitalClinicName: 'Heart Care Center',
          practiceAddress: '123 Medical Plaza',
          practiceCity: 'Mumbai',
          practiceState: 'Maharashtra',
          practiceLatitude: 19.0760,
          practiceLongitude: 72.8777,
          createdAt: '2024-01-15T10:30:00Z'
        },
        {
          id: 'dr_002',
          prefix: 'Dr',
          firstName: 'Michael',
          lastName: 'Chen',
          email: 'michael.chen@mediczy.com',
          phoneNumber: '+1-234-567-8902',
          specialization: 'Pediatrician',
          experience: 8,
          languages: ['English', 'Mandarin'],
          about: 'Dedicated pediatrician with expertise in child development and preventive care.',
          createdAt: '2024-02-10T14:15:00Z'
        },
        {
          id: 'dr_003',
          prefix: 'Ms',
          firstName: 'Emily',
          lastName: 'Rodriguez',
          email: 'emily.rodriguez@mediczy.com',
          phoneNumber: '+1-234-567-8903',
          specialization: 'Dermatologist',
          experience: 10,
          languages: ['English', 'Spanish', 'Portuguese'],
          about: 'Board-certified dermatologist focusing on skin cancer treatment and cosmetic procedures.',
          createdAt: '2024-01-22T09:45:00Z'
        },
        {
          id: 'dr_004',
          prefix: 'Prof',
          firstName: 'James',
          lastName: 'Wilson',
          email: 'james.wilson@mediczy.com',
          phoneNumber: '+1-234-567-8904',
          specialization: 'Orthopedist',
          experience: 15,
          languages: ['English'],
          about: 'Orthopedic surgeon specializing in joint replacement and sports medicine.',
          createdAt: '2024-03-05T16:20:00Z'
        },
        {
          id: 'dr_005',
          prefix: 'Dr',
          firstName: 'Lisa',
          lastName: 'Park',
          email: 'lisa.park@mediczy.com',
          phoneNumber: '+1-234-567-8905',
          specialization: 'Neurologist',
          experience: 9,
          languages: ['English', 'Korean'],
          about: 'Neurologist with expertise in treating movement disorders and epilepsy.',
          createdAt: '2024-02-28T11:00:00Z'
        }
      ];
      setDoctors(sampleDoctors);
      setFilteredDoctors(sampleDoctors);
    } finally {
      setDoctorsLoading(false);
    }
  };

  // Filter doctors based on search and specialization
  useEffect(() => {
    let filtered = doctors;

    if (searchTerm) {
      filtered = filtered.filter(doctor =>
        `${doctor.firstName} ${doctor.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doctor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doctor.phoneNumber.includes(searchTerm) ||
        doctor.specialization.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedSpecialization !== 'all') {
      filtered = filtered.filter(doctor => doctor.specialization === selectedSpecialization);
    }

    setFilteredDoctors(filtered);
  }, [searchTerm, selectedSpecialization, doctors]);

  // Load doctors on component mount
  useEffect(() => {
    fetchDoctors();
  }, [page]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const data = await parseExcelFile(file);
      const doctors = data.map((row: any) => ({
        prefix: row.Prefix || row.prefix || 'Dr',
        firstName: row.FirstName || row.firstName || '',
        lastName: row.LastName || row.lastName || '',
        email: row.Email || row.email || '',
        phoneNumber: row.PhoneNumber || row.phoneNumber || row.Phone || '',
        specialization: row.Specialization || row.specialization || 'General Practitioner',
        experience: parseInt(row.Experience || row.experience || '0'),
        languages: (row.Languages || row.languages || 'English').split(',').map((l: string) => l.trim()),
        about: row.About || row.about || '',
        ugQualifications: (row.UGQualifications || row.ugQualifications || '').split(',').map((q: string) => q.trim()).filter(Boolean),
        pgQualifications: (row.PGQualifications || row.pgQualifications || '').split(',').map((q: string) => q.trim()).filter(Boolean),
        medicalCouncilName: row.MedicalCouncilName || row.medicalCouncilName || '',
        medicalCouncilRegistrationNumber: row.MedicalCouncilRegistrationNumber || row.medicalCouncilRegistrationNumber || '',
        registrationNumber: row.RegistrationNumber || row.registrationNumber || '',
        doctorImage: row.DoctorImage || row.doctorImage || '',
        hospitalClinicName: row.HospitalClinicName || row.hospitalClinicName || '',
        practiceAddress: row.PracticeAddress || row.practiceAddress || '',
        practiceCity: row.PracticeCity || row.practiceCity || '',
        practiceState: row.PracticeState || row.practiceState || '',
        practiceZipCode: row.PracticeZipCode || row.practiceZipCode || '',
        practiceLatitude: parseFloat(row.PracticeLatitude || row.practiceLatitude || '0') || null,
        practiceLongitude: parseFloat(row.PracticeLongitude || row.practiceLongitude || '0') || null
      }));

      const { data: response } = await axios.post('http://192.168.1.72:8000/api/admin/masters/doctors', 
        { doctors },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(response);
      // Refresh the doctors list after successful upload
      fetchDoctors();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Excel upload failed');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const doctors = JSON.parse(jsonInput);
      const { data } = await axios.post('http://192.168.1.72:8000/api/admin/masters/doctors',
        { doctors: Array.isArray(doctors) ? doctors : [doctors] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setJsonInput('');
      // Refresh the doctors list after successful upload
      fetchDoctors();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSingleDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const doctor = {
        ...newDoctor,
        experience: parseInt(newDoctor.experience || '0'),
        languages: newDoctor.languages.split(',').map(l => l.trim()).filter(Boolean),
        ugQualifications: ugQualifications.filter(Boolean),
        pgQualifications: pgQualifications.filter(Boolean),
        practiceLatitude: parseFloat(newDoctor.practiceLatitude) || null,
        practiceLongitude: parseFloat(newDoctor.practiceLongitude) || null,
        clinics,
      };

      const { data } = await axios.post('http://192.168.1.72:8000/api/admin/masters/doctors',
        { doctors: [doctor] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setNewDoctor({
        prefix: 'Dr',
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        specialization: '',
        experience: '',
        languages: '',
        about: '',
        ugQualifications: [''],
        pgQualifications: [''],
        medicalCouncilName: '',
        medicalCouncilRegistrationNumber: '',
        registrationNumber: '',
        doctorImage: '',
        hospitalClinicName: '',
        practiceAddress: '',
        practiceCity: '',
        practiceState: '',
        practiceZipCode: '',
        practiceLatitude: '',
        practiceLongitude: ''
      });
      setUgQualifications(['']);
      setPgQualifications(['']);
      // Refresh the doctors list
      fetchDoctors();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create doctor');
    } finally {
      setLoading(false);
    }
  };

  // Get unique specializations for filter
  const uniqueSpecializations = Array.from(new Set(doctors.map(d => d.specialization)));

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Qualification management functions
  const addUgQualification = () => {
    setUgQualifications([...ugQualifications, '']);
  };

  const removeUgQualification = (index: number) => {
    const newQualifications = ugQualifications.filter((_, i) => i !== index);
    setUgQualifications(newQualifications);
  };

  const addPgQualification = () => {
    setPgQualifications([...pgQualifications, '']);
  };

  const removePgQualification = (index: number) => {
    const newQualifications = pgQualifications.filter((_, i) => i !== index);
    setPgQualifications(newQualifications);
  };

  const downloadTemplate = () => {
    const sampleData = [{
      Prefix: 'Dr',
      FirstName: 'John',
      LastName: 'Doe',
      Email: 'john.doe@example.com',
      PhoneNumber: '555-0123',
      Specialization: 'Cardiologist',
      Experience: 10,
      Languages: 'English, Hindi',
      About: 'Experienced cardiologist',
      UGQualifications: 'MBBS, MD',
      PGQualifications: 'DM Cardiology',
      MedicalCouncilName: 'Medical Council of India',
      MedicalCouncilRegistrationNumber: 'MCI-12345',
      RegistrationNumber: 'REG123',
      HospitalClinicName: 'City Hospital',
      PracticeAddress: '123 Medical Street',
      PracticeCity: 'Mumbai',
      PracticeState: 'Maharashtra',
      PracticeZipCode: '400001',
      PracticeLatitude: '19.0760',
      PracticeLongitude: '72.8777',
      DoctorImage: 'https://example.com/doctor.jpg'
    }];
    downloadExcelTemplate(
      ['Prefix', 'FirstName', 'LastName', 'Email', 'PhoneNumber', 'Specialization', 'Experience', 'Languages', 'About', 'UGQualifications', 'PGQualifications', 'MedicalCouncilName', 'MedicalCouncilRegistrationNumber', 'RegistrationNumber', 'HospitalClinicName', 'PracticeAddress', 'PracticeCity', 'PracticeState', 'PracticeZipCode', 'PracticeLatitude', 'PracticeLongitude', 'DoctorImage'],
      'doctors',
      sampleData
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Doctors Management</h2>
            <p className="text-muted-foreground">Create and manage doctor records</p>
          </div>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Excel Template
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message} {result.count !== undefined && `(${result.count} records)`}
          </div>
        )}

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list">View All Doctors</TabsTrigger>
            <TabsTrigger value="single">Create Single</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-blue-500" />
                  All Doctors ({filteredDoctors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Search and Filter Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search doctors by name, email, phone, or specialization..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedSpecialization} onValueChange={setSelectedSpecialization}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Filter by specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Specializations</SelectItem>
                      {uniqueSpecializations.map((spec) => (
                        <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Doctors Table */}
                {doctorsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading doctors...</p>
                  </div>
                ) : filteredDoctors.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Doctor</TableHead>
                          <TableHead>Specialization</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Experience</TableHead>
                          <TableHead>Languages</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDoctors.map((doctor) => (
                          <TableRow key={doctor.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-blue-500/10">
                                  <Stethoscope className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {doctor.prefix && `${doctor.prefix} `}{doctor.firstName} {doctor.lastName}
                                  </div>
                                  <div className="text-sm text-muted-foreground">ID: {doctor.id}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20">
                                {doctor.specialization}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{doctor.email}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{doctor.phoneNumber}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Award className="h-4 w-4 text-amber-500" />
                                <span>{doctor.experience} years</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {doctor.languages?.slice(0, 2).map((lang, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {lang}
                                  </Badge>
                                ))}
                                {doctor.languages && doctor.languages.length > 2 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{doctor.languages.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => {
                                  setDoctors(prev => prev.map(d => d.id === doctor.id ? { ...d, isActive: !d.isActive } : d));
                                  setFilteredDoctors(prev => prev.map(d => d.id === doctor.id ? { ...d, isActive: !d.isActive } : d));
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  doctor.isActive ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                    doctor.isActive ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(doctor.createdAt)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => {
                                    setSelectedDoctor(doctor);
                                    setViewDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Stethoscope className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No doctors found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm || selectedSpecialization !== 'all' 
                        ? 'No doctors match your search criteria.' 
                        : 'Get started by adding your first doctor.'}
                    </p>
                    <Button onClick={() => setSearchTerm('')} variant="outline">
                      Clear Search
                    </Button>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <Button 
                      variant="outline" 
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="single">
            <Card>
              <CardHeader>
                <CardTitle>Create New Doctor</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleDoctorSubmit} className="space-y-6">
                  {/* Basic Information Tab */}
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="basic">Basic Info</TabsTrigger>
                      <TabsTrigger value="education">Education</TabsTrigger>
                      <TabsTrigger value="practice">Practice</TabsTrigger>
                      <TabsTrigger value="council">Medical Council</TabsTrigger>
                      <TabsTrigger value="image">Photo</TabsTrigger>
                    </TabsList>

                    {/* Basic Information */}
                    <TabsContent value="basic" className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label>Prefix *</Label>
                          <Select value={newDoctor.prefix} onValueChange={(val) => setNewDoctor({...newDoctor, prefix: val})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select prefix" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Dr">Dr</SelectItem>
                              <SelectItem value="Mr">Mr</SelectItem>
                              <SelectItem value="Ms">Ms</SelectItem>
                              <SelectItem value="Mrs">Mrs</SelectItem>
                              <SelectItem value="Prof">Prof</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>First Name *</Label>
                          <Input
                            required
                            value={newDoctor.firstName}
                            onChange={(e) => setNewDoctor({...newDoctor, firstName: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Last Name *</Label>
                          <Input
                            required
                            value={newDoctor.lastName}
                            onChange={(e) => setNewDoctor({...newDoctor, lastName: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Email *</Label>
                          <Input
                            type="email"
                            required
                            value={newDoctor.email}
                            onChange={(e) => setNewDoctor({...newDoctor, email: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Phone Number *</Label>
                          <Input
                            required
                            value={newDoctor.phoneNumber}
                            onChange={(e) => setNewDoctor({...newDoctor, phoneNumber: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Specialization *</Label>
                          <Select value={newDoctor.specialization} onValueChange={(val) => setNewDoctor({...newDoctor, specialization: val})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select specialization" />
                            </SelectTrigger>
                            <SelectContent>
                              {specializations.map((spec) => (
                                <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Experience (years)</Label>
                          <Input
                            type="number"
                            value={newDoctor.experience}
                            onChange={(e) => setNewDoctor({...newDoctor, experience: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Languages (comma-separated)</Label>
                          <Input
                            placeholder="English, Hindi"
                            value={newDoctor.languages}
                            onChange={(e) => setNewDoctor({...newDoctor, languages: e.target.value})}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>About</Label>
                        <Textarea
                          value={newDoctor.about}
                          onChange={(e) => setNewDoctor({...newDoctor, about: e.target.value})}
                          placeholder="Brief description"
                        />
                      </div>
                    </TabsContent>

                    {/* Education & Qualifications */}
                    <TabsContent value="education" className="space-y-4">
                      <div>
                        <Label>Undergraduate Qualifications</Label>
                        {ugQualifications.map((qual, index) => (
                          <div key={index} className="flex gap-2 mt-2">
                            <Input
                              value={qual}
                              onChange={(e) => {
                                const updated = [...ugQualifications];
                                updated[index] = e.target.value;
                                setUgQualifications(updated);
                              }}
                              placeholder="e.g., MBBS, BDS"
                            />
                            {index > 0 && (
                              <Button type="button" variant="outline" onClick={() => removeUgQualification(index)}>
                                Remove
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" className="mt-2" onClick={addUgQualification}>
                          Add UG Qualification
                        </Button>
                      </div>

                      <div>
                        <Label>Postgraduate Qualifications</Label>
                        {pgQualifications.map((qual, index) => (
                          <div key={index} className="flex gap-2 mt-2">
                            <Input
                              value={qual}
                              onChange={(e) => {
                                const updated = [...pgQualifications];
                                updated[index] = e.target.value;
                                setPgQualifications(updated);
                              }}
                              placeholder="e.g., MD, MS, DM"
                            />
                            {index > 0 && (
                              <Button type="button" variant="outline" onClick={() => removePgQualification(index)}>
                                Remove
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" className="mt-2" onClick={addPgQualification}>
                          Add PG Qualification
                        </Button>
                      </div>
                    </TabsContent>

                    {/* Practice Details & Slot Durations */}
                    <TabsContent value="practice" className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label>Hospital/Clinic Name</Label>
                          <Input
                            value={newDoctor.hospitalClinicName}
                            onChange={(e) => setNewDoctor({...newDoctor, hospitalClinicName: e.target.value})}
                            placeholder="e.g., City Hospital"
                          />
                        </div>
                        <div>
                          <Label>Practice Address</Label>
                          <Input
                            value={newDoctor.practiceAddress}
                            onChange={(e) => setNewDoctor({...newDoctor, practiceAddress: e.target.value})}
                            placeholder="Street address"
                          />
                        </div>
                        <div>
                          <Label>City</Label>
                          <Input
                            value={newDoctor.practiceCity}
                            onChange={(e) => setNewDoctor({...newDoctor, practiceCity: e.target.value})}
                            placeholder="City"
                          />
                        </div>
                        <div>
                          <Label>State</Label>
                          <Input
                            value={newDoctor.practiceState}
                            onChange={(e) => setNewDoctor({...newDoctor, practiceState: e.target.value})}
                            placeholder="State"
                          />
                        </div>
                        <div>
                          <Label>ZIP Code</Label>
                          <Input
                            value={newDoctor.practiceZipCode}
                            onChange={(e) => setNewDoctor({...newDoctor, practiceZipCode: e.target.value})}
                            placeholder="ZIP/Postal code"
                          />
                        </div>
                        <div>
                          <Label>Latitude</Label>
                          <Input
                            type="number"
                            step="any"
                            value={newDoctor.practiceLatitude}
                            onChange={(e) => setNewDoctor({...newDoctor, practiceLatitude: e.target.value})}
                            placeholder="e.g., 19.0760"
                          />
                        </div>
                        <div>
                          <Label>Longitude</Label>
                          <Input
                            type="number"
                            step="any"
                            value={newDoctor.practiceLongitude}
                            onChange={(e) => setNewDoctor({...newDoctor, practiceLongitude: e.target.value})}
                            placeholder="e.g., 72.8777"
                          />
                        </div>
                        <div>
                          <Label>Online consultation slot duration</Label>
                          <Select
                            value={newDoctor.onlineSlotDurationMinutes}
                            onValueChange={(value) =>
                              setNewDoctor({ ...newDoctor, onlineSlotDurationMinutes: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select online duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 minutes</SelectItem>
                              <SelectItem value="30">30 minutes</SelectItem>
                              <SelectItem value="45">45 minutes</SelectItem>
                              <SelectItem value="60">60 minutes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Walk-in consultation slot duration</Label>
                          <Select
                            value={newDoctor.walkinSlotDurationMinutes}
                            onValueChange={(value) =>
                              setNewDoctor({ ...newDoctor, walkinSlotDurationMinutes: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select walk-in duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 minutes</SelectItem>
                              <SelectItem value="30">30 minutes</SelectItem>
                              <SelectItem value="45">45 minutes</SelectItem>
                              <SelectItem value="60">60 minutes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Multi-clinic configuration for walk-in consultations */}
                      <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Clinics / Hospitals (Walk-in)</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setClinics(prev => [
                                ...prev,
                                {
                                  id: `clinic_${Date.now()}`,
                                  name: '',
                                  address: '',
                                  city: '',
                                  state: '',
                                  pincode: '',
                                  walkinSlotDurationMinutes: 30,
                                  weeklyAvailability: {
                                    mon: true,
                                    tue: true,
                                    wed: true,
                                    thu: true,
                                    fri: true,
                                    sat: false,
                                    sun: false,
                                  },
                                },
                              ])
                            }
                          >
                            <Plus className="h-4 w-4 mr-1" /> Add Clinic / Hospital
                          </Button>
                        </div>

                        <div className="space-y-4">
                          {clinics.map((clinic, index) => (
                            <div key={clinic.id} className="rounded-lg border p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Clinic #{index + 1}</span>
                                {clinics.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setClinics(prev => prev.filter(c => c.id !== clinic.id))
                                    }
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>

                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <Label>Name</Label>
                                  <Input
                                    value={clinic.name}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setClinics(prev =>
                                        prev.map(c => (c.id === clinic.id ? { ...c, name: value } : c)),
                                      );
                                    }}
                                    placeholder="Clinic / Hospital name"
                                  />
                                </div>
                                <div>
                                  <Label>Walk-in slot duration</Label>
                                  <Select
                                    value={String(clinic.walkinSlotDurationMinutes)}
                                    onValueChange={value =>
                                      setClinics(prev =>
                                        prev.map(c =>
                                          c.id === clinic.id
                                            ? { ...c, walkinSlotDurationMinutes: parseInt(value, 10) }
                                            : c,
                                        ),
                                      )
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select duration" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="15">15 minutes</SelectItem>
                                      <SelectItem value="30">30 minutes</SelectItem>
                                      <SelectItem value="45">45 minutes</SelectItem>
                                      <SelectItem value="60">60 minutes</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="md:col-span-2">
                                  <Label>Address</Label>
                                  <Input
                                    value={clinic.address}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setClinics(prev =>
                                        prev.map(c => (c.id === clinic.id ? { ...c, address: value } : c)),
                                      );
                                    }}
                                    placeholder="Street address"
                                  />
                                </div>
                                <div>
                                  <Label>City</Label>
                                  <Input
                                    value={clinic.city}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setClinics(prev =>
                                        prev.map(c => (c.id === clinic.id ? { ...c, city: value } : c)),
                                      );
                                    }}
                                    placeholder="City"
                                  />
                                </div>
                                <div>
                                  <Label>State</Label>
                                  <Input
                                    value={clinic.state}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setClinics(prev =>
                                        prev.map(c => (c.id === clinic.id ? { ...c, state: value } : c)),
                                      );
                                    }}
                                    placeholder="State"
                                  />
                                </div>
                                <div>
                                  <Label>Pincode</Label>
                                  <Input
                                    value={clinic.pincode}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setClinics(prev =>
                                        prev.map(c => (c.id === clinic.id ? { ...c, pincode: value } : c)),
                                      );
                                    }}
                                    placeholder="Postal code"
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>Weekly availability (walk-in)</Label>
                                <div className="flex flex-wrap gap-2">
                                  {([
                                    ['Mon', 'mon'],
                                    ['Tue', 'tue'],
                                    ['Wed', 'wed'],
                                    ['Thu', 'thu'],
                                    ['Fri', 'fri'],
                                    ['Sat', 'sat'],
                                    ['Sun', 'sun'],
                                  ] as const).map(([label, key]) => (
                                    <button
                                      key={key}
                                      type="button"
                                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                                        clinic.weeklyAvailability[key]
                                          ? 'bg-green-500 text-white border-green-500'
                                          : 'bg-white text-gray-700 border-gray-300'
                                      }`}
                                      onClick={() =>
                                        setClinics(prev =>
                                          prev.map(c =>
                                            c.id === clinic.id
                                              ? {
                                                  ...c,
                                                  weeklyAvailability: {
                                                    ...c.weeklyAvailability,
                                                    [key]: !c.weeklyAvailability[key],
                                                  },
                                                }
                                              : c,
                                          ),
                                        )
                                      }
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    {/* Medical Council */}
                    <TabsContent value="council" className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label>Medical Council Name</Label>
                          <Input
                            value={newDoctor.medicalCouncilName}
                            onChange={(e) => setNewDoctor({...newDoctor, medicalCouncilName: e.target.value})}
                            placeholder="e.g., Medical Council of India"
                          />
                        </div>
                        <div>
                          <Label>Medical Council Registration Number</Label>
                          <Input
                            value={newDoctor.medicalCouncilRegistrationNumber}
                            onChange={(e) => setNewDoctor({...newDoctor, medicalCouncilRegistrationNumber: e.target.value})}
                            placeholder="e.g., MCI-12345"
                          />
                        </div>
                        <div>
                          <Label>Registration Number</Label>
                          <Input
                            value={newDoctor.registrationNumber}
                            onChange={(e) => setNewDoctor({...newDoctor, registrationNumber: e.target.value})}
                            placeholder="e.g., REG123456"
                          />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Doctor Image */}
                    <TabsContent value="image" className="space-y-4">
                      <div>
                        <Label>Doctor Image URL</Label>
                        <Input
                          value={newDoctor.doctorImage}
                          onChange={(e) => setNewDoctor({...newDoctor, doctorImage: e.target.value})}
                          placeholder="e.g., https://example.com/doctor-image.jpg"
                        />
                        <p className="text-sm text-muted-foreground mt-2">
                          Enter the URL of the doctor's photo or upload to your image hosting service
                        </p>
                      </div>
                      {newDoctor.doctorImage && (
                        <div>
                          <Label>Preview</Label>
                          <div className="mt-2">
                            <img 
                              src={newDoctor.doctorImage} 
                              alt="Doctor preview" 
                              className="w-32 h-32 object-cover rounded-lg border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/images/doctors/default-doctor.jpg';
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Creating...' : 'Create Doctor'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="excel">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload via Excel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Upload an Excel file (.xlsx, .xls) with doctor records. Download the template for proper format.
                  </p>
                  <div className="flex items-center gap-4">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelUpload}
                      disabled={loading}
                    />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Choose File
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload via JSON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of doctor objects. Required fields: firstName, lastName, email
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[{"firstName":"John","lastName":"Doe","email":"john@example.com","specialization":"Cardiologist","experience":10}]'
                  className="h-64 font-mono text-sm"
                />
                <Button onClick={handleJsonUpload} disabled={loading}>
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? 'Uploading...' : 'Upload JSON'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* View Doctor Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Doctor Details</DialogTitle>
          </DialogHeader>
          {selectedDoctor && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-medium">{selectedDoctor.prefix} {selectedDoctor.firstName} {selectedDoctor.lastName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Specialization</p>
                    <Badge variant="secondary">{selectedDoctor.specialization}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {selectedDoctor.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {selectedDoctor.phoneNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Experience</p>
                    <p className="font-medium">{selectedDoctor.experience} years</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Languages</p>
                    <p className="font-medium">{Array.isArray(selectedDoctor.languages) ? selectedDoctor.languages.join(', ') : selectedDoctor.languages || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={selectedDoctor.isActive ? 'default' : 'secondary'}>
                      {selectedDoctor.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Joined</p>
                    <p className="font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {new Date(selectedDoctor.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* About */}
              {selectedDoctor.about && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">About</h3>
                  <p className="text-muted-foreground">{selectedDoctor.about}</p>
                </div>
              )}

              {/* Education & Qualifications */}
              {((selectedDoctor.ugQualifications && selectedDoctor.ugQualifications.length > 0) || 
                (selectedDoctor.pgQualifications && selectedDoctor.pgQualifications.length > 0)) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Education & Qualifications
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedDoctor.ugQualifications && selectedDoctor.ugQualifications.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Undergraduate</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedDoctor.ugQualifications.map((qual, idx) => (
                            <Badge key={idx} variant="outline">{qual}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedDoctor.pgQualifications && selectedDoctor.pgQualifications.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Postgraduate</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedDoctor.pgQualifications.map((qual, idx) => (
                            <Badge key={idx} variant="outline">{qual}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Medical Council Registration */}
              {(selectedDoctor.medicalCouncilName || selectedDoctor.registrationNumber || selectedDoctor.medicalCouncilRegistrationNumber) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Medical Council Registration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedDoctor.medicalCouncilName && (
                      <div>
                        <p className="text-sm text-muted-foreground">Council Name</p>
                        <p className="font-medium">{selectedDoctor.medicalCouncilName}</p>
                      </div>
                    )}
                    {(selectedDoctor.registrationNumber || selectedDoctor.medicalCouncilRegistrationNumber) && (
                      <div>
                        <p className="text-sm text-muted-foreground">Registration Number</p>
                        <p className="font-medium">{selectedDoctor.registrationNumber || selectedDoctor.medicalCouncilRegistrationNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Practice Details */}
              {(selectedDoctor.hospitalClinicName || selectedDoctor.practiceAddress) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Stethoscope className="h-5 w-5" />
                    Practice Details
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {selectedDoctor.hospitalClinicName && (
                      <div>
                        <p className="text-sm text-muted-foreground">Hospital/Clinic</p>
                        <p className="font-medium">{selectedDoctor.hospitalClinicName}</p>
                      </div>
                    )}
                    {selectedDoctor.practiceAddress && (
                      <div>
                        <p className="text-sm text-muted-foreground">Address</p>
                        <p className="font-medium">
                          {selectedDoctor.practiceAddress}
                          {selectedDoctor.practiceCity && `, ${selectedDoctor.practiceCity}`}
                          {selectedDoctor.practiceState && `, ${selectedDoctor.practiceState}`}
                          {selectedDoctor.practiceZipCode && ` - ${selectedDoctor.practiceZipCode}`}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {selectedDoctor.onlineSlotDurationMinutes && (
                        <div>
                          <p className="text-sm text-muted-foreground">Online Slot Duration</p>
                          <p className="font-medium">{selectedDoctor.onlineSlotDurationMinutes} minutes</p>
                        </div>
                      )}
                      {selectedDoctor.walkinSlotDurationMinutes && (
                        <div>
                          <p className="text-sm text-muted-foreground">Walk-in Slot Duration</p>
                          <p className="font-medium">{selectedDoctor.walkinSlotDurationMinutes} minutes</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Clinics */}
              {selectedDoctor.clinics && selectedDoctor.clinics.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Registered Clinics</h3>
                  <div className="space-y-3">
                    {selectedDoctor.clinics.map((clinic) => (
                      <Card key={clinic.id}>
                        <CardContent className="pt-4">
                          <p className="font-medium mb-2">{clinic.name}</p>
                          <p className="text-sm text-muted-foreground mb-2">
                            {clinic.address}, {clinic.city}, {clinic.state} - {clinic.pincode}
                          </p>
                          <div className="flex items-center gap-4 text-sm">
                            <span>Slot Duration: {clinic.walkinSlotDurationMinutes} min</span>
                            <span className="text-muted-foreground">
                              Available: {Object.entries(clinic.weeklyAvailability || {})
                                .filter(([_, available]) => available)
                                .map(([day]) => day.toUpperCase())
                                .join(', ')}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default DoctorsManagement;

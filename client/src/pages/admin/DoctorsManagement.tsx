import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  UserCog, Search, Eye, Download, MapPin, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, Square, Stethoscope, Award, GraduationCap, Plus, Upload,
  LayoutGrid, List, FileSpreadsheet,
} from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { exportProviders } from '@/utils/exportToExcel';
import { generateDoctorTemplate } from '@/utils/excelTemplates';
import ProviderDetailModal from '@/components/providers/ProviderDetailModal';
import ProviderAnalytics from '@/components/providers/ProviderAnalytics';

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const DoctorsManagement = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  
  // Add doctor form state
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newDoctor, setNewDoctor] = useState({
    name: '',
    email: '',
    phone: '',
    gender: 'Male',
    specialties: [] as string[],
    qualification: '',
    experience: 0,
    registrationNumber: '',
    city: '',
    state: '',
    clinicName: '',
    clinicAddress: '',
    consultationFee: 0,
    verified: false,
  });
  
  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    fetchDoctors();
    fetchFilterOptions();
  }, [currentPage, searchQuery, selectedCity, selectedState, selectedSpecialty]);
  
  useEffect(() => {
    if (currentPage !== 1) setCurrentPage(1);
  }, [searchQuery, selectedCity, selectedState, selectedSpecialty]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: itemsPerPage };
      
      if (searchQuery) params.search = searchQuery;
      if (selectedCity && selectedCity !== 'all') params.city = selectedCity;
      if (selectedState && selectedState !== 'all') params.state = selectedState;
      if (selectedSpecialty && selectedSpecialty !== 'all') params.specialty = selectedSpecialty;
      
      const { data } = await axios.get(`${API_BASE_URL}/masterdata/doctors`, { params });
      
      if (data.success) {
        setDoctors(data.data);
        setTotalCount(data.pagination.total);
      }
    } catch (err: any) {
      console.error('Failed to fetch doctors:', err);
      setError('Failed to load doctors. Endpoint may not be implemented yet.');
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFilterOptions = async () => {
    try {
      const [citiesRes, statesRes, specialtiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/masterdata/cities`),
        axios.get(`${API_BASE_URL}/masterdata/states`),
        axios.get(`${API_BASE_URL}/masterdata/specialties`),
      ]);
      
      if (citiesRes.data.success) setCities(citiesRes.data.data);
      if (statesRes.data.success) setStates(statesRes.data.data);
      if (specialtiesRes.data.success) setSpecialties(specialtiesRes.data.data);
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  };
  
  const handleBulkSelect = (doctorId: string) => {
    const newSelection = new Set(selectedDoctors);
    if (newSelection.has(doctorId)) newSelection.delete(doctorId);
    else newSelection.add(doctorId);
    setSelectedDoctors(newSelection);
  };
  
  const handleSelectAll = () => {
    if (selectedDoctors.size === doctors.length) setSelectedDoctors(new Set());
    else setSelectedDoctors(new Set(doctors.map(d => d.id?.toString() || '')));
  };
  
  const handleExport = (format: 'excel' | 'csv') => {
    const preparedData = doctors.map(doctor => ({
      ID: doctor.id,
      Name: doctor.name,
      Specialties: Array.isArray(doctor.specialties) ? doctor.specialties.join(', ') : doctor.specialty || '',
      Qualification: doctor.qualification || '',
      Experience: doctor.experience ? `${doctor.experience} years` : '',
      City: doctor.city,
      State: doctor.state,
      Phone: doctor.phone || doctor.mobile,
      Email: doctor.email,
      'Registration Number': doctor.registration_number || '',
      'Quality Score': doctor.quality_score || '',
    }));
    
    if (format === 'csv') {
      const ws = XLSX.utils.json_to_sheet(preparedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Doctors');
      XLSX.writeFile(wb, `doctors_${doctors.length}_records_${Date.now()}.csv`, { bookType: 'csv' });
    } else {
      const ws = XLSX.utils.json_to_sheet(preparedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Doctors');
      XLSX.writeFile(wb, `doctors_${doctors.length}_records_${Date.now()}.xlsx`);
    }
    
    setResult({ message: `Exported ${doctors.length} doctors as ${format.toUpperCase()}` });
  };
  
  const handleViewDetails = (doctor: any) => {
    setSelectedDoctor(doctor);
    setShowDetailModal(true);
  };
  
  const handleSingleDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const { data } = await axios.post(
        `${API_BASE_URL}/admin/doctors`,
        { doctor: newDoctor },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult({ message: data.message || 'Doctor added successfully' });
      setNewDoctor({
        name: '',
        email: '',
        phone: '',
        gender: 'Male',
        specialties: [],
        qualification: '',
        experience: 0,
        registrationNumber: '',
        city: '',
        state: '',
        clinicName: '',
        clinicAddress: '',
        consultationFee: 0,
        verified: false,
      });
      fetchDoctors();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add doctor');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const doctors = JSON.parse(jsonInput);
      const { data } = await axios.post(
        `${API_BASE_URL}/admin/doctors/bulk`,
        { doctors: Array.isArray(doctors) ? doctors : [doctors] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult({ message: data.message || `Uploaded ${Array.isArray(doctors) ? doctors.length : 1} doctor(s) successfully`, count: data.count });
      setJsonInput('');
      fetchDoctors();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    generateDoctorTemplate();
    setResult({ message: 'Template downloaded successfully' });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const doctors = jsonData.map((row: any) => ({
        name: row['Doctor Name'],
        gender: row['Gender'],
        specialty: row['Specialty'],
        specialties: row['Specialty'] ? [row['Specialty']] : [],
        qualification: row['Qualification'],
        experience: parseInt(row['Experience (Years)']) || 0,
        registrationNumber: row['Registration Number'],
        city: row['City'],
        state: row['State'],
        phone: row['Mobile Number'],
        phoneNumber: row['Mobile Number'],
        email: row['Email'],
        clinicName: row['Clinic Name'],
        clinicAddress: row['Clinic Address'],
        consultationFee: parseInt(row['Consultation Fee']) || 0
      }));

      const response = await axios.post(
        `${API_BASE_URL}/admin/doctors/bulk`,
        { doctors },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult({ 
        message: `Successfully uploaded ${doctors.length} doctors`, 
        count: doctors.length 
      });
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      fetchDoctors();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Excel upload failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtyToggle = (specialty: string) => {
    setNewDoctor(prev => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter(s => s !== specialty)
        : [...prev.specialties, specialty]
    }));
  };

  // Calculate stats
  const verifiedDoctors = doctors.filter(d => d.registration_number || d.verified).length;
  const avgExperience = doctors.length > 0 
    ? (doctors.reduce((sum, d) => sum + (parseInt(d.experience) || 0), 0) / doctors.length).toFixed(1)
    : '0';

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Stethoscope className="h-8 w-8 text-blue-500" />
              Doctor Management
            </h2>
            <p className="text-muted-foreground">Manage healthcare providers and medical professionals</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Doctors</p>
                  <p className="text-3xl font-bold">{totalCount}</p>
                </div>
                <UserCog className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Verified</p>
                  <p className="text-3xl font-bold">{verifiedDoctors}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doctors.length > 0 ? ((verifiedDoctors / doctors.length) * 100).toFixed(1) : 0}%
                  </p>
                </div>
                <Award className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Experience</p>
                  <p className="text-3xl font-bold">{avgExperience}</p>
                  <p className="text-xs text-muted-foreground mt-1">years</p>
                </div>
                <GraduationCap className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Specialties</p>
                  <p className="text-3xl font-bold">{specialties.length}</p>
                </div>
                <Stethoscope className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {result.message}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="list">Doctors List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
            <TabsTrigger value="create">Add Doctor</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search doctors by name, specialty..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <Select value={selectedState} onValueChange={setSelectedState}>
                    <SelectTrigger><SelectValue placeholder="All States" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedCity} onValueChange={setSelectedCity}>
                    <SelectTrigger><SelectValue placeholder="All Cities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                    <SelectTrigger><SelectValue placeholder="All Specialties" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Specialties</SelectItem>
                      {specialties.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <Button variant={bulkActionMode ? 'default' : 'outline'} size="sm" onClick={() => setBulkActionMode(!bulkActionMode)}>
                      <Square className="mr-2 h-4 w-4" />
                      {bulkActionMode ? 'Cancel Bulk' : 'Bulk Actions'}
                    </Button>
                    {bulkActionMode && selectedDoctors.size > 0 && (
                      <span className="text-sm text-muted-foreground">{selectedDoctors.size} selected</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex border rounded-md">
                      <Button 
                        variant={viewMode === 'grid' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setViewMode('grid')}
                        className="rounded-r-none"
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant={viewMode === 'table' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setViewMode('table')}
                        className="rounded-l-none"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                      <Download className="mr-2 h-4 w-4" />Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                      <Download className="mr-2 h-4 w-4" />Export CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="text-center py-8">Loading doctors...</div>
            ) : doctors.length === 0 ? (
              <Card className="p-8 text-center">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground mb-2">No doctors found.</p>
                <p className="text-sm text-muted-foreground">
                  {error ? 'The doctors API endpoint may not be implemented yet.' : 'Try adjusting your filters.'}
                </p>
              </Card>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {bulkActionMode && (
                      <Card className="md:col-span-2 lg:col-span-3">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={selectedDoctors.size === doctors.length} onCheckedChange={handleSelectAll} />
                            <span className="text-sm font-medium">Select All ({selectedDoctors.size} of {doctors.length} selected)</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  
                  {doctors.map(doctor => (
                    <Card key={doctor.id} className="relative">
                      {bulkActionMode && (
                        <div className="absolute top-4 left-4 z-10">
                          <Checkbox checked={selectedDoctors.has(doctor.id?.toString() || '')} onCheckedChange={() => handleBulkSelect(doctor.id?.toString() || '')} />
                        </div>
                      )}
                      
                      <CardContent className={`p-6 ${bulkActionMode ? 'pl-12' : ''}`}>
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold">{doctor.name}</h3>
                                {(doctor.registration_number || doctor.verified) && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Award className="h-3 w-3 mr-1" />
                                    Verified
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Specialties */}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {Array.isArray(doctor.specialties) ? (
                                  doctor.specialties.slice(0, 2).map((spec: string, idx: number) => (
                                    <Badge key={idx} variant="outline" className="text-xs">{spec}</Badge>
                                  ))
                                ) : doctor.specialty ? (
                                  <Badge variant="outline" className="text-xs">{doctor.specialty}</Badge>
                                ) : null}
                              </div>
                              
                              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                {doctor.city}{doctor.state && `, ${doctor.state}`}
                              </div>
                            </div>
                          </div>

                          {doctor.qualification && (
                            <div className="flex items-center gap-2 text-sm">
                              <GraduationCap className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">Qualification:</span> {doctor.qualification}
                            </div>
                          )}
                          
                          {doctor.experience && (
                            <div className="text-sm">
                              <span className="font-medium">Experience:</span> {doctor.experience} years
                            </div>
                          )}

                          {doctor.phone && (
                            <div className="text-sm">
                              <span className="font-medium">Phone:</span> {doctor.phone}
                            </div>
                          )}
                          
                          {doctor.registration_number && (
                            <div className="text-sm">
                              <span className="font-medium">Reg. No:</span> {doctor.registration_number}
                            </div>
                          )}
                          
                          {doctor.quality_score && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Quality Score:</span>
                              <Badge variant="outline">{doctor.quality_score}</Badge>
                            </div>
                          )}

                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(doctor)}>
                            <Eye className="mr-2 h-4 w-4" />View Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              {bulkActionMode && (
                                <th className="p-4 text-left w-12">
                                  <Checkbox 
                                    checked={selectedDoctors.size === doctors.length} 
                                    onCheckedChange={handleSelectAll} 
                                  />
                                </th>
                              )}
                              <th className="p-4 text-left font-semibold">Name</th>
                              <th className="p-4 text-left font-semibold">Specialties</th>
                              <th className="p-4 text-left font-semibold">Qualification</th>
                              <th className="p-4 text-left font-semibold">Experience</th>
                              <th className="p-4 text-left font-semibold">Location</th>
                              <th className="p-4 text-left font-semibold">Contact</th>
                              <th className="p-4 text-left font-semibold">Status</th>
                              <th className="p-4 text-left font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {doctors.map((doctor, index) => (
                              <tr key={doctor.id} className={`border-b hover:bg-muted/30 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                                {bulkActionMode && (
                                  <td className="p-4">
                                    <Checkbox 
                                      checked={selectedDoctors.has(doctor.id?.toString() || '')} 
                                      onCheckedChange={() => handleBulkSelect(doctor.id?.toString() || '')} 
                                    />
                                  </td>
                                )}
                                <td className="p-4">
                                  <div>
                                    <div className="font-semibold">{doctor.name}</div>
                                    {doctor.registration_number && (
                                      <div className="text-xs text-muted-foreground">Reg: {doctor.registration_number}</div>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-wrap gap-1">
                                    {Array.isArray(doctor.specialties) ? (
                                      doctor.specialties.slice(0, 2).map((spec: string, idx: number) => (
                                        <Badge key={idx} variant="outline" className="text-xs">{spec}</Badge>
                                      ))
                                    ) : doctor.specialty ? (
                                      <Badge variant="outline" className="text-xs">{doctor.specialty}</Badge>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">-</span>
                                    )}
                                    {Array.isArray(doctor.specialties) && doctor.specialties.length > 2 && (
                                      <Badge variant="outline" className="text-xs">+{doctor.specialties.length - 2}</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4 text-sm">{doctor.qualification || '-'}</td>
                                <td className="p-4 text-sm">{doctor.experience ? `${doctor.experience} yrs` : '-'}</td>
                                <td className="p-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    <span>{doctor.city}{doctor.state && `, ${doctor.state}`}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm">
                                  {doctor.phone || doctor.mobile || '-'}
                                  {doctor.email && (
                                    <div className="text-xs text-muted-foreground">{doctor.email}</div>
                                  )}
                                </td>
                                <td className="p-4">
                                  {(doctor.registration_number || doctor.verified) && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Award className="h-3 w-3 mr-1" />
                                      Verified
                                    </Badge>
                                  )}
                                  {doctor.quality_score && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Score: {doctor.quality_score}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4">
                                  <Button size="sm" variant="outline" onClick={() => handleViewDetails(doctor)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} doctors
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Select value={itemsPerPage.toString()} onValueChange={(val) => setItemsPerPage(Number(val))}>
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[10, 20, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        <span className="text-sm">Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}</span>
                        
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="analytics">
            {doctors.length > 0 ? (
              <ProviderAnalytics providers={doctors} type="clinic" />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No data available for analytics.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="map">
            <Card>
              <CardContent className="p-8 text-center">
                <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="text-lg font-semibold mb-2">Interactive Map Coming Soon</h3>
                <p className="text-muted-foreground">View all doctors on an interactive map with their practice locations.</p>
                {doctors.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {doctors.filter(d => d.coordinates).length} doctors have GPS coordinates ready for mapping.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Add New Doctor</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleDoctorSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Full Name *</Label>
                      <Input
                        required
                        value={newDoctor.name}
                        onChange={(e) => setNewDoctor({...newDoctor, name: e.target.value})}
                        placeholder="Dr. John Doe"
                      />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        required
                        value={newDoctor.email}
                        onChange={(e) => setNewDoctor({...newDoctor, email: e.target.value})}
                        placeholder="doctor@example.com"
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input
                        required
                        value={newDoctor.phone}
                        onChange={(e) => setNewDoctor({...newDoctor, phone: e.target.value})}
                        placeholder="+91-9876543210"
                      />
                    </div>
                    <div>
                      <Label>Gender *</Label>
                      <Select value={newDoctor.gender} onValueChange={(val) => setNewDoctor({...newDoctor, gender: val})}>
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
                    <div>
                      <Label>Qualification *</Label>
                      <Input
                        required
                        value={newDoctor.qualification}
                        onChange={(e) => setNewDoctor({...newDoctor, qualification: e.target.value})}
                        placeholder="MBBS, MD"
                      />
                    </div>
                    <div>
                      <Label>Experience (years) *</Label>
                      <Input
                        type="number"
                        required
                        value={newDoctor.experience}
                        onChange={(e) => setNewDoctor({...newDoctor, experience: parseInt(e.target.value) || 0})}
                        placeholder="10"
                      />
                    </div>
                    <div>
                      <Label>Registration Number</Label>
                      <Input
                        value={newDoctor.registrationNumber}
                        onChange={(e) => setNewDoctor({...newDoctor, registrationNumber: e.target.value})}
                        placeholder="MCI-12345"
                      />
                    </div>
                    <div>
                      <Label>Consultation Fee (₹)</Label>
                      <Input
                        type="number"
                        value={newDoctor.consultationFee}
                        onChange={(e) => setNewDoctor({...newDoctor, consultationFee: parseInt(e.target.value) || 0})}
                        placeholder="500"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>City *</Label>
                      <Input
                        required
                        value={newDoctor.city}
                        onChange={(e) => setNewDoctor({...newDoctor, city: e.target.value})}
                        placeholder="Mumbai"
                      />
                    </div>
                    <div>
                      <Label>State *</Label>
                      <Input
                        required
                        value={newDoctor.state}
                        onChange={(e) => setNewDoctor({...newDoctor, state: e.target.value})}
                        placeholder="Maharashtra"
                      />
                    </div>
                    <div>
                      <Label>Clinic/Hospital Name</Label>
                      <Input
                        value={newDoctor.clinicName}
                        onChange={(e) => setNewDoctor({...newDoctor, clinicName: e.target.value})}
                        placeholder="Apollo Clinic"
                      />
                    </div>
                    <div>
                      <Label>Clinic Address</Label>
                      <Input
                        value={newDoctor.clinicAddress}
                        onChange={(e) => setNewDoctor({...newDoctor, clinicAddress: e.target.value})}
                        placeholder="123 Main Street"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Specialties *</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto border rounded-md p-4">
                      {specialties.map((specialty) => (
                        <div key={specialty} className="flex items-center space-x-2">
                          <Checkbox
                            checked={newDoctor.specialties.includes(specialty)}
                            onCheckedChange={() => handleSpecialtyToggle(specialty)}
                          />
                          <span className="text-sm">{specialty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newDoctor.verified}
                      onCheckedChange={(checked) => setNewDoctor({...newDoctor, verified: checked})}
                    />
                    <Label>Mark as Verified</Label>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Adding...' : 'Add Doctor'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Import Doctors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Excel Upload Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-semibold text-blue-900">Excel Template</h3>
                        <p className="text-sm text-blue-700">Download template, fill data, and upload</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleDownloadTemplate} className="border-blue-300">
                      <Download className="mr-2 h-4 w-4" />
                      Download Template
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="excel-upload" className="text-base font-semibold">Upload Excel File</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        id="excel-upload"
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelUpload}
                        className="flex-1"
                      />
                      <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4" />
                        Choose File
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Accepted formats: .xlsx, .xls | Maximum: 1000 doctors per upload
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or paste JSON</span>
                  </div>
                </div>

                {/* JSON Input Section */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">JSON Import</Label>
                  <p className="text-sm text-muted-foreground">
                    Paste JSON array of doctor objects
                  </p>
                  <Textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='[{"name":"Dr. Sarah Johnson","email":"sarah@example.com","phone":"+91-9876543210","gender":"Female","specialty":"Cardiology","qualification":"MBBS, MD","experience":15,"city":"Mumbai","state":"Maharashtra"}]'
                    className="h-48 font-mono text-sm"
                  />
                  <Button onClick={handleJsonUpload} disabled={loading} variant="secondary" className="w-full">
                    <Upload className="mr-2 h-4 w-4" />
                    {loading ? 'Uploading...' : 'Upload JSON'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <ProviderDetailModal provider={selectedDoctor} open={showDetailModal} onClose={() => setShowDetailModal(false)} type="clinic" />
      </div>
    </AdminLayout>
  );
};

export default DoctorsManagement;

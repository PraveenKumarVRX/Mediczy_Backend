import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import AdminLayout from "../../components/layout/AdminLayout";
import { useToast } from '../../hooks/use-toast';
import { 
  Download, Upload, Plus, FileSpreadsheet, UserPlus,
  Search, Eye, Edit, Trash2, MoreVertical, Star, Building2, Phone, Mail,
  ChevronLeft, ChevronRight, Users, Activity, TrendingUp, Shield, Clock,
  Stethoscope, Briefcase, MapPin, Calendar
} from 'lucide-react';
import { downloadExcelTemplate } from '../../utils/excelParser';
import api from '../../utils/api';
import axios from 'axios';

// OHC (Occupational Health Centre) Interface
interface OHCCentre {
  id: string;
  ohcName: string;
  ohcCode: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  designation: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  corporateCompany: string;
  industryType: string;
  facilityType: 'In-house' | 'Outsourced' | 'Shared' | 'Mobile';
  licenseNumber: string;
  employeeCapacity: number;
  establishedYear: number;
  operatingHours: string;
  emergencyServices: boolean;
  preventiveCareServices: boolean;
  occupationalHealthServices: boolean;
  firstAidServices: boolean;
  medicalStaff: number;
  bedCapacity?: number;
  ambulanceAvailable: boolean;
  equipmentLevel: 'Basic' | 'Intermediate' | 'Advanced';
  rating?: number;
  reviewCount?: number;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  joinedDate: string;
  lastInspection: string;
  website?: string;
  specializations: string[];
  complianceCertifications: string[];
}

// Sample OHC data
const sampleOHCData: OHCCentre[] = [
  {
    id: 'OHC001',
    ohcName: 'Tata Steel Occupational Health Centre',
    ohcCode: 'TATA-OHC-001',
    email: 'ohc@tatasteel.com',
    phoneNumber: '+91-657-2345678',
    contactPerson: 'Dr. Rajesh Kumar',
    designation: 'Chief Medical Officer',
    area: 'Tata Steel Plant',
    city: 'Jamshedpur',
    state: 'Jharkhand',
    pincode: '831001',
    corporateCompany: 'Tata Steel Limited',
    industryType: 'Steel Manufacturing',
    facilityType: 'In-house',
    licenseNumber: 'OHC/JH/2020/001',
    employeeCapacity: 25000,
    establishedYear: 1995,
    operatingHours: '24/7',
    emergencyServices: true,
    preventiveCareServices: true,
    occupationalHealthServices: true,
    firstAidServices: true,
    medicalStaff: 45,
    bedCapacity: 20,
    ambulanceAvailable: true,
    equipmentLevel: 'Advanced',
    rating: 4.8,
    reviewCount: 1240,
    status: 'Active',
    joinedDate: '2022-03-15',
    lastInspection: '2024-01-10',
    website: 'https://tatasteel.com/healthcare',
    specializations: ['Occupational Medicine', 'Emergency Care', 'Preventive Health', 'Industrial Hygiene'],
    complianceCertifications: ['NABH', 'ISO 45001', 'Factory Act Compliance', 'Pollution Control Board']
  },
  {
    id: 'OHC002',
    ohcName: 'Reliance Industries Medical Centre',
    ohcCode: 'RIL-OHC-002',
    email: 'medical@ril.com',
    phoneNumber: '+91-22-35553000',
    contactPerson: 'Dr. Priya Sharma',
    designation: 'General Manager - Health Services',
    area: 'Reliance Corporate Park',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    pincode: '400701',
    corporateCompany: 'Reliance Industries Limited',
    industryType: 'Petroleum & Petrochemicals',
    facilityType: 'In-house',
    licenseNumber: 'OHC/MH/2019/002',
    employeeCapacity: 18000,
    establishedYear: 1998,
    operatingHours: '24/7',
    emergencyServices: true,
    preventiveCareServices: true,
    occupationalHealthServices: true,
    firstAidServices: true,
    medicalStaff: 35,
    bedCapacity: 15,
    ambulanceAvailable: true,
    equipmentLevel: 'Advanced',
    rating: 4.6,
    reviewCount: 890,
    status: 'Active',
    joinedDate: '2022-07-20',
    lastInspection: '2024-01-05',
    website: 'https://ril.com/employee-health',
    specializations: ['Chemical Exposure Treatment', 'Respiratory Health', 'Cardiac Care', 'Trauma Care'],
    complianceCertifications: ['NABH', 'ISO 45001', 'AERB Certification', 'Pollution Control Board']
  },
  {
    id: 'OHC003',
    ohcName: 'Infosys Health Centre',
    ohcCode: 'INFY-HC-003',
    email: 'healthcare@infosys.com',
    phoneNumber: '+91-80-28520261',
    contactPerson: 'Dr. Arun Menon',
    designation: 'Head of Employee Wellness',
    area: 'Electronics City',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560100',
    corporateCompany: 'Infosys Limited',
    industryType: 'Information Technology',
    facilityType: 'In-house',
    licenseNumber: 'OHC/KA/2021/003',
    employeeCapacity: 15000,
    establishedYear: 2005,
    operatingHours: '8:00 AM - 8:00 PM',
    emergencyServices: false,
    preventiveCareServices: true,
    occupationalHealthServices: true,
    firstAidServices: true,
    medicalStaff: 12,
    bedCapacity: 5,
    ambulanceAvailable: false,
    equipmentLevel: 'Intermediate',
    rating: 4.4,
    reviewCount: 567,
    status: 'Active',
    joinedDate: '2022-11-10',
    lastInspection: '2023-12-20',
    website: 'https://infosys.com/employee-health',
    specializations: ['General Medicine', 'Stress Management', 'Eye Care', 'Ergonomic Health'],
    complianceCertifications: ['ISO 45001', 'NABH', 'IT Industry Standards']
  },
  {
    id: 'OHC004',
    ohcName: 'L&T Construction Health Unit',
    ohcCode: 'LT-CHU-004',
    email: 'safety@larsentoubro.com',
    phoneNumber: '+91-22-66528000',
    contactPerson: 'Dr. Sunita Patel',
    designation: 'Project Medical Officer',
    area: 'Powai Campus',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400072',
    corporateCompany: 'Larsen & Toubro Limited',
    industryType: 'Construction & Engineering',
    facilityType: 'Mobile',
    licenseNumber: 'OHC/MH/2020/004',
    employeeCapacity: 8000,
    establishedYear: 2010,
    operatingHours: '6:00 AM - 10:00 PM',
    emergencyServices: true,
    preventiveCareServices: true,
    occupationalHealthServices: true,
    firstAidServices: true,
    medicalStaff: 18,
    bedCapacity: 8,
    ambulanceAvailable: true,
    equipmentLevel: 'Intermediate',
    rating: 4.2,
    reviewCount: 423,
    status: 'Pending',
    joinedDate: '2023-08-15',
    lastInspection: '2023-11-30',
    website: 'https://larsentoubro.com/safety',
    specializations: ['Construction Safety', 'Trauma Care', 'Heat Stroke Treatment', 'Emergency Medicine'],
    complianceCertifications: ['Factory Act Compliance', 'ISO 45001', 'Construction Safety Standards']
  }
];

const OHCManagement = () => {
  const { toast } = useToast();
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [editingOHC, setEditingOHC] = useState<OHCCentre | null>(null);
  const [createForm, setCreateForm] = useState<Partial<OHCCentre>>({
    ohcName: '',
    ohcCode: '',
    email: '',
    phoneNumber: '',
    contactPerson: '',
    designation: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
    corporateCompany: '',
    industryType: '',
    facilityType: 'In-house',
    licenseNumber: '',
    employeeCapacity: 0,
    establishedYear: new Date().getFullYear(),
    operatingHours: '',
    emergencyServices: false,
    preventiveCareServices: false,
    occupationalHealthServices: false,
    firstAidServices: false,
    medicalStaff: 0,
    ambulanceAvailable: false,
    equipmentLevel: 'Basic',
    status: 'Active',
    specializations: [],
    complianceCertifications: []
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [ohcCentres, setOHCCentres] = useState<OHCCentre[]>(sampleOHCData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facilityTypeFilter, setFacilityTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch OHC centres on component mount
  useEffect(() => {
    fetchOHCCentres();
  }, [currentPage]);

  const fetchOHCCentres = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/ohc?page=${currentPage}&limit=${itemsPerPage}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOHCCentres(data.data || sampleOHCData);
    } catch (err) {
      console.error('Failed to fetch OHC centres, using sample data:', err);
      setOHCCentres(sampleOHCData);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOHC = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const now = new Date();
    const newOHC: OHCCentre = {
      id: `OHC_${now.getTime()}`,
      ohcName: (createForm.ohcName || '').trim(),
      ohcCode: (createForm.ohcCode || '').trim(),
      email: (createForm.email || '').trim(),
      phoneNumber: (createForm.phoneNumber || '').trim(),
      contactPerson: (createForm.contactPerson || '').trim(),
      designation: (createForm.designation || '').trim(),
      area: (createForm.area || '').trim(),
      city: (createForm.city || '').trim(),
      state: (createForm.state || '').trim(),
      pincode: (createForm.pincode || '').trim(),
      corporateCompany: (createForm.corporateCompany || '').trim(),
      industryType: (createForm.industryType || '').trim(),
      facilityType: (createForm.facilityType as any) || 'In-house',
      licenseNumber: (createForm.licenseNumber || '').trim(),
      employeeCapacity: Number(createForm.employeeCapacity || 0),
      establishedYear: Number(createForm.establishedYear || now.getFullYear()),
      operatingHours: (createForm.operatingHours || '').trim(),
      emergencyServices: !!createForm.emergencyServices,
      preventiveCareServices: !!createForm.preventiveCareServices,
      occupationalHealthServices: !!createForm.occupationalHealthServices,
      firstAidServices: !!createForm.firstAidServices,
      medicalStaff: Number(createForm.medicalStaff || 0),
      bedCapacity: createForm.bedCapacity ? Number(createForm.bedCapacity) : undefined,
      ambulanceAvailable: !!createForm.ambulanceAvailable,
      equipmentLevel: (createForm.equipmentLevel as any) || 'Basic',
      rating: 0,
      reviewCount: 0,
      status: (createForm.status as any) || 'Active',
      joinedDate: now.toISOString().slice(0, 10),
      lastInspection: now.toISOString().slice(0, 10),
      website: (createForm.website || '').trim() || undefined,
      specializations: Array.isArray(createForm.specializations) ? createForm.specializations : [],
      complianceCertifications: Array.isArray(createForm.complianceCertifications) ? createForm.complianceCertifications : []
    };

    if (!newOHC.ohcName || !newOHC.ohcCode || !newOHC.email) {
      setError('Please fill OHC Name, OHC Code, and Email.');
      return;
    }

    setOHCCentres(prev => [newOHC, ...prev]);
    setResult({ message: 'OHC created successfully', count: 1 });
    setActiveTab('list');

    setCreateForm(prev => ({
      ...prev,
      ohcName: '',
      ohcCode: '',
      email: '',
      phoneNumber: '',
      contactPerson: '',
      designation: '',
      area: '',
      city: '',
      state: '',
      pincode: '',
      corporateCompany: '',
      industryType: '',
      licenseNumber: '',
      operatingHours: '',
      employeeCapacity: 0,
      medicalStaff: 0
    }));
  };

  // Filtered and paginated OHC centres
  const filteredOHCCentres = useMemo(() => {
    return ohcCentres.filter(ohc => {
      const searchMatch = searchQuery === '' || 
        ohc.ohcName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ohc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ohc.phoneNumber.includes(searchQuery) ||
        ohc.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ohc.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ohc.ohcCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ohc.corporateCompany.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ohc.industryType.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || ohc.status === statusFilter;

      const facilityMatch = facilityTypeFilter === 'all' || 
        ohc.facilityType.toLowerCase().includes(facilityTypeFilter.toLowerCase());

      return searchMatch && statusMatch && facilityMatch;
    });
  }, [ohcCentres, searchQuery, statusFilter, facilityTypeFilter]);

  const paginatedOHCCentres = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOHCCentres.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOHCCentres, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, facilityTypeFilter]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Excel upload implementation
    console.log('Excel upload:', e.target.files?.[0]);
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const ohcData = JSON.parse(jsonInput);
      // API call would go here
      setResult({ message: 'OHC centres uploaded successfully', count: Array.isArray(ohcData) ? ohcData.length : 1 });
      setJsonInput('');
    } catch (err: any) {
      setError('Invalid JSON format or upload failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const sampleData = [{
      OHCName: 'Tata Steel Occupational Health Centre',
      OHCCode: 'TATA-OHC-001',
      Email: 'ohc@tatasteel.com',
      PhoneNumber: '657-2345678',
      ContactPerson: 'Dr. Rajesh Kumar',
      Designation: 'Chief Medical Officer',
      Area: 'Tata Steel Plant',
      City: 'Jamshedpur',
      State: 'Jharkhand',
      Pincode: '831001',
      CorporateCompany: 'Tata Steel Limited',
      IndustryType: 'Steel Manufacturing',
      FacilityType: 'In-house',
      LicenseNumber: 'OHC/JH/2020/001',
      EmployeeCapacity: 25000,
      EstablishedYear: 1995,
      OperatingHours: '24/7',
      EmergencyServices: true,
      PreventiveCareServices: true,
      OccupationalHealthServices: true,
      FirstAidServices: true,
      MedicalStaff: 45,
      BedCapacity: 20,
      AmbulanceAvailable: true,
      EquipmentLevel: 'Advanced',
      Website: 'https://tatasteel.com/healthcare',
      Specializations: 'Occupational Medicine, Emergency Care',
      ComplianceCertifications: 'NABH, ISO 45001',
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'OHCName', 'OHCCode', 'Email', 'PhoneNumber', 'ContactPerson', 'Designation',
      'Area', 'City', 'State', 'Pincode', 'CorporateCompany', 'IndustryType', 'FacilityType',
      'LicenseNumber', 'EmployeeCapacity', 'EstablishedYear', 'OperatingHours',
      'EmergencyServices', 'PreventiveCareServices', 'OccupationalHealthServices',
      'FirstAidServices', 'MedicalStaff', 'BedCapacity', 'AmbulanceAvailable',
      'EquipmentLevel', 'Website', 'Specializations', 'ComplianceCertifications', 'Status'
    ], 'ohc-centres', sampleData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My OHC</h1>
            <p className="text-muted-foreground">Manage Occupational Health Centres in corporate facilities</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setActiveTab('create')} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add OHC
            </Button>
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message}{result.count !== undefined && ` (${result.count} OHC centres)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 lg:w-[520px]">
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="create">Add OHC</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Occupational Health Centre</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Create a new OHC entry (saved locally in this admin view).
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateOHC} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ohcName">OHC Name *</Label>
                      <Input
                        id="ohcName"
                        value={createForm.ohcName || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, ohcName: e.target.value }))}
                        placeholder="Enter OHC name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ohcCode">OHC Code *</Label>
                      <Input
                        id="ohcCode"
                        value={createForm.ohcCode || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, ohcCode: e.target.value }))}
                        placeholder="Enter OHC code"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={createForm.email || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="ohc@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={createForm.phoneNumber || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                        placeholder="+91XXXXXXXXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="corporateCompany">Corporate Company</Label>
                      <Input
                        id="corporateCompany"
                        value={createForm.corporateCompany || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, corporateCompany: e.target.value }))}
                        placeholder="Company name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industryType">Industry Type</Label>
                      <Input
                        id="industryType"
                        value={createForm.industryType || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, industryType: e.target.value }))}
                        placeholder="e.g., Manufacturing"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Facility Type</Label>
                      <Select
                        value={(createForm.facilityType as any) || 'In-house'}
                        onValueChange={(value) => setCreateForm(prev => ({ ...prev, facilityType: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select facility type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="In-house">In-house</SelectItem>
                          <SelectItem value="Outsourced">Outsourced</SelectItem>
                          <SelectItem value="Shared">Shared</SelectItem>
                          <SelectItem value="Mobile">Mobile</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={(createForm.status as any) || 'Active'}
                        onValueChange={(value) => setCreateForm(prev => ({ ...prev, status: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={createForm.city || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={createForm.state || ''}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, state: e.target.value }))}
                        placeholder="State"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={loading}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create OHC
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setActiveTab('list')}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="space-y-6">
            {/* Search and Filter Controls */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by OHC name, code, company, contact person, or industry..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={facilityTypeFilter} onValueChange={setFacilityTypeFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Facility Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="in-house">In-house</SelectItem>
                      <SelectItem value="outsourced">Outsourced</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                      <SelectItem value="mobile">Mobile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* OHC Centres Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Occupational Health Centres</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedOHCCentres.length} of {filteredOHCCentres.length} OHC centres
                  </p>
                </div>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OHC Details</TableHead>
                        <TableHead>Contact & Company</TableHead>
                        <TableHead>Facility & Capacity</TableHead>
                        <TableHead>Services & Equipment</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <TableRow key={index}>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                          </TableRow>
                        ))
                      ) : paginatedOHCCentres.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredOHCCentres.length === 0 ? 'No OHC centres found matching your criteria' : 'No OHC centres to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedOHCCentres.map((ohc) => (
                          <TableRow key={ohc.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{ohc.ohcName}</div>
                                <div className="text-xs text-muted-foreground">Code: {ohc.ohcCode}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {ohc.area}, {ohc.city}
                                </div>
                                <Badge variant="secondary" className="text-xs">{ohc.facilityType}</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm font-medium">{ohc.corporateCompany}</div>
                                <div className="text-xs text-muted-foreground">{ohc.industryType}</div>
                                <div className="text-xs text-muted-foreground">{ohc.contactPerson}</div>
                                <div className="text-xs text-muted-foreground">{ohc.designation}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {ohc.email}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {ohc.phoneNumber}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">
                                  <Users className="h-3 w-3 inline mr-1" />
                                  {ohc.employeeCapacity.toLocaleString()} employees
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Staff: {ohc.medicalStaff} medical personnel
                                </div>
                                {ohc.bedCapacity && (
                                  <div className="text-xs text-muted-foreground">
                                    Beds: {ohc.bedCapacity}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {ohc.operatingHours}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant="outline" className="text-xs">
                                  {ohc.equipmentLevel}
                                </Badge>
                                <div className="text-xs space-y-1">
                                  {ohc.emergencyServices && (
                                    <div className="text-green-600 flex items-center gap-1">
                                      <Shield className="h-3 w-3" />
                                      Emergency
                                    </div>
                                  )}
                                  {ohc.occupationalHealthServices && (
                                    <div className="text-blue-600 flex items-center gap-1">
                                      <Briefcase className="h-3 w-3" />
                                      Occupational
                                    </div>
                                  )}
                                  {ohc.preventiveCareServices && (
                                    <div className="text-purple-600 flex items-center gap-1">
                                      <Stethoscope className="h-3 w-3" />
                                      Preventive
                                    </div>
                                  )}
                                  {ohc.ambulanceAvailable && (
                                    <div className="text-red-600 text-xs">
                                      🚑 Ambulance Available
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{ohc.rating?.toFixed(1) || 'N/A'}</span>
                                {ohc.reviewCount && (
                                  <span className="text-xs text-muted-foreground">({ohc.reviewCount})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  ohc.status === 'Active' ? 'default' : 
                                  ohc.status === 'Inactive' ? 'secondary' : 
                                  ohc.status === 'Pending' ? 'outline' : 'destructive'
                                }
                              >
                                {ohc.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[160px]">
                                  <DropdownMenuItem onClick={() => setEditingOHC(ohc)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit OHC
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toast({ title: "OHC Details", description: `Viewing details for ${ohc.ohcName}` })}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toast({ title: "Schedule Inspection", description: `Scheduling inspection for ${ohc.ohcName}` })}>
                                    <Shield className="mr-2 h-4 w-4" />
                                    Schedule Inspection
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => toast({ title: "Confirm Delete", description: `Are you sure you want to delete ${ohc.ohcName}?`, variant: "destructive" })} 
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Shield className="mr-2 h-4 w-4" />
                                    Schedule Inspection
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => toast({ title: "Confirm Delete", description: `Are you sure you want to delete ${ohc.ohcName}?`, variant: "destructive" })} 
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {filteredOHCCentres.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredOHCCentres.length)} of {filteredOHCCentres.length} entries
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.ceil(filteredOHCCentres.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredOHCCentres.length / itemsPerPage) || 
                            Math.abs(page - currentPage) <= 1
                          )
                          .map((page, index, array) => (
                            <React.Fragment key={page}>
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className="text-muted-foreground">...</span>
                              )}
                              <Button
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(page)}
                                className="w-8 h-8 p-0"
                              >
                                {page}
                              </Button>
                            </React.Fragment>
                          ))
                        }
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredOHCCentres.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredOHCCentres.length / itemsPerPage)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total OHC Centres</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{ohcCentres.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {ohcCentres.filter(o => o.status === 'Active').length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Employee Coverage</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(ohcCentres.reduce((sum, o) => sum + o.employeeCapacity, 0) / 1000).toFixed(0)}K
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Employees covered
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Medical Staff</CardTitle>
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {ohcCentres.reduce((sum, o) => sum + o.medicalStaff, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Healthcare professionals
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Emergency Ready</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {ohcCentres.filter(o => o.emergencyServices).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    With emergency services
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Additional Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Facility Types Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {['In-house', 'Outsourced', 'Shared', 'Mobile'].map(type => {
                      const count = ohcCentres.filter(o => o.facilityType === type).length;
                      const percentage = ((count / ohcCentres.length) * 100).toFixed(1);
                      return (
                        <div key={type} className="flex justify-between items-center">
                          <span className="text-sm">{type}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-muted rounded-full">
                              <div 
                                className="h-full bg-blue-500 rounded-full" 
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Equipment Level Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {['Basic', 'Intermediate', 'Advanced'].map(level => {
                      const count = ohcCentres.filter(o => o.equipmentLevel === level).length;
                      const percentage = ((count / ohcCentres.length) * 100).toFixed(1);
                      return (
                        <div key={level} className="flex justify-between items-center">
                          <span className="text-sm">{level}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-muted rounded-full">
                              <div 
                                className={`h-full rounded-full ${
                                  level === 'Advanced' ? 'bg-green-500' :
                                  level === 'Intermediate' ? 'bg-yellow-500' : 'bg-orange-500'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Service Availability</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Emergency Services</span>
                      <Badge variant="secondary">
                        {ohcCentres.filter(o => o.emergencyServices).length}/{ohcCentres.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Preventive Care</span>
                      <Badge variant="secondary">
                        {ohcCentres.filter(o => o.preventiveCareServices).length}/{ohcCentres.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Occupational Health</span>
                      <Badge variant="secondary">
                        {ohcCentres.filter(o => o.occupationalHealthServices).length}/{ohcCentres.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Ambulance Available</span>
                      <Badge variant="secondary">
                        {ohcCentres.filter(o => o.ambulanceAvailable).length}/{ohcCentres.length}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="excel">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload via Excel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Upload an Excel file (.xlsx) with OHC centre records.
                  </p>
                  <div className="flex items-center gap-4">
                    <Input 
                      ref={fileInputRef} 
                      type="file" 
                      accept=".xlsx" 
                      onChange={handleExcelUpload} 
                      disabled={loading} 
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()} 
                      disabled={loading}
                    >
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
                  Paste JSON array of OHC centre objects with required fields: ohcName, ohcCode, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"ohcName":"Tata Steel Occupational Health Centre","ohcCode":"TATA-OHC-001","email":"ohc@tatasteel.com","phoneNumber":"657-2345678","corporateCompany":"Tata Steel Limited","industryType":"Steel Manufacturing"}]' 
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
    </AdminLayout>
  );
};

export default OHCManagement;
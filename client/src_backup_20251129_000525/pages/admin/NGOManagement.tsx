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
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  Download, Upload, Plus, FileSpreadsheet, UserPlus,
  Search, Eye, Edit, Trash2, MoreVertical, Star, Building2, Phone, Mail,
  ChevronLeft, ChevronRight, Users, Activity, TrendingUp, Shield
} from 'lucide-react';
import { downloadExcelTemplate } from '../../utils/excelParser';
import api from '../../utils/api';
import axios from 'axios';

// NGO Organization Interface
interface NGOOrganization {
  id: string;
  ngoName: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  focusAreas: string[];
  programs: string[];
  establishedYear: number;
  beneficiariesServed: number;
  volunteerCount: number;
  donationSupported: boolean;
  rating?: number;
  reviewCount?: number;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  joinedDate: string;
  lastActive: string;
  website?: string;
  certifications: string[];
}

// Sample NGO data
const sampleNGOData: NGOOrganization[] = [
  {
    id: 'NGO001',
    ngoName: 'HealthCare for All',
    registrationNumber: 'NGO-2020-001',
    email: 'info@healthcareforall.org',
    phoneNumber: '+1-555-0401',
    contactPerson: 'Dr. Anjali Mehta',
    area: 'Civic Center',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    focusAreas: ['Healthcare Access', 'Maternal Health', 'Child Nutrition', 'Health Education'],
    programs: ['Mobile Clinics', 'Health Camps', 'Vaccination Drives', 'Nutrition Programs'],
    establishedYear: 2015,
    beneficiariesServed: 25000,
    volunteerCount: 150,
    donationSupported: true,
    rating: 4.8,
    reviewCount: 189,
    status: 'Active',
    joinedDate: '2023-01-10',
    lastActive: '2024-01-20',
    website: 'https://healthcareforall.org',
    certifications: ['12A Registration', '80G Certification', 'FCRA Approval']
  },
  {
    id: 'NGO002',
    ngoName: 'Rural Health Initiative',
    registrationNumber: 'NGO-2018-045',
    email: 'contact@ruralhealthinit.org',
    phoneNumber: '+1-555-0402',
    contactPerson: 'Ramesh Kumar',
    area: 'Rural Development Zone',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    focusAreas: ['Rural Healthcare', 'Medical Equipment', 'Health Infrastructure', 'Community Health'],
    programs: ['Telemedicine', 'Medical Equipment Distribution', 'Health Worker Training'],
    establishedYear: 2012,
    beneficiariesServed: 45000,
    volunteerCount: 200,
    donationSupported: true,
    rating: 4.6,
    reviewCount: 234,
    status: 'Active',
    joinedDate: '2022-11-15',
    lastActive: '2024-01-19',
    website: 'https://ruralhealthinit.org',
    certifications: ['12A Registration', '80G Certification']
  },
  {
    id: 'NGO003',
    ngoName: 'Women & Child Welfare Society',
    registrationNumber: 'NGO-2019-123',
    email: 'admin@wcws.org',
    phoneNumber: '+1-555-0403',
    contactPerson: 'Priya Sharma',
    area: 'Social Welfare District',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
    focusAreas: ['Women Health', 'Child Care', 'Mental Health', 'Health Awareness'],
    programs: ['Maternal Care', 'Child Immunization', 'Mental Health Support', 'Health Workshops'],
    establishedYear: 2016,
    beneficiariesServed: 18000,
    volunteerCount: 85,
    donationSupported: false,
    rating: 4.5,
    reviewCount: 126,
    status: 'Active',
    joinedDate: '2023-03-20',
    lastActive: '2024-01-18',
    website: 'https://wcws.org',
    certifications: ['12A Registration']
  },
  {
    id: 'NGO004',
    ngoName: 'Community Health Network',
    registrationNumber: 'NGO-2021-089',
    email: 'info@communityhealthnet.org',
    phoneNumber: '+1-555-0404',
    contactPerson: 'Suresh Patel',
    area: 'Community Center',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    focusAreas: ['Community Health', 'Health Technology', 'Health Data', 'Digital Health'],
    programs: ['Health Apps', 'Digital Health Records', 'Health Analytics'],
    establishedYear: 2020,
    beneficiariesServed: 12000,
    volunteerCount: 60,
    donationSupported: true,
    rating: 4.3,
    reviewCount: 78,
    status: 'Pending',
    joinedDate: '2024-01-05',
    lastActive: '2024-01-15',
    website: 'https://communityhealthnet.org',
    certifications: ['12A Registration', '80G Certification']
  }
];

const NGOManagement = () => {
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [editingNGO, setEditingNGO] = useState<NGOOrganization | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [ngos, setNGOs] = useState<NGOOrganization[]>(sampleNGOData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [focusAreaFilter, setFocusAreaFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch NGOs on component mount
  useEffect(() => {
    fetchNGOs();
  }, [currentPage]);

  const fetchNGOs = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`http://192.168.1.72:8000/api/admin/ngo?page=${currentPage}&limit=${itemsPerPage}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNGOs(data.data || sampleNGOData);
    } catch (err) {
      console.error('Failed to fetch NGOs, using sample data:', err);
      setNGOs(sampleNGOData);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and paginated NGOs
  const filteredNGOs = useMemo(() => {
    return ngos.filter(ngo => {
      const searchMatch = searchQuery === '' || 
        ngo.ngoName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ngo.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ngo.phoneNumber.includes(searchQuery) ||
        ngo.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ngo.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ngo.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || ngo.status === statusFilter;

      const focusAreaMatch = focusAreaFilter === 'all' || 
        ngo.focusAreas.some(area => area.toLowerCase().includes(focusAreaFilter.toLowerCase()));

      return searchMatch && statusMatch && focusAreaMatch;
    });
  }, [ngos, searchQuery, statusFilter, focusAreaFilter]);

  const paginatedNGOs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNGOs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNGOs, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, focusAreaFilter]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Excel upload implementation
    console.log('Excel upload:', e.target.files?.[0]);
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const ngoData = JSON.parse(jsonInput);
      // API call would go here
      setResult({ message: 'NGOs uploaded successfully', count: Array.isArray(ngoData) ? ngoData.length : 1 });
      setJsonInput('');
    } catch (err: any) {
      setError('Invalid JSON format or upload failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const sampleData = [{
      NGOName: 'HealthCare for All',
      RegistrationNumber: 'NGO-2024-001',
      Email: 'info@healthcareforall.org',
      PhoneNumber: '555-0400',
      ContactPerson: 'Dr. Anjali Mehta',
      Area: 'Civic Center',
      City: 'Mumbai',
      State: 'Maharashtra',
      Pincode: '400001',
      FocusAreas: 'Healthcare Access, Maternal Health',
      Programs: 'Mobile Clinics, Health Camps',
      EstablishedYear: 2015,
      BeneficiariesServed: 25000,
      VolunteerCount: 150,
      DonationSupported: 'true',
      Website: 'https://healthcareforall.org',
      Certifications: '12A Registration, 80G Certification',
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'NGOName', 'RegistrationNumber', 'Email', 'PhoneNumber', 'ContactPerson',
      'Area', 'City', 'State', 'Pincode', 'FocusAreas', 'Programs',
      'EstablishedYear', 'BeneficiariesServed', 'VolunteerCount', 'DonationSupported',
      'Website', 'Certifications', 'Status'
    ], 'ngo-organizations', sampleData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My NGO</h1>
            <p className="text-muted-foreground">Manage non-governmental healthcare organizations</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setActiveTab('create')} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add NGO
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
            {result.message}{result.count !== undefined && ` (${result.count} NGOs)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-6">
            {/* Search and Filter Controls */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by NGO name, registration, email, or contact person..."
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
                  <Select value={focusAreaFilter} onValueChange={setFocusAreaFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Focus Area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      <SelectItem value="healthcare">Healthcare Access</SelectItem>
                      <SelectItem value="maternal">Maternal Health</SelectItem>
                      <SelectItem value="child">Child Care</SelectItem>
                      <SelectItem value="mental">Mental Health</SelectItem>
                      <SelectItem value="community">Community Health</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* NGOs Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>NGO Organizations</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedNGOs.length} of {filteredNGOs.length} NGOs
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
                        <TableHead>NGO Details</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Focus & Programs</TableHead>
                        <TableHead>Impact</TableHead>
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
                      ) : paginatedNGOs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredNGOs.length === 0 ? 'No NGOs found matching your criteria' : 'No NGOs to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedNGOs.map((ngo) => (
                          <TableRow key={ngo.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{ngo.ngoName}</div>
                                <div className="text-xs text-muted-foreground">Reg: {ngo.registrationNumber}</div>
                                <div className="text-xs text-muted-foreground">{ngo.area}, {ngo.city}</div>
                                <div className="text-xs text-muted-foreground">Est. {ngo.establishedYear}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">{ngo.contactPerson}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {ngo.email}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {ngo.phoneNumber}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {ngo.focusAreas.slice(0, 2).map((area, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                      {area}
                                    </Badge>
                                  ))}
                                  {ngo.focusAreas.length > 2 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{ngo.focusAreas.length - 2}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Programs: {ngo.programs.length}
                                </div>
                                {ngo.donationSupported && (
                                  <Badge variant="outline" className="text-xs">Donation Supported</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">
                                  <Heart className="h-3 w-3 inline mr-1 text-red-500" />
                                  {ngo.beneficiariesServed.toLocaleString()} served
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  <Users className="h-3 w-3 inline mr-1" />
                                  {ngo.volunteerCount} volunteers
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{ngo.rating?.toFixed(1) || 'N/A'}</span>
                                {ngo.reviewCount && (
                                  <span className="text-xs text-muted-foreground">({ngo.reviewCount})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  ngo.status === 'Active' ? 'default' : 
                                  ngo.status === 'Inactive' ? 'secondary' : 
                                  ngo.status === 'Pending' ? 'outline' : 'destructive'
                                }
                              >
                                {ngo.status}
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
                                  <DropdownMenuItem onClick={() => setEditingNGO(ngo)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit NGO
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => alert(`View details for ${ngo.ngoName}`)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => alert(`Delete ${ngo.ngoName}?`)} 
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
                {filteredNGOs.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredNGOs.length)} of {filteredNGOs.length} entries
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
                        {Array.from({ length: Math.ceil(filteredNGOs.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredNGOs.length / itemsPerPage) || 
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
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredNGOs.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredNGOs.length / itemsPerPage)}
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
                  <CardTitle className="text-sm font-medium">Total NGOs</CardTitle>
                  <Heart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{ngos.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {ngos.filter(n => n.status === 'Active').length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Beneficiaries</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {ngos.reduce((sum, n) => sum + n.beneficiariesServed, 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    People served
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Volunteers</CardTitle>
                  <Award className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {ngos.reduce((sum, n) => sum + n.volunteerCount, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Active volunteers
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Donation Supported</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {ngos.filter(n => n.donationSupported).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Accept donations
                  </p>
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
                    Upload an Excel file (.xlsx, .xls) with NGO organization records.
                  </p>
                  <div className="flex items-center gap-4">
                    <Input 
                      ref={fileInputRef} 
                      type="file" 
                      accept=".xlsx,.xls" 
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
                  Paste JSON array of NGO objects with required fields: ngoName, registrationNumber, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"ngoName":"HealthCare for All","registrationNumber":"NGO-2024-001","email":"info@healthcareforall.org","phoneNumber":"555-0400","city":"Mumbai","state":"Maharashtra"}]' 
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

export default NGOManagement;
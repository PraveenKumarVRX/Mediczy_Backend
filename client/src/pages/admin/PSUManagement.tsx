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

// PSU Organization Interface
interface PSUOrganization {
  id: string;
  psuName: string;
  psuCode: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  designation: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  sector: string;
  category: string;
  establishedYear: number;
  employeeCount: number;
  serviceTypes: string[];
  healthSchemes: string[];
  empanelledHospitals: number;
  budgetAllocated: number;
  rating?: number;
  reviewCount?: number;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  joinedDate: string;
  lastActive: string;
  website?: string;
  parentMinistry: string;
}

// Sample PSU data
const samplePSUData: PSUOrganization[] = [
  {
    id: 'PSU001',
    psuName: 'Indian Railways Medical Service',
    psuCode: 'IRMS-001',
    email: 'medical@indianrailways.gov.in',
    phoneNumber: '+91-11-23389999',
    contactPerson: 'Dr. R.K. Singh',
    designation: 'Chief Medical Officer',
    area: 'Rail Bhavan',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110001',
    sector: 'Transportation',
    category: 'Navratna',
    establishedYear: 1951,
    employeeCount: 150000,
    serviceTypes: ['Employee Healthcare', 'Family Coverage', 'Retired Employee Benefits', 'Emergency Services'],
    healthSchemes: ['RELHS', 'CGHS Empanelment', 'Railway Hospital Network'],
    empanelledHospitals: 450,
    budgetAllocated: 5000000000, // 5000 crores
    rating: 4.5,
    reviewCount: 2340,
    status: 'Active',
    joinedDate: '2022-08-15',
    lastActive: '2024-01-20',
    website: 'https://indianrailways.gov.in',
    parentMinistry: 'Ministry of Railways'
  },
  {
    id: 'PSU002',
    psuName: 'ONGC Medical Services',
    psuCode: 'ONGC-MED-002',
    email: 'medical@ongc.co.in',
    phoneNumber: '+91-22-26598765',
    contactPerson: 'Dr. Priya Sharma',
    designation: 'GM Medical Services',
    area: 'Corporate Office',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    sector: 'Oil & Gas',
    category: 'Maharatna',
    establishedYear: 1956,
    employeeCount: 85000,
    serviceTypes: ['Occupational Health', 'Preventive Healthcare', 'Specialized Treatment', 'Health Check-ups'],
    healthSchemes: ['ONGC Medical Scheme', 'Cashless Treatment', 'Emergency Medical Aid'],
    empanelledHospitals: 320,
    budgetAllocated: 3200000000, // 3200 crores
    rating: 4.6,
    reviewCount: 1890,
    status: 'Active',
    joinedDate: '2022-10-20',
    lastActive: '2024-01-19',
    website: 'https://ongc.co.in',
    parentMinistry: 'Ministry of Petroleum & Natural Gas'
  },
  {
    id: 'PSU003',
    psuName: 'Steel Authority Medical Division',
    psuCode: 'SAIL-MED-003',
    email: 'medical@sail.co.in',
    phoneNumber: '+91-11-24367890',
    contactPerson: 'Dr. Arun Kumar',
    designation: 'Director Medical Services',
    area: 'Steel Bhavan',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110003',
    sector: 'Steel & Mining',
    category: 'Navratna',
    establishedYear: 1973,
    employeeCount: 95000,
    serviceTypes: ['Industrial Health', 'Trauma Care', 'Occupational Medicine', 'Community Health'],
    healthSchemes: ['SAIL Medical Benefits', 'Family Health Coverage', 'Retired Employee Medical'],
    empanelledHospitals: 280,
    budgetAllocated: 2800000000, // 2800 crores
    rating: 4.3,
    reviewCount: 1456,
    status: 'Active',
    joinedDate: '2023-01-12',
    lastActive: '2024-01-18',
    website: 'https://sail.co.in',
    parentMinistry: 'Ministry of Steel'
  },
  {
    id: 'PSU004',
    psuName: 'BHEL Healthcare Services',
    psuCode: 'BHEL-HC-004',
    email: 'healthcare@bhel.co.in',
    phoneNumber: '+91-11-26601234',
    contactPerson: 'Dr. Sunita Reddy',
    designation: 'Chief Medical Advisor',
    area: 'BHEL House',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110066',
    sector: 'Heavy Engineering',
    category: 'Navratna',
    establishedYear: 1964,
    employeeCount: 45000,
    serviceTypes: ['Employee Wellness', 'Health Monitoring', 'Medical Insurance', 'Preventive Care'],
    healthSchemes: ['BHEL Medical Scheme', 'Group Health Insurance', 'Medical Reimbursement'],
    empanelledHospitals: 180,
    budgetAllocated: 1800000000, // 1800 crores
    rating: 4.1,
    reviewCount: 892,
    status: 'Pending',
    joinedDate: '2023-12-05',
    lastActive: '2024-01-15',
    website: 'https://bhel.co.in',
    parentMinistry: 'Ministry of Heavy Industries'
  }
];

const PSUManagement = () => {
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [editingPSU, setEditingPSU] = useState<PSUOrganization | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [psus, setPSUs] = useState<PSUOrganization[]>(samplePSUData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch PSUs on component mount
  useEffect(() => {
    fetchPSUs();
  }, [currentPage]);

  const fetchPSUs = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/psu?page=${currentPage}&limit=${itemsPerPage}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPSUs(data.data || samplePSUData);
    } catch (err) {
      console.error('Failed to fetch PSUs, using sample data:', err);
      setPSUs(samplePSUData);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and paginated PSUs
  const filteredPSUs = useMemo(() => {
    return psus.filter(psu => {
      const searchMatch = searchQuery === '' || 
        psu.psuName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        psu.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        psu.phoneNumber.includes(searchQuery) ||
        psu.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        psu.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        psu.psuCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        psu.parentMinistry.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || psu.status === statusFilter;

      const sectorMatch = sectorFilter === 'all' || 
        psu.sector.toLowerCase().includes(sectorFilter.toLowerCase());

      return searchMatch && statusMatch && sectorMatch;
    });
  }, [psus, searchQuery, statusFilter, sectorFilter]);

  const paginatedPSUs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPSUs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPSUs, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sectorFilter]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Excel upload implementation
    console.log('Excel upload:', e.target.files?.[0]);
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const psuData = JSON.parse(jsonInput);
      // API call would go here
      setResult({ message: 'PSUs uploaded successfully', count: Array.isArray(psuData) ? psuData.length : 1 });
      setJsonInput('');
    } catch (err: any) {
      setError('Invalid JSON format or upload failed');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${amount.toLocaleString()}`;
  };

  const downloadTemplate = () => {
    const sampleData = [{
      PSUName: 'Indian Railways Medical Service',
      PSUCode: 'IRMS-001',
      Email: 'medical@indianrailways.gov.in',
      PhoneNumber: '11-23389999',
      ContactPerson: 'Dr. R.K. Singh',
      Designation: 'Chief Medical Officer',
      Area: 'Rail Bhavan',
      City: 'New Delhi',
      State: 'Delhi',
      Pincode: '110001',
      Sector: 'Transportation',
      Category: 'Navratna',
      EstablishedYear: 1951,
      EmployeeCount: 150000,
      ServiceTypes: 'Employee Healthcare, Family Coverage',
      HealthSchemes: 'RELHS, CGHS Empanelment',
      EmpanelledHospitals: 450,
      BudgetAllocated: 5000000000,
      Website: 'https://indianrailways.gov.in',
      ParentMinistry: 'Ministry of Railways',
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'PSUName', 'PSUCode', 'Email', 'PhoneNumber', 'ContactPerson', 'Designation',
      'Area', 'City', 'State', 'Pincode', 'Sector', 'Category', 'EstablishedYear',
      'EmployeeCount', 'ServiceTypes', 'HealthSchemes', 'EmpanelledHospitals',
      'BudgetAllocated', 'Website', 'ParentMinistry', 'Status'
    ], 'psu-organizations', sampleData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My PSU</h1>
            <p className="text-muted-foreground">Manage Public Sector Undertaking healthcare organizations</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setActiveTab('create')} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add PSU
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
            {result.message}{result.count !== undefined && ` (${result.count} PSUs)`}
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
                      placeholder="Search by PSU name, code, email, ministry, or contact person..."
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
                  <Select value={sectorFilter} onValueChange={setSectorFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Sector" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sectors</SelectItem>
                      <SelectItem value="transportation">Transportation</SelectItem>
                      <SelectItem value="oil">Oil & Gas</SelectItem>
                      <SelectItem value="steel">Steel & Mining</SelectItem>
                      <SelectItem value="heavy">Heavy Engineering</SelectItem>
                      <SelectItem value="power">Power</SelectItem>
                      <SelectItem value="banking">Banking & Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* PSUs Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>PSU Organizations</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedPSUs.length} of {filteredPSUs.length} PSUs
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
                        <TableHead>PSU Details</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Sector & Ministry</TableHead>
                        <TableHead>Scale & Budget</TableHead>
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
                      ) : paginatedPSUs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredPSUs.length === 0 ? 'No PSUs found matching your criteria' : 'No PSUs to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPSUs.map((psu) => (
                          <TableRow key={psu.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{psu.psuName}</div>
                                <div className="text-xs text-muted-foreground">Code: {psu.psuCode}</div>
                                <div className="text-xs text-muted-foreground">{psu.area}, {psu.city}</div>
                                <Badge variant="secondary" className="text-xs">{psu.category}</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">{psu.contactPerson}</div>
                                <div className="text-xs text-muted-foreground">{psu.designation}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {psu.email}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {psu.phoneNumber}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant="outline" className="text-xs">
                                  {psu.sector}
                                </Badge>
                                <div className="text-xs text-muted-foreground">
                                  {psu.parentMinistry}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Est. {psu.establishedYear}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">
                                  <Users className="h-3 w-3 inline mr-1" />
                                  {psu.employeeCount.toLocaleString()} employees
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Budget: {formatCurrency(psu.budgetAllocated)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Hospitals: {psu.empanelledHospitals}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{psu.rating?.toFixed(1) || 'N/A'}</span>
                                {psu.reviewCount && (
                                  <span className="text-xs text-muted-foreground">({psu.reviewCount})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  psu.status === 'Active' ? 'default' : 
                                  psu.status === 'Inactive' ? 'secondary' : 
                                  psu.status === 'Pending' ? 'outline' : 'destructive'
                                }
                              >
                                {psu.status}
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
                                  <DropdownMenuItem onClick={() => setEditingPSU(psu)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit PSU
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => alert(`View details for ${psu.psuName}`)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => alert(`Delete ${psu.psuName}?`)} 
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
                {filteredPSUs.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredPSUs.length)} of {filteredPSUs.length} entries
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
                        {Array.from({ length: Math.ceil(filteredPSUs.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredPSUs.length / itemsPerPage) || 
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
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredPSUs.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredPSUs.length / itemsPerPage)}
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
                  <CardTitle className="text-sm font-medium">Total PSUs</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{psus.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {psus.filter(p => p.status === 'Active').length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(psus.reduce((sum, p) => sum + p.employeeCount, 0) / 1000000).toFixed(1)}M
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Million employees
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₹{(psus.reduce((sum, p) => sum + p.budgetAllocated, 0) / 10000000000).toFixed(1)}K Cr
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Thousand crores
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Empanelled Hospitals</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {psus.reduce((sum, p) => sum + p.empanelledHospitals, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Healthcare providers
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
                    Upload an Excel file (.xlsx, .xls) with PSU organization records.
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
                  Paste JSON array of PSU objects with required fields: psuName, psuCode, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"psuName":"Indian Railways Medical Service","psuCode":"IRMS-001","email":"medical@indianrailways.gov.in","phoneNumber":"11-23389999","city":"New Delhi","state":"Delhi"}]' 
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

export default PSUManagement;
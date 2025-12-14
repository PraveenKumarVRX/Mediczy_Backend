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
import { Switch } from "../../components/ui/switch";
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  Download, Upload, Plus, FileSpreadsheet, UserPlus,
  Search, Eye, Edit, Trash2, MoreVertical, Star, Home, MapPin, Clock,
  ChevronLeft, ChevronRight, Users, Activity, TrendingUp, Shield
} from 'lucide-react';
import { downloadExcelTemplate } from '../../utils/excelParser';
import api from '../../utils/api';
import axios from 'axios';

// Enhanced Homecare Provider Interface
interface HomecareProvider {
  id: string;
  providerName: string;
  licenseNumber: string;
  email: string;
  phoneNumber: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  serviceAreas: string[];
  services: string[];
  availability24x7: boolean;
  staffCapacity: number;
  currentStaff: number;
  priceRange: string;
  rating?: number;
  reviewCount?: number;
  emergency24x7: boolean;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  joinedDate: string;
  lastActive: string;
  website?: string;
}

// Sample data for homecare providers
const sampleHomecareData: HomecareProvider[] = [
  {
    id: 'HC001',
    providerName: 'CareMax Home Services',
    licenseNumber: 'HC-2023-001',
    email: 'info@caremax.com',
    phoneNumber: '+1-555-0201',
    area: 'Central District',
    city: 'New York',
    state: 'NY',
    pincode: '10001',
    serviceAreas: ['Manhattan', 'Brooklyn', 'Queens'],
    services: ['Nursing Care', 'Physical Therapy', 'Elderly Care', 'Post-Surgery Care'],
    availability24x7: true,
    staffCapacity: 50,
    currentStaff: 42,
    priceRange: '$50-150/hour',
    rating: 4.8,
    reviewCount: 156,
    emergency24x7: true,
    status: 'Active',
    joinedDate: '2023-01-15',
    lastActive: '2024-01-20',
    website: 'https://caremax.com'
  },
  {
    id: 'HC002',
    providerName: 'HealthHome Solutions',
    licenseNumber: 'HC-2023-002',
    email: 'contact@healthhome.com',
    phoneNumber: '+1-555-0202',
    area: 'Westside',
    city: 'Los Angeles',
    state: 'CA',
    pincode: '90210',
    serviceAreas: ['West LA', 'Beverly Hills', 'Santa Monica'],
    services: ['Home Nursing', 'Medical Equipment', 'Lab Tests at Home', 'Wound Care'],
    availability24x7: false,
    staffCapacity: 30,
    currentStaff: 28,
    priceRange: '$40-120/hour',
    rating: 4.5,
    reviewCount: 89,
    emergency24x7: false,
    status: 'Active',
    joinedDate: '2023-03-10',
    lastActive: '2024-01-18',
    website: 'https://healthhome.com'
  },
  {
    id: 'HC003',
    providerName: 'Elite Homecare Services',
    licenseNumber: 'HC-2023-003',
    email: 'admin@elitehomecare.com',
    phoneNumber: '+1-555-0203',
    area: 'North Side',
    city: 'Chicago',
    state: 'IL',
    pincode: '60601',
    serviceAreas: ['North Chicago', 'Lincoln Park', 'Gold Coast'],
    services: ['Palliative Care', 'Mental Health Support', 'Nutrition Counseling', 'Health Monitoring'],
    availability24x7: true,
    staffCapacity: 25,
    currentStaff: 20,
    priceRange: '$60-200/hour',
    rating: 4.7,
    reviewCount: 234,
    emergency24x7: true,
    status: 'Active',
    joinedDate: '2022-12-05',
    lastActive: '2024-01-19'
  },
  {
    id: 'HC004',
    providerName: 'Comfort Care Partners',
    licenseNumber: 'HC-2023-004',
    email: 'info@comfortcare.com',
    phoneNumber: '+1-555-0204',
    area: 'Downtown',
    city: 'Houston',
    state: 'TX',
    pincode: '77001',
    serviceAreas: ['Downtown', 'Midtown', 'River Oaks'],
    services: ['Occupational Therapy', 'Speech Therapy', 'Medication Management'],
    availability24x7: false,
    staffCapacity: 20,
    currentStaff: 15,
    priceRange: '$45-130/hour',
    rating: 4.2,
    reviewCount: 67,
    emergency24x7: false,
    status: 'Pending',
    joinedDate: '2024-01-10',
    lastActive: '2024-01-15'
  }
];

const HomecareManagement = () => {
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [editingProvider, setEditingProvider] = useState<HomecareProvider | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [providers, setProviders] = useState<HomecareProvider[]>(sampleHomecareData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // New provider form state
  const [newProvider, setNewProvider] = useState({
    name: '',
    licenseNumber: '',
    email: '',
    phoneNumber: '',
    city: '',
    state: '',
    services: '',
    staffCapacity: 0,
    emergency24x7: false
  });

  // Fetch providers on component mount
  useEffect(() => {
    fetchProviders();
  }, [currentPage]);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/homecare?page=${currentPage}&limit=${itemsPerPage}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProviders(data.data || sampleHomecareData);
    } catch (err) {
      console.error('Failed to fetch homecare providers, using sample data:', err);
      setProviders(sampleHomecareData);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and paginated providers
  const filteredProviders = useMemo(() => {
    return providers.filter(provider => {
      const searchMatch = searchQuery === '' || 
        provider.providerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.phoneNumber.includes(searchQuery) ||
        provider.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.licenseNumber.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || provider.status === statusFilter;

      const availabilityMatch = availabilityFilter === 'all' || 
        (availabilityFilter === '24x7' && provider.availability24x7) ||
        (availabilityFilter === 'emergency' && provider.emergency24x7) ||
        (availabilityFilter === 'standard' && !provider.availability24x7);

      return searchMatch && statusMatch && availabilityMatch;
    });
  }, [providers, searchQuery, statusFilter, availabilityFilter]);

  const paginatedProviders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProviders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProviders, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, availabilityFilter]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const { data } = await api.post('/admin/masters/homecare/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
      });
      setResult(data);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Excel upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const providersData = JSON.parse(jsonInput);
      const { data } = await api.post('/admin/masters/homecare', { 
        providers: Array.isArray(providersData) ? providersData : [providersData] 
      }, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setResult(data);
      setJsonInput('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const sampleData = [{
      ProviderName: 'CareMax Services',
      LicenseNumber: 'HC-2024-001',
      Email: 'info@caremax.com',
      PhoneNumber: '555-0100',
      Area: 'Central District',
      City: 'New York',
      State: 'NY',
      Pincode: '10001',
      ServiceAreas: 'Manhattan, Brooklyn',
      Services: 'Nursing Care, Physical Therapy',
      Availability24x7: 'true',
      StaffCapacity: 50,
      Emergency24x7: 'true',
      PriceRange: '$50-150/hour',
      Website: 'https://caremax.com',
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'ProviderName', 'LicenseNumber', 'Email', 'PhoneNumber', 'Area', 'City', 'State', 'Pincode',
      'ServiceAreas', 'Services', 'Availability24x7', 'StaffCapacity', 'Emergency24x7',
      'PriceRange', 'Website', 'Status'
    ], 'homecare-providers', sampleData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Homecare</h1>
            <p className="text-muted-foreground">Manage homecare providers and services</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setActiveTab('create')} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Provider
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
            {result.message}{result.count !== undefined && ` (${result.count} providers)`}
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
                      placeholder="Search by provider name, license, email, or city..."
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
                  <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Availability" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="24x7">24/7 Available</SelectItem>
                      <SelectItem value="emergency">Emergency Services</SelectItem>
                      <SelectItem value="standard">Standard Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Providers Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Homecare Providers</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedProviders.length} of {filteredProviders.length} providers
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
                        <TableHead>Provider Details</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Services</TableHead>
                        <TableHead>Staff & Capacity</TableHead>
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
                      ) : paginatedProviders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredProviders.length === 0 ? 'No providers found matching your criteria' : 'No providers to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedProviders.map((provider) => (
                          <TableRow key={provider.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{provider.providerName}</div>
                                <div className="text-sm text-muted-foreground">{provider.email}</div>
                                <div className="text-sm text-muted-foreground">{provider.phoneNumber}</div>
                                <div className="text-xs text-muted-foreground">License: {provider.licenseNumber}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">{provider.area}, {provider.city}</div>
                                <div className="text-xs text-muted-foreground">{provider.state}, {provider.pincode}</div>
                                <div className="text-xs text-muted-foreground">
                                  Areas: {provider.serviceAreas.slice(0, 2).join(', ')}{provider.serviceAreas.length > 2 && '...'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {provider.services.slice(0, 2).map((service, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {service}
                                  </Badge>
                                ))}
                                {provider.services.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{provider.services.length - 2} more
                                  </Badge>
                                )}
                                <div className="mt-1 space-y-1">
                                  {provider.availability24x7 && (
                                    <Badge variant="outline" className="text-xs">24/7</Badge>
                                  )}
                                  {provider.emergency24x7 && (
                                    <Badge variant="outline" className="text-xs">Emergency</Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">
                                  <Users className="h-3 w-3 inline mr-1" />
                                  {provider.currentStaff}/{provider.staffCapacity}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {provider.priceRange}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{provider.rating?.toFixed(1) || 'N/A'}</span>
                                {provider.reviewCount && (
                                  <span className="text-xs text-muted-foreground">({provider.reviewCount})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  provider.status === 'Active' ? 'default' : 
                                  provider.status === 'Inactive' ? 'secondary' : 
                                  provider.status === 'Pending' ? 'outline' : 'destructive'
                                }
                              >
                                {provider.status}
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
                                  <DropdownMenuItem onClick={() => setEditingProvider(provider)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit Provider
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => alert(`View details for ${provider.providerName}`)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => alert(`Delete ${provider.providerName}?`)} 
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
                {filteredProviders.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredProviders.length)} of {filteredProviders.length} entries
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
                        {Array.from({ length: Math.ceil(filteredProviders.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredProviders.length / itemsPerPage) || 
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
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredProviders.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredProviders.length / itemsPerPage)}
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
                  <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
                  <Home className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{providers.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {providers.filter(p => p.status === 'Active').length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">24/7 Available</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {providers.filter(p => p.availability24x7).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Round the clock service
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {providers.reduce((sum, p) => sum + p.currentStaff, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    /{providers.reduce((sum, p) => sum + p.staffCapacity, 0)} capacity
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
                    {providers.filter(p => p.emergency24x7).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Emergency services
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
                    Upload an Excel file (.xlsx, .xls) with homecare provider records.
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
                  Paste JSON array of homecare provider objects with required fields: providerName, licenseNumber, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"providerName":"CareMax Services","licenseNumber":"HC-2024-001","email":"info@caremax.com","phoneNumber":"555-0100","city":"New York","state":"NY"}]' 
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

export default HomecareManagement;
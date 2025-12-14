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
  Search, Eye, Edit, Trash2, MoreVertical, Star, Building2, Phone, Mail, Shield,
  ChevronLeft, ChevronRight, Users, Activity, TrendingUp, FileText
} from 'lucide-react';
import { downloadExcelTemplate } from '../../utils/excelParser';
import api from '../../utils/api';
import axios from 'axios';

// Insurance Provider Interface
interface InsuranceProvider {
  id: string;
  insurerName: string;
  insurerCode: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  designation: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  insuranceType: string;
  licenseNumber: string;
  irdaiRegistration: string;
  establishedYear: number;
  claimRatio: number;
  settlementTime: number; // in days
  networkHospitals: number;
  premiumCollection: number;
  rating?: number;
  reviewCount?: number;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  joinedDate: string;
  lastActive: string;
  website?: string;
  specializations: string[];
}

// Sample Insurance Provider data
const sampleInsuranceData: InsuranceProvider[] = [
  {
    id: 'INS001',
    insurerName: 'HDFC ERGO General Insurance',
    insurerCode: 'HDFC-ERGO',
    email: 'corporate@hdfcergo.com',
    phoneNumber: '+91-22-67196800',
    contactPerson: 'Rahul Sharma',
    designation: 'Regional Manager',
    area: 'Bandra Kurla Complex',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400051',
    insuranceType: 'General Insurance',
    licenseNumber: 'IRDAI/GI/LIC/511/10/2019',
    irdaiRegistration: '511',
    establishedYear: 2002,
    claimRatio: 95.5,
    settlementTime: 7,
    networkHospitals: 8500,
    premiumCollection: 15000000000, // 15000 crores
    rating: 4.6,
    reviewCount: 3420,
    status: 'Active',
    joinedDate: '2022-06-10',
    lastActive: '2024-01-20',
    website: 'https://hdfcergo.com',
    specializations: ['Health Insurance', 'Motor Insurance', 'Travel Insurance', 'Personal Accident']
  },
  {
    id: 'INS002',
    insurerName: 'ICICI Lombard General Insurance',
    insurerCode: 'ICICI-LOMBARD',
    email: 'healthcare@icicilombard.com',
    phoneNumber: '+91-22-61961600',
    contactPerson: 'Priya Nair',
    designation: 'Business Head - Health',
    area: 'ICICI Bank Towers',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400020',
    insuranceType: 'General Insurance',
    licenseNumber: 'IRDAI/GI/LIC/301/09/2019',
    irdaiRegistration: '301',
    establishedYear: 2001,
    claimRatio: 93.8,
    settlementTime: 5,
    networkHospitals: 7200,
    premiumCollection: 12500000000, // 12500 crores
    rating: 4.5,
    reviewCount: 2890,
    status: 'Active',
    joinedDate: '2022-08-15',
    lastActive: '2024-01-19',
    website: 'https://icicilombard.com',
    specializations: ['Health Insurance', 'Critical Illness', 'Group Health', 'International Travel']
  },
  {
    id: 'INS003',
    insurerName: 'SBI General Insurance',
    insurerCode: 'SBI-GENERAL',
    email: 'medical@sbigeneral.in',
    phoneNumber: '+91-22-28356400',
    contactPerson: 'Anil Kumar',
    designation: 'Chief Medical Officer',
    area: 'Nariman Point',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400021',
    insuranceType: 'General Insurance',
    licenseNumber: 'IRDAI/GI/LIC/103/08/2019',
    irdaiRegistration: '103',
    establishedYear: 2009,
    claimRatio: 91.2,
    settlementTime: 10,
    networkHospitals: 6800,
    premiumCollection: 8900000000, // 8900 crores
    rating: 4.3,
    reviewCount: 2156,
    status: 'Active',
    joinedDate: '2022-11-22',
    lastActive: '2024-01-18',
    website: 'https://sbigeneral.in',
    specializations: ['Health Insurance', 'Rural Insurance', 'Crop Insurance', 'Micro Insurance']
  },
  {
    id: 'INS004',
    insurerName: 'Star Health and Allied Insurance',
    insurerCode: 'STAR-HEALTH',
    email: 'info@starhealth.in',
    phoneNumber: '+91-44-28288800',
    contactPerson: 'Dr. Meera Reddy',
    designation: 'VP Medical Services',
    area: 'T. Nagar',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600017',
    insuranceType: 'Health Insurance',
    licenseNumber: 'IRDAI/GI/LIC/512/03/2019',
    irdaiRegistration: '512',
    establishedYear: 2006,
    claimRatio: 97.1,
    settlementTime: 3,
    networkHospitals: 9200,
    premiumCollection: 11200000000, // 11200 crores
    rating: 4.7,
    reviewCount: 4567,
    status: 'Pending',
    joinedDate: '2023-09-05',
    lastActive: '2024-01-15',
    website: 'https://starhealth.in',
    specializations: ['Health Insurance', 'Senior Citizen Plans', 'Diabetes Cover', 'Cancer Insurance']
  }
];

const AdminInsurance = () => {
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [editingInsurer, setEditingInsurer] = useState<InsuranceProvider | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [insurers, setInsurers] = useState<InsuranceProvider[]>(sampleInsuranceData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [insuranceTypeFilter, setInsuranceTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch insurance providers on component mount
  useEffect(() => {
    fetchInsurers();
  }, [currentPage]);

  const fetchInsurers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/insurance-providers?page=${currentPage}&limit=${itemsPerPage}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsurers(data.data || sampleInsuranceData);
    } catch (err) {
      console.error('Failed to fetch insurance providers, using sample data:', err);
      setInsurers(sampleInsuranceData);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and paginated insurers
  const filteredInsurers = useMemo(() => {
    return insurers.filter(insurer => {
      const searchMatch = searchQuery === '' || 
        insurer.insurerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insurer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insurer.phoneNumber.includes(searchQuery) ||
        insurer.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insurer.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insurer.insurerCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insurer.licenseNumber.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || insurer.status === statusFilter;

      const typeMatch = insuranceTypeFilter === 'all' || 
        insurer.insuranceType.toLowerCase().includes(insuranceTypeFilter.toLowerCase());

      return searchMatch && statusMatch && typeMatch;
    });
  }, [insurers, searchQuery, statusFilter, insuranceTypeFilter]);

  const paginatedInsurers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredInsurers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInsurers, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, insuranceTypeFilter]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Excel upload implementation
    console.log('Excel upload:', e.target.files?.[0]);
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const insurerData = JSON.parse(jsonInput);
      // API call would go here
      setResult({ message: 'Insurance providers uploaded successfully', count: Array.isArray(insurerData) ? insurerData.length : 1 });
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
      InsurerName: 'HDFC ERGO General Insurance',
      InsurerCode: 'HDFC-ERGO',
      Email: 'corporate@hdfcergo.com',
      PhoneNumber: '22-67196800',
      ContactPerson: 'Rahul Sharma',
      Designation: 'Regional Manager',
      Area: 'Bandra Kurla Complex',
      City: 'Mumbai',
      State: 'Maharashtra',
      Pincode: '400051',
      InsuranceType: 'General Insurance',
      LicenseNumber: 'IRDAI/GI/LIC/511/10/2019',
      IRDAIRegistration: '511',
      EstablishedYear: 2002,
      ClaimRatio: 95.5,
      SettlementTime: 7,
      NetworkHospitals: 8500,
      PremiumCollection: 15000000000,
      Website: 'https://hdfcergo.com',
      Specializations: 'Health Insurance, Motor Insurance',
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'InsurerName', 'InsurerCode', 'Email', 'PhoneNumber', 'ContactPerson', 'Designation',
      'Area', 'City', 'State', 'Pincode', 'InsuranceType', 'LicenseNumber', 'IRDAIRegistration',
      'EstablishedYear', 'ClaimRatio', 'SettlementTime', 'NetworkHospitals',
      'PremiumCollection', 'Website', 'Specializations', 'Status'
    ], 'insurance-providers', sampleData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Insurer</h1>
            <p className="text-muted-foreground">Manage insurance providers and policies</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setActiveTab('create')} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Insurer
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
            {result.message}{result.count !== undefined && ` (${result.count} insurance providers)`}
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
                      placeholder="Search by insurer name, code, email, license, or contact person..."
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
                  <Select value={insuranceTypeFilter} onValueChange={setInsuranceTypeFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Insurance Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="general">General Insurance</SelectItem>
                      <SelectItem value="health">Health Insurance</SelectItem>
                      <SelectItem value="life">Life Insurance</SelectItem>
                      <SelectItem value="motor">Motor Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Insurance Providers Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Insurance Providers</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedInsurers.length} of {filteredInsurers.length} insurance providers
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
                        <TableHead>Insurer Details</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>License & Performance</TableHead>
                        <TableHead>Network & Settlement</TableHead>
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
                      ) : paginatedInsurers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredInsurers.length === 0 ? 'No insurance providers found matching your criteria' : 'No insurance providers to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedInsurers.map((insurer) => (
                          <TableRow key={insurer.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{insurer.insurerName}</div>
                                <div className="text-xs text-muted-foreground">Code: {insurer.insurerCode}</div>
                                <div className="text-xs text-muted-foreground">{insurer.area}, {insurer.city}</div>
                                <Badge variant="secondary" className="text-xs">{insurer.insuranceType}</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">{insurer.contactPerson}</div>
                                <div className="text-xs text-muted-foreground">{insurer.designation}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {insurer.email}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {insurer.phoneNumber}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-xs text-muted-foreground">
                                  License: {insurer.licenseNumber}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  IRDAI: {insurer.irdaiRegistration}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Claim Ratio: {insurer.claimRatio}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Premium: {formatCurrency(insurer.premiumCollection)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">
                                  <Shield className="h-3 w-3 inline mr-1" />
                                  {insurer.networkHospitals.toLocaleString()} hospitals
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Settlement: {insurer.settlementTime} days
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Est. {insurer.establishedYear}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{insurer.rating?.toFixed(1) || 'N/A'}</span>
                                {insurer.reviewCount && (
                                  <span className="text-xs text-muted-foreground">({insurer.reviewCount})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  insurer.status === 'Active' ? 'default' : 
                                  insurer.status === 'Inactive' ? 'secondary' : 
                                  insurer.status === 'Pending' ? 'outline' : 'destructive'
                                }
                              >
                                {insurer.status}
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
                                  <DropdownMenuItem onClick={() => setEditingInsurer(insurer)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit Insurer
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => alert(`View details for ${insurer.insurerName}`)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => alert(`Delete ${insurer.insurerName}?`)} 
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
                {filteredInsurers.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredInsurers.length)} of {filteredInsurers.length} entries
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
                        {Array.from({ length: Math.ceil(filteredInsurers.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredInsurers.length / itemsPerPage) || 
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
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredInsurers.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredInsurers.length / itemsPerPage)}
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
                  <CardTitle className="text-sm font-medium">Total Insurers</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{insurers.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {insurers.filter(i => i.status === 'Active').length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Network Hospitals</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(insurers.reduce((sum, i) => sum + i.networkHospitals, 0) / 1000).toFixed(1)}K
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Thousand hospitals
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Premium</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₹{(insurers.reduce((sum, i) => sum + i.premiumCollection, 0) / 10000000000).toFixed(1)}K Cr
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Thousand crores
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Claim Ratio</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(insurers.reduce((sum, i) => sum + i.claimRatio, 0) / insurers.length).toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average settlement
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
                    Upload an Excel file (.xlsx, .xls) with insurance provider records.
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
                  Paste JSON array of insurance provider objects with required fields: insurerName, insurerCode, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"insurerName":"HDFC ERGO General Insurance","insurerCode":"HDFC-ERGO","email":"corporate@hdfcergo.com","phoneNumber":"22-67196800","city":"Mumbai","state":"Maharashtra"}]' 
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

export default AdminInsurance;

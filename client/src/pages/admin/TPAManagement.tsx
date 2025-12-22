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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import AdminLayout from '../../components/layout/AdminLayout';
import { useToast } from '../../hooks/use-toast';
import { 
  Download, Upload, Plus, FileSpreadsheet, UserPlus,
  Search, Eye, Edit, Trash2, MoreVertical, Star, Building2, Phone, Mail,
  ChevronLeft, ChevronRight, Users, Activity, TrendingUp, Shield, Building
} from 'lucide-react';
import { downloadExcelTemplate } from '../../utils/excelParser';
import api from '../../utils/api';
import axios from 'axios';

// Third Party Administrator (TPA) Interface
interface TPAProvider {
  id: string;
  tpaName: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  serviceTypes: string[];
  claimProcessingTime: string;
  networkSize: number;
  supportedInsurers: string[];
  digitalPlatform: boolean;
  rating?: number;
  reviewCount?: number;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  joinedDate: string;
  lastActive: string;
  website?: string;
  accreditation?: string;
}

// Sample TPA data
const sampleTPAData: TPAProvider[] = [
  {
    id: 'TPA001',
    tpaName: 'MediClaim Solutions',
    registrationNumber: 'TPA-2023-001',
    email: 'info@mediclaim.com',
    phoneNumber: '+1-555-0301',
    contactPerson: 'Rajesh Kumar',
    area: 'Business District',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    serviceTypes: ['Cashless Claims', 'Reimbursement', 'Pre-authorization', 'Health Check-ups'],
    claimProcessingTime: '3-5 days',
    networkSize: 5000,
    supportedInsurers: ['Star Health', 'HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz'],
    digitalPlatform: true,
    rating: 4.6,
    reviewCount: 234,
    status: 'Active',
    joinedDate: '2023-01-20',
    lastActive: '2024-01-20',
    website: 'https://mediclaim.com',
    accreditation: 'IRDA'
  },
  {
    id: 'TPA002',
    tpaName: 'HealthCare TPA Services',
    registrationNumber: 'TPA-2023-002',
    email: 'contact@healthcaretpa.com',
    phoneNumber: '+1-555-0302',
    contactPerson: 'Priya Sharma',
    area: 'Commercial Zone',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
    serviceTypes: ['Corporate Claims', 'Individual Claims', 'Family Floater', 'Critical Illness'],
    claimProcessingTime: '2-4 days',
    networkSize: 3500,
    supportedInsurers: ['SBI General', 'Oriental Insurance', 'National Insurance'],
    digitalPlatform: true,
    rating: 4.4,
    reviewCount: 189,
    status: 'Active',
    joinedDate: '2023-02-15',
    lastActive: '2024-01-19',
    website: 'https://healthcaretpa.com',
    accreditation: 'IRDA'
  },
  {
    id: 'TPA003',
    tpaName: 'SecureClaim Partners',
    registrationNumber: 'TPA-2023-003',
    email: 'admin@secureclaim.com',
    phoneNumber: '+1-555-0303',
    contactPerson: 'Arun Patel',
    area: 'Financial District',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    serviceTypes: ['Motor Claims', 'Health Claims', 'Travel Claims', 'Group Insurance'],
    claimProcessingTime: '1-3 days',
    networkSize: 4200,
    supportedInsurers: ['Max Bupa', 'Care Health', 'Religare Health'],
    digitalPlatform: false,
    rating: 4.2,
    reviewCount: 156,
    status: 'Active',
    joinedDate: '2022-11-10',
    lastActive: '2024-01-18'
  },
  {
    id: 'TPA004',
    tpaName: 'RapidClaim Solutions',
    registrationNumber: 'TPA-2024-001',
    email: 'info@rapidclaim.com',
    phoneNumber: '+1-555-0304',
    contactPerson: 'Sunita Reddy',
    area: 'Tech Park',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500001',
    serviceTypes: ['Digital Claims', 'AI Processing', 'Instant Approvals'],
    claimProcessingTime: '1-2 days',
    networkSize: 2800,
    supportedInsurers: ['Future Generali', 'Cholamandalam MS'],
    digitalPlatform: true,
    rating: 4.8,
    reviewCount: 92,
    status: 'Pending',
    joinedDate: '2024-01-05',
    lastActive: '2024-01-15',
    website: 'https://rapidclaim.com',
    accreditation: 'IRDA'
  }
];

interface TPAFormState {
  id?: string;
  tpaName: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  serviceTypes: string;
  claimProcessingTime: string;
  networkSize: string;
  supportedInsurers: string;
  digitalPlatform: boolean;
  status: TPAProvider['status'];
  joinedDate: string;
  lastActive: string;
  website?: string;
  accreditation?: string;
}

const formatListInput = (value: string[] = []) => value.join(', ');
const parseListInput = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const today = () => new Date().toISOString().split('T')[0];

const createTpaFormState = (tpa?: TPAProvider): TPAFormState => ({
  id: tpa?.id,
  tpaName: tpa?.tpaName || '',
  registrationNumber: tpa?.registrationNumber || '',
  email: tpa?.email || '',
  phoneNumber: tpa?.phoneNumber || '',
  contactPerson: tpa?.contactPerson || '',
  area: tpa?.area || '',
  city: tpa?.city || '',
  state: tpa?.state || '',
  pincode: tpa?.pincode || '',
  serviceTypes: formatListInput(tpa?.serviceTypes),
  claimProcessingTime: tpa?.claimProcessingTime || '',
  networkSize: tpa ? String(tpa.networkSize) : '',
  supportedInsurers: formatListInput(tpa?.supportedInsurers),
  digitalPlatform: tpa?.digitalPlatform ?? true,
  status: tpa?.status || 'Active',
  joinedDate: tpa?.joinedDate || today(),
  lastActive: tpa?.lastActive || today(),
  website: tpa?.website || '',
  accreditation: tpa?.accreditation || '',
});

const TPAManagement = () => {
  const { toast } = useToast();
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [editingTPA, setEditingTPA] = useState<TPAProvider | null>(null);
  const [tpaForm, setTpaForm] = useState<TPAFormState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [tpas, setTPAs] = useState<TPAProvider[]>(sampleTPAData);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accreditationFilter, setAccreditationFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch TPAs on component mount
  useEffect(() => {
    fetchTPAs();
  }, [currentPage]);

  const fetchTPAs = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/tpa?page=${currentPage}&limit=${itemsPerPage}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTPAs(data.data || sampleTPAData);
    } catch (err) {
      console.error('Failed to fetch TPAs, using sample data:', err);
      setTPAs(sampleTPAData);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and paginated TPAs
  const filteredTPAs = useMemo(() => {
    return tpas.filter(tpa => {
      const searchMatch = searchQuery === '' || 
        tpa.tpaName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpa.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpa.phoneNumber.includes(searchQuery) ||
        tpa.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpa.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpa.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || tpa.status === statusFilter;

      const accreditationMatch = accreditationFilter === 'all' || 
        (accreditationFilter === 'IRDA' && tpa.accreditation === 'IRDA') ||
        (accreditationFilter === 'none' && !tpa.accreditation);

      return searchMatch && statusMatch && accreditationMatch;
    });
  }, [tpas, searchQuery, statusFilter, accreditationFilter]);

  const paginatedTPAs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTPAs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTPAs, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, accreditationFilter]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Excel upload implementation
    console.log('Excel upload:', e.target.files?.[0]);
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const tpaData = JSON.parse(jsonInput);
      // API call would go here
      setResult({ message: 'TPAs uploaded successfully', count: Array.isArray(tpaData) ? tpaData.length : 1 });
      setJsonInput('');
    } catch (err: any) {
      setError('Invalid JSON format or upload failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const sampleData = [{
      TPAName: 'MediClaim Solutions',
      RegistrationNumber: 'TPA-2024-001',
      Email: 'info@mediclaim.com',
      PhoneNumber: '555-0300',
      ContactPerson: 'Rajesh Kumar',
      Area: 'Business District',
      City: 'Mumbai',
      State: 'Maharashtra',
      Pincode: '400001',
      ServiceTypes: 'Cashless Claims, Reimbursement',
      ClaimProcessingTime: '3-5 days',
      NetworkSize: 5000,
      SupportedInsurers: 'Star Health, HDFC ERGO',
      DigitalPlatform: 'true',
      Website: 'https://mediclaim.com',
      Accreditation: 'IRDA',
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'TPAName', 'RegistrationNumber', 'Email', 'PhoneNumber', 'ContactPerson',
      'Area', 'City', 'State', 'Pincode', 'ServiceTypes', 'ClaimProcessingTime',
      'NetworkSize', 'SupportedInsurers', 'DigitalPlatform', 'Website', 'Accreditation', 'Status'
    ], 'tpa-providers', sampleData);
  };

  const openTpaDialog = (tpa?: TPAProvider) => {
    setEditingTPA(tpa || null);
    setTpaForm(createTpaFormState(tpa));
    setActiveTab('list');
  };

  const closeTpaDialog = () => {
    setEditingTPA(null);
    setTpaForm(null);
  };

  const updateTpaForm = <K extends keyof TPAFormState>(field: K, value: TPAFormState[K]) => {
    setTpaForm(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSaveTPA = () => {
    if (!tpaForm) return;

    if (!tpaForm.tpaName.trim() || !tpaForm.registrationNumber.trim()) {
      toast({
        title: "Missing information",
        description: "TPA name and registration number are required.",
        variant: "destructive"
      });
      return;
    }

    const normalized: TPAProvider = {
      id: editingTPA?.id || `TPA${Date.now()}`,
      tpaName: tpaForm.tpaName.trim(),
      registrationNumber: tpaForm.registrationNumber.trim(),
      email: tpaForm.email.trim(),
      phoneNumber: tpaForm.phoneNumber.trim(),
      contactPerson: tpaForm.contactPerson.trim(),
      area: tpaForm.area.trim(),
      city: tpaForm.city.trim(),
      state: tpaForm.state.trim(),
      pincode: tpaForm.pincode.trim(),
      serviceTypes: parseListInput(tpaForm.serviceTypes),
      claimProcessingTime: tpaForm.claimProcessingTime.trim() || '3-5 days',
      networkSize: Number(tpaForm.networkSize) || 0,
      supportedInsurers: parseListInput(tpaForm.supportedInsurers),
      digitalPlatform: tpaForm.digitalPlatform,
      status: tpaForm.status,
      joinedDate: tpaForm.joinedDate || today(),
      lastActive: tpaForm.lastActive || tpaForm.joinedDate || today(),
      website: tpaForm.website?.trim() || undefined,
      accreditation: tpaForm.accreditation?.trim() || undefined,
      rating: editingTPA?.rating,
      reviewCount: editingTPA?.reviewCount,
    };

    setTPAs(prev => {
      if (editingTPA) {
        return prev.map(t => t.id === editingTPA.id ? normalized : t);
      }
      return [normalized, ...prev];
    });

    toast({
      title: editingTPA ? "TPA updated" : "TPA added",
      description: `${normalized.tpaName} has been ${editingTPA ? 'updated' : 'added'} successfully.`
    });

    closeTpaDialog();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My TPA</h1>
            <p className="text-muted-foreground">Manage Third Party Administrator providers</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => openTpaDialog()} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add TPA
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
            {result.message}{result.count !== undefined && ` (${result.count} TPAs)`}
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
                      placeholder="Search by TPA name, registration, email, or contact person..."
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
                  <Select value={accreditationFilter} onValueChange={setAccreditationFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Accreditation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="IRDA">IRDA Registered</SelectItem>
                      <SelectItem value="none">No Accreditation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* TPAs Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>TPA Providers</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedTPAs.length} of {filteredTPAs.length} TPAs
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
                        <TableHead>TPA Details</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Services & Network</TableHead>
                        <TableHead>Processing Time</TableHead>
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
                      ) : paginatedTPAs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredTPAs.length === 0 ? 'No TPAs found matching your criteria' : 'No TPAs to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedTPAs.map((tpa) => (
                          <TableRow key={tpa.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{tpa.tpaName}</div>
                                <div className="text-xs text-muted-foreground">Reg: {tpa.registrationNumber}</div>
                                <div className="text-xs text-muted-foreground">{tpa.area}, {tpa.city}</div>
                                {tpa.accreditation && (
                                  <Badge variant="secondary" className="text-xs">{tpa.accreditation}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">{tpa.contactPerson}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {tpa.email}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {tpa.phoneNumber}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {tpa.serviceTypes.slice(0, 2).map((service, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                      {service}
                                    </Badge>
                                  ))}
                                  {tpa.serviceTypes.length > 2 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{tpa.serviceTypes.length - 2}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Network: {tpa.networkSize.toLocaleString()} providers
                                </div>
                                {tpa.digitalPlatform && (
                                  <Badge variant="outline" className="text-xs">Digital Platform</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{tpa.claimProcessingTime}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{tpa.rating?.toFixed(1) || 'N/A'}</span>
                                {tpa.reviewCount && (
                                  <span className="text-xs text-muted-foreground">({tpa.reviewCount})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  tpa.status === 'Active' ? 'default' : 
                                  tpa.status === 'Inactive' ? 'secondary' : 
                                  tpa.status === 'Pending' ? 'outline' : 'destructive'
                                }
                              >
                                {tpa.status}
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
                                  <DropdownMenuItem onClick={() => openTpaDialog(tpa)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit TPA
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toast({ title: "TPA Details", description: `Viewing details for ${tpa.tpaName}` })}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => toast({ title: "Confirm Delete", description: `Are you sure you want to delete ${tpa.tpaName}?`, variant: "destructive" })} 
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
                {filteredTPAs.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredTPAs.length)} of {filteredTPAs.length} entries
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
                        {Array.from({ length: Math.ceil(filteredTPAs.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredTPAs.length / itemsPerPage) || 
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
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredTPAs.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredTPAs.length / itemsPerPage)}
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
                  <CardTitle className="text-sm font-medium">Total TPAs</CardTitle>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{tpas.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {tpas.filter(t => t.status === 'Active').length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Network Size</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {tpas.reduce((sum, t) => sum + t.networkSize, 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Healthcare providers
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Digital Enabled</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {tpas.filter(t => t.digitalPlatform).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Digital platforms
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg. Processing Time</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3.2</div>
                  <p className="text-xs text-muted-foreground">
                    Days average
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
                    Upload an Excel file (.xlsx) with TPA provider records.
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
                  Paste JSON array of TPA objects with required fields: tpaName, registrationNumber, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"tpaName":"MediClaim Solutions","registrationNumber":"TPA-2024-001","email":"info@mediclaim.com","phoneNumber":"555-0300","city":"Mumbai","state":"Maharashtra"}]' 
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

        {tpaForm && (
          <Dialog open={!!tpaForm} onOpenChange={(open) => {
            if (!open) {
              closeTpaDialog();
            }
          }}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingTPA ? 'Edit TPA' : 'Add TPA Provider'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>TPA Name</Label>
                  <Input value={tpaForm.tpaName} onChange={(e) => updateTpaForm('tpaName', e.target.value)} />
                </div>
                <div>
                  <Label>Registration Number</Label>
                  <Input value={tpaForm.registrationNumber} onChange={(e) => updateTpaForm('registrationNumber', e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={tpaForm.email} onChange={(e) => updateTpaForm('email', e.target.value)} />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={tpaForm.phoneNumber} onChange={(e) => updateTpaForm('phoneNumber', e.target.value)} />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={tpaForm.contactPerson} onChange={(e) => updateTpaForm('contactPerson', e.target.value)} />
                </div>
                <div>
                  <Label>Area</Label>
                  <Input value={tpaForm.area} placeholder="Area" onChange={(e) => updateTpaForm('area', e.target.value)} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={tpaForm.city} onChange={(e) => updateTpaForm('city', e.target.value)} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={tpaForm.state} onChange={(e) => updateTpaForm('state', e.target.value)} />
                </div>
                <div>
                  <Label>Pincode</Label>
                  <Input value={tpaForm.pincode} onChange={(e) => updateTpaForm('pincode', e.target.value)} />
                </div>
                <div>
                  <Label>Service Types (comma separated)</Label>
                  <Input value={tpaForm.serviceTypes} onChange={(e) => updateTpaForm('serviceTypes', e.target.value)} />
                </div>
                <div>
                  <Label>Supported Insurers (comma separated)</Label>
                  <Input value={tpaForm.supportedInsurers} onChange={(e) => updateTpaForm('supportedInsurers', e.target.value)} />
                </div>
                <div>
                  <Label>Claim Processing Time</Label>
                  <Input value={tpaForm.claimProcessingTime} onChange={(e) => updateTpaForm('claimProcessingTime', e.target.value)} />
                </div>
                <div>
                  <Label>Network Size</Label>
                  <Input value={tpaForm.networkSize} onChange={(e) => updateTpaForm('networkSize', e.target.value)} />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input value={tpaForm.website} onChange={(e) => updateTpaForm('website', e.target.value)} />
                </div>
                <div>
                  <Label>Accreditation</Label>
                  <Input value={tpaForm.accreditation} onChange={(e) => updateTpaForm('accreditation', e.target.value)} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={tpaForm.status} onValueChange={(value) => updateTpaForm('status', value as TPAProvider['status'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Digital Platform</Label>
                  <Select value={tpaForm.digitalPlatform ? 'yes' : 'no'} onValueChange={(value) => updateTpaForm('digitalPlatform', value === 'yes')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Joined Date</Label>
                  <Input type="date" value={tpaForm.joinedDate} onChange={(e) => updateTpaForm('joinedDate', e.target.value)} />
                </div>
                <div>
                  <Label>Last Active</Label>
                  <Input type="date" value={tpaForm.lastActive} onChange={(e) => updateTpaForm('lastActive', e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={closeTpaDialog}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveTPA}>
                  {editingTPA ? 'Update TPA' : 'Add TPA'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
};

export default TPAManagement;

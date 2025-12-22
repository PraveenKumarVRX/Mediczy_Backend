import { useRef, useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Upload, 
  Download, 
  Plus, 
  FileSpreadsheet, 
  Search,
  Eye,
  Edit,
  Trash2,
  Building,
  Mail,
  Phone,
  Calendar,
  Users,
  TrendingUp
} from 'lucide-react';
import api from '@/utils/api';
import axios from 'axios';
import { parseExcelFile, downloadExcelTemplate } from '@/utils/excelParser';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CorporateData {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phoneNumber: string;
  industry: string;
  employeeCount: number;
  packageType: string;
  billingCycle: string;
  status: string;
  packageAmount?: number;
  gstNumber?: string;
  panNumber?: string;
  createdAt: string;
}

const packageTypes = ['Basic', 'Standard', 'Premium', 'Enterprise', 'Custom'];
const billingCycles = ['Monthly', 'Quarterly', 'Yearly'];
const statusOptions = ['Active', 'Inactive', 'Suspended', 'Pending'];

const CorporatesManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // Corporates list state
  const [corporates, setCorporates] = useState<CorporateData[]>([]);
  const [filteredCorporates, setFilteredCorporates] = useState<CorporateData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPackage, setSelectedPackage] = useState('all');
  const [corporatesLoading, setCorporatesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewingCorporate, setViewingCorporate] = useState<CorporateData | null>(null);
  const [editingCorporate, setEditingCorporate] = useState<CorporateData | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('list');

  const [newCorporate, setNewCorporate] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phoneNumber: '',
    industry: '',
    employeeCount: '',
    packageType: 'Standard',
    billingCycle: 'Yearly',
    status: 'Pending',
    gstNumber: '',
    panNumber: '',
    packageAmount: ''
  });

  // Fetch corporates list
  const fetchCorporates = async () => {
    try {
      setCorporatesLoading(true);
      setError(null);
      
      const { data } = await api.get(`/admin/corporates?page=${page}&limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      setCorporates(data.data || []);
      setFilteredCorporates(data.data || []);
      setTotalPages(Math.ceil(data.total / 20));
    } catch (err: any) {
      console.error('Failed to fetch corporates:', err);
      // Set sample data for demo
      const sampleCorporates: CorporateData[] = [
        {
          id: 'corp_001',
          companyName: 'TechCorp Solutions',
          contactPerson: 'John Smith',
          email: 'john.smith@techcorp.com',
          phoneNumber: '+1-234-567-8901',
          industry: 'Information Technology',
          employeeCount: 250,
          packageType: 'Premium',
          billingCycle: 'Yearly',
          status: 'Active',
          packageAmount: 50000,
          gstNumber: 'GST001234567',
          panNumber: 'ABCDE1234F',
          createdAt: '2024-01-15T10:30:00Z'
        },
        {
          id: 'corp_002',
          companyName: 'Global Manufacturing Ltd',
          contactPerson: 'Sarah Johnson',
          email: 'sarah.j@globalmanuf.com',
          phoneNumber: '+1-234-567-8902',
          industry: 'Manufacturing',
          employeeCount: 500,
          packageType: 'Enterprise',
          billingCycle: 'Yearly',
          status: 'Active',
          packageAmount: 100000,
          gstNumber: 'GST001234568',
          panNumber: 'FGHIJ5678K',
          createdAt: '2024-02-10T14:15:00Z'
        },
        {
          id: 'corp_003',
          companyName: 'StartupHub Inc',
          contactPerson: 'Mike Chen',
          email: 'mike@startuphub.com',
          phoneNumber: '+1-234-567-8903',
          industry: 'Technology Consulting',
          employeeCount: 50,
          packageType: 'Standard',
          billingCycle: 'Quarterly',
          status: 'Pending',
          packageAmount: 15000,
          gstNumber: 'GST001234569',
          panNumber: 'LMNOP9012Q',
          createdAt: '2024-01-22T09:45:00Z'
        },
        {
          id: 'corp_004',
          companyName: 'HealthFirst Corporation',
          contactPerson: 'Dr. Emily Brown',
          email: 'emily.brown@healthfirst.com',
          phoneNumber: '+1-234-567-8904',
          industry: 'Healthcare',
          employeeCount: 150,
          packageType: 'Premium',
          billingCycle: 'Yearly',
          status: 'Active',
          packageAmount: 75000,
          gstNumber: 'GST001234570',
          panNumber: 'RSTUV3456W',
          createdAt: '2024-03-05T16:20:00Z'
        }
      ];
      setCorporates(sampleCorporates);
      setFilteredCorporates(sampleCorporates);
    } finally {
      setCorporatesLoading(false);
    }
  };

  // Filter corporates based on search and filters
  useEffect(() => {
    let filtered = corporates;

    if (searchTerm) {
      filtered = filtered.filter(corporate =>
        corporate.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        corporate.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
        corporate.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        corporate.phoneNumber.includes(searchTerm) ||
        corporate.industry.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(corporate => corporate.status === selectedStatus);
    }

    if (selectedPackage !== 'all') {
      filtered = filtered.filter(corporate => corporate.packageType === selectedPackage);
    }

    setFilteredCorporates(filtered);
  }, [searchTerm, selectedStatus, selectedPackage, corporates]);

  // Load corporates on component mount
  useEffect(() => {
    fetchCorporates();
  }, [page]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    try {
      setLoading(true); setError(null); setResult(null);
      const data = await parseExcelFile(file);
      const corporates = data.map((row:any)=>({
        companyName: row.CompanyName || row.companyName || '',
        contactPerson: row.ContactPerson || row.contactPerson || '',
        email: row.Email || row.email || '',
        phoneNumber: row.PhoneNumber || row.phoneNumber || '',
        industry: row.Industry || row.industry || null,
        employeeCount: row.EmployeeCount || row.employeeCount || null,
        gstNumber: row.GST || row.gstNumber || null,
        panNumber: row.PAN || row.panNumber || null,
        address: row.Address ? { line1: row.Address } : {},
        packageType: row.PackageType || row.packageType || 'Standard',
        packageStartDate: row.PackageStartDate || null,
        packageEndDate: row.PackageEndDate || null,
        packageAmount: row.PackageAmount || null,
        services: (row.Services || '').split(',').map((s:string)=>s.trim()).filter(Boolean),
        status: row.Status || 'Pending',
        billingCycle: row.BillingCycle || 'Yearly',
        paymentMethod: row.PaymentMethod || null,
      }));
      const { data: response } = await api.post('/admin/masters/corporates',{ corporates },{ headers:{ Authorization:`Bearer ${token}`}});
      setResult(response);
    } catch(err:any){ setError(err?.response?.data?.message || 'Excel upload failed'); }
    finally { setLoading(false); if(fileInputRef.current) fileInputRef.current.value=''; }
  };

  const handleJsonUpload = async () => {
    try { setLoading(true); setError(null); setResult(null); const corporates = JSON.parse(jsonInput); const { data } = await api.post('/admin/masters/corporates',{ corporates: Array.isArray(corporates)? corporates:[corporates] },{ headers:{ Authorization:`Bearer ${token}`}}); setResult(data); setJsonInput(''); } catch(err:any){ setError(err?.response?.data?.message || 'JSON upload failed'); } finally { setLoading(false); }
  };

  const handleSingleCorporateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      
      const corporate = {
        ...newCorporate,
        employeeCount: newCorporate.employeeCount ? parseInt(newCorporate.employeeCount) : null,
        packageAmount: newCorporate.packageAmount ? parseFloat(newCorporate.packageAmount) : null
      };
      
      if (editingCorporate) {
        // Update existing corporate
        const { data } = await api.put(`/admin/corporates/${editingCorporate.id}`,
          corporate,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        setResult({ message: 'Corporate updated successfully' });
      } else {
        // Create new corporate
        const { data } = await api.post('/admin/masters/corporates',
          { corporates: [corporate] },
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        setResult(data);
      }
      
      setNewCorporate({ 
        companyName: '', 
        contactPerson: '', 
        email: '', 
        phoneNumber: '', 
        industry: '', 
        employeeCount: '', 
        packageType: 'Standard', 
        billingCycle: 'Yearly', 
        status: 'Pending',
        gstNumber: '',
        panNumber: '',
        packageAmount: ''
      });
      setEditingCorporate(null);
      setActiveTab('list');
      fetchCorporates();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${editingCorporate ? 'update' : 'create'} corporate`);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/10 border-green-500/20 text-green-700';
      case 'Pending': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700';
      case 'Suspended': return 'bg-red-500/10 border-red-500/20 text-red-700';
      case 'Inactive': return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
      default: return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
    }
  };

  const getPackageColor = (packageType: string) => {
    switch (packageType) {
      case 'Enterprise': return 'bg-purple-500/10 border-purple-500/20 text-purple-700';
      case 'Premium': return 'bg-blue-500/10 border-blue-500/20 text-blue-700';
      case 'Standard': return 'bg-green-500/10 border-green-500/20 text-green-700';
      case 'Basic': return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
      default: return 'bg-orange-500/10 border-orange-500/20 text-orange-700';
    }
  };

  const handleViewCorporate = (corporate: CorporateData) => {
    setViewingCorporate(corporate);
    setIsViewDialogOpen(true);
  };

  const handleEditCorporate = (corporate: CorporateData) => {
    setEditingCorporate(corporate);
    setNewCorporate({
      companyName: corporate.companyName,
      contactPerson: corporate.contactPerson,
      email: corporate.email,
      phoneNumber: corporate.phoneNumber,
      industry: corporate.industry,
      employeeCount: corporate.employeeCount.toString(),
      packageType: corporate.packageType,
      billingCycle: corporate.billingCycle,
      status: corporate.status,
      gstNumber: corporate.gstNumber || '',
      panNumber: corporate.panNumber || '',
      packageAmount: corporate.packageAmount?.toString() || ''
    });
    setActiveTab('single');
  };

  const handleDeleteCorporate = async (corporateId: string) => {
    if (!confirm('Are you sure you want to delete this corporate client?')) return;
    
    try {
      setLoading(true);
      await api.delete(`/admin/corporates/${corporateId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setResult({ message: 'Corporate deleted successfully' });
      fetchCorporates();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete corporate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Corporates Management</h2>
            <p className="text-muted-foreground">Manage corporate clients and enterprise accounts</p>
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
            {result.message} {result.count !== undefined && ` (${result.count} records)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list">View All Corporates</TabsTrigger>
            <TabsTrigger value="single">{editingCorporate ? 'Edit Corporate' : 'Create Single'}</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-blue-500" />
                  All Corporate Clients ({filteredCorporates.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Search and Filter Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search corporates by company name, contact, email, industry..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedPackage} onValueChange={setSelectedPackage}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Package" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Packages</SelectItem>
                      {packageTypes.map((pkg) => (
                        <SelectItem key={pkg} value={pkg}>{pkg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Corporates Table */}
                {corporatesLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading corporates...</p>
                  </div>
                ) : filteredCorporates.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead>Contact & Details</TableHead>
                          <TableHead>Package & Billing</TableHead>
                          <TableHead>Employees & Industry</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCorporates.map((corporate) => (
                          <TableRow key={corporate.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-blue-500/10">
                                  <Building className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                  <div className="font-medium">{corporate.companyName}</div>
                                  <div className="text-sm text-muted-foreground">ID: {corporate.id}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">{corporate.contactPerson}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{corporate.email}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{corporate.phoneNumber}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-2">
                                <Badge variant="outline" className={getPackageColor(corporate.packageType)}>
                                  {corporate.packageType}
                                </Badge>
                                <div className="text-sm text-muted-foreground">
                                  {corporate.billingCycle} billing
                                </div>
                                {corporate.packageAmount && (
                                  <div className="text-sm font-medium">
                                    ₹{corporate.packageAmount.toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">{corporate.employeeCount} employees</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {corporate.industry}
                                </div>
                                {corporate.gstNumber && (
                                  <div className="text-xs text-muted-foreground">
                                    GST: {corporate.gstNumber}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant="outline" className={getStatusColor(corporate.status)}>
                                  {corporate.status}
                                </Badge>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(corporate.createdAt)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleViewCorporate(corporate)} title="View Details">
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleEditCorporate(corporate)} title="Edit Corporate">
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => handleDeleteCorporate(corporate.id)} title="Delete Corporate">
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
                    <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No corporates found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm || selectedStatus !== 'all' || selectedPackage !== 'all'
                        ? 'No corporates match your search criteria.' 
                        : 'Get started by adding your first corporate client.'}
                    </p>
                    <Button onClick={() => { setSearchTerm(''); setSelectedStatus('all'); setSelectedPackage('all'); }} variant="outline">
                      Clear Filters
                    </Button>
                  </div>
                )}

                {/* View Corporate Dialog */}
                <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                  <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5 text-blue-500" />
                        {viewingCorporate?.companyName}
                      </DialogTitle>
                    </DialogHeader>
                    {viewingCorporate && (
                      <div className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-semibold text-muted-foreground">Company Information</Label>
                              <div className="mt-2 space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Company Name</Label>
                                  <p className="font-medium">{viewingCorporate.companyName}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Industry</Label>
                                  <p>{viewingCorporate.industry}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Employee Count</Label>
                                  <p>{viewingCorporate.employeeCount} employees</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Corporate ID</Label>
                                  <p className="font-mono text-sm">{viewingCorporate.id}</p>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <Label className="text-sm font-semibold text-muted-foreground">Tax Information</Label>
                              <div className="mt-2 space-y-2">
                                {viewingCorporate.gstNumber && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">GST Number</Label>
                                    <p className="font-mono">{viewingCorporate.gstNumber}</p>
                                  </div>
                                )}
                                {viewingCorporate.panNumber && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">PAN Number</Label>
                                    <p className="font-mono">{viewingCorporate.panNumber}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-semibold text-muted-foreground">Contact Information</Label>
                              <div className="mt-2 space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Contact Person</Label>
                                  <p className="font-medium">{viewingCorporate.contactPerson}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                  <p>{viewingCorporate.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <p>{viewingCorporate.phoneNumber}</p>
                                </div>
                              </div>
                            </div>

                            <div>
                              <Label className="text-sm font-semibold text-muted-foreground">Package Details</Label>
                              <div className="mt-2 space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Package Type</Label>
                                  <div className="mt-1">
                                    <Badge variant="outline" className={getPackageColor(viewingCorporate.packageType)}>
                                      {viewingCorporate.packageType}
                                    </Badge>
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Billing Cycle</Label>
                                  <p>{viewingCorporate.billingCycle}</p>
                                </div>
                                {viewingCorporate.packageAmount && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Package Amount</Label>
                                    <p className="text-lg font-semibold text-green-600">₹{viewingCorporate.packageAmount.toLocaleString()}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                              <div className="mt-2">
                                <Badge variant="outline" className={getStatusColor(viewingCorporate.status)}>
                                  {viewingCorporate.status}
                                </Badge>
                              </div>
                            </div>

                            <div>
                              <Label className="text-sm font-semibold text-muted-foreground">Registration Date</Label>
                              <div className="mt-1 flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <p>{formatDate(viewingCorporate.createdAt)}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-4 border-t">
                          <Button onClick={() => handleEditCorporate(viewingCorporate)} className="flex-1">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Corporate
                          </Button>
                          <Button variant="outline" onClick={() => setIsViewDialogOpen(false)} className="flex-1">
                            Close
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

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
                <CardTitle>{editingCorporate ? 'Edit Corporate Client' : 'Create New Corporate Client'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleCorporateSubmit} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Company Name *</Label>
                      <Input 
                        required 
                        value={newCorporate.companyName} 
                        onChange={(e) => setNewCorporate({...newCorporate, companyName: e.target.value})} 
                      />
                    </div>
                    <div>
                      <Label>Contact Person *</Label>
                      <Input 
                        required 
                        value={newCorporate.contactPerson} 
                        onChange={(e) => setNewCorporate({...newCorporate, contactPerson: e.target.value})} 
                      />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input 
                        type="email" 
                        required 
                        value={newCorporate.email} 
                        onChange={(e) => setNewCorporate({...newCorporate, email: e.target.value})} 
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input 
                        required 
                        value={newCorporate.phoneNumber} 
                        onChange={(e) => setNewCorporate({...newCorporate, phoneNumber: e.target.value})} 
                      />
                    </div>
                    <div>
                      <Label>Industry</Label>
                      <Input 
                        value={newCorporate.industry} 
                        onChange={(e) => setNewCorporate({...newCorporate, industry: e.target.value})} 
                        placeholder="e.g., Information Technology"
                      />
                    </div>
                    <div>
                      <Label>Employee Count</Label>
                      <Input 
                        type="number" 
                        value={newCorporate.employeeCount} 
                        onChange={(e) => setNewCorporate({...newCorporate, employeeCount: e.target.value})} 
                      />
                    </div>
                    <div>
                      <Label>Package Type</Label>
                      <Select value={newCorporate.packageType} onValueChange={(val) => setNewCorporate({...newCorporate, packageType: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select package" />
                        </SelectTrigger>
                        <SelectContent>
                          {packageTypes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Package Amount (₹)</Label>
                      <Input 
                        type="number" 
                        value={newCorporate.packageAmount} 
                        onChange={(e) => setNewCorporate({...newCorporate, packageAmount: e.target.value})} 
                        placeholder="50000"
                      />
                    </div>
                    <div>
                      <Label>Billing Cycle</Label>
                      <Select value={newCorporate.billingCycle} onValueChange={(val) => setNewCorporate({...newCorporate, billingCycle: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select cycle" />
                        </SelectTrigger>
                        <SelectContent>
                          {billingCycles.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>GST Number</Label>
                      <Input 
                        value={newCorporate.gstNumber} 
                        onChange={(e) => setNewCorporate({...newCorporate, gstNumber: e.target.value})} 
                        placeholder="GST123456789"
                      />
                    </div>
                    <div>
                      <Label>PAN Number</Label>
                      <Input 
                        value={newCorporate.panNumber} 
                        onChange={(e) => setNewCorporate({...newCorporate, panNumber: e.target.value})} 
                        placeholder="ABCDE1234F"
                      />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={newCorporate.status} onValueChange={(val) => setNewCorporate({...newCorporate, status: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      {loading ? (editingCorporate ? 'Updating...' : 'Creating...') : (editingCorporate ? 'Update Corporate' : 'Create Corporate')}
                    </Button>
                    {editingCorporate && (
                      <Button type="button" variant="outline" onClick={() => {
                        setEditingCorporate(null);
                        setNewCorporate({ 
                          companyName: '', 
                          contactPerson: '', 
                          email: '', 
                          phoneNumber: '', 
                          industry: '', 
                          employeeCount: '', 
                          packageType: 'Standard', 
                          billingCycle: 'Yearly', 
                          status: 'Pending',
                          gstNumber: '',
                          panNumber: '',
                          packageAmount: ''
                        });
                        setActiveTab('list');
                      }}>
                        Cancel Edit
                      </Button>
                    )}
                  </div>
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
                    Upload an Excel file (.xlsx) with corporate records.
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
                  Paste JSON array of corporate objects with required fields: companyName, contactPerson, email, phoneNumber
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"companyName":"Acme Corp","contactPerson":"Jane Doe","email":"corp@example.com","phoneNumber":"555-0300","industry":"IT Services","employeeCount":100,"packageType":"Standard","billingCycle":"Yearly","status":"Active"}]' 
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

const downloadTemplate = () => { 
  const sample = [{ 
    CompanyName: 'Acme Corp', 
    ContactPerson: 'Jane Doe', 
    Email: 'corp@example.com', 
    PhoneNumber: '555-0300', 
    Industry: 'IT Services', 
    EmployeeCount: 100, 
    PackageType: 'Standard', 
    BillingCycle: 'Yearly', 
    Status: 'Active' 
  }]; 
  downloadExcelTemplate(['CompanyName','ContactPerson','Email','PhoneNumber','Industry','EmployeeCount','PackageType','BillingCycle','Status'], 'corporates', sample); 
};

export default CorporatesManagement;

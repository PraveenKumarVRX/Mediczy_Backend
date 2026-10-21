import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
  Search,
  Eye,
  Edit,
  Trash2,
  Building,
  Heart,
  Users,
  Package,
  UserCheck,
  Activity,
  CheckCircle2
} from 'lucide-react';
import api from '@/utils/api';

interface HealthCheckupPackage {
  id: string;
  corporateId: string;
  corporateName?: string;
  packageName: string;
  description: string;
  tests: string[];
  frequency: string;
  validityPeriod: string;
  costPerEmployee: number;
  maxEmployees: number;
  currentEnrolled: number;
  status: string;
  createdAt: string;
}

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  isEligible: boolean;
  enrolledPackages: string[];
}

const frequencies = ['Annual', 'Bi-Annual', 'Quarterly', 'Monthly'];
const validityPeriods = ['1 Year', '2 Years', '3 Years', 'Lifetime'];
const packageStatuses = ['Active', 'Inactive', 'Draft', 'Expired'];

const CorporateHealthPackages = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = localStorage.getItem('adminToken');

  // Packages state
  const [packages, setPackages] = useState<HealthCheckupPackage[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<HealthCheckupPackage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCorporate, setSelectedCorporate] = useState('all');

  // Employees state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isTagEmployeesDialogOpen, setIsTagEmployeesDialogOpen] = useState(false);
  const [viewingPackage, setViewingPackage] = useState<HealthCheckupPackage | null>(null);
  const [taggingPackage, setTaggingPackage] = useState<HealthCheckupPackage | null>(null);
  const [editingPackage, setEditingPackage] = useState<HealthCheckupPackage | null>(null);
  const [activeTab, setActiveTab] = useState('list');

  // Corporates list for dropdown
  const [corporates, setCorporates] = useState<{ id: string; name: string }[]>([]);

  const [newPackage, setNewPackage] = useState({
    corporateId: '',
    packageName: '',
    description: '',
    tests: '',
    frequency: 'Annual',
    validityPeriod: '1 Year',
    costPerEmployee: '',
    maxEmployees: '',
    status: 'Active'
  });

  useEffect(() => {
    fetchPackages();
    fetchCorporates();
  }, []);

  useEffect(() => {
    filterPackages();
  }, [searchTerm, selectedStatus, selectedCorporate, packages]);

  const fetchCorporates = async () => {
    try {
      const { data } = await api.get('/admin/corporates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const corporateList = (data.data || []).map((corp: any) => ({
        id: String(corp.id),
        name: corp.companyName
      }));
      setCorporates(corporateList);
    } catch (err: any) {
      setCorporates([]);
      setError(err?.response?.data?.message || 'Unable to load corporates');
    }
  };

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/health-packages', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setPackages(data.data || []);
    } catch (err: any) {
      setPackages([]);
      setError(err?.response?.data?.message || 'Unable to load health packages');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async (corporateId: string) => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/corporate-employees/${corporateId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setEmployees((data.employees || []).filter((e: any) => e.id && e.hasAssociation && String(e.status).toLowerCase() === 'active').map((e: any) => ({
        id:String(e.id),employeeId:e.user_employee_id || e.corporate_employee_id || '',
        name:[e.firstName,e.lastName].filter(Boolean).join(' '),email:e.email || '',
        department:e.department_name || '',designation:e.metadata?.designation || '',isEligible:true,enrolledPackages:[],
      })));
    } catch (err: any) {
      setEmployees([]);
      setError(err?.response?.data?.message || 'Unable to load employees');
    } finally {
      setLoading(false);
    }
  };

  const filterPackages = () => {
    let filtered = packages;

    if (searchTerm) {
      filtered = filtered.filter(pkg =>
        pkg.packageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.corporateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(pkg => pkg.status === selectedStatus);
    }

    if (selectedCorporate !== 'all') {
      filtered = filtered.filter(pkg => pkg.corporateId === selectedCorporate);
    }

    setFilteredPackages(filtered);
  };

  const handleViewPackage = (pkg: HealthCheckupPackage) => {
    setViewingPackage(pkg);
    setIsViewDialogOpen(true);
  };

  const handleEditPackage = (pkg: HealthCheckupPackage) => {
    setEditingPackage(pkg);
    setNewPackage({
      corporateId: pkg.corporateId,
      packageName: pkg.packageName,
      description: pkg.description,
      tests: pkg.tests.join(', '),
      frequency: pkg.frequency,
      validityPeriod: pkg.validityPeriod,
      costPerEmployee: pkg.costPerEmployee.toString(),
      maxEmployees: pkg.maxEmployees.toString(),
      status: pkg.status
    });
    setActiveTab('create');
  };

  const handleDeletePackage = async (packageId: string) => {
    if (!confirm('Deactivate this health package? Employees will no longer be able to make new bookings with it.')) return;
    
    try {
      setLoading(true);
      await api.delete(`/admin/health-packages/${packageId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setResult({ message: 'Health package deactivated successfully' });
      fetchPackages();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete health package');
    } finally {
      setLoading(false);
    }
  };

  const handleTagEmployees = (pkg: HealthCheckupPackage) => {
    setTaggingPackage(pkg);
    fetchEmployees(pkg.corporateId);
    setSelectedEmployees([]);
    setIsTagEmployeesDialogOpen(true);
  };

  const handleSubmitTagging = async () => {
    if (!taggingPackage || selectedEmployees.length === 0) {
      setError('Please select at least one employee');
      return;
    }

    try {
      setLoading(true);
      await api.post(`/admin/health-packages/${taggingPackage.id}/tag-employees`, {
        employeeIds: selectedEmployees
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setResult({ message: `${selectedEmployees.length} employees tagged successfully` });
      setIsTagEmployeesDialogOpen(false);
      fetchPackages();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to tag employees');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const packageData = {
        ...newPackage,
        tests: newPackage.tests.split(',').map(t => t.trim()).filter(Boolean),
        costPerEmployee: parseFloat(newPackage.costPerEmployee),
        maxEmployees: parseInt(newPackage.maxEmployees)
      };

      if (editingPackage) {
        await api.put(`/admin/health-packages/${editingPackage.id}`, packageData, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        setResult({ message: 'Health package updated successfully' });
      } else {
        await api.post('/admin/health-packages', packageData, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        setResult({ message: 'Health package created successfully' });
      }

      resetForm();
      setActiveTab('list');
      fetchPackages();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${editingPackage ? 'update' : 'create'} health package`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewPackage({
      corporateId: '',
      packageName: '',
      description: '',
      tests: '',
      frequency: 'Annual',
      validityPeriod: '1 Year',
      costPerEmployee: '',
      maxEmployees: '',
      status: 'Active'
    });
    setEditingPackage(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/10 border-green-500/20 text-green-700';
      case 'Inactive': return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
      case 'Draft': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700';
      case 'Expired': return 'bg-red-500/10 border-red-500/20 text-red-700';
      default: return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredEmployees = employees.filter(emp =>
    emp.isEligible && (
      emp.name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
      emp.department.toLowerCase().includes(employeeSearchTerm.toLowerCase())
    )
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Heart className="h-8 w-8 text-red-500" />
              Corporate Health Checkup Packages
            </h2>
            <p className="text-muted-foreground">Manage health checkup packages and tag eligible employees</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Packages</p>
                  <p className="text-3xl font-bold">{packages.length}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Packages</p>
                  <p className="text-3xl font-bold">{packages.filter(p => p.status === 'Active').length}</p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Enrolled</p>
                  <p className="text-3xl font-bold">{packages.reduce((sum, p) => sum + p.currentEnrolled, 0)}</p>
                </div>
                <UserCheck className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Capacity</p>
                  <p className="text-3xl font-bold">{packages.reduce((sum, p) => sum + p.maxEmployees, 0)}</p>
                </div>
                <Users className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">All Packages</TabsTrigger>
            <TabsTrigger value="create">{editingPackage ? 'Edit Package' : 'Create Package'}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-500" />
                  Health Checkup Packages ({filteredPackages.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search packages..."
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
                      {packageStatuses.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedCorporate} onValueChange={setSelectedCorporate}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Corporate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Corporates</SelectItem>
                      {corporates.map((corp) => (
                        <SelectItem key={corp.id} value={corp.id}>{corp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Packages Table */}
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading packages...</p>
                  </div>
                ) : filteredPackages.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Package Details</TableHead>
                          <TableHead>Corporate</TableHead>
                          <TableHead>Tests & Frequency</TableHead>
                          <TableHead>Enrollment</TableHead>
                          <TableHead>Cost</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPackages.map((pkg) => (
                          <TableRow key={pkg.id}>
                            <TableCell>
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-full bg-red-500/10">
                                  <Heart className="h-4 w-4 text-red-500" />
                                </div>
                                <div>
                                  <div className="font-medium">{pkg.packageName}</div>
                                  <div className="text-sm text-muted-foreground line-clamp-2">{pkg.description}</div>
                                  <div className="text-xs text-muted-foreground mt-1">ID: {pkg.id}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{pkg.corporateName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm font-medium">{pkg.tests.length} Tests</div>
                                <div className="text-sm text-muted-foreground">{pkg.frequency}</div>
                                <div className="text-xs text-muted-foreground">Valid: {pkg.validityPeriod}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <UserCheck className="h-4 w-4 text-green-500" />
                                  <span className="font-medium">{pkg.currentEnrolled} / {pkg.maxEmployees}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-500 h-2 rounded-full" 
                                    style={{ width: `${(pkg.currentEnrolled / pkg.maxEmployees) * 100}%` }}
                                  ></div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold text-green-600">
                                ₹{pkg.costPerEmployee.toLocaleString()}
                              </div>
                              <div className="text-xs text-muted-foreground">per employee</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getStatusColor(pkg.status)}>
                                {pkg.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0" 
                                  onClick={() => handleViewPackage(pkg)}
                                  title="View Details"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleEditPackage(pkg)}
                                  title="Edit Package"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  className="h-8 bg-blue-500 hover:bg-blue-600"
                                  onClick={() => handleTagEmployees(pkg)}
                                  title="Tag Employees"
                                >
                                  <Users className="h-3 w-3 mr-1" />
                                  Tag
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => handleDeletePackage(pkg.id)}
                                  title="Delete Package"
                                >
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
                    <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No packages found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm || selectedStatus !== 'all' || selectedCorporate !== 'all'
                        ? 'No packages match your search criteria.'
                        : 'Get started by creating your first health checkup package.'}
                    </p>
                    <Button onClick={() => setActiveTab('create')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Package
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{editingPackage ? 'Edit Health Checkup Package' : 'Create Health Checkup Package'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitPackage} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Corporate *</Label>
                      <Select 
                        value={newPackage.corporateId} 
                        onValueChange={(val) => setNewPackage({...newPackage, corporateId: val})}
                        required
                      >
                        <SelectTrigger className="bg-background text-foreground">
                          <SelectValue placeholder="Select corporate" />
                        </SelectTrigger>
                        <SelectContent>
                          {corporates.map(corp => (
                            <SelectItem key={corp.id} value={corp.id}>{corp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Package Name *</Label>
                      <Input
                        required
                        value={newPackage.packageName}
                        onChange={(e) => setNewPackage({...newPackage, packageName: e.target.value})}
                        placeholder="Executive Health Checkup"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Description *</Label>
                      <Textarea
                        required
                        value={newPackage.description}
                        onChange={(e) => setNewPackage({...newPackage, description: e.target.value})}
                        placeholder="Comprehensive health screening including..."
                        rows={3}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Tests Included * (comma-separated)</Label>
                      <Textarea
                        required
                        value={newPackage.tests}
                        onChange={(e) => setNewPackage({...newPackage, tests: e.target.value})}
                        placeholder="Complete Blood Count, Lipid Profile, ECG, Chest X-Ray"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label>Frequency *</Label>
                      <Select 
                        value={newPackage.frequency} 
                        onValueChange={(val) => setNewPackage({...newPackage, frequency: val})}
                      >
                        <SelectTrigger className="bg-background text-foreground">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          {frequencies.map(freq => (
                            <SelectItem key={freq} value={freq}>{freq}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Validity Period *</Label>
                      <Select 
                        value={newPackage.validityPeriod} 
                        onValueChange={(val) => setNewPackage({...newPackage, validityPeriod: val})}
                      >
                        <SelectTrigger className="bg-background text-foreground">
                          <SelectValue placeholder="Select validity" />
                        </SelectTrigger>
                        <SelectContent>
                          {validityPeriods.map(period => (
                            <SelectItem key={period} value={period}>{period}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Cost Per Employee (₹) *</Label>
                      <Input
                        type="number"
                        required
                        value={newPackage.costPerEmployee}
                        onChange={(e) => setNewPackage({...newPackage, costPerEmployee: e.target.value})}
                        placeholder="5000"
                      />
                    </div>
                    <div>
                      <Label>Max Employees *</Label>
                      <Input
                        type="number"
                        required
                        value={newPackage.maxEmployees}
                        onChange={(e) => setNewPackage({...newPackage, maxEmployees: e.target.value})}
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <Label>Status *</Label>
                      <Select 
                        value={newPackage.status} 
                        onValueChange={(val) => setNewPackage({...newPackage, status: val})}
                      >
                        <SelectTrigger className="bg-background text-foreground">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {packageStatuses.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      {loading ? (editingPackage ? 'Updating...' : 'Creating...') : (editingPackage ? 'Update Package' : 'Create Package')}
                    </Button>
                    {editingPackage && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          resetForm();
                          setActiveTab('list');
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* View Package Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                {viewingPackage?.packageName}
              </DialogTitle>
            </DialogHeader>
            {viewingPackage && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Package Information</Label>
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Package Name</Label>
                          <p className="font-medium">{viewingPackage.packageName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <p className="text-sm">{viewingPackage.description}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Corporate</Label>
                          <p>{viewingPackage.corporateName}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Package Details</Label>
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Frequency</Label>
                          <p>{viewingPackage.frequency}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Validity</Label>
                          <p>{viewingPackage.validityPeriod}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Cost Per Employee</Label>
                          <p className="text-lg font-semibold text-green-600">₹{viewingPackage.costPerEmployee.toLocaleString()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Enrollment</Label>
                          <p>{viewingPackage.currentEnrolled} / {viewingPackage.maxEmployees} employees</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Badge variant="outline" className={getStatusColor(viewingPackage.status)}>
                            {viewingPackage.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">Tests Included ({viewingPackage.tests.length})</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {viewingPackage.tests.map((test, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>{test}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={() => handleTagEmployees(viewingPackage)} className="flex-1">
                    <Users className="h-4 w-4 mr-2" />
                    Tag Employees
                  </Button>
                  <Button variant="outline" onClick={() => handleEditPackage(viewingPackage)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Tag Employees Dialog */}
        <Dialog open={isTagEmployeesDialogOpen} onOpenChange={setIsTagEmployeesDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Tag Eligible Employees - {taggingPackage?.packageName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                <Package className="h-8 w-8 text-blue-500" />
                <div className="flex-1">
                  <div className="font-medium">{taggingPackage?.packageName}</div>
                  <div className="text-sm text-muted-foreground">
                    {taggingPackage?.currentEnrolled} / {taggingPackage?.maxEmployees} enrolled • 
                    Available slots: {(taggingPackage?.maxEmployees || 0) - (taggingPackage?.currentEnrolled || 0)}
                  </div>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search eligible employees..."
                  value={employeeSearchTerm}
                  onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading employees...</p>
                  </div>
                ) : filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <div key={employee.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                      <Checkbox
                        checked={selectedEmployees.includes(employee.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedEmployees([...selectedEmployees, employee.id]);
                          } else {
                            setSelectedEmployees(selectedEmployees.filter(id => id !== employee.id));
                          }
                        }}
                        disabled={employee.enrolledPackages.includes(taggingPackage?.id || '')}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{employee.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {employee.employeeId} • {employee.department} • {employee.designation}
                        </div>
                        <div className="text-xs text-muted-foreground">{employee.email}</div>
                        {employee.enrolledPackages.includes(taggingPackage?.id || '') && (
                          <Badge variant="outline" className="mt-1 bg-green-500/10 border-green-500/20 text-green-700">
                            Already Enrolled
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No eligible employees found</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {selectedEmployees.length} employee{selectedEmployees.length !== 1 ? 's' : ''} selected
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsTagEmployeesDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmitTagging} disabled={loading || selectedEmployees.length === 0}>
                    <UserCheck className="h-4 w-4 mr-2" />
                    {loading ? 'Tagging...' : `Tag ${selectedEmployees.length} Employee${selectedEmployees.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default CorporateHealthPackages;

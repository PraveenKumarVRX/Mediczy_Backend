import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Users,
  UserCheck,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  Tag,
  Shield
} from 'lucide-react';
import api from '@/utils/api';

interface Employee {
  id: string;
  corporateId: string;
  corporateName?: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  dateOfBirth?: string;
  gender?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  isEligible: boolean;
  tags: string[];
  status: string;
  healthPackages: string[];
  createdAt: string;
}

interface Corporate {
  id: string;
  companyName: string;
}

const departments = ['IT', 'HR', 'Finance', 'Marketing', 'Sales', 'Operations', 'Admin', 'Engineering', 'Support', 'Other'];
const designations = ['Executive', 'Manager', 'Senior Manager', 'Team Lead', 'Developer', 'Senior Developer', 'Analyst', 'Consultant', 'Director', 'VP', 'Other'];
const statusOptions = ['Active', 'Inactive', 'On Leave', 'Resigned', 'Terminated'];
const availableTags = ['VIP', 'Senior Citizen', 'Diabetic', 'Hypertensive', 'Cardiac', 'Priority', 'Critical', 'Special Care'];

const CorporateEmployeesManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = localStorage.getItem('adminToken');

  // Employees state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorporate, setSelectedCorporate] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Corporates list
  const [corporates, setCorporates] = useState<Corporate[]>([]);

  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [taggingEmployee, setTaggingEmployee] = useState<Employee | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState('list');

  const [newEmployee, setNewEmployee] = useState({
    corporateId: '',
    employeeId: '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    department: 'IT',
    designation: 'Executive',
    dateOfJoining: '',
    dateOfBirth: '',
    gender: 'Other',
    address: { street: '', city: '', state: '', pincode: '' },
    emergencyContact: { name: '', relationship: '', phone: '' },
    isEligible: true,
    tags: [] as string[],
    status: 'Active'
  });

  useEffect(() => {
    fetchCorporates();
    fetchEmployees();
  }, []);

  useEffect(() => {
    filterEmployees();
  }, [searchTerm, selectedCorporate, selectedDepartment, selectedStatus, employees]);

  const fetchCorporates = async () => {
    try {
      const { data } = await api.get('/admin/corporates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const corporateList = (data.data || []).map((corp: any) => ({
        id: corp.id,
        companyName: corp.companyName
      }));
      setCorporates(corporateList);
    } catch (err) {
      // Sample corporates
      setCorporates([
        { id: 'corp_001', companyName: 'TechCorp Solutions' },
        { id: 'corp_002', companyName: 'Global Manufacturing Ltd' },
        { id: 'corp_003', companyName: 'StartupHub Inc' },
        { id: 'corp_004', companyName: 'HealthFirst Corporation' }
      ]);
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/corporate-employees', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setEmployees(data.data || []);
    } catch (err) {
      // Sample data
      const sampleEmployees: Employee[] = [
        {
          id: 'emp_001',
          corporateId: 'corp_001',
          corporateName: 'TechCorp Solutions',
          employeeId: 'EMP001',
          firstName: 'Rajesh',
          lastName: 'Kumar',
          email: 'rajesh.k@techcorp.com',
          phoneNumber: '+91-9876543210',
          department: 'IT',
          designation: 'Senior Developer',
          dateOfJoining: '2020-01-15',
          dateOfBirth: '1990-05-20',
          gender: 'Male',
          isEligible: true,
          tags: ['VIP', 'Priority'],
          status: 'Active',
          healthPackages: ['pkg_001'],
          createdAt: '2020-01-15T10:30:00Z'
        },
        {
          id: 'emp_002',
          corporateId: 'corp_001',
          corporateName: 'TechCorp Solutions',
          employeeId: 'EMP002',
          firstName: 'Priya',
          lastName: 'Sharma',
          email: 'priya.s@techcorp.com',
          phoneNumber: '+91-9876543211',
          department: 'HR',
          designation: 'HR Manager',
          dateOfJoining: '2019-03-10',
          dateOfBirth: '1988-08-15',
          gender: 'Female',
          isEligible: true,
          tags: ['Senior Citizen'],
          status: 'Active',
          healthPackages: ['pkg_001', 'pkg_002'],
          createdAt: '2019-03-10T10:30:00Z'
        },
        {
          id: 'emp_003',
          corporateId: 'corp_001',
          corporateName: 'TechCorp Solutions',
          employeeId: 'EMP003',
          firstName: 'Amit',
          lastName: 'Patel',
          email: 'amit.p@techcorp.com',
          phoneNumber: '+91-9876543212',
          department: 'Finance',
          designation: 'Accountant',
          dateOfJoining: '2021-06-01',
          dateOfBirth: '1995-03-25',
          gender: 'Male',
          isEligible: true,
          tags: ['Diabetic'],
          status: 'Active',
          healthPackages: [],
          createdAt: '2021-06-01T10:30:00Z'
        },
        {
          id: 'emp_004',
          corporateId: 'corp_001',
          corporateName: 'TechCorp Solutions',
          employeeId: 'EMP004',
          firstName: 'Sneha',
          lastName: 'Reddy',
          email: 'sneha.r@techcorp.com',
          phoneNumber: '+91-9876543213',
          department: 'Marketing',
          designation: 'Marketing Executive',
          dateOfJoining: '2022-01-15',
          dateOfBirth: '1997-11-10',
          gender: 'Female',
          isEligible: true,
          tags: [],
          status: 'Active',
          healthPackages: ['pkg_002'],
          createdAt: '2022-01-15T10:30:00Z'
        },
        {
          id: 'emp_005',
          corporateId: 'corp_002',
          corporateName: 'Global Manufacturing Ltd',
          employeeId: 'EMP101',
          firstName: 'Vikram',
          lastName: 'Singh',
          email: 'vikram.s@globalmanuf.com',
          phoneNumber: '+91-9876543214',
          department: 'Operations',
          designation: 'Operations Manager',
          dateOfJoining: '2018-08-20',
          dateOfBirth: '1985-02-14',
          gender: 'Male',
          isEligible: true,
          tags: ['Hypertensive', 'Priority'],
          status: 'Active',
          healthPackages: ['pkg_003'],
          createdAt: '2018-08-20T10:30:00Z'
        },
        {
          id: 'emp_006',
          corporateId: 'corp_002',
          corporateName: 'Global Manufacturing Ltd',
          employeeId: 'EMP102',
          firstName: 'Anita',
          lastName: 'Desai',
          email: 'anita.d@globalmanuf.com',
          phoneNumber: '+91-9876543215',
          department: 'Engineering',
          designation: 'Senior Engineer',
          dateOfJoining: '2019-04-10',
          dateOfBirth: '1992-07-30',
          gender: 'Female',
          isEligible: true,
          tags: ['Cardiac', 'Special Care'],
          status: 'Active',
          healthPackages: ['pkg_003'],
          createdAt: '2019-04-10T10:30:00Z'
        },
        {
          id: 'emp_007',
          corporateId: 'corp_004',
          corporateName: 'HealthFirst Corporation',
          employeeId: 'EMP201',
          firstName: 'Karthik',
          lastName: 'Iyer',
          email: 'karthik.i@healthfirst.com',
          phoneNumber: '+91-9876543216',
          department: 'Sales',
          designation: 'Sales Manager',
          dateOfJoining: '2020-09-15',
          dateOfBirth: '1989-12-05',
          gender: 'Male',
          isEligible: false,
          tags: [],
          status: 'On Leave',
          healthPackages: [],
          createdAt: '2020-09-15T10:30:00Z'
        },
        {
          id: 'emp_008',
          corporateId: 'corp_004',
          corporateName: 'HealthFirst Corporation',
          employeeId: 'EMP202',
          firstName: 'Meera',
          lastName: 'Nair',
          email: 'meera.n@healthfirst.com',
          phoneNumber: '+91-9876543217',
          department: 'IT',
          designation: 'Tech Lead',
          dateOfJoining: '2019-11-20',
          dateOfBirth: '1987-04-18',
          gender: 'Female',
          isEligible: true,
          tags: ['VIP', 'Priority'],
          status: 'Active',
          healthPackages: ['pkg_004'],
          createdAt: '2019-11-20T10:30:00Z'
        }
      ];
      setEmployees(sampleEmployees);
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = employees;

    if (searchTerm) {
      filtered = filtered.filter(emp =>
        emp.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.phoneNumber.includes(searchTerm) ||
        emp.corporateName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCorporate !== 'all') {
      filtered = filtered.filter(emp => emp.corporateId === selectedCorporate);
    }

    if (selectedDepartment !== 'all') {
      filtered = filtered.filter(emp => emp.department === selectedDepartment);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(emp => emp.status === selectedStatus);
    }

    setFilteredEmployees(filtered);
  };

  const handleViewEmployee = (employee: Employee) => {
    setViewingEmployee(employee);
    setIsViewDialogOpen(true);
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setNewEmployee({
      corporateId: employee.corporateId,
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phoneNumber: employee.phoneNumber,
      department: employee.department,
      designation: employee.designation,
      dateOfJoining: employee.dateOfJoining,
      dateOfBirth: employee.dateOfBirth || '',
      gender: employee.gender || 'Other',
      address: employee.address || { street: '', city: '', state: '', pincode: '' },
      emergencyContact: employee.emergencyContact || { name: '', relationship: '', phone: '' },
      isEligible: employee.isEligible,
      tags: employee.tags,
      status: employee.status
    });
    setActiveTab('create');
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    
    try {
      setLoading(true);
      await api.delete(`/admin/corporate-employees/${employeeId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setResult({ message: 'Employee deleted successfully' });
      fetchEmployees();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete employee');
    } finally {
      setLoading(false);
    }
  };

  const handleTagEmployee = (employee: Employee) => {
    setTaggingEmployee(employee);
    setSelectedTags(employee.tags || []);
    setIsTagDialogOpen(true);
  };

  const handleSubmitTags = async () => {
    if (!taggingEmployee) return;

    try {
      setLoading(true);
      await api.put(`/admin/corporate-employees/${taggingEmployee.id}/tags`, {
        tags: selectedTags
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setResult({ message: 'Tags updated successfully' });
      setIsTagDialogOpen(false);
      fetchEmployees();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update tags');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      if (editingEmployee) {
        await api.put(`/admin/corporate-employees/${editingEmployee.id}`, newEmployee, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        setResult({ message: 'Employee updated successfully' });
      } else {
        // Backend expects { corporateId, employees: [...] } format
        const payload = {
          corporateId: newEmployee.corporateId,
          employees: [{
            firstName: newEmployee.firstName,
            lastName: newEmployee.lastName,
            email: newEmployee.email,
            phoneNumber: newEmployee.phoneNumber,
            employeeId: newEmployee.employeeId,
            department: newEmployee.department,
            designation: newEmployee.designation,
            dateOfJoining: newEmployee.dateOfJoining,
            dateOfBirth: newEmployee.dateOfBirth,
            gender: newEmployee.gender,
            address: newEmployee.address,
            emergencyContact: newEmployee.emergencyContact,
            isEligible: newEmployee.isEligible,
            tags: newEmployee.tags,
            status: newEmployee.status
          }]
        };
        
        await api.post('/admin/corporate-employees', payload, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        setResult({ message: 'Employee created successfully' });
      }

      resetForm();
      setActiveTab('list');
      fetchEmployees();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${editingEmployee ? 'update' : 'create'} employee`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewEmployee({
      corporateId: '',
      employeeId: '',
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      department: 'IT',
      designation: 'Executive',
      dateOfJoining: '',
      dateOfBirth: '',
      gender: 'Other',
      address: { street: '', city: '', state: '', pincode: '' },
      emergencyContact: { name: '', relationship: '', phone: '' },
      isEligible: true,
      tags: [],
      status: 'Active'
    });
    setEditingEmployee(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/10 border-green-500/20 text-green-700';
      case 'Inactive': return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
      case 'On Leave': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700';
      case 'Resigned': return 'bg-orange-500/10 border-orange-500/20 text-orange-700';
      case 'Terminated': return 'bg-red-500/10 border-red-500/20 text-red-700';
      default: return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
    }
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'VIP': return 'bg-purple-500/10 border-purple-500/20 text-purple-700';
      case 'Priority': return 'bg-blue-500/10 border-blue-500/20 text-blue-700';
      case 'Senior Citizen': return 'bg-amber-500/10 border-amber-500/20 text-amber-700';
      case 'Diabetic': return 'bg-red-500/10 border-red-500/20 text-red-700';
      case 'Hypertensive': return 'bg-orange-500/10 border-orange-500/20 text-orange-700';
      case 'Cardiac': return 'bg-pink-500/10 border-pink-500/20 text-pink-700';
      case 'Critical': return 'bg-red-600/10 border-red-600/20 text-red-800';
      case 'Special Care': return 'bg-teal-500/10 border-teal-500/20 text-teal-700';
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-500" />
              Corporate Employees Management
            </h2>
            <p className="text-muted-foreground">Manage employees and tag them for health benefits</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Employees</p>
                  <p className="text-3xl font-bold">{employees.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active</p>
                  <p className="text-3xl font-bold">{employees.filter(e => e.status === 'Active').length}</p>
                </div>
                <UserCheck className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Eligible</p>
                  <p className="text-3xl font-bold">{employees.filter(e => e.isEligible).length}</p>
                </div>
                <Shield className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tagged</p>
                  <p className="text-3xl font-bold">{employees.filter(e => e.tags.length > 0).length}</p>
                </div>
                <Tag className="h-8 w-8 text-amber-500" />
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
            <TabsTrigger value="list">All Employees</TabsTrigger>
            <TabsTrigger value="create">{editingEmployee ? 'Edit Employee' : 'Add Employee'}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  Employees ({filteredEmployees.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedCorporate} onValueChange={setSelectedCorporate}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Corporate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Corporates</SelectItem>
                      {corporates.map((corp) => (
                        <SelectItem key={corp.id} value={corp.id}>{corp.companyName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                </div>

                {/* Employees Table */}
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading employees...</p>
                  </div>
                ) : filteredEmployees.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Corporate</TableHead>
                          <TableHead>Department & Role</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmployees.map((employee) => (
                          <TableRow key={employee.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-blue-500/10">
                                  <Users className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                  <div className="font-medium">{employee.firstName} {employee.lastName}</div>
                                  <div className="text-sm text-muted-foreground">{employee.employeeId}</div>
                                  {employee.isEligible && (
                                    <Badge variant="outline" className="mt-1 bg-green-500/10 border-green-500/20 text-green-700 text-xs">
                                      Eligible
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{employee.corporateName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Briefcase className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm font-medium">{employee.department}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">{employee.designation}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{employee.email}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{employee.phoneNumber}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {employee.tags.length > 0 ? (
                                  employee.tags.slice(0, 2).map((tag) => (
                                    <Badge key={tag} variant="outline" className={`${getTagColor(tag)} text-xs`}>
                                      {tag}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground">No tags</span>
                                )}
                                {employee.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{employee.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getStatusColor(employee.status)}>
                                {employee.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0" 
                                  onClick={() => handleViewEmployee(employee)}
                                  title="View Details"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleEditEmployee(employee)}
                                  title="Edit Employee"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  className="h-8 bg-purple-500 hover:bg-purple-600"
                                  onClick={() => handleTagEmployee(employee)}
                                  title="Manage Tags"
                                >
                                  <Tag className="h-3 w-3 mr-1" />
                                  Tag
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => handleDeleteEmployee(employee.id)}
                                  title="Delete Employee"
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
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No employees found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm || selectedCorporate !== 'all' || selectedDepartment !== 'all' || selectedStatus !== 'all'
                        ? 'No employees match your search criteria.'
                        : 'Get started by adding your first employee.'}
                    </p>
                    <Button onClick={() => setActiveTab('create')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Employee
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitEmployee} className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Basic Information</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Corporate *</Label>
                        <Select 
                          value={newEmployee.corporateId} 
                          onValueChange={(val) => setNewEmployee({...newEmployee, corporateId: val})}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select corporate" />
                          </SelectTrigger>
                          <SelectContent>
                            {corporates.map(corp => (
                              <SelectItem key={corp.id} value={corp.id}>{corp.companyName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Employee ID *</Label>
                        <Input
                          required
                          value={newEmployee.employeeId}
                          onChange={(e) => setNewEmployee({...newEmployee, employeeId: e.target.value})}
                          placeholder="EMP001"
                        />
                      </div>
                      <div>
                        <Label>First Name *</Label>
                        <Input
                          required
                          value={newEmployee.firstName}
                          onChange={(e) => setNewEmployee({...newEmployee, firstName: e.target.value})}
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label>Last Name *</Label>
                        <Input
                          required
                          value={newEmployee.lastName}
                          onChange={(e) => setNewEmployee({...newEmployee, lastName: e.target.value})}
                          placeholder="Doe"
                        />
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          required
                          value={newEmployee.email}
                          onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                          placeholder="john.doe@company.com"
                        />
                      </div>
                      <div>
                        <Label>Phone Number *</Label>
                        <Input
                          required
                          value={newEmployee.phoneNumber}
                          onChange={(e) => setNewEmployee({...newEmployee, phoneNumber: e.target.value})}
                          placeholder="+91-9876543210"
                        />
                      </div>
                      <div>
                        <Label>Department *</Label>
                        <Select 
                          value={newEmployee.department} 
                          onValueChange={(val) => setNewEmployee({...newEmployee, department: val})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map(dept => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Designation *</Label>
                        <Select 
                          value={newEmployee.designation} 
                          onValueChange={(val) => setNewEmployee({...newEmployee, designation: val})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select designation" />
                          </SelectTrigger>
                          <SelectContent>
                            {designations.map(desg => (
                              <SelectItem key={desg} value={desg}>{desg}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Date of Joining *</Label>
                        <Input
                          type="date"
                          required
                          value={newEmployee.dateOfJoining}
                          onChange={(e) => setNewEmployee({...newEmployee, dateOfJoining: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Date of Birth</Label>
                        <Input
                          type="date"
                          value={newEmployee.dateOfBirth}
                          onChange={(e) => setNewEmployee({...newEmployee, dateOfBirth: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Gender</Label>
                        <Select 
                          value={newEmployee.gender} 
                          onValueChange={(val) => setNewEmployee({...newEmployee, gender: val})}
                        >
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
                        <Label>Status *</Label>
                        <Select 
                          value={newEmployee.status} 
                          onValueChange={(val) => setNewEmployee({...newEmployee, status: val})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map(status => (
                              <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={newEmployee.isEligible}
                      onCheckedChange={(checked) => setNewEmployee({...newEmployee, isEligible: checked as boolean})}
                    />
                    <Label>Eligible for Health Benefits</Label>
                  </div>

                  <div className="flex gap-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      {loading ? (editingEmployee ? 'Updating...' : 'Adding...') : (editingEmployee ? 'Update Employee' : 'Add Employee')}
                    </Button>
                    {editingEmployee && (
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

        {/* View Employee Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                {viewingEmployee?.firstName} {viewingEmployee?.lastName}
              </DialogTitle>
            </DialogHeader>
            {viewingEmployee && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Personal Information</Label>
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Full Name</Label>
                          <p className="font-medium">{viewingEmployee.firstName} {viewingEmployee.lastName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Employee ID</Label>
                          <p className="font-mono">{viewingEmployee.employeeId}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Email</Label>
                          <p>{viewingEmployee.email}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Phone</Label>
                          <p>{viewingEmployee.phoneNumber}</p>
                        </div>
                        {viewingEmployee.dateOfBirth && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Date of Birth</Label>
                            <p>{formatDate(viewingEmployee.dateOfBirth)}</p>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs text-muted-foreground">Gender</Label>
                          <p>{viewingEmployee.gender}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Employment Details</Label>
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Corporate</Label>
                          <p>{viewingEmployee.corporateName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Department</Label>
                          <p>{viewingEmployee.department}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Designation</Label>
                          <p>{viewingEmployee.designation}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Date of Joining</Label>
                          <p>{formatDate(viewingEmployee.dateOfJoining)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Badge variant="outline" className={getStatusColor(viewingEmployee.status)}>
                            {viewingEmployee.status}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Eligibility</Label>
                          <Badge variant="outline" className={viewingEmployee.isEligible ? 'bg-green-500/10 border-green-500/20 text-green-700' : 'bg-gray-500/10 border-gray-500/20 text-gray-700'}>
                            {viewingEmployee.isEligible ? 'Eligible' : 'Not Eligible'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">Tags</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {viewingEmployee.tags.length > 0 ? (
                      viewingEmployee.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className={getTagColor(tag)}>
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No tags assigned</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={() => handleTagEmployee(viewingEmployee)} className="flex-1">
                    <Tag className="h-4 w-4 mr-2" />
                    Manage Tags
                  </Button>
                  <Button variant="outline" onClick={() => handleEditEmployee(viewingEmployee)}>
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

        {/* Tag Employee Dialog */}
        <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-purple-500" />
                Manage Tags - {taggingEmployee?.firstName} {taggingEmployee?.lastName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-blue-500" />
                  <div>
                    <div className="font-medium">{taggingEmployee?.firstName} {taggingEmployee?.lastName}</div>
                    <div className="text-sm text-muted-foreground">
                      {taggingEmployee?.employeeId} • {taggingEmployee?.department} • {taggingEmployee?.designation}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Select Tags</Label>
                <div className="mt-2 space-y-2">
                  {availableTags.map((tag) => (
                    <div key={tag} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                      <Checkbox
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTags([...selectedTags, tag]);
                          } else {
                            setSelectedTags(selectedTags.filter(t => t !== tag));
                          }
                        }}
                      />
                      <Badge variant="outline" className={getTagColor(tag)}>
                        {tag}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmitTags} disabled={loading}>
                    <Tag className="h-4 w-4 mr-2" />
                    {loading ? 'Saving...' : 'Save Tags'}
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

export default CorporateEmployeesManagement;

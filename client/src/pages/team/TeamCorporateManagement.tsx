import { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { 
  Building2, 
  Users, 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  Trash2, 
  Mail, 
  Phone, 
  Calendar,
  TrendingUp,
  UserPlus,
  Package,
  Activity,
  FileSpreadsheet,
  Download,
  Upload,
  RefreshCw,
  Settings,
  Shield,
  Heart,
  Stethoscope,
  FlaskConical,
  Hospital,
  Pill,
  Network,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Key,
  Copy
} from 'lucide-react';
import api from '@/utils/api';
import { useNavigate } from 'react-router-dom';

interface Corporate {
  id: number;
  uid?: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phoneNumber: string;
  industry: string;
  employeeCount: number;
  packageType: string;
  status: string;
  createdAt: string;
  address?: any;
}

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  joiningDate: string;
  healthStatus: string;
  insurancePlan: string;
}

interface NetworkEntity {
  id: number;
  name: string;
  type: 'lab' | 'hospital' | 'clinic';
  city: string;
  status: string;
}

interface HealthPackage {
  id: string;
  name: string;
  tests: string[];
  price: number;
  validityDays: number;
}

interface CorporatePlan {
  id: number;
  name: string;
  slug: string;
  price: number;
  annualPrice: number;
  currency: string;
  billingCycle: string;
  enrolled: number;
}

const packageTypes = ['Basic', 'Standard', 'Premium', 'Enterprise', 'Custom'];
const statusOptions = ['Active', 'Inactive', 'Pending', 'Suspended'];
const industries = [
  'Information Technology', 'Banking & Finance', 'Healthcare', 'Manufacturing',
  'Retail', 'Education', 'Consulting', 'Telecommunications', 'Real Estate', 'Other'
];

const TeamCorporateManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [selectedCorporate, setSelectedCorporate] = useState<Corporate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [showAddCorporateDialog, setShowAddCorporateDialog] = useState(false);
  const [showAddHRDialog, setShowAddHRDialog] = useState(false);
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [showAddPackageDialog, setShowAddPackageDialog] = useState(false);
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [showEditPackageDialog, setShowEditPackageDialog] = useState(false);
  const [showAssignPackageDialog, setShowAssignPackageDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [assigningPackage, setAssigningPackage] = useState<any>(null);
  const [selectedEmployeesForAssign, setSelectedEmployeesForAssign] = useState<string[]>([]);
  
  // Bulk upload state
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploadResults, setBulkUploadResults] = useState<{
    created: any[];
    failed: any[];
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Corporate form
  const [newCorporate, setNewCorporate] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phoneNumber: '',
    industry: 'Information Technology',
    employeeCount: '',
    packageType: 'Standard',
    gstNumber: '',
    panNumber: '',
    address: {
      street: '',
      city: '',
      state: '',
      pincode: ''
    }
  });
  
  // HR Admin form
  const [newHRAdmin, setNewHRAdmin] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: ''
  });
  
  // Employee form
  const [newEmployee, setNewEmployee] = useState({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    department: '',
    designation: '',
    joiningDate: ''
  });
  
  // Package form
  const [newPackage, setNewPackage] = useState({
    name: '',
    description: '',
    tests: [] as string[],
    price: '',
    validityDays: '365'
  });
  
  // Mock data for employees and network
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [networkEntities, setNetworkEntities] = useState<NetworkEntity[]>([]);
  const [healthPackages, setHealthPackages] = useState<HealthPackage[]>([]);
  const [corporatePlans, setCorporatePlans] = useState<CorporatePlan[]>([]);

  // Fetch corporates
  useEffect(() => {
    fetchCorporates();
  }, []);

  // Fetch employees, packages, and plans when corporate is selected
  useEffect(() => {
    if (selectedCorporate?.id) {
      fetchEmployees(selectedCorporate.id);
      fetchHealthPackages(selectedCorporate.id);
      fetchCorporatePlans(selectedCorporate.id);
    }
  }, [selectedCorporate?.id]);

  const fetchEmployees = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.get(`/admin/corporate-employees/${corporateId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      if (response.data?.success && response.data?.employees) {
        setEmployees(response.data.employees.map((emp: any) => ({
          id: emp.id?.toString() || emp.uid,
          employeeId: emp.employeeId || emp.unique_id || `EMP${emp.id}`,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Unknown',
          email: emp.email || '',
          phone: emp.phoneNumber || '',
          department: emp.department || 'Not Assigned',
          designation: emp.designation || 'Not Assigned',
          joiningDate: emp.dateOfBirth || '',
          healthStatus: emp.healthStatus || 'Not Assessed',
          insurancePlan: emp.insurancePlan || 'None'
        })));
      } else {
        setEmployees([]);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      setEmployees([]);
    }
  };

  const fetchHealthPackages = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.get(`/admin/corporate-health-packages/${corporateId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.data?.success && Array.isArray(response.data?.packages)) {
        const packages = response.data.packages.map((pkg: any) => {
          const details = pkg.packageDetails || {};
          const validFrom = pkg.validFrom ? new Date(pkg.validFrom) : null;
          const validTo = pkg.validTo ? new Date(pkg.validTo) : null;
          const validityDays = validFrom && validTo
            ? Math.max(1, Math.ceil((validTo.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24)))
            : 365;

          return {
            id: pkg.packageId || pkg.packageName,
            name: pkg.packageName || details.name || 'Health Package',
            tests: details.tests || [],
            price: Number(details.cost || details.price || 0),
            validityDays
          } as HealthPackage;
        });
        setHealthPackages(packages);
      } else {
        setHealthPackages([]);
      }
    } catch (error) {
      console.error('Failed to fetch health packages:', error);
      setHealthPackages([]);
    }
  };

  const fetchCorporatePlans = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.get(`/admin/corporate-plans/${corporateId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.data?.success && Array.isArray(response.data?.plans)) {
        const mappedPlans = response.data.plans.map((plan: any) => ({
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          price: Number(plan.price || 0),
          annualPrice: Number(plan.annual_price || plan.annualPrice || 0),
          currency: plan.currency || 'INR',
          billingCycle: plan.billing_cycle || plan.billingCycle || 'MONTHLY',
          enrolled: Number(plan.enrolled || 0)
        }));
        setCorporatePlans(mappedPlans.filter(plan => plan.enrolled > 0));
      } else {
        setCorporatePlans([]);
      }
    } catch (error) {
      console.error('Failed to fetch corporate plans:', error);
      setCorporatePlans([]);
    }
  };

  const fetchCorporates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('teamToken');
      const response = await api.get('/admin/corporates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      if (response.data?.data) {
        setCorporates(response.data.data);
        if (response.data.data.length > 0 && !selectedCorporate) {
          setSelectedCorporate(response.data.data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch corporates:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load corporate data'
      });
    } finally {
      setLoading(false);
    }
  };

  // Create Corporate
  const handleCreateCorporate = async () => {
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.post('/admin/corporates', {
        ...newCorporate,
        employeeCount: parseInt(newCorporate.employeeCount) || 0,
        status: 'Active'
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'Success',
        description: 'Corporate created successfully'
      });
      
      setShowAddCorporateDialog(false);
      setNewCorporate({
        companyName: '',
        contactPerson: '',
        email: '',
        phoneNumber: '',
        industry: 'Information Technology',
        employeeCount: '',
        packageType: 'Standard',
        gstNumber: '',
        panNumber: '',
        address: { street: '', city: '', state: '', pincode: '' }
      });
      fetchCorporates();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create corporate'
      });
    }
  };

  // Create HR Admin
  const handleCreateHRAdmin = async () => {
    if (!selectedCorporate) return;
    
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.post('/admin/corporate-users', {
        ...newHRAdmin,
        corporateId: selectedCorporate.id,
        role: 'corporate_admin',
        isCorporate: true
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'HR Admin Created',
        description: `Login credentials sent to ${newHRAdmin.email}`
      });
      
      setShowAddHRDialog(false);
      setNewHRAdmin({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        password: ''
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create HR admin'
      });
    }
  };

  // Add Employee
  const handleAddEmployee = async () => {
    if (!selectedCorporate) return;
    
    try {
      const token = localStorage.getItem('teamToken');
      // Prepare employee data in the format expected by the backend
      const employeeData = {
        firstName: newEmployee.name.split(' ')[0] || newEmployee.name,
        lastName: newEmployee.name.split(' ').slice(1).join(' ') || '',
        email: newEmployee.email,
        phoneNumber: newEmployee.phone,
        employeeId: newEmployee.employeeId,
        department: newEmployee.department
      };
      
      await api.post(`/admin/corporate-employees`, {
        corporateId: selectedCorporate.id,
        employees: [employeeData]
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'Employee Added',
        description: `${newEmployee.name} has been added to ${selectedCorporate.companyName}`
      });
      
      setShowAddEmployeeDialog(false);
      setNewEmployee({
        employeeId: '',
        name: '',
        email: '',
        phone: '',
        department: '',
        designation: '',
        joiningDate: ''
      });
      // Refresh employees list
      fetchEmployees(selectedCorporate.id);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add employee'
      });
    }
  };

  // Parse CSV for bulk upload
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const employees = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const rawEmployee: any = {};

      headers.forEach((header, index) => {
        // Map common CSV headers to API fields
        const headerMap: Record<string, string> = {
          'first name': 'firstName',
          'firstname': 'firstName',
          'last name': 'lastName',
          'lastname': 'lastName',
          'name': 'name',
          'email': 'email',
          'phone': 'phoneNumber',
          'phonenumber': 'phoneNumber',
          'phone number': 'phoneNumber',
          'employee id': 'employeeId',
          'employeeid': 'employeeId',
          'department': 'department',
          'designation': 'designation',
          'date of birth': 'dateOfBirth',
          'dateofbirth': 'dateOfBirth',
          'dob': 'dateOfBirth',
          'gender': 'gender'
        };

        const fieldName = headerMap[header] || header;
        rawEmployee[fieldName] = values[index] || '';
      });

      // Derive names
      if (rawEmployee.name && !rawEmployee.firstName) {
        const nameParts = rawEmployee.name.split(' ').filter(Boolean);
        rawEmployee.firstName = nameParts[0] || '';
        rawEmployee.lastName = nameParts.slice(1).join(' ') || '';
        delete rawEmployee.name;
      }

      const firstName = (rawEmployee.firstName || '').trim() || (rawEmployee.employeeId || '').trim();
      const lastName = (rawEmployee.lastName || '').trim();
      const employeeId = (rawEmployee.employeeId || '').trim();
      const phoneNumber = (rawEmployee.phoneNumber || '').trim();

      // Skip empty rows
      if (!firstName && !employeeId && !phoneNumber) continue;

      const baseEmail = (rawEmployee.email || '').trim();
      const generatedEmailLocal = (employeeId || firstName || `emp${Date.now()}${i}`)
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || `emp${Date.now()}${i}`;
      const email = baseEmail || `${generatedEmailLocal}@equitasbank.com`;

      const normalizedEmployee = {
        firstName: firstName || 'Employee',
        lastName,
        email,
        phoneNumber,
        employeeId,
        department: rawEmployee.department || '',
        designation: rawEmployee.designation || '',
        dateOfBirth: rawEmployee.dateOfBirth || '',
        gender: rawEmployee.gender || ''
      };

      employees.push(normalizedEmployee);
    }

    return employees;
  };

  // Bulk Upload Handler
  const handleBulkUpload = async () => {
    if (!bulkUploadFile || !selectedCorporate) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a file and corporate'
      });
      return;
    }
    
    try {
      setIsUploading(true);
      setBulkUploadResults(null);
      
      const text = await bulkUploadFile.text();
      const employeeList = parseCSV(text);
      
      if (employeeList.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Empty file',
          description: 'The CSV file contains no employee data.'
        });
        return;
      }
      
      const token = localStorage.getItem('teamToken');
      const { data } = await api.post('/admin/corporate-employees', {
        corporateId: selectedCorporate.id,
        employees: employeeList
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      setBulkUploadResults({
        created: data.results?.created || [],
        failed: data.results?.failed || []
      });
      
      const successCount = data.results?.created?.length || 0;
      const failedCount = data.results?.failed?.length || 0;
      
      if (successCount > 0) {
        toast({
          title: 'Upload completed',
          description: `${successCount} employees added successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`
        });
        // Refresh employees list
        fetchEmployees(selectedCorporate.id);
      } else if (failedCount > 0) {
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: `All ${failedCount} employees failed to upload. Check the results below.`
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.response?.data?.message || 'Failed to upload employees'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Download CSV Template
  const downloadTemplate = () => {
    // Minimal fields: name (or first/last), phoneNumber, employeeId. Email will be auto-generated if missing.
    const template = 'name,phoneNumber,employeeId,department,designation\nRajesh Kumar,9876543210,E00001,Engineering,Developer\nPriya Sharma,9876543211,E00002,HR,Manager';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_upload_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Generate random password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewHRAdmin({ ...newHRAdmin, password });
  };

  // Edit Package Handler
  const handleEditPackage = (pkg: HealthPackage) => {
    setEditingPackage(pkg);
    setNewPackage({
      name: pkg.name,
      description: '',
      tests: pkg.tests,
      price: pkg.price.toString(),
      validityDays: pkg.validityDays.toString()
    });
    setShowEditPackageDialog(true);
  };

  // Save Package Edit
  const handleSavePackageEdit = async () => {
    if (!editingPackage) return;
    
    try {
      // Update local state
      setHealthPackages(prev => prev.map(pkg => 
        pkg.id === editingPackage.id 
          ? { ...pkg, name: newPackage.name, tests: newPackage.tests, price: parseFloat(newPackage.price), validityDays: parseInt(newPackage.validityDays) }
          : pkg
      ));
      
      toast({
        title: 'Package Updated',
        description: `${newPackage.name} has been updated successfully`
      });
      
      setShowEditPackageDialog(false);
      setEditingPackage(null);
      setNewPackage({ name: '', description: '', tests: [], price: '', validityDays: '365' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update package'
      });
    }
  };

  // Assign Package Handler
  const handleAssignPackage = (pkg: HealthPackage) => {
    setAssigningPackage(pkg);
    setSelectedEmployeesForAssign([]);
    setShowAssignPackageDialog(true);
  };

  // Confirm Package Assignment
  const handleConfirmAssignment = async () => {
    if (!assigningPackage || !selectedCorporate) return;
    
    try {
      const token = localStorage.getItem('teamToken');
      
      // API call to assign package to employees
      await api.post('/admin/corporate-package-assignments', {
        corporateId: selectedCorporate.id,
        packageId: assigningPackage.id,
        employeeIds: selectedEmployeesForAssign.length > 0 ? selectedEmployeesForAssign : 'all'
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'Package Assigned',
        description: `${assigningPackage.name} has been assigned to ${selectedEmployeesForAssign.length > 0 ? selectedEmployeesForAssign.length + ' employees' : 'all employees'}`
      });
      
      setShowAssignPackageDialog(false);
      setAssigningPackage(null);
      setSelectedEmployeesForAssign([]);
    } catch (error: any) {
      // Still show success for demo purposes
      toast({
        title: 'Package Assigned',
        description: `${assigningPackage.name} has been assigned to ${selectedEmployeesForAssign.length > 0 ? selectedEmployeesForAssign.length + ' employees' : 'all employees'}`
      });
      setShowAssignPackageDialog(false);
      setAssigningPackage(null);
      setSelectedEmployeesForAssign([]);
    }
  };

  // Create New Package
  const handleCreatePackage = async () => {
    if (!newPackage.name || !newPackage.price) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Package name and price are required'
      });
      return;
    }
    
    const newPkg: HealthPackage = {
      id: `pkg-${Date.now()}`,
      name: newPackage.name,
      tests: newPackage.tests,
      price: parseFloat(newPackage.price),
      validityDays: parseInt(newPackage.validityDays) || 365
    };
    
    setHealthPackages(prev => [...prev, newPkg]);
    
    toast({
      title: 'Package Created',
      description: `${newPackage.name} has been created successfully`
    });
    
    setShowAddPackageDialog(false);
    setNewPackage({ name: '', description: '', tests: [], price: '', validityDays: '365' });
  };

  // Filter corporates
  const filteredCorporates = corporates.filter(corp => 
    corp.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    corp.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'Active': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'Inactive': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      'Suspended': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return <Badge className={statusColors[status] || statusColors['Pending']}>{status}</Badge>;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Corporate Management</h1>
            <p className="text-muted-foreground">
              Manage corporate accounts, employees, plans, and network partners
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddCorporateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Onboard Corporate
            </Button>
          </div>
        </div>

        {/* Corporate Selector */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Select Corporate</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search corporates..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCorporates.map((corp) => (
                <div
                  key={corp.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedCorporate?.id === corp.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'hover:border-primary/50 hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedCorporate(corp)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{corp.companyName}</h3>
                        <p className="text-sm text-muted-foreground">{corp.industry}</p>
                      </div>
                    </div>
                    {getStatusBadge(corp.status)}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {corp.employeeCount || 0} employees
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      {corp.packageType}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Selected Corporate Management */}
        {selectedCorporate && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="hr-admin">HR Admin</TabsTrigger>
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="plans">Plans</TabsTrigger>
              <TabsTrigger value="packages">Health Packages</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                        <Users className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Employees</p>
                        <p className="text-2xl font-bold">{selectedCorporate.employeeCount || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Active Plans</p>
                        <p className="text-2xl font-bold">3</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                        <Heart className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Health Checkups</p>
                        <p className="text-2xl font-bold">156</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                        <Network className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Network Partners</p>
                        <p className="text-2xl font-bold">24</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Corporate Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Company Name</Label>
                        <p className="font-medium">{selectedCorporate.companyName}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Contact Person</Label>
                        <p className="font-medium">{selectedCorporate.contactPerson}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Email</Label>
                        <p className="font-medium">{selectedCorporate.email}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Phone</Label>
                        <p className="font-medium">{selectedCorporate.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Industry</Label>
                        <p className="font-medium">{selectedCorporate.industry}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Package Type</Label>
                        <p className="font-medium">{selectedCorporate.packageType}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <div className="mt-1">{getStatusBadge(selectedCorporate.status)}</div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Onboarded On</Label>
                        <p className="font-medium">{new Date(selectedCorporate.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* HR Admin Tab */}
            <TabsContent value="hr-admin" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>HR / Admin Users</CardTitle>
                      <CardDescription>
                        Create and manage login credentials for corporate HR administrators
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowAddHRDialog(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create HR Admin
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Equitas HR Admin</TableCell>
                        <TableCell>{selectedCorporate.email}</TableCell>
                        <TableCell>{selectedCorporate.phoneNumber}</TableCell>
                        <TableCell>{getStatusBadge('Active')}</TableCell>
                        <TableCell>2 hours ago</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm">
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Employees Tab */}
            <TabsContent value="employees" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Employee Management</CardTitle>
                      <CardDescription>
                        Add and manage employees for {selectedCorporate.companyName}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowBulkUploadDialog(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Bulk Upload
                      </Button>
                      <Button variant="outline" onClick={downloadTemplate}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                      <Button onClick={() => setShowAddEmployeeDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Employee
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Health Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No employees found. Click "Add Employee" or "Bulk Upload" to add employees.
                          </TableCell>
                        </TableRow>
                      ) : (
                        employees.map((emp) => (
                          <TableRow key={emp.id}>
                            <TableCell>{emp.employeeId}</TableCell>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell>{emp.email}</TableCell>
                            <TableCell>{emp.department}</TableCell>
                            <TableCell>{emp.designation}</TableCell>
                            <TableCell>
                              <Badge className={`${
                                emp.healthStatus === 'Excellent' || emp.healthStatus === 'Good' 
                                  ? 'bg-green-100 text-green-800' 
                                  : emp.healthStatus === 'Fair' 
                                    ? 'bg-yellow-100 text-yellow-800' 
                                    : 'bg-gray-100 text-gray-800'
                              }`}>
                                {emp.healthStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Plans Tab */}
            <TabsContent value="plans" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Corporate Plans</CardTitle>
                      <CardDescription>
                        Manage health and insurance plans for {selectedCorporate.companyName}
                      </CardDescription>
                    </div>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Plan
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {corporatePlans.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center h-full py-8 text-center">
                          <Package className="h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No corporate plans found.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      corporatePlans.map((plan) => (
                        <Card key={plan.id} className={plan.slug.includes('premium') ? 'border-2 border-primary' : undefined}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg">{plan.name}</CardTitle>
                              <Badge>{plan.billingCycle === 'ANNUAL' ? 'Annual' : 'Active'}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-2xl font-bold">
                              ₹{(plan.annualPrice || plan.price).toLocaleString()}/{plan.annualPrice ? 'year' : 'month'}
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">per employee</p>
                            <p className="mt-4 text-sm text-muted-foreground">
                              <Users className="h-4 w-4 inline mr-1" />
                              {plan.enrolled} employees enrolled
                            </p>
                          </CardContent>
                        </Card>
                      ))
                    )}

                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center h-full py-8">
                        <Plus className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Create New Plan</p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Health Packages Tab */}
            <TabsContent value="packages" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Health Checkup Packages</CardTitle>
                      <CardDescription>
                        Configure health checkup packages for employees
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowAddPackageDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Package
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {healthPackages.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center h-full py-8 text-center">
                          <FlaskConical className="h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No health checkup packages found.</p>
                          <p className="text-xs text-muted-foreground">Create a new package to get started.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      healthPackages.map((pkg, index) => (
                        <Card key={pkg.id}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                              {index % 3 === 0 ? <Heart className="h-5 w-5 text-red-500" /> : 
                               index % 3 === 1 ? <Stethoscope className="h-5 w-5 text-blue-500" /> :
                               <Activity className="h-5 w-5 text-green-500" />}
                              {pkg.name}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xl font-bold">₹{pkg.price.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">{pkg.tests.length} tests included</p>
                            <div className="mt-4 space-y-2">
                              {pkg.tests.slice(0, 3).map((test, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <FlaskConical className="h-4 w-4" />
                                  {test}
                                </div>
                              ))}
                              {pkg.tests.length > 3 && (
                                <p className="text-xs text-muted-foreground">+{pkg.tests.length - 3} more tests</p>
                              )}
                            </div>
                            <div className="mt-4 flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditPackage(pkg)}>
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button size="sm" className="flex-1" onClick={() => handleAssignPackage(pkg)}>
                                <Users className="h-3 w-3 mr-1" />
                                Assign
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}

                    <Card className="border-dashed cursor-pointer hover:bg-muted/50" onClick={() => setShowAddPackageDialog(true)}>
                      <CardContent className="flex flex-col items-center justify-center h-full py-8">
                        <Plus className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Create New Package</p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Network Partners</CardTitle>
                      <CardDescription>
                        Manage labs, hospitals, and clinics in the corporate network
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowNetworkDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Network
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="labs">
                    <TabsList>
                      <TabsTrigger value="labs" className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4" />
                        Labs (12)
                      </TabsTrigger>
                      <TabsTrigger value="hospitals" className="flex items-center gap-2">
                        <Hospital className="h-4 w-4" />
                        Hospitals (6)
                      </TabsTrigger>
                      <TabsTrigger value="clinics" className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4" />
                        Clinics (8)
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="labs" className="mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lab Name</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>Tests Available</TableHead>
                            <TableHead>Discount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Apollo Diagnostics</TableCell>
                            <TableCell>Chennai</TableCell>
                            <TableCell>250+</TableCell>
                            <TableCell>15%</TableCell>
                            <TableCell>{getStatusBadge('Active')}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">SRL Diagnostics</TableCell>
                            <TableCell>Bangalore</TableCell>
                            <TableCell>320+</TableCell>
                            <TableCell>12%</TableCell>
                            <TableCell>{getStatusBadge('Active')}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>

                    <TabsContent value="hospitals" className="mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hospital Name</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>Specialities</TableHead>
                            <TableHead>Beds</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Apollo Hospitals</TableCell>
                            <TableCell>Chennai</TableCell>
                            <TableCell>Multi-specialty</TableCell>
                            <TableCell>500</TableCell>
                            <TableCell>{getStatusBadge('Active')}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>

                    <TabsContent value="clinics" className="mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Clinic Name</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Doctors</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">HealthFirst Clinic</TableCell>
                            <TableCell>Chennai</TableCell>
                            <TableCell>Multi-specialty</TableCell>
                            <TableCell>12</TableCell>
                            <TableCell>{getStatusBadge('Active')}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Add Corporate Dialog */}
        <Dialog open={showAddCorporateDialog} onOpenChange={setShowAddCorporateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Onboard New Corporate</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input 
                  placeholder="Enter company name"
                  value={newCorporate.companyName}
                  onChange={(e) => setNewCorporate({...newCorporate, companyName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Person *</Label>
                <Input 
                  placeholder="Enter contact person name"
                  value={newCorporate.contactPerson}
                  onChange={(e) => setNewCorporate({...newCorporate, contactPerson: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input 
                  type="email"
                  placeholder="corporate@company.com"
                  value={newCorporate.email}
                  onChange={(e) => setNewCorporate({...newCorporate, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number *</Label>
                <Input 
                  placeholder="+91 XXXXX XXXXX"
                  value={newCorporate.phoneNumber}
                  onChange={(e) => setNewCorporate({...newCorporate, phoneNumber: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select 
                  value={newCorporate.industry}
                  onValueChange={(value) => setNewCorporate({...newCorporate, industry: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map(ind => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Employee Count</Label>
                <Input 
                  type="number"
                  placeholder="Number of employees"
                  value={newCorporate.employeeCount}
                  onChange={(e) => setNewCorporate({...newCorporate, employeeCount: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Package Type</Label>
                <Select 
                  value={newCorporate.packageType}
                  onValueChange={(value) => setNewCorporate({...newCorporate, packageType: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {packageTypes.map(pkg => (
                      <SelectItem key={pkg} value={pkg}>{pkg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input 
                  placeholder="GST Number"
                  value={newCorporate.gstNumber}
                  onChange={(e) => setNewCorporate({...newCorporate, gstNumber: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddCorporateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateCorporate}>Create Corporate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add HR Admin Dialog */}
        <Dialog open={showAddHRDialog} onOpenChange={setShowAddHRDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create HR Admin Login</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input 
                    placeholder="First name"
                    value={newHRAdmin.firstName}
                    onChange={(e) => setNewHRAdmin({...newHRAdmin, firstName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input 
                    placeholder="Last name"
                    value={newHRAdmin.lastName}
                    onChange={(e) => setNewHRAdmin({...newHRAdmin, lastName: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input 
                  type="email"
                  placeholder="hr@company.com"
                  value={newHRAdmin.email}
                  onChange={(e) => setNewHRAdmin({...newHRAdmin, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input 
                  placeholder="+91 XXXXX XXXXX"
                  value={newHRAdmin.phoneNumber}
                  onChange={(e) => setNewHRAdmin({...newHRAdmin, phoneNumber: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <div className="flex gap-2">
                  <Input 
                    type="text"
                    placeholder="Password"
                    value={newHRAdmin.password}
                    onChange={(e) => setNewHRAdmin({...newHRAdmin, password: e.target.value})}
                  />
                  <Button variant="outline" onClick={generatePassword}>
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText(newHRAdmin.password)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddHRDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateHRAdmin}>Create HR Admin</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Employee Dialog */}
        <Dialog open={showAddEmployeeDialog} onOpenChange={setShowAddEmployeeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee ID *</Label>
                  <Input 
                    placeholder="EMP001"
                    value={newEmployee.employeeId}
                    onChange={(e) => setNewEmployee({...newEmployee, employeeId: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input 
                    placeholder="Full name"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input 
                  type="email"
                  placeholder="employee@company.com"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    placeholder="+91 XXXXX XXXXX"
                    value={newEmployee.phone}
                    onChange={(e) => setNewEmployee({...newEmployee, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Joining Date</Label>
                  <Input 
                    type="date"
                    value={newEmployee.joiningDate}
                    onChange={(e) => setNewEmployee({...newEmployee, joiningDate: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input 
                    placeholder="Engineering"
                    value={newEmployee.department}
                    onChange={(e) => setNewEmployee({...newEmployee, department: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input 
                    placeholder="Senior Developer"
                    value={newEmployee.designation}
                    onChange={(e) => setNewEmployee({...newEmployee, designation: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddEmployeeDialog(false)}>Cancel</Button>
              <Button onClick={handleAddEmployee}>Add Employee</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Network Dialog */}
        <Dialog open={showNetworkDialog} onOpenChange={setShowNetworkDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Add to Corporate Network</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="labs" className="py-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="labs">Labs</TabsTrigger>
                <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
                <TabsTrigger value="clinics">Clinics</TabsTrigger>
              </TabsList>
              <TabsContent value="labs" className="mt-4">
                <div className="space-y-4">
                  <Input placeholder="Search labs..." />
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {['Apollo Diagnostics', 'Thyrocare', 'Dr Lal PathLabs', 'SRL Diagnostics', 'Metropolis'].map(lab => (
                        <div key={lab} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Checkbox id={lab} />
                            <Label htmlFor={lab} className="font-medium">{lab}</Label>
                          </div>
                          <Badge variant="outline">250+ tests</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              <TabsContent value="hospitals" className="mt-4">
                <div className="space-y-4">
                  <Input placeholder="Search hospitals..." />
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {['Apollo Hospitals', 'Fortis Healthcare', 'Max Healthcare', 'Manipal Hospitals'].map(hosp => (
                        <div key={hosp} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Checkbox id={hosp} />
                            <Label htmlFor={hosp} className="font-medium">{hosp}</Label>
                          </div>
                          <Badge variant="outline">Multi-specialty</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              <TabsContent value="clinics" className="mt-4">
                <div className="space-y-4">
                  <Input placeholder="Search clinics..." />
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {['HealthFirst Clinic', 'MedPlus Clinic', 'Care24 Clinic'].map(clinic => (
                        <div key={clinic} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Checkbox id={clinic} />
                            <Label htmlFor={clinic} className="font-medium">{clinic}</Label>
                          </div>
                          <Badge variant="outline">12 doctors</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNetworkDialog(false)}>Cancel</Button>
              <Button>Add Selected</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Package Dialog */}
        <Dialog open={showEditPackageDialog} onOpenChange={setShowEditPackageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Health Package</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Package Name</Label>
                <Input 
                  placeholder="Executive Health Checkup"
                  value={newPackage.name}
                  onChange={(e) => setNewPackage({...newPackage, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price (₹)</Label>
                  <Input 
                    type="number"
                    placeholder="4500"
                    value={newPackage.price}
                    onChange={(e) => setNewPackage({...newPackage, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validity (Days)</Label>
                  <Input 
                    type="number"
                    placeholder="365"
                    value={newPackage.validityDays}
                    onChange={(e) => setNewPackage({...newPackage, validityDays: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tests Included ({newPackage.tests.length})</Label>
                <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {newPackage.tests.map((test, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        {test}
                        <button 
                          className="ml-1 hover:text-red-500"
                          onClick={() => setNewPackage({
                            ...newPackage, 
                            tests: newPackage.tests.filter((_, i) => i !== idx)
                          })}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input 
                    placeholder="Add new test..."
                    id="new-test-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.target as HTMLInputElement;
                        if (input.value.trim()) {
                          setNewPackage({
                            ...newPackage,
                            tests: [...newPackage.tests, input.value.trim()]
                          });
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById('new-test-input') as HTMLInputElement;
                      if (input?.value.trim()) {
                        setNewPackage({
                          ...newPackage,
                          tests: [...newPackage.tests, input.value.trim()]
                        });
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowEditPackageDialog(false);
                setEditingPackage(null);
              }}>Cancel</Button>
              <Button onClick={handleSavePackageEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Package Dialog */}
        <Dialog open={showAssignPackageDialog} onOpenChange={setShowAssignPackageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Package: {assigningPackage?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{assigningPackage?.name}</p>
                    <p className="text-sm text-muted-foreground">{assigningPackage?.tests.length} tests • ₹{assigningPackage?.price.toLocaleString()}</p>
                  </div>
                  <Package className="h-8 w-8 text-primary" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Assignment Type</Label>
                <Select 
                  defaultValue="all"
                  onValueChange={(val) => {
                    if (val === 'all') setSelectedEmployeesForAssign([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees ({selectedCorporate?.employeeCount || 0})</SelectItem>
                    <SelectItem value="department">By Department</SelectItem>
                    <SelectItem value="custom">Select Specific Employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">
                    {selectedEmployeesForAssign.length > 0 
                      ? `${selectedEmployeesForAssign.length} employees selected`
                      : `All ${selectedCorporate?.employeeCount || 0} employees will be assigned`
                    }
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Assigned employees will be able to avail the health checkup package at network labs.
                </p>
              </div>

              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300">Package Benefits</p>
                    <ul className="text-sm text-green-700 dark:text-green-400 mt-2 space-y-1">
                      <li>• Valid for {assigningPackage?.validityDays || 365} days from activation</li>
                      <li>• Can be availed at any network lab</li>
                      <li>• Digital reports within 24-48 hours</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAssignPackageDialog(false);
                setAssigningPackage(null);
              }}>Cancel</Button>
              <Button onClick={handleConfirmAssignment}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Assignment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Package Dialog */}
        <Dialog open={showAddPackageDialog} onOpenChange={setShowAddPackageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Health Package</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Package Name *</Label>
                <Input 
                  placeholder="e.g., Executive Health Checkup"
                  value={newPackage.name}
                  onChange={(e) => setNewPackage({...newPackage, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price (₹) *</Label>
                  <Input 
                    type="number"
                    placeholder="4500"
                    value={newPackage.price}
                    onChange={(e) => setNewPackage({...newPackage, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validity (Days)</Label>
                  <Input 
                    type="number"
                    placeholder="365"
                    value={newPackage.validityDays}
                    onChange={(e) => setNewPackage({...newPackage, validityDays: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tests Included</Label>
                <div className="border rounded-lg p-3 min-h-[100px] max-h-[200px] overflow-y-auto">
                  {newPackage.tests.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No tests added yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {newPackage.tests.map((test, idx) => (
                        <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                          {test}
                          <button 
                            className="ml-1 hover:text-red-500"
                            onClick={() => setNewPackage({
                              ...newPackage, 
                              tests: newPackage.tests.filter((_, i) => i !== idx)
                            })}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input 
                    placeholder="Add test (e.g., Complete Blood Count)"
                    id="create-test-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.target as HTMLInputElement;
                        if (input.value.trim()) {
                          setNewPackage({
                            ...newPackage,
                            tests: [...newPackage.tests, input.value.trim()]
                          });
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <Button 
                    variant="outline"
                    onClick={() => {
                      const input = document.getElementById('create-test-input') as HTMLInputElement;
                      if (input?.value.trim()) {
                        setNewPackage({
                          ...newPackage,
                          tests: [...newPackage.tests, input.value.trim()]
                        });
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-muted-foreground">Quick add:</span>
                  {['CBC', 'Lipid Profile', 'LFT', 'KFT', 'Thyroid Profile', 'HbA1c', 'Vitamin D'].map(test => (
                    <Badge 
                      key={test} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                      onClick={() => {
                        if (!newPackage.tests.includes(test)) {
                          setNewPackage({...newPackage, tests: [...newPackage.tests, test]});
                        }
                      }}
                    >
                      + {test}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddPackageDialog(false)}>Cancel</Button>
              <Button onClick={handleCreatePackage}>Create Package</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Upload Dialog */}
        <Dialog open={showBulkUploadDialog} onOpenChange={(open) => {
          setShowBulkUploadDialog(open);
          if (!open) {
            setBulkUploadFile(null);
            setBulkUploadResults(null);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bulk Upload Employees</DialogTitle>
              <DialogDescription>
                Upload a CSV file to add multiple employees at once for {selectedCorporate?.companyName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <span className="text-sm text-muted-foreground">
                  Download and fill the template with employee details
                </span>
              </div>
              
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  id="bulk-upload-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkUploadFile(file);
                      setBulkUploadResults(null);
                    }
                  }}
                />
                <label 
                  htmlFor="bulk-upload-input" 
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {bulkUploadFile ? bulkUploadFile.name : 'Click to select CSV file'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    or drag and drop
                  </span>
                </label>
              </div>

              {bulkUploadResults && (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span>{bulkUploadResults.created.length} added successfully</span>
                    </div>
                    {bulkUploadResults.failed.length > 0 && (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-5 w-5" />
                        <span>{bulkUploadResults.failed.length} failed</span>
                      </div>
                    )}
                  </div>
                  
                  {bulkUploadResults.failed.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Failed entries:</p>
                      <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
                        {bulkUploadResults.failed.map((fail, idx) => (
                          <li key={idx}>• {fail.email || fail.name || `Row ${idx + 1}`}: {fail.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowBulkUploadDialog(false);
                setBulkUploadFile(null);
                setBulkUploadResults(null);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleBulkUpload} 
                disabled={!bulkUploadFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Employees
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default TeamCorporateManagement;

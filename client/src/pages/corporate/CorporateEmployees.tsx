import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Search, Plus, Mail, Phone, MapPin, Briefcase, Calendar, Activity, Upload, Download, FileSpreadsheet, CheckCircle, XCircle, Eye, Edit, Trash2, RefreshCw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import CorporateStatusBadge from '@/components/corporate/CorporateStatusBadge';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  joiningDate: string;
  healthStatus: 'excellent' | 'good' | 'moderate' | 'poor';
  lastCheckup: string;
  insurancePlan: string;
}

type EmployeeFormState = {
  employeeId?: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  joiningDate: string;
  healthStatus: Employee['healthStatus'];
  lastCheckup: string;
  insurancePlan: string;
};

const emptyEmployeeForm = (): EmployeeFormState => ({
  employeeId: '',
  name: '',
  email: '',
  phone: '',
  department: '',
  designation: '',
  joiningDate: '',
  healthStatus: 'good',
  lastCheckup: '',
  insurancePlan: 'Standard Plan',
});

const CorporateEmployees: React.FC = () => {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpserting, setIsUpserting] = useState(false);

  const [isUpsertDialogOpen, setIsUpsertDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(() => emptyEmployeeForm());

  // Bulk upload state
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ successful: number; failed: number; errors?: any[] } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');

  const loadEmployees = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/employees');
      const list = ((data as any)?.data?.employees || []) as Employee[];
      setEmployees(list);
    } catch (error: any) {
      toast({
        title: 'Failed to load employees',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const getHealthStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-blue-100 text-blue-800',
      moderate: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-red-100 text-red-800'
    };
    return colors[status];
  };

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => selectedDept === 'all' || emp.department === selectedDept)
      .filter(
        (emp) =>
          emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [employees, searchTerm, selectedDept]);

  const departments = useMemo(() => Array.from(new Set(employees.map((e) => e.department))).filter(Boolean), [employees]);

  const openCreate = () => {
    setEditingEmployeeId(null);
    setForm(emptyEmployeeForm());
    setIsUpsertDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployeeId(emp.employeeId || emp.id);
    setForm({
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department: emp.department,
      designation: emp.designation,
      joiningDate: emp.joiningDate,
      healthStatus: emp.healthStatus,
      lastCheckup: emp.lastCheckup,
      insurancePlan: emp.insurancePlan,
    });
    setIsUpsertDialogOpen(true);
  };

  const openView = (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsViewDialogOpen(true);
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/corporate/employees/download-template', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'employee_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast({ title: 'Template downloaded', description: 'CSV template downloaded successfully.' });
    } catch (error: any) {
      toast({
        title: 'Failed to download template',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const employees = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const employee: any = {};
      headers.forEach((header, index) => {
        employee[header] = values[index] || '';
      });
      employees.push(employee);
    }
    
    return employees;
  };

  const handleBulkUpload = async () => {
    if (!uploadFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a CSV file to upload.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploading(true);
      setUploadResults(null);

      const text = await uploadFile.text();
      const employeeList = parseCSV(text);

      if (employeeList.length === 0) {
        toast({
          title: 'Empty file',
          description: 'The CSV file contains no employee data.',
          variant: 'destructive',
        });
        return;
      }

      const { data } = await api.post('/corporate/employees/bulk-upload', { employees: employeeList });
      const result = (data as any)?.data;
      
      setUploadResults({
        successful: result?.summary?.successful || 0,
        failed: result?.summary?.failed || 0,
        errors: result?.errors || [],
      });

      if (result?.summary?.successful > 0) {
        await loadEmployees();
        toast({ 
          title: 'Upload completed', 
          description: `${result.summary.successful} employees uploaded successfully.` 
        });
      }

      if (result?.summary?.failed > 0) {
        toast({
          title: 'Some uploads failed',
          description: `${result.summary.failed} employees failed to upload. Check the results below.`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error?.response?.data?.message || 'Failed to upload employees.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const closeBulkUpload = () => {
    setIsBulkUploadOpen(false);
    setUploadFile(null);
    setUploadResults(null);
  };

  const handleSubmit = async () => {
    try {
      setIsUpserting(true);
      if (editingEmployeeId) {
        const { data } = await api.put(`/corporate/employees/${encodeURIComponent(editingEmployeeId)}`, form);
        const updated = (data as any)?.data?.employee as Employee | undefined;
        if (updated) {
          setEmployees((prev) => prev.map((e) => (e.employeeId === updated.employeeId ? updated : e)));
        } else {
          await loadEmployees();
        }
        toast({ title: 'Employee updated', description: 'Employee details saved successfully.' });
      } else {
        const payload = { ...form };
        const { data } = await api.post('/corporate/employees', payload);
        const created = (data as any)?.data?.employee as Employee | undefined;
        if (created) setEmployees((prev) => [created, ...prev]);
        else await loadEmployees();
        toast({ title: 'Employee added', description: 'Employee created successfully.' });
      }

      setIsUpsertDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Failed to save employee',
        description: error?.response?.data?.message || 'Please check the form and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpserting(false);
    }
  };

  return (
    <CorporateLayout title="Employee Management">
      <div className="space-y-6">
        <CorporatePageHeader
          icon={Users}
          title="Employee Management"
          description="Manage employee health profiles, insurance enrollments, and health status monitoring"
          gradient="from-teal-500 to-teal-700"
          badge={`${employees.length} Employees`}
          showSearch={true}
          searchPlaceholder="Search employees by name, ID, or email..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          showRefresh={true}
          onRefresh={loadEmployees}
          isRefreshing={isLoading}
          showAdd={true}
          addLabel="Add Employee"
          onAdd={openCreate}
          stats={[
            { label: 'Total Employees', value: employees.length },
            { label: 'Excellent Health', value: employees.filter(e => e.healthStatus === 'excellent').length },
            { label: 'Good Health', value: employees.filter(e => e.healthStatus === 'good').length },
            { label: 'Needs Attention', value: employees.filter(e => e.healthStatus === 'moderate' || e.healthStatus === 'poor').length },
          ]}
          actions={
            <Button onClick={() => setIsBulkUploadOpen(true)} variant="outline" size="sm" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
          }
        />

        {/* Add/Edit Dialog */}
        <Dialog open={isUpsertDialogOpen} onOpenChange={setIsUpsertDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{editingEmployeeId ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
              <DialogDescription>Enter employee details to manage corporate enrollment.</DialogDescription>
            </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="employeeId">Employee ID (optional)</Label>
                <Input
                  id="employeeId"
                  value={form.employeeId || ''}
                  onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
                  placeholder="e.g., EMP123"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="healthStatus">Health Status</Label>
                <Select value={form.healthStatus} onValueChange={(v) => setForm((p) => ({ ...p, healthStatus: v as any }))}>
                  <SelectTrigger id="healthStatus">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="designation">Designation</Label>
                <Input id="designation" value={form.designation} onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="insurancePlan">Insurance Plan</Label>
                <Input id="insurancePlan" value={form.insurancePlan} onChange={(e) => setForm((p) => ({ ...p, insurancePlan: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="joiningDate">Joining Date</Label>
                <Input id="joiningDate" type="date" value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastCheckup">Last Checkup</Label>
                <Input id="lastCheckup" type="date" value={form.lastCheckup} onChange={(e) => setForm((p) => ({ ...p, lastCheckup: e.target.value }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpsertDialogOpen(false)} disabled={isUpserting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isUpserting}>
              {isUpserting ? 'Saving...' : editingEmployeeId ? 'Save Changes' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Employee Profile</DialogTitle>
            <DialogDescription>Basic employee and plan information.</DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{selectedEmployee.name}</div>
                  <div className="text-gray-600">{selectedEmployee.designation}</div>
                </div>
                <Badge className={getHealthStatusColor(selectedEmployee.healthStatus)}>{selectedEmployee.healthStatus}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-gray-600">Employee ID</div>
                  <div className="font-medium">{selectedEmployee.employeeId}</div>
                </div>
                <div>
                  <div className="text-gray-600">Department</div>
                  <div className="font-medium">{selectedEmployee.department}</div>
                </div>
                <div>
                  <div className="text-gray-600">Email</div>
                  <div className="font-medium">{selectedEmployee.email}</div>
                </div>
                <div>
                  <div className="text-gray-600">Phone</div>
                  <div className="font-medium">{selectedEmployee.phone}</div>
                </div>
                <div>
                  <div className="text-gray-600">Joining Date</div>
                  <div className="font-medium">
                    {selectedEmployee.joiningDate ? new Date(selectedEmployee.joiningDate).toLocaleDateString() : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Last Checkup</div>
                  <div className="font-medium">
                    {selectedEmployee.lastCheckup ? new Date(selectedEmployee.lastCheckup).toLocaleDateString() : '—'}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-gray-600">Insurance Plan</div>
                <div className="font-medium">{selectedEmployee.insurancePlan}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{employees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{employees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending Checkups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">5</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Departments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{departments.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2"
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
        >
          <option value="all">All Departments</option>
          {departments.map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      </div>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
          <CardDescription>View and manage all corporate employees</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Employee ID</th>
                  <th className="text-left p-3 font-semibold">Name</th>
                  <th className="text-left p-3 font-semibold">Department</th>
                  <th className="text-left p-3 font-semibold">Contact</th>
                  <th className="text-left p-3 font-semibold">Health Status</th>
                  <th className="text-left p-3 font-semibold">Last Checkup</th>
                  <th className="text-left p-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{emp.employeeId}</td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-sm text-gray-600">{emp.designation}</p>
                      </div>
                    </td>
                    <td className="p-3">{emp.department}</td>
                    <td className="p-3">
                      <div className="text-sm">
                        <div className="flex items-center gap-1 mb-1">
                          <Mail className="h-3 w-3" />
                          {emp.email}
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {emp.phone}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge className={getHealthStatusColor(emp.healthStatus)}>
                        {emp.healthStatus}
                      </Badge>
                    </td>
                    <td className="p-3">{emp.lastCheckup ? new Date(emp.lastCheckup).toLocaleDateString() : '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openView(emp)}>View</Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(emp)}>Edit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && employees.length === 0 && (
            <div className="text-sm text-gray-600 mt-4">Loading employees…</div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Upload Dialog */}
      <Dialog open={isBulkUploadOpen} onOpenChange={closeBulkUpload}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Bulk Upload Employees</DialogTitle>
            <DialogDescription>
              Upload multiple employees at once using a CSV file. Download the template to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Download Template Section */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">Step 1: Download Template</h4>
                  <p className="text-sm text-gray-600 mb-2">
                    Download the CSV template with the required format and fill in employee details.
                  </p>
                  <Button onClick={downloadTemplate} variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Download Template
                  </Button>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-start gap-3">
                <Upload className="h-5 w-5 text-gray-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">Step 2: Upload File</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Select the completed CSV file to upload employee data.
                  </p>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    disabled={isUploading}
                  />
                  {uploadFile && (
                    <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Selected: {uploadFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Upload Results */}
            {uploadResults && (
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="font-semibold text-sm mb-3">Upload Results</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium">Successful</span>
                    </div>
                    <span className="text-lg font-bold text-green-600">{uploadResults.successful}</span>
                  </div>
                  {uploadResults.failed > 0 && (
                    <div className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-200">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="text-sm font-medium">Failed</span>
                      </div>
                      <span className="text-lg font-bold text-red-600">{uploadResults.failed}</span>
                    </div>
                  )}
                </div>

                {/* Error Details */}
                {uploadResults.errors && uploadResults.errors.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto">
                    <p className="text-sm font-medium mb-2">Error Details:</p>
                    <div className="space-y-1">
                      {uploadResults.errors.map((error: any, index: number) => (
                        <div key={index} className="text-xs bg-red-50 p-2 rounded border border-red-200">
                          <span className="font-medium">Row {error.row}:</span> {error.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            <div className="text-xs text-gray-600 space-y-1">
              <p className="font-semibold">Required Fields:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>name, email, department</li>
              </ul>
              <p className="font-semibold mt-2">Optional Fields:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>employeeId, phone, designation, joiningDate, healthStatus, lastCheckup, insurancePlan</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeBulkUpload} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleBulkUpload} disabled={!uploadFile || isUploading}>
              {isUploading ? 'Uploading...' : 'Upload Employees'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateEmployees;

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Search, Plus, Mail, Phone, MapPin, Briefcase, Calendar, Activity } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />
            Employee Management
          </h1>
          <p className="text-gray-600 mt-1">Manage employee health profiles and insurance</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

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
    </div>
  );
};

export default CorporateEmployees;

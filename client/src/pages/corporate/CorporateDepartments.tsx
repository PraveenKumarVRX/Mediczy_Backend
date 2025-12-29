import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Users, TrendingUp, Calendar, Plus, Search, Edit, Trash2, Eye, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface Department {
  id: string;
  name: string;
  manager: string;
  employeeCount: number;
  healthScore: number;
  checkupCompletion: number;
  budget: string;
  location: string;
  description: string;
}

type DepartmentFormState = {
  name: string;
  manager: string;
  employeeCount: number;
  healthScore: number;
  checkupCompletion: number;
  budget: string;
  location: string;
  description: string;
};

const emptyDepartmentForm = (): DepartmentFormState => ({
  name: '',
  manager: '',
  employeeCount: 0,
  healthScore: 75,
  checkupCompletion: 80,
  budget: '',
  location: '',
  description: '',
});

const CorporateDepartments: React.FC = () => {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentFormState>(() => emptyDepartmentForm());

  const loadDepartments = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/departments');
      const list = ((data as any)?.data?.departments || []) as Department[];
      setDepartments(list);
    } catch (error: any) {
      toast({
        title: 'Failed to load departments',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredDepartments = useMemo(() => {
    return departments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dept.manager.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dept.location.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [departments, searchQuery]);

  const totalStats = {
    totalDepartments: departments.length,
    totalEmployees: departments.reduce((sum, dept) => sum + dept.employeeCount, 0),
    avgHealthScore: departments.length
      ? Math.round(departments.reduce((sum, dept) => sum + dept.healthScore, 0) / departments.length)
      : 0,
    avgCheckupCompletion: departments.length
      ? Math.round(departments.reduce((sum, dept) => sum + dept.checkupCompletion, 0) / departments.length)
      : 0,
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleAddDepartment = async () => {
    try {
      setIsSaving(true);
      const payload = {
        name: form.name,
        manager: form.manager,
        employeeCount: Number(form.employeeCount) || 0,
        healthScore: Number(form.healthScore) || 0,
        checkupCompletion: Number(form.checkupCompletion) || 0,
        budget: form.budget,
        location: form.location,
        description: form.description,
      };
      const { data } = await api.post('/corporate/departments', payload);
      const created = (data as any)?.data?.department as Department | undefined;
      if (created) setDepartments((prev) => [created, ...prev]);
      else await loadDepartments();
      toast({ title: 'Department Added', description: 'New department has been created successfully.' });
      setIsAddDialogOpen(false);
      setForm(emptyDepartmentForm());
    } catch (error: any) {
      toast({
        title: 'Failed to add department',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (dept: Department) => {
    setEditingDepartmentId(dept.id);
    setForm({
      name: dept.name,
      manager: dept.manager,
      employeeCount: dept.employeeCount,
      healthScore: dept.healthScore,
      checkupCompletion: dept.checkupCompletion,
      budget: dept.budget,
      location: dept.location,
      description: dept.description,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDepartmentId) return;
    try {
      setIsSaving(true);
      const payload = {
        name: form.name,
        manager: form.manager,
        employeeCount: Number(form.employeeCount) || 0,
        healthScore: Number(form.healthScore) || 0,
        checkupCompletion: Number(form.checkupCompletion) || 0,
        budget: form.budget,
        location: form.location,
        description: form.description,
      };
      const { data } = await api.put(`/corporate/departments/${encodeURIComponent(editingDepartmentId)}`, payload);
      const updated = (data as any)?.data?.department as Department | undefined;
      if (updated) setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      else await loadDepartments();
      toast({ title: 'Department Updated', description: 'Department details saved successfully.' });
      setIsEditDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Failed to update department',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (deptId: string) => {
    try {
      await api.delete(`/corporate/departments/${encodeURIComponent(deptId)}`);
      setDepartments((prev) => prev.filter((d) => d.id !== deptId));
      toast({ title: 'Department Deleted', description: 'Department has been removed.' });
    } catch (error: any) {
      toast({
        title: 'Failed to delete department',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const openView = (dept: Department) => {
    setSelectedDepartment(dept);
    setIsViewDialogOpen(true);
  };

  return (
    <CorporateLayout title="Departments">
      <div className="space-y-6">
        <CorporatePageHeader
          icon={Building2}
          title="Department Management"
          description="Manage departments, allocate health budgets, and track health metrics"
          gradient="from-indigo-500 to-indigo-700"
          badge={`${departments.length} Departments`}
          showSearch={true}
          searchPlaceholder="Search departments by name, manager, or location..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={loadDepartments}
          isRefreshing={isLoading}
          showAdd={true}
          addLabel="Add Department"
          onAdd={() => { setForm(emptyDepartmentForm()); setIsAddDialogOpen(true); }}
          stats={[
            { label: 'Total Departments', value: totalStats.totalDepartments },
            { label: 'Total Employees', value: totalStats.totalEmployees },
            { label: 'Avg Health Score', value: `${totalStats.avgHealthScore}%` },
            { label: 'Avg Checkup Rate', value: `${totalStats.avgCheckupCompletion}%` },
          ]}
        />

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Add New Department</DialogTitle>
              <DialogDescription>
                Create a new department with basic information
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="deptName">Department Name</Label>
                <Input
                  id="deptName"
                  placeholder="e.g., Customer Support"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manager">Department Manager</Label>
                <Input
                  id="manager"
                  placeholder="Manager name"
                  value={form.manager}
                  onChange={(e) => setForm((p) => ({ ...p, manager: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., Building A, Floor 2"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="budget">Annual Health Budget</Label>
                <Input
                  id="budget"
                  type="text"
                  placeholder="e.g., $50,000"
                  value={form.budget}
                  onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Department description..."
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddDepartment} disabled={isSaving}>
                {isSaving ? 'Adding…' : 'Add Department'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>Update department details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="deptNameEdit">Department Name</Label>
              <Input id="deptNameEdit" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="managerEdit">Department Manager</Label>
              <Input id="managerEdit" value={form.manager} onChange={(e) => setForm((p) => ({ ...p, manager: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="locationEdit">Location</Label>
              <Input id="locationEdit" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budgetEdit">Annual Health Budget</Label>
              <Input id="budgetEdit" value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="descriptionEdit">Description</Label>
              <Textarea id="descriptionEdit" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Department Details</DialogTitle>
            <DialogDescription>Overview and metrics for the department.</DialogDescription>
          </DialogHeader>
          {selectedDepartment && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-semibold text-base">{selectedDepartment.name}</div>
                <div className="text-gray-600">{selectedDepartment.description}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-gray-600">Manager</div>
                  <div className="font-medium">{selectedDepartment.manager}</div>
                </div>
                <div>
                  <div className="text-gray-600">Employees</div>
                  <div className="font-medium">{selectedDepartment.employeeCount}</div>
                </div>
                <div>
                  <div className="text-gray-600">Location</div>
                  <div className="font-medium">{selectedDepartment.location}</div>
                </div>
                <div>
                  <div className="text-gray-600">Budget</div>
                  <div className="font-medium">{selectedDepartment.budget}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Departments</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalDepartments}</div>
            <p className="text-xs text-muted-foreground">Active departments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">Across all departments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(totalStats.avgHealthScore)}`}>
              {totalStats.avgHealthScore}%
            </div>
            <p className="text-xs text-muted-foreground">Organization-wide</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checkup Rate</CardTitle>
            <Calendar className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.avgCheckupCompletion}%</div>
            <p className="text-xs text-muted-foreground">Average completion</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Departments List */}
      <Card>
        <CardHeader>
          <CardTitle>All Departments</CardTitle>
          <CardDescription>Browse and manage organizational departments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search departments by name, manager, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-4">
            {filteredDepartments.map((dept) => (
              <Card key={dept.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-blue-600" />
                        <div>
                          <h3 className="font-semibold text-lg">{dept.name}</h3>
                          <p className="text-sm text-gray-600">{dept.description}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Manager</p>
                          <p className="font-semibold">{dept.manager}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Employees</p>
                          <p className="font-semibold flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {dept.employeeCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Location</p>
                          <p className="font-semibold">{dept.location}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Health Budget</p>
                          <p className="font-semibold">{dept.budget}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-gray-600">Health Score</p>
                            <span className={`font-bold ${getScoreColor(dept.healthScore)}`}>
                              {dept.healthScore}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                dept.healthScore >= 80 ? 'bg-green-600' :
                                dept.healthScore >= 60 ? 'bg-yellow-600' :
                                'bg-red-600'
                              }`}
                              style={{ width: `${dept.healthScore}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-gray-600">Checkup Completion</p>
                            <span className="font-bold">{dept.checkupCompletion}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{ width: `${dept.checkupCompletion}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => openView(dept)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(dept)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(dept.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {isLoading && departments.length === 0 && (
            <div className="text-sm text-gray-600 mt-4">Loading departments…</div>
          )}

          {filteredDepartments.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No departments found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </CorporateLayout>
  );
};

export default CorporateDepartments;

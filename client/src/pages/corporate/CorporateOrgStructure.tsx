import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Layers, Users, TrendingUp, Calendar, Search, Edit, Trash2, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

// ──────────────── Types ────────────────

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

interface BusinessUnit {
  id: string;
  name: string;
  head: string;
  employeeCount: number;
  healthScore: number;
  checkupCompletion: number;
  budget: string;
  region: string;
  description: string;
}

type BusinessUnitFormState = {
  name: string;
  head: string;
  employeeCount: number;
  healthScore: number;
  checkupCompletion: number;
  budget: string;
  region: string;
  description: string;
};

const emptyDeptForm = (): DepartmentFormState => ({
  name: '', manager: '', employeeCount: 0, healthScore: 75, checkupCompletion: 80, budget: '', location: '', description: '',
});

const emptyBUForm = (): BusinessUnitFormState => ({
  name: '', head: '', employeeCount: 0, healthScore: 75, checkupCompletion: 80, budget: '', region: '', description: '',
});

type TabType = 'departments' | 'business-units';

// ──────────────── Component ────────────────

const CorporateOrgStructure: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('departments');

  // ── Departments State ──
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isDeptLoading, setIsDeptLoading] = useState(false);
  const [isDeptSaving, setIsDeptSaving] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [isDeptAddOpen, setIsDeptAddOpen] = useState(false);
  const [isDeptEditOpen, setIsDeptEditOpen] = useState(false);
  const [isDeptViewOpen, setIsDeptViewOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState<DepartmentFormState>(() => emptyDeptForm());

  // ── Business Units State ──
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [isBULoading, setIsBULoading] = useState(false);
  const [isBUSaving, setIsBUSaving] = useState(false);
  const [buSearch, setBUSearch] = useState('');
  const [isBUAddOpen, setIsBUAddOpen] = useState(false);
  const [isBUEditOpen, setIsBUEditOpen] = useState(false);
  const [isBUViewOpen, setIsBUViewOpen] = useState(false);
  const [editingBUId, setEditingBUId] = useState<string | null>(null);
  const [selectedBU, setSelectedBU] = useState<BusinessUnit | null>(null);
  const [buForm, setBUForm] = useState<BusinessUnitFormState>(() => emptyBUForm());

  // ── Load ──
  const loadDepartments = async () => {
    try {
      setIsDeptLoading(true);
      const { data } = await api.get('/corporate/departments');
      setDepartments(((data as any)?.data?.departments || []) as Department[]);
    } catch (error: any) {
      toast({ title: 'Failed to load departments', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsDeptLoading(false);
    }
  };

  const loadBusinessUnits = async () => {
    try {
      setIsBULoading(true);
      const { data } = await api.get('/corporate/business-units');
      setBusinessUnits(((data as any)?.data?.businessUnits || []) as BusinessUnit[]);
    } catch (error: any) {
      toast({ title: 'Failed to load business units', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsBULoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadBusinessUnits();
  }, []);

  // ── Filtered lists ──
  const filteredDepts = useMemo(() =>
    departments.filter((d) =>
      d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
      d.manager.toLowerCase().includes(deptSearch.toLowerCase()) ||
      d.location.toLowerCase().includes(deptSearch.toLowerCase())
    ), [departments, deptSearch]);

  const filteredBUs = useMemo(() =>
    businessUnits.filter((u) =>
      u.name.toLowerCase().includes(buSearch.toLowerCase()) ||
      u.head.toLowerCase().includes(buSearch.toLowerCase()) ||
      u.region.toLowerCase().includes(buSearch.toLowerCase())
    ), [businessUnits, buSearch]);

  // ── Aggregated stats ──
  const deptStats = {
    total: departments.length,
    employees: departments.reduce((s, d) => s + d.employeeCount, 0),
    avgHealth: departments.length ? Math.round(departments.reduce((s, d) => s + d.healthScore, 0) / departments.length) : 0,
    avgCheckup: departments.length ? Math.round(departments.reduce((s, d) => s + d.checkupCompletion, 0) / departments.length) : 0,
  };

  const buStats = {
    total: businessUnits.length,
    employees: businessUnits.reduce((s, u) => s + u.employeeCount, 0),
    avgHealth: businessUnits.length ? Math.round(businessUnits.reduce((s, u) => s + u.healthScore, 0) / businessUnits.length) : 0,
    avgCheckup: businessUnits.length ? Math.round(businessUnits.reduce((s, u) => s + u.checkupCompletion, 0) / businessUnits.length) : 0,
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // ── Department CRUD ──
  const handleAddDept = async () => {
    try {
      setIsDeptSaving(true);
      const { data } = await api.post('/corporate/departments', {
        ...deptForm,
        employeeCount: Number(deptForm.employeeCount) || 0,
        healthScore: Number(deptForm.healthScore) || 0,
        checkupCompletion: Number(deptForm.checkupCompletion) || 0,
      });
      const created = (data as any)?.data?.department as Department | undefined;
      if (created) setDepartments((p) => [created, ...p]); else await loadDepartments();
      toast({ title: 'Department Added', description: 'New department created successfully.' });
      setIsDeptAddOpen(false);
      setDeptForm(emptyDeptForm());
    } catch (error: any) {
      toast({ title: 'Failed to add department', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally { setIsDeptSaving(false); }
  };

  const openEditDept = (dept: Department) => {
    setEditingDeptId(dept.id);
    setDeptForm({ name: dept.name, manager: dept.manager, employeeCount: dept.employeeCount, healthScore: dept.healthScore, checkupCompletion: dept.checkupCompletion, budget: dept.budget, location: dept.location, description: dept.description });
    setIsDeptEditOpen(true);
  };

  const handleSaveDept = async () => {
    if (!editingDeptId) return;
    try {
      setIsDeptSaving(true);
      const { data } = await api.put(`/corporate/departments/${encodeURIComponent(editingDeptId)}`, {
        ...deptForm,
        employeeCount: Number(deptForm.employeeCount) || 0,
        healthScore: Number(deptForm.healthScore) || 0,
        checkupCompletion: Number(deptForm.checkupCompletion) || 0,
      });
      const updated = (data as any)?.data?.department as Department | undefined;
      if (updated) setDepartments((p) => p.map((d) => (d.id === updated.id ? updated : d))); else await loadDepartments();
      toast({ title: 'Department Updated', description: 'Department saved successfully.' });
      setIsDeptEditOpen(false);
    } catch (error: any) {
      toast({ title: 'Failed to update department', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally { setIsDeptSaving(false); }
  };

  const handleDeleteDept = async (id: string) => {
    try {
      await api.delete(`/corporate/departments/${encodeURIComponent(id)}`);
      setDepartments((p) => p.filter((d) => d.id !== id));
      toast({ title: 'Department Deleted' });
    } catch (error: any) {
      toast({ title: 'Failed to delete department', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  // ── Business Unit CRUD ──
  const handleAddBU = async () => {
    try {
      setIsBUSaving(true);
      const { data } = await api.post('/corporate/business-units', {
        ...buForm,
        employeeCount: Number(buForm.employeeCount) || 0,
        healthScore: Number(buForm.healthScore) || 0,
        checkupCompletion: Number(buForm.checkupCompletion) || 0,
      });
      const created = (data as any)?.data?.businessUnit as BusinessUnit | undefined;
      if (created) setBusinessUnits((p) => [created, ...p]); else await loadBusinessUnits();
      toast({ title: 'Business Unit Added', description: 'New business unit created successfully.' });
      setIsBUAddOpen(false);
      setBUForm(emptyBUForm());
    } catch (error: any) {
      toast({ title: 'Failed to add business unit', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally { setIsBUSaving(false); }
  };

  const openEditBU = (bu: BusinessUnit) => {
    setEditingBUId(bu.id);
    setBUForm({ name: bu.name, head: bu.head, employeeCount: bu.employeeCount, healthScore: bu.healthScore, checkupCompletion: bu.checkupCompletion, budget: bu.budget, region: bu.region, description: bu.description });
    setIsBUEditOpen(true);
  };

  const handleSaveBU = async () => {
    if (!editingBUId) return;
    try {
      setIsBUSaving(true);
      const { data } = await api.put(`/corporate/business-units/${encodeURIComponent(editingBUId)}`, {
        ...buForm,
        employeeCount: Number(buForm.employeeCount) || 0,
        healthScore: Number(buForm.healthScore) || 0,
        checkupCompletion: Number(buForm.checkupCompletion) || 0,
      });
      const updated = (data as any)?.data?.businessUnit as BusinessUnit | undefined;
      if (updated) setBusinessUnits((p) => p.map((u) => (u.id === updated.id ? updated : u))); else await loadBusinessUnits();
      toast({ title: 'Business Unit Updated', description: 'Business unit saved successfully.' });
      setIsBUEditOpen(false);
    } catch (error: any) {
      toast({ title: 'Failed to update business unit', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally { setIsBUSaving(false); }
  };

  const handleDeleteBU = async (id: string) => {
    try {
      await api.delete(`/corporate/business-units/${encodeURIComponent(id)}`);
      setBusinessUnits((p) => p.filter((u) => u.id !== id));
      toast({ title: 'Business Unit Deleted' });
    } catch (error: any) {
      toast({ title: 'Failed to delete business unit', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <CorporateLayout title="Org Structure">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">

        {/* ── Tab Toggle ── */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/60 border border-slate-700/50 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'departments'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Departments
          </button>
          <button
            onClick={() => setActiveTab('business-units')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'business-units'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            Business Units
          </button>
        </div>

        {/* ═══════════════ DEPARTMENTS VIEW ═══════════════ */}
        {activeTab === 'departments' && (
          <>
            <CorporatePageHeader
              icon={Building2}
              title="Department Management"
              description="Manage departments, allocate health budgets, and track health metrics"
              gradient="from-indigo-500 to-indigo-700"
              badge={`${departments.length} Departments`}
              showSearch={true}
              searchPlaceholder="Search departments by name, manager, or location..."
              searchValue={deptSearch}
              onSearchChange={setDeptSearch}
              showRefresh={true}
              onRefresh={loadDepartments}
              isRefreshing={isDeptLoading}
              showAdd={true}
              addLabel="Add Department"
              onAdd={() => { setDeptForm(emptyDeptForm()); setIsDeptAddOpen(true); }}
              stats={[
                { label: 'Total Departments', value: deptStats.total },
                { label: 'Total Employees', value: deptStats.employees },
                { label: 'Avg Health Score', value: `${deptStats.avgHealth}%` },
                { label: 'Avg Checkup Rate', value: `${deptStats.avgCheckup}%` },
              ]}
            />

            {/* Add Department Dialog */}
            <Dialog open={isDeptAddOpen} onOpenChange={setIsDeptAddOpen}>
              <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                  <DialogTitle>Add New Department</DialogTitle>
                  <DialogDescription>Create a new department with basic information</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Department Name</Label><Input placeholder="e.g., Customer Support" value={deptForm.name} onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Department Manager</Label><Input placeholder="Manager name" value={deptForm.manager} onChange={(e) => setDeptForm((p) => ({ ...p, manager: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Location</Label><Input placeholder="e.g., Building A, Floor 2" value={deptForm.location} onChange={(e) => setDeptForm((p) => ({ ...p, location: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Annual Health Budget</Label><Input placeholder="e.g., $50,000" value={deptForm.budget} onChange={(e) => setDeptForm((p) => ({ ...p, budget: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Description</Label><Textarea placeholder="Department description..." value={deptForm.description} onChange={(e) => setDeptForm((p) => ({ ...p, description: e.target.value }))} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDeptAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddDept} disabled={isDeptSaving}>{isDeptSaving ? 'Adding…' : 'Add Department'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Department Dialog */}
            <Dialog open={isDeptEditOpen} onOpenChange={setIsDeptEditOpen}>
              <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                  <DialogTitle>Edit Department</DialogTitle>
                  <DialogDescription>Update department details.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Department Name</Label><Input value={deptForm.name} onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Department Manager</Label><Input value={deptForm.manager} onChange={(e) => setDeptForm((p) => ({ ...p, manager: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Location</Label><Input value={deptForm.location} onChange={(e) => setDeptForm((p) => ({ ...p, location: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Annual Health Budget</Label><Input value={deptForm.budget} onChange={(e) => setDeptForm((p) => ({ ...p, budget: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Description</Label><Textarea value={deptForm.description} onChange={(e) => setDeptForm((p) => ({ ...p, description: e.target.value }))} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDeptEditOpen(false)} disabled={isDeptSaving}>Cancel</Button>
                  <Button onClick={handleSaveDept} disabled={isDeptSaving}>{isDeptSaving ? 'Saving…' : 'Save Changes'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* View Department Dialog */}
            <Dialog open={isDeptViewOpen} onOpenChange={setIsDeptViewOpen}>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>Department Details</DialogTitle>
                  <DialogDescription>Overview and metrics for the department.</DialogDescription>
                </DialogHeader>
                {selectedDept && (
                  <div className="space-y-3 text-sm">
                    <div><div className="font-semibold text-base">{selectedDept.name}</div><div className="text-slate-400">{selectedDept.description}</div></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-slate-400">Manager</div><div className="font-medium">{selectedDept.manager}</div></div>
                      <div><div className="text-slate-400">Employees</div><div className="font-medium">{selectedDept.employeeCount}</div></div>
                      <div><div className="text-slate-400">Location</div><div className="font-medium">{selectedDept.location}</div></div>
                      <div><div className="text-slate-400">Budget</div><div className="font-medium">{selectedDept.budget}</div></div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Departments</CardTitle><Building2 className="h-4 w-4 text-blue-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{deptStats.total}</div><p className="text-xs text-muted-foreground">Active departments</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Employees</CardTitle><Users className="h-4 w-4 text-green-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{deptStats.employees}</div><p className="text-xs text-muted-foreground">Across all departments</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Avg Health Score</CardTitle><TrendingUp className="h-4 w-4 text-purple-600" /></CardHeader><CardContent><div className={`text-2xl font-bold ${getScoreColor(deptStats.avgHealth)}`}>{deptStats.avgHealth}%</div><p className="text-xs text-muted-foreground">Organization-wide</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Checkup Rate</CardTitle><Calendar className="h-4 w-4 text-orange-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{deptStats.avgCheckup}%</div><p className="text-xs text-muted-foreground">Average completion</p></CardContent></Card>
            </div>

            {/* Departments List */}
            <Card>
              <CardHeader><CardTitle>All Departments</CardTitle><CardDescription>Browse and manage organizational departments</CardDescription></CardHeader>
              <CardContent>
                <div className="mb-6 relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search departments by name, manager, or location..." value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)} className="pl-8" /></div>
                <div className="space-y-4">
                  {filteredDepts.map((dept) => (
                    <Card key={dept.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-3">
                              <Building2 className="h-5 w-5 text-blue-600" />
                              <div><h3 className="font-semibold text-lg">{dept.name}</h3><p className="text-sm text-slate-400">{dept.description}</p></div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div><p className="text-sm text-slate-400">Manager</p><p className="font-semibold">{dept.manager}</p></div>
                              <div><p className="text-sm text-slate-400">Employees</p><p className="font-semibold flex items-center gap-1"><Users className="h-4 w-4" />{dept.employeeCount}</p></div>
                              <div><p className="text-sm text-slate-400">Location</p><p className="font-semibold">{dept.location}</p></div>
                              <div><p className="text-sm text-slate-400">Budget</p><p className="font-semibold">{dept.budget}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-2"><p className="text-sm text-slate-400">Health Score</p><span className={`font-bold ${getScoreColor(dept.healthScore)}`}>{dept.healthScore}%</span></div>
                                <div className="w-full bg-slate-700 rounded-full h-2"><div className={`h-2 rounded-full ${dept.healthScore >= 80 ? 'bg-green-600' : dept.healthScore >= 60 ? 'bg-yellow-600' : 'bg-red-600'}`} style={{ width: `${dept.healthScore}%` }} /></div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-2"><p className="text-sm text-slate-400">Checkup Completion</p><span className="font-bold">{dept.checkupCompletion}%</span></div>
                                <div className="w-full bg-slate-700 rounded-full h-2"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${dept.checkupCompletion}%` }} /></div>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button variant="outline" size="sm" onClick={() => { setSelectedDept(dept); setIsDeptViewOpen(true); }}><Eye className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => openEditDept(dept)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteDept(dept.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {isDeptLoading && departments.length === 0 && <div className="text-sm text-slate-400 mt-4">Loading departments…</div>}
                {filteredDepts.length === 0 && !isDeptLoading && (
                  <div className="text-center py-12 text-slate-400"><Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No departments found matching your search</p></div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ═══════════════ BUSINESS UNITS VIEW ═══════════════ */}
        {activeTab === 'business-units' && (
          <>
            <CorporatePageHeader
              icon={Layers}
              title="Business Unit Management"
              description="Manage business units, track health metrics, and monitor workforce across units"
              gradient="from-violet-500 to-violet-700"
              badge={`${businessUnits.length} Business Units`}
              showSearch={true}
              searchPlaceholder="Search business units by name, head, or region..."
              searchValue={buSearch}
              onSearchChange={setBUSearch}
              showRefresh={true}
              onRefresh={loadBusinessUnits}
              isRefreshing={isBULoading}
              showAdd={true}
              addLabel="Add Business Unit"
              onAdd={() => { setBUForm(emptyBUForm()); setIsBUAddOpen(true); }}
              stats={[
                { label: 'Total Business Units', value: buStats.total },
                { label: 'Total Employees', value: buStats.employees },
                { label: 'Avg Health Score', value: `${buStats.avgHealth}%` },
                { label: 'Avg Checkup Rate', value: `${buStats.avgCheckup}%` },
              ]}
            />

            {/* Add Business Unit Dialog */}
            <Dialog open={isBUAddOpen} onOpenChange={setIsBUAddOpen}>
              <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                  <DialogTitle>Add New Business Unit</DialogTitle>
                  <DialogDescription>Create a new business unit with basic information</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Business Unit Name</Label><Input placeholder="e.g., North Region" value={buForm.name} onChange={(e) => setBUForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Unit Head</Label><Input placeholder="Head name" value={buForm.head} onChange={(e) => setBUForm((p) => ({ ...p, head: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Region</Label><Input placeholder="e.g., North, South, HQ, Global" value={buForm.region} onChange={(e) => setBUForm((p) => ({ ...p, region: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Annual Health Budget</Label><Input placeholder="e.g., $150,000" value={buForm.budget} onChange={(e) => setBUForm((p) => ({ ...p, budget: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Description</Label><Textarea placeholder="Business unit description..." value={buForm.description} onChange={(e) => setBUForm((p) => ({ ...p, description: e.target.value }))} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsBUAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddBU} disabled={isBUSaving}>{isBUSaving ? 'Adding…' : 'Add Business Unit'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Business Unit Dialog */}
            <Dialog open={isBUEditOpen} onOpenChange={setIsBUEditOpen}>
              <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                  <DialogTitle>Edit Business Unit</DialogTitle>
                  <DialogDescription>Update business unit details.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Business Unit Name</Label><Input value={buForm.name} onChange={(e) => setBUForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Unit Head</Label><Input value={buForm.head} onChange={(e) => setBUForm((p) => ({ ...p, head: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Region</Label><Input value={buForm.region} onChange={(e) => setBUForm((p) => ({ ...p, region: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Annual Health Budget</Label><Input value={buForm.budget} onChange={(e) => setBUForm((p) => ({ ...p, budget: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label>Description</Label><Textarea value={buForm.description} onChange={(e) => setBUForm((p) => ({ ...p, description: e.target.value }))} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsBUEditOpen(false)} disabled={isBUSaving}>Cancel</Button>
                  <Button onClick={handleSaveBU} disabled={isBUSaving}>{isBUSaving ? 'Saving…' : 'Save Changes'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* View Business Unit Dialog */}
            <Dialog open={isBUViewOpen} onOpenChange={setIsBUViewOpen}>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>Business Unit Details</DialogTitle>
                  <DialogDescription>Overview and metrics for the business unit.</DialogDescription>
                </DialogHeader>
                {selectedBU && (
                  <div className="space-y-3 text-sm">
                    <div><div className="font-semibold text-base">{selectedBU.name}</div><div className="text-slate-400">{selectedBU.description}</div></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-slate-400">Unit Head</div><div className="font-medium">{selectedBU.head}</div></div>
                      <div><div className="text-slate-400">Employees</div><div className="font-medium">{selectedBU.employeeCount}</div></div>
                      <div><div className="text-slate-400">Region</div><div className="font-medium">{selectedBU.region}</div></div>
                      <div><div className="text-slate-400">Budget</div><div className="font-medium">{selectedBU.budget}</div></div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Business Units</CardTitle><Layers className="h-4 w-4 text-violet-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{buStats.total}</div><p className="text-xs text-muted-foreground">Active units</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Employees</CardTitle><Users className="h-4 w-4 text-green-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{buStats.employees}</div><p className="text-xs text-muted-foreground">Across all units</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Avg Health Score</CardTitle><TrendingUp className="h-4 w-4 text-purple-600" /></CardHeader><CardContent><div className={`text-2xl font-bold ${getScoreColor(buStats.avgHealth)}`}>{buStats.avgHealth}%</div><p className="text-xs text-muted-foreground">Organization-wide</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Checkup Rate</CardTitle><Calendar className="h-4 w-4 text-orange-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{buStats.avgCheckup}%</div><p className="text-xs text-muted-foreground">Average completion</p></CardContent></Card>
            </div>

            {/* Business Units List */}
            <Card>
              <CardHeader><CardTitle>All Business Units</CardTitle><CardDescription>Browse and manage business units</CardDescription></CardHeader>
              <CardContent>
                <div className="mb-6 relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search business units by name, head, or region..." value={buSearch} onChange={(e) => setBUSearch(e.target.value)} className="pl-8" /></div>
                <div className="space-y-4">
                  {filteredBUs.map((bu) => (
                    <Card key={bu.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-3">
                              <Layers className="h-5 w-5 text-violet-600" />
                              <div><h3 className="font-semibold text-lg">{bu.name}</h3><p className="text-sm text-slate-400">{bu.description}</p></div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div><p className="text-sm text-slate-400">Unit Head</p><p className="font-semibold">{bu.head}</p></div>
                              <div><p className="text-sm text-slate-400">Employees</p><p className="font-semibold flex items-center gap-1"><Users className="h-4 w-4" />{bu.employeeCount}</p></div>
                              <div><p className="text-sm text-slate-400">Region</p><p className="font-semibold">{bu.region}</p></div>
                              <div><p className="text-sm text-slate-400">Budget</p><p className="font-semibold">{bu.budget}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-2"><p className="text-sm text-slate-400">Health Score</p><span className={`font-bold ${getScoreColor(bu.healthScore)}`}>{bu.healthScore}%</span></div>
                                <div className="w-full bg-slate-700 rounded-full h-2"><div className={`h-2 rounded-full ${bu.healthScore >= 80 ? 'bg-green-600' : bu.healthScore >= 60 ? 'bg-yellow-600' : 'bg-red-600'}`} style={{ width: `${bu.healthScore}%` }} /></div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-2"><p className="text-sm text-slate-400">Checkup Completion</p><span className="font-bold">{bu.checkupCompletion}%</span></div>
                                <div className="w-full bg-slate-700 rounded-full h-2"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${bu.checkupCompletion}%` }} /></div>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button variant="outline" size="sm" onClick={() => { setSelectedBU(bu); setIsBUViewOpen(true); }}><Eye className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => openEditBU(bu)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteBU(bu.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {isBULoading && businessUnits.length === 0 && <div className="text-sm text-slate-400 mt-4">Loading business units…</div>}
                {filteredBUs.length === 0 && !isBULoading && (
                  <div className="text-center py-12 text-slate-400"><Layers className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No business units found matching your search</p></div>
                )}
              </CardContent>
            </Card>
          </>
        )}

      </div>
    </CorporateLayout>
  );
};

export default CorporateOrgStructure;

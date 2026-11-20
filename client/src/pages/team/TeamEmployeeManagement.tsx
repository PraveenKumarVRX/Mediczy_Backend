import { useState, useEffect, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Users, Search, Building2, Eye, Edit2, UserX, UserCheck,
  Loader2, Phone, Mail, Briefcase, Hash, RefreshCw, AlertCircle,
  ChevronDown, X, CalendarCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/utils/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Corporate {
  id: number;
  companyName: string;
  employeeCount?: number;
  status?: string;
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  status: string;       // from user_associations.status
  startDate?: string;
  metadata?: {
    employeeId?: string;
    department?: string;
    designation?: string;
    city?: string;
    pinCode?: string;
  };
  // plan
  planId?: string;
  planName?: string;
  planValidTo?: string;
  // derived
  corporateId?: number;
  corporateName?: string;
}

interface CorporatePlan {
  packageId: string;
  packageName: string;
}

const DEPT_OPTIONS = [
  'IT', 'HR', 'Finance', 'Marketing', 'Sales', 'Operations',
  'Admin', 'Engineering', 'Support', 'Legal', 'Other',
];

const DESIG_OPTIONS = [
  'Executive', 'Manager', 'Senior Manager', 'Team Lead', 'Developer',
  'Senior Developer', 'Analyst', 'Consultant', 'Director', 'VP', 'Officer', 'Other',
];

// ─── Main Page ────────────────────────────────────────────────────────────────

const TeamEmployeeManagement = () => {
  const { toast } = useToast();

  // ── Corporate list ─────────────────────────────────────────────
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [corpLoading, setCorpLoading] = useState(false);
  const [selectedCorporate, setSelectedCorporate] = useState<Corporate | null>(null);

  // ── Employee list ──────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // ── View dialog ────────────────────────────────────────────────
  const [viewEmp, setViewEmp] = useState<Employee | null>(null);

  // ── Edit dialog ────────────────────────────────────────────────
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    department: '',
    designation: '',
    city: '',
    pinCode: '',
    packageId: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  // ── Corporate packages (for plan dropdown) ─────────────────────
  const [corpPackages, setCorpPackages] = useState<CorporatePlan[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);

  // ── Toggle status ──────────────────────────────────────────────
  const [toggling, setToggling] = useState<number | null>(null);

  // ── Load corporates ────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setCorpLoading(true);
      try {
        const r = await api.get('/admin/corporates');
        const list: Corporate[] = (r.data.data || []).map((c: any) => ({
          id: c.id,
          companyName: c.companyName || c.name || `Corporate #${c.id}`,
          employeeCount: c.employeeCount,
          status: c.status,
        }));
        setCorporates(list);
        if (list.length === 1) setSelectedCorporate(list[0]);
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load corporates.' });
      } finally {
        setCorpLoading(false);
      }
    };
    load();
  }, []);

  // ── Load employees when corporate changes ──────────────────────
  const loadEmployees = useCallback(async (corp: Corporate) => {
    setEmpLoading(true);
    setEmployees([]);
    try {
      const r = await api.get(`/admin/corporate-employees/${corp.id}`);
      const raw: any[] = r.data.employees || [];
      setEmployees(raw.map(e => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phoneNumber: e.phoneNumber,
        status: e.status || 'active',
        startDate: e.startDate,
        metadata: e.metadata || {},
        planId: e.currentPackageId,
        planName: e.currentPackageName,
        planValidTo: e.packageValidTo,
        corporateId: corp.id,
        corporateName: corp.companyName,
      })));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load employees.' });
    } finally {
      setEmpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCorporate) loadEmployees(selectedCorporate);
    else setEmployees([]);
  }, [selectedCorporate]);

  // ── Filtered employees ─────────────────────────────────────────
  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.phoneNumber || '').includes(q) ||
      (e.metadata?.employeeId || '').toLowerCase().includes(q) ||
      (e.metadata?.department || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Edit handlers ──────────────────────────────────────────────
  const openEdit = (emp: Employee) => {
    setEditEmp(emp);
    setEditForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phoneNumber: emp.phoneNumber,
      department: emp.metadata?.department || '',
      designation: emp.metadata?.designation || '',
      city: emp.metadata?.city || '',
      pinCode: emp.metadata?.pinCode || '',
      packageId: emp.planId || '',
    });
    // Load available packages for this corporate
    if (selectedCorporate) {
      setPkgLoading(true);
      api.get(`/admin/corporate-health-packages/${selectedCorporate.id}`)
        .then(r => setCorpPackages((r.data.packages || []).map((p: any) => ({ packageId: String(p.packageId), packageName: p.packageName }))))
        .catch(() => setCorpPackages([]))
        .finally(() => setPkgLoading(false));
    }
  };

  const saveEdit = async () => {
    if (!editEmp || !selectedCorporate) return;
    setEditSaving(true);
    try {
      await api.put(`/admin/corporate-employees/${editEmp.id}`, {
        corporateId: selectedCorporate.id,
        ...editForm,
        packageId: editForm.packageId || undefined,
      });
      toast({ title: 'Saved', description: `${editForm.firstName} ${editForm.lastName} updated.` });
      setEditEmp(null);
      loadEmployees(selectedCorporate);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e?.response?.data?.message || 'Failed to save.' });
    } finally {
      setEditSaving(false);
    }
  };

  // ── Toggle active/inactive ─────────────────────────────────────
  const toggleStatus = async (emp: Employee) => {
    if (!selectedCorporate) return;
    const newStatus = emp.status === 'active' ? 'inactive' : 'active';
    setToggling(emp.id);
    try {
      await api.put(`/admin/corporate-employees/${emp.id}`, {
        corporateId: selectedCorporate.id,
        status: newStatus,
      });
      const label = newStatus === 'inactive' ? 'deactivated' : 'reactivated';
      toast({ title: 'Updated', description: `${emp.firstName} ${emp.lastName} ${label}.` });
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: newStatus } : e));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e?.response?.data?.message || 'Failed to update status.' });
    } finally {
      setToggling(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" /> Employee Management
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              View, edit and manage corporate employees
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="flex items-center gap-1.5">
              <Link to={selectedCorporate ? `/team/completed-checkups?corporateId=${selectedCorporate.id}` : '/team/completed-checkups'}>
                <CalendarCheck className="h-4 w-4" /> Completed check-ups &amp; reports
              </Link>
            </Button>
            {selectedCorporate && (
              <Button variant="outline" size="sm" onClick={() => loadEmployees(selectedCorporate)} className="flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            )}
          </div>
        </div>

        {/* ── Corporate Selector ── */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
                <Building2 className="h-4 w-4" /> Corporate
              </div>
              {corpLoading ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading corporates...
                </span>
              ) : (
                <Select
                  value={selectedCorporate?.id?.toString() || ''}
                  onValueChange={v => setSelectedCorporate(corporates.find(c => c.id === parseInt(v)) || null)}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Select a corporate..." />
                  </SelectTrigger>
                  <SelectContent>
                    {corporates.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.companyName}
                        {c.employeeCount ? ` (${c.employeeCount} employees)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCorporate && (
                <Badge variant="secondary" className="shrink-0">
                  {filtered.length} / {employees.length} employees
                  {statusFilter !== 'all' ? ` (${statusFilter})` : ''}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Filters ── */}
        {selectedCorporate && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, employee ID or department..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── Employee Table ── */}
        {!selectedCorporate ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Select a corporate to view its employees</p>
            </CardContent>
          </Card>
        ) : empLoading ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
              <p>Loading employees...</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{employees.length === 0 ? 'No employees found for this corporate.' : 'No employees match your search.'}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                {selectedCorporate.companyName} — Employees
                <Badge variant="secondary">{filtered.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Emp ID</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Department</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(emp => (
                      <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{emp.firstName} {emp.lastName}</div>
                          <div className="text-xs text-muted-foreground">{emp.email}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {emp.metadata?.employeeId || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">{emp.metadata?.department || '—'}</div>
                          {emp.metadata?.designation && (
                            <div className="text-xs text-muted-foreground">{emp.metadata.designation}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" /> {emp.phoneNumber || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={emp.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setViewEmp(emp)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(emp)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${emp.status === 'active' ? 'hover:text-red-500' : 'hover:text-green-600'}`}
                              title={emp.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              onClick={() => toggleStatus(emp)}
                              disabled={toggling === emp.id}
                            >
                              {toggling === emp.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : emp.status === 'active'
                                  ? <UserX className="h-4 w-4" />
                                  : <UserCheck className="h-4 w-4" />
                              }
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2 p-3">
                {filtered.map(emp => (
                  <div key={emp.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{emp.firstName} {emp.lastName}</div>
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
                      </div>
                      <StatusBadge status={emp.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {emp.metadata?.employeeId && <span className="font-mono">#{emp.metadata.employeeId}</span>}
                      {emp.metadata?.department && <span>{emp.metadata.department}</span>}
                      {emp.phoneNumber && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{emp.phoneNumber}</span>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => setViewEmp(emp)}>
                        <Eye className="h-3 w-3" /> View
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => openEdit(emp)}>
                        <Edit2 className="h-3 w-3" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`flex-1 h-8 text-xs gap-1 ${emp.status === 'active' ? 'text-red-500 border-red-200' : 'text-green-600 border-green-200'}`}
                        onClick={() => toggleStatus(emp)}
                        disabled={toggling === emp.id}
                      >
                        {toggling === emp.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : emp.status === 'active'
                            ? <><UserX className="h-3 w-3" /> Deactivate</>
                            : <><UserCheck className="h-3 w-3" /> Reactivate</>
                        }
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ───────────────────────────────────────────────── */}
        {/* View Dialog                                       */}
        {/* ───────────────────────────────────────────────── */}
        <Dialog open={!!viewEmp} onOpenChange={open => !open && setViewEmp(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600" /> Employee Details
              </DialogTitle>
              <DialogDescription className="sr-only">Employee details view</DialogDescription>
            </DialogHeader>
            {viewEmp && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold">{viewEmp.firstName} {viewEmp.lastName}</span>
                  <StatusBadge status={viewEmp.status} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InfoRow icon={<Hash className="h-4 w-4" />} label="Employee ID" value={viewEmp.metadata?.employeeId} />
                  <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Department" value={viewEmp.metadata?.department} />
                  <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Designation" value={viewEmp.metadata?.designation} />
                  <InfoRow icon={<Building2 className="h-4 w-4" />} label="Corporate" value={viewEmp.corporateName} />
                  <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={viewEmp.email} />
                  <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={viewEmp.phoneNumber} />
                  {viewEmp.planName && (
                    <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Health Plan" value={viewEmp.planName} />
                  )}
                  {viewEmp.startDate && (
                    <InfoRow icon={<Hash className="h-4 w-4" />} label="Joined" value={new Date(viewEmp.startDate).toLocaleDateString('en-IN')} />
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setViewEmp(null); if (viewEmp) openEdit(viewEmp); }}>
                <Edit2 className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button onClick={() => setViewEmp(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ───────────────────────────────────────────────── */}
        {/* Edit Dialog                                       */}
        {/* ───────────────────────────────────────────────── */}
        <Dialog open={!!editEmp} onOpenChange={open => !open && setEditEmp(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-blue-600" /> Edit Employee
              </DialogTitle>
              <DialogDescription className="sr-only">Edit employee form</DialogDescription>
            </DialogHeader>
            {editEmp && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>First Name</Label>
                    <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Last Name</Label>
                    <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Phone Number</Label>
                  <Input value={editForm.phoneNumber} onChange={e => setEditForm(f => ({ ...f, phoneNumber: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Department</Label>
                    <Select value={editForm.department} onValueChange={v => setEditForm(f => ({ ...f, department: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {DEPT_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Designation</Label>
                    <Select value={editForm.designation} onValueChange={v => setEditForm(f => ({ ...f, designation: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {DESIG_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>City</Label>
                    <Input placeholder="e.g. Chennai" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Pin Code</Label>
                    <Input placeholder="e.g. 600001" maxLength={10} value={editForm.pinCode} onChange={e => setEditForm(f => ({ ...f, pinCode: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                </div>

                {/* Health Plan */}
                <div className="space-y-1">
                  <Label>Health Plan</Label>
                  <Select
                    value={editForm.packageId || '__none__'}
                    onValueChange={v => setEditForm(f => ({ ...f, packageId: v === '__none__' ? '' : v }))}
                    disabled={pkgLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={pkgLoading ? 'Loading plans...' : corpPackages.length === 0 ? 'No plans available' : 'Select plan...'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No plan assigned —</SelectItem>
                      {corpPackages.map(p => (
                        <SelectItem key={p.packageId} value={p.packageId}>{p.packageName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status toggle in edit dialog */}
                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div className="text-sm">
                    <p className="font-medium">Employee Status</p>
                    <p className="text-xs text-muted-foreground">Inactive employees cannot use corporate benefits</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={editEmp.status === 'active' ? 'text-red-500 border-red-200' : 'text-green-600 border-green-200'}
                    onClick={() => { toggleStatus(editEmp); setEditEmp(null); }}
                  >
                    {editEmp.status === 'active'
                      ? <><UserX className="h-4 w-4 mr-1" /> Deactivate</>
                      : <><UserCheck className="h-4 w-4 mr-1" /> Reactivate</>
                    }
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditEmp(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={editSaving}>
                {editSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
};

// ─── Helper components ─────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const isActive = status === 'active';
  return (
    <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-green-600 hover:bg-green-700' : 'text-muted-foreground'}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
};

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) => (
  <div className="space-y-0.5">
    <p className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</p>
    <p className="font-medium">{value || '—'}</p>
  </div>
);

export default TeamEmployeeManagement;

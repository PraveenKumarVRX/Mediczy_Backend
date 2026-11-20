import React, { useEffect, useState, useCallback } from 'react';
import {
  CalendarCheck, Plus, Users, CheckCircle, Clock,
  Bell, Search, Download, Filter,
  FileText, UserPlus, Settings,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { exportToCSV } from '@/utils/exportToExcel';
import HealthCheckupStatusBoard from '@/components/corporate/HealthCheckupStatusBoard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AhcBatch {
  id: number;
  batchName: string;
  batchYear: number;
  scheduledDate: string | null;
  dueDate: string;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  priority: 'normal' | 'high' | 'urgent';
  notes: string | null;
  targetDepartments: string[] | null;
  enrolled: number;
  completed: number;
  pending: number;
  reportReady: number;
  createdAt: string;
}

interface Enrollment {
  id: number;
  employeeId: string;
  employeeName: string;
  name: string;
  email: string;
  department: string;
  status: 'pending' | 'invited' | 'booked' | 'completed' | 'skipped';
  bookedDate: string | null;
  bookedSlot: string | null;
  reportReady: boolean;
  reportUrl: string | null;
  reminderSentAt: string | null;
  notes: string | null;
  dependents: number;
}

interface AhcSummary {
  batches: number;
  activeBatches: number;
  enrolled: number;
  completed: number;
  pending: number;
  invited: number;
  booked: number;
  reportReady: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-slate-700 text-slate-300',
  active:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed:'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled:'bg-red-500/20 text-red-400 border-red-500/30',
  pending:  'bg-slate-700 text-slate-400',
  invited:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  booked:   'bg-violet-500/20 text-violet-300 border-violet-500/30',
  skipped:  'bg-slate-700 text-slate-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  normal: 'bg-slate-700 text-slate-400',
  high:   'bg-amber-500/20 text-amber-400 border-amber-500/30',
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
};

// ─── Component ────────────────────────────────────────────────────────────────

const CorporateAnnualHealthCheckup: React.FC = () => {
  const { toast } = useToast();
  const [summary, setSummary] = useState<AhcSummary>({ batches: 0, activeBatches: 0, enrolled: 0, completed: 0, pending: 0, invited: 0, booked: 0, reportReady: 0 });
  const [batches, setBatches] = useState<AhcBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<AhcBatch | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'batches' | 'enrollments' | 'reports'>('batches');
  const [healthReports, setHealthReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create batch dialog
  const [activationBatch, setActivationBatch] = useState<AhcBatch | null>(null);
  const [packageOptions, setPackageOptions] = useState<{id:string;name:string}[]>([]);
  const [activationPackage, setActivationPackage] = useState('');
  const [activating, setActivating] = useState(false);
  const [reminding, setReminding] = useState<Set<number>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [enrollingBatchIds, setEnrollingBatchIds] = useState<Set<number>>(new Set());
  const [newBatch, setNewBatch] = useState({ batchName: '', dueDate: '', scheduledDate: '', priority: 'normal', notes: '' });

  // Update enrollment dialog
  const [editEnroll, setEditEnroll] = useState<Enrollment | null>(null);
  const [updatingEnroll, setUpdatingEnroll] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ status: '', bookedDate: '', bookedSlot: '', reportReady: false, notes: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, batchRes] = await Promise.all([
        api.get('/corporate/ahc/summary').catch(() => ({ data: null })),
        api.get('/corporate/ahc/batches').catch(() => ({ data: null })),
      ]);
      if (summaryRes.data?.data) setSummary(summaryRes.data.data);
      if (batchRes.data?.data?.batches) setBatches(batchRes.data.data.batches);
    } catch {
      toast({ title: 'Failed to load AHC data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadEnrollments = useCallback(async (batch: AhcBatch) => {
    setEnrollLoading(true);
    try {
      const { data } = await api.get(`/corporate/ahc/batches/${batch.id}/enrollments`);
      setEnrollments(data?.data?.enrollments || []);
    } catch {
      toast({ title: 'Failed to load enrollments', variant: 'destructive' });
    } finally {
      setEnrollLoading(false);
    }
  }, [toast]);

  const loadHealthReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const { data } = await api.get('/corporate/health-reports');
      setHealthReports(data?.data?.reports || []);
    } catch {
      toast({ title: 'Failed to load report status', variant: 'destructive' });
    } finally {
      setReportsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); loadHealthReports(); }, [loadData, loadHealthReports]);
  useEffect(() => {
    if (selectedBatch && activeTab === 'enrollments') loadEnrollments(selectedBatch);
  }, [selectedBatch, activeTab, loadEnrollments]);

  const handleCreateBatch = async () => {
    if (!newBatch.batchName.trim() || !newBatch.dueDate) {
      toast({ title: 'Batch name and due date are required', variant: 'destructive' }); return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/corporate/ahc/batches', {
        batchName: newBatch.batchName.trim(),
        dueDate: newBatch.dueDate,
        scheduledDate: newBatch.scheduledDate || undefined,
        priority: newBatch.priority,
        notes: newBatch.notes || undefined,
      });
      toast({ title: 'Batch created', description: newBatch.batchName });
      setCreateOpen(false);
      setNewBatch({ batchName: '', dueDate: '', scheduledDate: '', priority: 'normal', notes: '' });
      loadData();
    } catch (e: any) {
      toast({ title: 'Failed to create batch', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleEnrollAll = async (batch: AhcBatch) => {
    if (enrollingBatchIds.has(batch.id)) return; // already in flight - a double-click was
    // hitting ON CONFLICT DO NOTHING on the second request, which returned "0 employees
    // enrolled" even though the first request had already enrolled everyone.
    setEnrollingBatchIds((prev) => new Set(prev).add(batch.id));
    try {
      const { data } = await api.post(`/corporate/ahc/batches/${batch.id}/enroll-all`);
      toast({ title: 'Employees enrolled', description: data?.data?.message });
      loadData();
      if (selectedBatch?.id === batch.id) loadEnrollments(batch);
    } catch (e: any) {
      toast({ title: 'Failed to enroll', description: e?.response?.data?.message, variant: 'destructive' });
    } finally {
      setEnrollingBatchIds((prev) => { const next = new Set(prev); next.delete(batch.id); return next; });
    }
  };

  const handleSendReminders = async (batch: AhcBatch) => {
    if (reminding.has(batch.id)) return;
    setReminding(previous => new Set(previous).add(batch.id));
    try {
      const { data } = await api.post(`/corporate/ahc/batches/${batch.id}/send-reminders`);
      toast({ title: 'Reminders sent', description: data?.data?.message });
      loadData();
    } catch {
      toast({ title: 'Failed to send reminders', variant: 'destructive' });
    } finally { setReminding(previous => {const next=new Set(previous);next.delete(batch.id);return next;}); }
  };

  const handleActivateBatch = async (batch: AhcBatch, status: string) => {
    if (status === 'active' && !activationBatch) {
      try {
        const {data}=await api.get('/corporate/ahc/package-options');
        setPackageOptions(data?.data?.packages || []);
        setActivationPackage('');setActivationBatch(batch);
      } catch { toast({title:'Unable to load configured health packages',variant:'destructive'}); }
      return;
    }
    if (activating) return;
    setActivating(true);
    try {
      await api.put(`/corporate/ahc/batches/${batch.id}`, { status, packageId: activationPackage || undefined });
      setActivationBatch(null);
      toast({ title: `Batch ${status}` });
      loadData();
    } catch (error: any) {
      toast({ title: 'Failed to update batch', description:error?.response?.data?.message, variant: 'destructive' });
    } finally { setActivating(false); }
  };

  const openEditEnroll = (e: Enrollment) => {
    setEditEnroll(e);
    setEnrollForm({ status: e.status, bookedDate: e.bookedDate || '', bookedSlot: e.bookedSlot || '', reportReady: e.reportReady, notes: e.notes || '' });
  };

  const handleUpdateEnroll = async () => {
    if (!editEnroll) return;
    setUpdatingEnroll(true);
    try {
      await api.put(`/corporate/ahc/enrollments/${editEnroll.id}`, {
        status: enrollForm.status || undefined,
        bookedDate: enrollForm.bookedDate || undefined,
        bookedSlot: enrollForm.bookedSlot || undefined,
        reportReady: enrollForm.reportReady,
        notes: enrollForm.notes || undefined,
      });
      toast({ title: 'Updated', description: editEnroll.name });
      setEditEnroll(null);
      if (selectedBatch) loadEnrollments(selectedBatch);
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setUpdatingEnroll(false);
    }
  };

  const exportBatchCSV = () => {
    if (!enrollments.length) return;
    exportToCSV(enrollments.map(e => ({
      EmployeeID: e.employeeId, Name: e.name, Department: e.department,
      Status: e.status, BookedDate: e.bookedDate || '', BookedSlot: e.bookedSlot || '',
      ReportReady: e.reportReady ? 'Yes' : 'No', ReminderSent: e.reminderSentAt ? new Date(e.reminderSentAt).toLocaleDateString('en-IN') : '',
    })), { filename: `ahc-${selectedBatch?.batchName || 'batch'}` });
  };

  const filteredEnrollments = enrollments.filter(e => {
    const matchSearch = !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.employeeId.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const completionPct = (b: AhcBatch) => b.enrolled > 0 ? Math.round((b.completed / b.enrolled) * 100) : 0;

  return (
    <CorporateLayout title="Annual Health Checkup">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={CalendarCheck}
          title="Annual Health Checkup"
          description="Manage yearly health checkup cycles, eligibility, and tracking"
          gradient="from-teal-500 to-teal-700"
          showAdd={true}
          addLabel="New Batch"
          onAdd={() => setCreateOpen(true)}
          showRefresh={true}
          onRefresh={loadData}
          isRefreshing={loading}
          stats={[
            { label: 'Active Batches', value: summary.activeBatches },
            { label: 'Enrolled', value: summary.enrolled },
            { label: 'Completed', value: summary.completed },
            { label: 'Reports Ready', value: summary.reportReady },
          ]}
        />

        {/* Summary cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: 'Pending', value: summary.pending, color: 'text-slate-400', bg: 'bg-slate-700/30' },
            { label: 'Invited', value: summary.invited, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Booked', value: summary.booked, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Completed', value: summary.completed, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          ].map(stat => (
            <Card key={stat.label} className="bg-slate-900/60 border-slate-700/60">
              <CardContent className="pt-4 pb-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Batches list */}
        {batches.length === 0 ? (
          <Card className="bg-slate-900/60 border-slate-700/60">
            <CardContent className="py-12 text-center space-y-3">
              <CalendarCheck className="h-10 w-10 text-slate-700 mx-auto" />
              <p className="text-slate-400">No checkup batches yet</p>
              <p className="text-slate-500 text-sm">Create a batch to start organising annual health checkups for your employees.</p>
              <Button onClick={() => setCreateOpen(true)} className="mt-2 bg-teal-600 hover:bg-teal-500">
                <Plus className="h-4 w-4 mr-2" /> Create First Batch
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {batches.map(batch => (
              <Card key={batch.id} className={`bg-slate-900/60 border-slate-700/60 hover:border-slate-600 transition-colors ${selectedBatch?.id === batch.id ? 'ring-1 ring-teal-500/40' : ''}`}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-100">{batch.batchName}</h3>
                        <Badge className={`text-xs ${STATUS_COLORS[batch.status] || ''}`}>{batch.status}</Badge>
                        {batch.status === 'planning' && batch.scheduledDate && new Date(batch.scheduledDate).getTime() < Date.now() && <Badge className="text-amber-300">Awaiting activation — start date passed</Badge>}
                        <Badge className={`text-xs ${PRIORITY_COLORS[batch.priority] || ''}`}>{batch.priority}</Badge>
                        <span className="text-xs text-slate-500">FY {batch.batchYear}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span>Due: {new Date(batch.dueDate).toLocaleDateString('en-IN')}</span>
                        {batch.scheduledDate && <span>Scheduled: {new Date(batch.scheduledDate).toLocaleDateString('en-IN')}</span>}
                        {batch.enrolled > 0 && <span>{batch.enrolled} enrolled</span>}
                      </div>
                      {batch.enrolled > 0 && (
                        <div className="mt-3 space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>Completion</span>
                            <span>{batch.completed}/{batch.enrolled} ({completionPct(batch)}%)</span>
                          </div>
                          <Progress value={completionPct(batch)} className="h-1.5 bg-slate-800" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" variant="outline"
                        onClick={() => { setSelectedBatch(batch); setActiveTab('enrollments'); loadEnrollments(batch); }}
                        className="h-7 px-2 text-xs bg-slate-800/60 border-slate-700/60 text-slate-300">
                        <Users className="h-3 w-3 mr-1" /> View ({batch.enrolled})
                      </Button>
                      {batch.status === 'planning' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleEnrollAll(batch)}
                            disabled={enrollingBatchIds.has(batch.id)}
                            className="h-7 px-2 text-xs bg-teal-500/10 border-teal-500/30 text-teal-400">
                            <UserPlus className="h-3 w-3 mr-1" /> {enrollingBatchIds.has(batch.id) ? 'Enrolling…' : 'Enroll All'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleActivateBatch(batch, 'active')}
                            className="h-7 px-2 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400">
                            Activate
                          </Button>
                        </>
                      )}
                      {batch.status === 'active' && (
                        <Button size="sm" variant="outline" disabled={reminding.has(batch.id)} onClick={() => handleSendReminders(batch)}
                          className="h-7 px-2 text-xs bg-amber-500/10 border-amber-500/30 text-amber-400">
                          <Bell className="h-3 w-3 mr-1" /> Remind
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Enrollments panel */}
        {selectedBatch && (
          <Card className="bg-slate-900/60 border-slate-700/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-slate-100 text-base">{selectedBatch.batchName} — Enrollments</CardTitle>
                  <CardDescription className="text-slate-500 text-xs">{enrollments.length} employees</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <Input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search…" className="pl-8 h-8 w-40 bg-slate-800/60 border-slate-700/60 text-sm text-slate-300" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-32 bg-slate-800/60 border-slate-700/60 text-slate-300 text-xs">
                      <Filter className="h-3 w-3 mr-1" /><SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {['all','pending','invited','booked','completed','skipped'].map(s => (
                        <SelectItem key={s} value={s} className="text-slate-300 text-xs">{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {enrollments.length > 0 && <Button variant="outline" size="sm" onClick={exportBatchCSV} className="h-8 text-xs bg-slate-800/60 border-slate-700/60 text-slate-400">
                    <Download className="h-3.5 w-3.5 mr-1" /> CSV
                  </Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {enrollLoading ? (
                <div className="text-center py-6 text-slate-500">Loading…</div>
              ) : filteredEnrollments.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  {enrollments.length === 0 ? 'No employees enrolled yet — use "Enroll All" to add them.' : 'No employees match the filter.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-slate-400 text-xs uppercase">
                        <th className="text-left pb-2 font-medium">Employee</th>
                        <th className="text-left pb-2 font-medium">Dept</th>
                        <th className="text-left pb-2 font-medium">Status</th>
                        <th className="text-left pb-2 font-medium">Booked</th>
                        <th className="text-center pb-2 font-medium">Report</th>
                        <th className="text-center pb-2 font-medium">Deps</th>
                        <th className="text-right pb-2 font-medium">Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredEnrollments.map(e => (
                        <tr key={e.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5">
                            <p className="font-medium text-slate-200">{e.name || e.employeeId}</p>
                            <p className="text-xs text-slate-500">{e.email || e.employeeId}</p>
                          </td>
                          <td className="py-2.5 text-slate-400 text-xs">{e.department || '—'}</td>
                          <td className="py-2.5">
                            <Badge className={`text-xs ${STATUS_COLORS[e.status] || ''}`}>{e.status}</Badge>
                          </td>
                          <td className="py-2.5 text-slate-400 text-xs">
                            {e.bookedDate ? new Date(e.bookedDate).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="py-2.5 text-center">
                            {e.reportReady ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <Clock className="h-4 w-4 text-slate-600 mx-auto" />}
                          </td>
                          <td className="py-2.5 text-center text-slate-500 text-xs">{e.dependents || 0}</td>
                          <td className="py-2.5 text-right">
                            <Button size="sm" variant="outline" onClick={() => openEditEnroll(e)}
                              className="h-7 px-2 text-xs bg-slate-800/60 border-slate-700/60 text-slate-400">
                              <Settings className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Health check-up status: every eligible employee from not booked to report delivered (HR full access, every access audited) */}
        <HealthCheckupStatusBoard mode="hr" cardClassName="bg-slate-900/60 border-slate-700/60 text-slate-100" />

        {/* Report Status panel */}
        <Card className="bg-slate-900/60 border-slate-700/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-100 text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-teal-400" /> Report Delivery Status
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs">Track which employees have received their health reports</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={loadHealthReports} disabled={reportsLoading} className="text-slate-400 h-8">
                {reportsLoading ? 'Loading…' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <p className="text-slate-500 text-sm py-4 text-center">Loading…</p>
            ) : healthReports.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No health reports found. Reports uploaded via the Team portal will appear here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {['Employee', 'Dept', 'Report', 'Type', 'Due', 'Delivered', 'Status'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {healthReports.map(r => (
                      <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-200">{r.employeeName || r.employeeId}</td>
                        <td className="py-2 px-3 text-slate-400">{r.department || '—'}</td>
                        <td className="py-2 px-3 text-slate-300">{r.reportName}</td>
                        <td className="py-2 px-3 text-slate-400">{r.checkupType || r.reportType}</td>
                        <td className="py-2 px-3 text-slate-400">{r.dueAt ? new Date(r.dueAt).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="py-2 px-3 text-slate-400">{r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${
                            r.slaStatus === 'delivered' ? 'bg-emerald-500/20 text-emerald-400' :
                            r.slaStatus === 'overdue'   ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>{r.slaStatus || (r.deliveredAt ? 'delivered' : 'pending')}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create batch dialog */}
        <Dialog open={!!activationBatch} onOpenChange={open => {if(!open&&!activating)setActivationBatch(null);}}>
        <DialogContent><DialogHeader><DialogTitle>Activate checkup batch</DialogTitle><DialogDescription>Select the package employees will receive. Active enrolled employees with linked accounts will be invited.</DialogDescription></DialogHeader>
          <Label htmlFor="activation-package">Health checkup package</Label>
          <Select value={activationPackage} onValueChange={setActivationPackage}><SelectTrigger id="activation-package" className="bg-background text-foreground"><SelectValue placeholder="Select a package" /></SelectTrigger><SelectContent>{packageOptions.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
          {!packageOptions.length && <p>No packages configured. Ask an administrator to create a health checkup package for this corporate.</p>}
          <Button disabled={!activationPackage || activating} onClick={()=>activationBatch&&handleActivateBatch(activationBatch,'active')}>{activating?'Activating…':'Activate and invite employees'}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle>Create Checkup Batch</DialogTitle>
              <DialogDescription className="text-slate-400">Set up a new annual health checkup cycle for your employees.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Batch Name *</Label>
                <Input value={newBatch.batchName} onChange={e => setNewBatch(p => ({ ...p, batchName: e.target.value }))}
                  placeholder="e.g. AHC 2026 — All Employees" className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Due Date *</Label>
                  <Input type="date" value={newBatch.dueDate} onChange={e => setNewBatch(p => ({ ...p, dueDate: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-slate-100" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Scheduled Start</Label>
                  <Input type="date" value={newBatch.scheduledDate} onChange={e => setNewBatch(p => ({ ...p, scheduledDate: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-slate-100" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Priority</Label>
                <Select value={newBatch.priority} onValueChange={v => setNewBatch(p => ({ ...p, priority: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="normal" className="text-slate-300">Normal</SelectItem>
                    <SelectItem value="high" className="text-slate-300">High</SelectItem>
                    <SelectItem value="urgent" className="text-slate-300">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Notes (optional)</Label>
                <Input value={newBatch.notes} onChange={e => setNewBatch(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any special instructions…" className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
              <Button onClick={handleCreateBatch} disabled={creating} className="bg-teal-600 hover:bg-teal-500">
                {creating ? 'Creating…' : 'Create Batch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit enrollment dialog */}
        <Dialog open={!!editEnroll} onOpenChange={v => { if (!v) setEditEnroll(null); }}>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle>Update Enrollment</DialogTitle>
              <DialogDescription className="text-slate-400">{editEnroll?.name || editEnroll?.employeeId}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Status</Label>
                <Select value={enrollForm.status} onValueChange={v => setEnrollForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {['pending','invited','booked','completed','skipped'].map(s => (
                      <SelectItem key={s} value={s} className="text-slate-300 capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Booked Date</Label>
                  <Input type="date" value={enrollForm.bookedDate} onChange={e => setEnrollForm(p => ({ ...p, bookedDate: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-slate-100" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Time Slot</Label>
                  <Input value={enrollForm.bookedSlot} onChange={e => setEnrollForm(p => ({ ...p, bookedSlot: e.target.value }))}
                    placeholder="e.g. 10:00 AM" className="bg-slate-800 border-slate-700 text-slate-100" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="rr" checked={enrollForm.reportReady} onChange={e => setEnrollForm(p => ({ ...p, reportReady: e.target.checked }))}
                  className="accent-teal-500" />
                <Label htmlFor="rr" className="text-slate-300 cursor-pointer">Report Ready</Label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Notes</Label>
                <Input value={enrollForm.notes} onChange={e => setEnrollForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes…" className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditEnroll(null)} className="border-slate-700 text-slate-300">Cancel</Button>
              <Button onClick={handleUpdateEnroll} disabled={updatingEnroll} className="bg-teal-600 hover:bg-teal-500">
                {updatingEnroll ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateAnnualHealthCheckup;

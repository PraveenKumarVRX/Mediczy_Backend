import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Key,
  Send,
  Download,
  Shield,
  Smartphone,
  Mail,
  Phone,
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  MoreHorizontal,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface UserRecord {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  healthStatus: string;
  appStatus: 'active' | 'inactive' | 'invited' | 'not_invited';
  lastLogin?: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  inactive: 'bg-red-500/15 text-red-400 border-red-500/30',
  invited: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  not_invited: 'bg-slate-700/50 text-slate-400 border-slate-600/50',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  invited: 'Invite Sent',
  not_invited: 'Not Invited',
};

const CorporateUserManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const resp = await api.get('/corporate/employees');
      const raw: any[] = resp.data?.data?.employees || [];
      const mapped: UserRecord[] = raw.map((e) => ({
        id: e.id || e.employeeId,
        employeeId: e.employeeId || e.id,
        name: e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.email,
        email: e.email || '',
        phone: e.phone || e.phoneNumber || '',
        department: e.department || 'Not Assigned',
        designation: e.designation || 'Not Assigned',
        healthStatus: e.healthStatus || 'Not Assessed',
        appStatus: e.appStatus || (e.email ? 'not_invited' : 'inactive'),
        lastLogin: e.lastLogin || undefined,
      }));
      setUsers(mapped);
    } catch {
      toast({ title: 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const departments = ['all', ...Array.from(new Set(users.map((u) => u.department))).filter(Boolean).sort()];

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.employeeId.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || u.appStatus === filterStatus;
    const matchDept = filterDept === 'all' || u.department === filterDept;
    return matchSearch && matchStatus && matchDept;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const handleSendInvite = async (user: UserRecord) => {
    setSelectedUser(user);
    setInviteDialogOpen(true);
  };

  const confirmSendInvite = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.post('/corporate/employees/send-invite', { email: selectedUser.email, employeeId: selectedUser.employeeId });
      toast({ title: `Invite sent to ${selectedUser.name}`, description: `An app access invite was sent to ${selectedUser.email}` });
      setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? { ...u, appStatus: 'invited' } : u));
    } catch {
      toast({ title: 'Failed to send invite', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
      setInviteDialogOpen(false);
    }
  };

  const handleResetPassword = (user: UserRecord) => {
    setSelectedUser(user);
    setResetDialogOpen(true);
  };

  const confirmResetPassword = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.post('/corporate/employees/reset-password', { employeeId: selectedUser.employeeId, email: selectedUser.email });
      toast({ title: 'Password reset email sent', description: `A reset link was sent to ${selectedUser.email}` });
    } catch {
      toast({ title: 'Failed to reset password', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
      setResetDialogOpen(false);
    }
  };

  const handleToggleStatus = async (user: UserRecord) => {
    const newStatus = user.appStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/corporate/employees/${user.employeeId}`, { appStatus: newStatus });
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, appStatus: newStatus } : u));
      toast({ title: `User ${newStatus === 'active' ? 'activated' : 'deactivated'}`, description: `${user.name} is now ${newStatus}.` });
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Employee ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'App Status'].join(','),
      ...filtered.map((u) => [u.employeeId, `"${u.name}"`, u.email, u.phone, u.department, u.designation, u.appStatus].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-management-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCounts = {
    total: users.length,
    active: users.filter((u) => u.appStatus === 'active').length,
    invited: users.filter((u) => u.appStatus === 'invited').length,
    notInvited: users.filter((u) => u.appStatus === 'not_invited').length,
  };

  return (
    <CorporateLayout title="User Management" subtitle="Manage employee app accounts and portal access">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={Shield}
          title="User Management"
          description="Manage employee app accounts, send invites, and control portal access"
          gradient="from-violet-600 to-violet-800"
          badge={{ text: `${users.length} Users`, variant: 'violet' }}
          actions={
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" /> Export
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: statCounts.total, icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/15' },
            { label: 'Active', value: statCounts.active, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
            { label: 'Invite Sent', value: statCounts.invited, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/15' },
            { label: 'Not Invited', value: statCounts.notInvited, icon: XCircle, color: 'text-slate-400', bg: 'bg-slate-700/50' },
          ].map((stat) => (
            <Card key={stat.label} className="!p-0 bg-slate-900/50 border-white/[0.06]">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="!p-0 bg-slate-900/50 border-white/[0.06]">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search by name, email, employee ID..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9 bg-slate-800/60 border-white/10 text-white placeholder:text-slate-500 focus:border-violet-500"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="w-44">
                  <Filter className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="App Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="invited">Invite Sent</SelectItem>
                  <SelectItem value="not_invited">Not Invited</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterDept} onValueChange={(v) => { setFilterDept(v); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <Building2 className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d === 'all' ? 'All Departments' : d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchUsers} title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="!p-0 bg-slate-900/50 border-white/[0.06]">
          <CardHeader className="pb-0">
            <CardTitle className="text-base font-semibold text-white">
              {filtered.length} user{filtered.length !== 1 ? 's' : ''} found
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-10 h-10 border-4 border-t-violet-500 border-slate-200 rounded-full animate-spin" />
              </div>
            ) : paginated.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-slate-800/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">App Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginated.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-800/30 transition-colors border-b border-white/[0.04]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white">{user.name}</p>
                              <p className="text-xs text-slate-500">{user.employeeId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-300">{user.department}</p>
                          <p className="text-xs text-slate-500">{user.designation}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                              <Mail className="w-3 h-3" /> {user.email}
                            </div>
                            {user.phone && (
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <Phone className="w-3 h-3" /> {user.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[user.appStatus]}`}>
                            <Smartphone className="w-3 h-3" />
                            {statusLabels[user.appStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {(user.appStatus === 'not_invited' || user.appStatus === 'inactive') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-violet-400 border-violet-500/30 hover:bg-violet-500/10 bg-transparent"
                                onClick={() => handleSendInvite(user)}
                              >
                                <Send className="w-3 h-3" /> Invite
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleResetPassword(user)}
                            >
                              <Key className="w-3 h-3" /> Reset
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 text-xs gap-1 bg-transparent ${user.appStatus === 'active' ? 'text-red-400 border-red-500/30 hover:bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'}`}
                              onClick={() => handleToggleStatus(user)}
                            >
                              {user.appStatus === 'active' ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                              {user.appStatus === 'active' ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send App Invite</DialogTitle>
            <DialogDescription>
              An invite email with app download link and login credentials will be sent to <strong>{selectedUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-violet-500" /> {selectedUser?.name}</div>
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-violet-500" /> {selectedUser?.email}</div>
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-violet-500" /> {selectedUser?.department}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmSendInvite} disabled={actionLoading} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
              <Send className="w-4 h-4" /> {actionLoading ? 'Sending...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              A password reset link will be sent to <strong>{selectedUser?.email}</strong>. The employee will be prompted to set a new password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmResetPassword} disabled={actionLoading} className="gap-2">
              <Key className="w-4 h-4" /> {actionLoading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CorporateLayout>
  );
};

export default CorporateUserManagement;

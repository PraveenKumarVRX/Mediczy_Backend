import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Users, Shield, Save, X, Search, RefreshCw, Plus,
  CheckCircle2, Loader2, ChevronDown, ChevronUp, UserX, UserCheck, Mail, Phone,
} from 'lucide-react';
import api from '@/utils/api';

interface TeamMemberRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  department: string;
  designation: string;
  isActive: boolean;
  permissions: string[];
  lastLogin?: string;
  createdAt?: string;
}

interface PermissionDef { key: string; group: string; description: string; }

const EDITABLE_MODULES = [
  'users', 'doctors', 'appointments', 'chat', 'hospitals',
  'pharmacies', 'plans', 'reports', 'team_directory', 'corporates',
  'clinics', 'labs', 'brokers', 'support', 'activity',
];

const ROLE_OPTIONS = ['team_member', 'team_lead', 'admin'];

const emptyCreateForm = {
  firstName: '', lastName: '', email: '', phone: '',
  role: 'team_member', department: '', designation: '',
};

const TeamStaffManagement = () => {
  const { toast } = useToast();

  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [search, setSearch] = useState('');

  const [catalog, setCatalog] = useState<PermissionDef[]>([]);

  const [selected, setSelected] = useState<TeamMemberRow | null>(null);
  const [permDraft, setPermDraft] = useState<string[]>([]);
  const [editableDraft, setEditableDraft] = useState<string[]>([]);
  const [deletableDraft, setDeletableDraft] = useState<string[]>([]);
  const [expanded, setExpanded] = useState({ permissions: true, modules: false, profile: true });
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '', department: '', designation: '', role: 'team_member' });
  const [savingProfile, setSavingProfile] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/team/users', { params: { status: statusFilter, limit: 100 } });
      if (data?.success) setMembers(data.users || []);
    } catch (err) {
      console.error('Failed to load team members', err);
      toast({ title: 'Failed to load team members', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async () => {
    try {
      const { data } = await api.get('/team/permissions-catalog');
      if (data?.success) setCatalog(data.permissions || []);
    } catch (err) {
      console.error('Failed to load permissions catalog', err);
    }
  };

  useEffect(() => { loadCatalog(); }, []);
  useEffect(() => { loadMembers(); }, [statusFilter]);

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) || (m.department || '').toLowerCase().includes(q);
  });

  const openEditor = (m: TeamMemberRow) => {
    setSelected(m);
    setPermDraft([...(m.permissions || [])]);
    setEditableDraft([]);
    setDeletableDraft([]);
    setProfileForm({
      firstName: m.firstName || '', lastName: m.lastName || '', phone: m.phone || '',
      department: m.department || '', designation: m.designation || '', role: m.role || 'team_member',
    });
  };

  const togglePerm = (perm: string) =>
    setPermDraft((d) => d.includes(perm) ? d.filter((p) => p !== perm) : [...d, perm]);

  const toggleMod = (mod: string, key: 'editable' | 'deletable') => {
    const setter = key === 'editable' ? setEditableDraft : setDeletableDraft;
    setter((d) => d.includes(mod) ? d.filter((m) => m !== mod) : [...d, mod]);
  };

  const savePrivileges = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/team/privileges/${selected.id}`, {
        permissions: permDraft,
        editableModules: editableDraft,
        deletableModules: deletableDraft,
      });
      toast({ title: 'Permissions updated', description: `${selected.firstName} ${selected.lastName}` });
      setMembers((prev) => prev.map((m) => m.id === selected.id ? { ...m, permissions: permDraft } : m));
      setSelected((s) => s ? { ...s, permissions: permDraft } : s);
    } catch (err) {
      console.error('Save privileges failed', err);
      toast({ title: 'Failed to save permissions', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!selected) return;
    setSavingProfile(true);
    try {
      await api.patch(`/team/users/${selected.id}`, profileForm);
      toast({ title: 'Profile updated' });
      await loadMembers();
      setSelected((s) => s ? { ...s, ...profileForm } : s);
    } catch (err) {
      console.error('Save profile failed', err);
      toast({ title: 'Failed to update profile', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleActive = async (m: TeamMemberRow) => {
    setToggling(m.id);
    try {
      await api.patch(`/team/users/${m.id}`, { isActive: !m.isActive });
      toast({ title: m.isActive ? 'Member deactivated' : 'Member reactivated' });
      await loadMembers();
      if (selected?.id === m.id) setSelected((s) => s ? { ...s, isActive: !m.isActive } : s);
    } catch (err) {
      console.error('Toggle status failed', err);
      toast({ title: 'Failed to update status', variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  };

  const createMember = async () => {
    if (!createForm.firstName || !createForm.lastName || !createForm.email) {
      toast({ title: 'First name, last name and email are required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await api.post('/team/users', createForm);
      toast({ title: 'Team member created', description: createForm.email });
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      await loadMembers();
    } catch (err: any) {
      console.error('Create member failed', err);
      toast({ title: 'Failed to create member', description: err?.response?.data?.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const permGroups = Array.from(new Set(catalog.map((p) => p.group)));

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-indigo-500" />
              Team Members &amp; Access
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Create staff accounts, assign designations and control RBAC permissions.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadMembers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-1" /> Add Team Member
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Member list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Staff Directory
                <Badge variant="outline" className="ml-auto">{filtered.length}</Badge>
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search name, email, department…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No team members found.</div>
              ) : (
                <div className="divide-y">
                  {filtered.map((m) => (
                    <div
                      key={m.id}
                      className={`w-full px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-2 ${selected?.id === m.id ? 'bg-indigo-500/5 border-l-2 border-indigo-500' : ''}`}
                    >
                      <button className="flex-1 text-left" onClick={() => openEditor(m)}>
                        <p className="font-medium text-sm">
                          {m.firstName} {m.lastName}
                          {!m.isActive && <span className="ml-1 text-xs text-red-500">(inactive)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{m.email} · {m.designation}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                          <Badge variant="outline" className="text-[10px]">{m.department}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{(m.permissions || []).length}p</Badge>
                        </div>
                      </button>
                      <Button
                        size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                        disabled={toggling === m.id}
                        onClick={() => toggleActive(m)}
                        title={m.isActive ? 'Deactivate' : 'Reactivate'}
                      >
                        {toggling === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> :
                          m.isActive ? <UserX className="h-4 w-4 text-red-500" /> : <UserCheck className="h-4 w-4 text-green-500" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Editor panel */}
          <div className="space-y-4">
            {!selected ? (
              <Card className="flex items-center justify-center min-h-[300px]">
                <CardContent className="text-center py-16 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Select a team member to view their profile and permissions.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setExpanded((e) => ({ ...e, profile: !e.profile }))}>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2"><Users className="h-4 w-4 text-indigo-500" /> Profile</span>
                      {expanded.profile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-3 text-xs pt-1">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selected.email}</span>
                      {selected.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selected.phone}</span>}
                    </CardDescription>
                  </CardHeader>
                  {expanded.profile && (
                    <CardContent className="space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">First name</Label>
                          <Input className="h-8 text-sm" value={profileForm.firstName} onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Last name</Label>
                          <Input className="h-8 text-sm" value={profileForm.lastName} onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input className="h-8 text-sm" value={profileForm.phone} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Role</Label>
                          <Select value={profileForm.role} onValueChange={(v) => setProfileForm((f) => ({ ...f, role: v }))}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Department</Label>
                          <Input className="h-8 text-sm" value={profileForm.department} onChange={(e) => setProfileForm((f) => ({ ...f, department: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Designation</Label>
                          <Input className="h-8 text-sm" value={profileForm.designation} onChange={(e) => setProfileForm((f) => ({ ...f, designation: e.target.value }))} />
                        </div>
                      </div>
                      <Button size="sm" onClick={saveProfile} disabled={savingProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {savingProfile ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        Save Profile
                      </Button>
                    </CardContent>
                  )}
                </Card>

                <Card>
                  <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setExpanded((e) => ({ ...e, permissions: !e.permissions }))}>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-indigo-500" />
                        Module Permissions
                        <Badge variant="secondary">{permDraft.length}/{catalog.length}</Badge>
                      </span>
                      {expanded.permissions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                  {expanded.permissions && (
                    <CardContent>
                      <div className="flex gap-2 mb-3">
                        <Button size="sm" variant="outline" onClick={() => setPermDraft(catalog.map((p) => p.key))}>Grant all</Button>
                        <Button size="sm" variant="outline" onClick={() => setPermDraft([])}>Revoke all</Button>
                        <Button size="sm" onClick={savePrivileges} disabled={saving} className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white">
                          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                          Save Permissions
                        </Button>
                      </div>
                      {permGroups.map((group) => (
                        <div key={group} className="mb-3">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{group}</p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {catalog.filter((p) => p.group === group).map((perm) => {
                              const checked = permDraft.includes(perm.key);
                              return (
                                <div key={perm.key} title={perm.description} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors hover:bg-muted/30 ${checked ? 'border-indigo-500/30 bg-indigo-500/5' : ''}`}>
                                  <Checkbox id={`p-${perm.key}`} checked={checked} onCheckedChange={() => togglePerm(perm.key)} />
                                  <Label htmlFor={`p-${perm.key}`} className="text-xs cursor-pointer">{perm.key}</Label>
                                  {checked && <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>

                <Card>
                  <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setExpanded((e) => ({ ...e, modules: !e.modules }))}>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-amber-500" />
                        Edit / Delete Access
                      </span>
                      {expanded.modules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                  {expanded.modules && (
                    <CardContent>
                      <div className="space-y-1.5">
                        {EDITABLE_MODULES.map((mod) => (
                          <div key={mod} className="flex items-center gap-6 p-2 rounded-lg border text-xs">
                            <span className="w-32 font-medium capitalize">{mod.replace(/_/g, ' ')}</span>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <Checkbox checked={editableDraft.includes(mod)} onCheckedChange={() => toggleMod(mod, 'editable')} />
                              Edit
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <Checkbox checked={deletableDraft.includes(mod)} onCheckedChange={() => toggleMod(mod, 'deletable')} />
                              Delete
                            </label>
                          </div>
                        ))}
                      </div>
                      <Button size="sm" onClick={savePrivileges} disabled={saving} className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        Save Module Access
                      </Button>
                    </CardContent>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Creates a new internal staff account with team login access.</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">First name *</Label>
              <Input className="h-9 text-sm" value={createForm.firstName} onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Last name *</Label>
              <Input className="h-9 text-sm" value={createForm.lastName} onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Email *</Label>
              <Input className="h-9 text-sm" type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input className="h-9 text-sm" value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Input className="h-9 text-sm" value={createForm.department} onChange={(e) => setCreateForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Designation</Label>
              <Input className="h-9 text-sm" value={createForm.designation} onChange={(e) => setCreateForm((f) => ({ ...f, designation: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createMember} disabled={creating} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Create Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default TeamStaffManagement;

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  Users, Shield, Save, X, Search, RefreshCw,
  CheckCircle2, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

// All 15 team permissions — mirrors TEAM_PERMISSIONS in server/config/roles.config.js
const ALL_PERMISSIONS = [
  'User Management',
  'Doctor Management',
  'Appointment Management',
  'Patient Reports',
  'Analytics Access',
  'Chat Dashboard Access',
  'Hospital Management',
  'Clinic Management',
  'Lab Management',
  'Pharmacy Management',
  'Health Plans Access',
  'Corporate Management',
  'Broker Management',
  'Support Tickets',
  'Audit Access',
];

const EDITABLE_MODULES = [
  'users', 'doctors', 'appointments', 'chat', 'hospitals',
  'pharmacies', 'plans', 'reports', 'team_directory', 'corporates',
  'clinics', 'labs', 'brokers', 'support', 'activity',
];

interface TeamMember {
  id: string | number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  isActive: boolean;
  permissions: string[];
  editableModules: string[];
  deletableModules: string[];
  privilegesUpdatedAt: string | null;
}

const TeamPrivileges = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [draft, setDraft] = useState<Pick<TeamMember, 'permissions' | 'editableModules' | 'deletableModules'> | null>(null);
  const [expanded, setExpanded] = useState({ permissions: true, modules: false });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-team-members', search],
    queryFn: async () => {
      const { data } = await api.get(`/admin/team-members?limit=100&search=${encodeURIComponent(search)}`);
      return data;
    },
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string | number; payload: any }) => {
      const { data } = await api.put(`/admin/team-members/${id}/privileges`, payload);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'Privileges saved', description: `Updated for ${selectedMember?.email}` });
      queryClient.invalidateQueries({ queryKey: ['admin-team-members'] });
      if (selectedMember) {
        const updated = { ...selectedMember, ...data.member };
        setSelectedMember(updated);
        setDraft(null);
      }
    },
    onError: () => {
      toast({ title: 'Save failed', description: 'Could not update privileges.', variant: 'destructive' });
    },
  });

  const members: TeamMember[] = data?.members || [];

  const openEditor = (member: TeamMember) => {
    setSelectedMember(member);
    setDraft({
      permissions: [...(member.permissions || [])],
      editableModules: [...(member.editableModules || [])],
      deletableModules: [...(member.deletableModules || [])],
    });
  };

  const togglePerm = (perm: string) =>
    setDraft((d) => !d ? d : {
      ...d,
      permissions: d.permissions.includes(perm)
        ? d.permissions.filter((p) => p !== perm)
        : [...d.permissions, perm],
    });

  const toggleMod = (mod: string, key: 'editableModules' | 'deletableModules') =>
    setDraft((d) => !d ? d : {
      ...d,
      [key]: d[key].includes(mod) ? d[key].filter((m) => m !== mod) : [...d[key], mod],
    });

  const isDirty = draft && selectedMember && (
    JSON.stringify([...draft.permissions].sort()) !== JSON.stringify([...(selectedMember.permissions || [])].sort()) ||
    JSON.stringify([...draft.editableModules].sort()) !== JSON.stringify([...(selectedMember.editableModules || [])].sort()) ||
    JSON.stringify([...draft.deletableModules].sort()) !== JSON.stringify([...(selectedMember.deletableModules || [])].sort())
  );

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-indigo-500" />
              Team Privilege Management
            </h1>
            <p className="text-muted-foreground mt-1">Set module permissions and edit/delete access per team member.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Member list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Members
                {data?.total != null && <Badge variant="outline" className="ml-auto">{data.total}</Badge>}
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[560px] overflow-y-auto">
              {isLoading ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : members.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No team members found.</div>
              ) : (
                <div className="divide-y">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openEditor(m)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${
                        selectedMember?.id === m.id ? 'bg-indigo-500/5 border-l-2 border-indigo-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">
                            {m.firstName} {m.lastName}
                            {!m.isActive && <span className="ml-1 text-xs text-red-500">(inactive)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 justify-end">
                          <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${m.status === 'active' ? 'border-green-500/30 text-green-600' : 'border-red-500/30 text-red-600'}`}
                          >
                            {m.status}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">{(m.permissions || []).length}p</Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Editor panel */}
          <div className="space-y-4">
            {!selectedMember ? (
              <Card className="flex items-center justify-center min-h-[300px]">
                <CardContent className="text-center py-16 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Select a team member to edit privileges.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Header */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{selectedMember.firstName} {selectedMember.lastName}</CardTitle>
                        <CardDescription>{selectedMember.email}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {isDirty && (
                          <Button size="sm" variant="outline" onClick={() => openEditor(selectedMember)}>
                            <X className="h-4 w-4 mr-1" />Revert
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => saveMutation.mutate({ id: selectedMember.id, payload: draft })}
                          disabled={!isDirty || saveMutation.isPending}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Permissions card */}
                <Card>
                  <CardHeader
                    className="pb-2 cursor-pointer select-none"
                    onClick={() => setExpanded((e) => ({ ...e, permissions: !e.permissions }))}
                  >
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-indigo-500" />
                        Module Permissions
                        <Badge variant="secondary">{draft?.permissions.length ?? 0}/{ALL_PERMISSIONS.length}</Badge>
                      </span>
                      {expanded.permissions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                  {expanded.permissions && (
                    <CardContent>
                      <div className="flex gap-2 mb-3">
                        <Button size="sm" variant="outline" onClick={() => setDraft((d) => d ? { ...d, permissions: [...ALL_PERMISSIONS] } : d)}>
                          Grant all
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDraft((d) => d ? { ...d, permissions: [] } : d)}>
                          Revoke all
                        </Button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {ALL_PERMISSIONS.map((perm) => {
                          const checked = draft?.permissions.includes(perm) ?? false;
                          return (
                            <div key={perm} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors hover:bg-muted/30 ${checked ? 'border-indigo-500/30 bg-indigo-500/5' : ''}`}>
                              <Checkbox id={`p-${perm}`} checked={checked} onCheckedChange={() => togglePerm(perm)} />
                              <Label htmlFor={`p-${perm}`} className="text-xs cursor-pointer">{perm}</Label>
                              {checked && <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Edit/Delete module access */}
                <Card>
                  <CardHeader
                    className="pb-2 cursor-pointer select-none"
                    onClick={() => setExpanded((e) => ({ ...e, modules: !e.modules }))}
                  >
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-amber-500" />
                        Edit / Delete Access
                        <Badge variant="secondary">{draft?.editableModules.length ?? 0} editable</Badge>
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
                              <Checkbox checked={draft?.editableModules.includes(mod) ?? false} onCheckedChange={() => toggleMod(mod, 'editableModules')} />
                              Edit
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <Checkbox checked={draft?.deletableModules.includes(mod) ?? false} onCheckedChange={() => toggleMod(mod, 'deletableModules')} />
                              Delete
                            </label>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>

                {selectedMember.privilegesUpdatedAt && (
                  <p className="text-xs text-muted-foreground text-right">
                    Last updated: {new Date(selectedMember.privilegesUpdatedAt).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default TeamPrivileges;

import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Monitor, Ticket, Users, Package, Activity,
  Network, HardDrive, Shield, Lock, BarChart3, Settings, HelpCircle,
  PlusCircle, Download, Search, Filter, Loader2, Server, Wifi, KeyRound,
  BadgeCheck, AlertTriangle, LifeBuoy, Database, Tag, Router,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createITEDPTicket,
  createITEDPUserProvision,
  createITEDPAsset,
  createITEDPAssetLabel,
  createITEDPNetworkAdmin,
  deleteITEDPTicket,
  deleteITEDPUserProvision,
  deleteITEDPAsset,
  deleteITEDPAssetLabel,
  deleteITEDPNetworkAdmin,
  updateITEDPTicket,
  updateITEDPUserProvision,
  updateITEDPAsset,
  updateITEDPAssetLabel,
  updateITEDPNetworkAdmin,
  useITEDPPortalData,
} from './useITEDPPortalData';

export const itEdpNavSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Monitor, label: 'Dashboard', href: '/it-edp/dashboard' }] },
  { title: 'Support', items: [
    { icon: Ticket,  label: 'Help Desk Tickets', href: '/it-edp/tickets' },
    { icon: Users,   label: 'User Accounts',     href: '/it-edp/users' },
    { icon: Package, label: 'Asset Management',  href: '/it-edp/assets' },
  ]},
  { title: 'Infrastructure', items: [
    { icon: Activity,   label: 'System Monitor',    href: '/it-edp/systems' },
    { icon: Network,    label: 'Network Status',    href: '/it-edp/network' },
    { icon: HardDrive,  label: 'Backup & Recovery', href: '/it-edp/backup' },
  ]},
  { title: 'Security', items: [
    { icon: Shield, label: 'Security Logs',  href: '/it-edp/security' },
    { icon: Lock,   label: 'Access Control', href: '/it-edp/access' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Reports',  href: '/it-edp/reports' },
    { icon: Settings,   label: 'Settings', href: '/it-edp/settings' },
    { icon: HelpCircle, label: 'Support',  href: '/it-edp/support' },
  ]},
];

const statusTone: Record<string, string> = {
  Open: 'bg-red-100 text-red-700',
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-amber-100 text-amber-700',
  Medium: 'bg-blue-100 text-blue-700',
  Low: 'bg-slate-200 text-slate-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
  Escalated: 'bg-violet-100 text-violet-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Repair: 'bg-amber-100 text-amber-700',
  'At Risk': 'bg-red-100 text-red-700',
  Operational: 'bg-emerald-100 text-emerald-700',
  Degraded: 'bg-amber-100 text-amber-700',
  Stable: 'bg-emerald-100 text-emerald-700',
  Watch: 'bg-amber-100 text-amber-700',
  Warning: 'bg-amber-100 text-amber-700',
  Failed: 'bg-red-100 text-red-700',
  Successful: 'bg-emerald-100 text-emerald-700',
  Healthy: 'bg-emerald-100 text-emerald-700',
  Due: 'bg-amber-100 text-amber-700',
  Action: 'bg-red-100 text-red-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  Ready: 'bg-emerald-100 text-emerald-700',
  Live: 'bg-blue-100 text-blue-700',
  'Needs Review': 'bg-amber-100 text-amber-700',
  Provisioning: 'bg-blue-100 text-blue-700',
  Suspended: 'bg-slate-200 text-slate-700',
  Printed: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Reprint: 'bg-red-100 text-red-700',
  Review: 'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
};

const ToneBadge = ({ value }: { value: string }) => (
  <Badge className={`${statusTone[value] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>{value}</Badge>
);

const PageShell = ({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: React.ReactNode; children: React.ReactNode; }) => (
  <HospDeptLayout deptKey="it-edp" deptName="IT / EDP" badgeLabel="IT/EDP" loginPath="/it-edp/login" DeptIcon={Monitor} navSections={itEdpNavSections} title={title} subtitle={subtitle}>
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search systems, tickets, or users" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-1"><Filter className="h-4 w-4" />Filter</Button>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </div>
  </HospDeptLayout>
);

const StatCard = ({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub: string; icon: LucideIcon; color: string; }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><Icon className={`h-5 w-5 ${color}`} /></div>
      </div>
    </CardContent>
  </Card>
);

const SectionTable = ({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) => (
  <table className="w-full text-sm">
    <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{headers.map((header) => <th key={header} className="py-2 pr-3 font-medium">{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index} className="border-b last:border-0 hover:bg-muted/30">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-3 pr-3 align-top">{cell}</td>)}</tr>)}</tbody>
  </table>
);

const ITEDPDataState = ({ loading, error, refresh }: { loading: boolean; error: string | null; refresh: () => void }) => {
  if (!loading && !error) return null;
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>{loading ? 'Loading IT/EDP operations data...' : error}</span>
        </div>
        {!loading && <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>}
      </CardContent>
    </Card>
  );
};

const ActionError = ({ error }: { error: string | null }) => {
  if (!error) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
};

const actionFilterOptions = ['All', 'Created', 'Updated', 'Deleted'];

const mapHistoryAction = (value: string) => {
  if (value.includes('CREATED')) return 'Created';
  if (value.includes('UPDATED')) return 'Updated';
  if (value.includes('DELETED')) return 'Deleted';
  return 'Other';
};

const filterHistoryRows = <T extends { action: string; actor: string }>(
  rows: T[],
  actionFilter: string,
  actorFilter: string,
) => rows.filter((row) => {
  const actionMatches = actionFilter === 'All' || mapHistoryAction(row.action) === actionFilter;
  const actorMatches = actorFilter === 'All' || row.actor === actorFilter;
  return actionMatches && actorMatches;
});

const HistoryFilterBar = ({
  rows,
  actionFilter,
  actorFilter,
  onActionChange,
  onActorChange,
}: {
  rows: Array<{ action: string; actor: string }>;
  actionFilter: string;
  actorFilter: string;
  onActionChange: (value: string) => void;
  onActorChange: (value: string) => void;
}) => {
  const actors = ['All', ...Array.from(new Set(rows.map((row) => row.actor).filter(Boolean)))];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-slate-50 p-3 md:flex-row md:items-center md:justify-between dark:bg-slate-800/40">
      <div className="flex flex-wrap gap-2">
        {actionFilterOptions.map((option) => (
          <Button key={option} size="sm" variant={actionFilter === option ? 'default' : 'outline'} onClick={() => onActionChange(option)}>
            {option}
          </Button>
        ))}
      </div>
      <div className="w-full md:w-56">
        <Select value={actorFilter} onValueChange={onActorChange}>
          <SelectTrigger><SelectValue placeholder="Filter by actor" /></SelectTrigger>
          <SelectContent>
            {actors.map((actor) => <SelectItem key={actor} value={actor}>{actor}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

const HistoryPanel = ({ title, rows }: { title: string; rows: Array<{ action: string; resourceId: string; actor: string; time: string; summary: string }> }) => {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={`${row.resourceId}-${row.time}`} className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-900 dark:text-white">{row.summary}</span>
              <span className="text-xs text-muted-foreground">{row.time}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{row.action} · {row.actor} · {row.resourceId}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export const ITEDPTicketsPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const [ticketDraft, setTicketDraft] = useState({ title: '', department: '', priority: 'Medium', status: 'Open', owner: '', note: '' });
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState({ title: '', department: '', priority: 'Medium', status: 'Open', owner: '', note: '' });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyActionFilter, setHistoryActionFilter] = useState('All');
  const [historyActorFilter, setHistoryActorFilter] = useState('All');
  const tickets = data?.tickets ?? [];
  const ticketHistory = filterHistoryRows(data?.ticketHistory ?? [], historyActionFilter, historyActorFilter);

  const startEditTicket = (ticket: typeof tickets[number]) => {
    setEditingTicketId(ticket.id);
    setEditingTicket({ title: ticket.title, department: ticket.department, priority: ticket.priority, status: ticket.status, owner: ticket.owner, note: ticket.note || '' });
  };

  const handleCreateTicket = async () => {
    try {
      setSubmitting('ticket');
      setActionError(null);
      await createITEDPTicket(ticketDraft);
      setTicketDraft({ title: '', department: '', priority: 'Medium', status: 'Open', owner: '', note: '' });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to create ticket');
    } finally {
      setSubmitting(null);
    }
  };

  const handleSaveTicket = async (id: string) => {
    try {
      setSubmitting(id);
      setActionError(null);
      await updateITEDPTicket(id, editingTicket);
      setEditingTicketId(null);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update ticket');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    try {
      setSubmitting(`delete-${id}`);
      setActionError(null);
      await deleteITEDPTicket(id);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to delete ticket');
    } finally {
      setSubmitting(null);
    }
  };

  return <PageShell title="Help Desk Tickets" subtitle="Clinical and administrative service desk workload with SLA visibility" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Queue</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />New Ticket</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><ActionError error={actionError} /><div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><StatCard label="Open" value={String(tickets.filter((row) => row.status !== 'Resolved').length)} sub="Pending action" icon={Ticket} color="text-red-600" /><StatCard label="High Priority" value={String(tickets.filter((row) => ['High', 'Critical'].includes(row.priority)).length)} sub="Patient-impacting or urgent" icon={AlertTriangle} color="text-amber-600" /><StatCard label="Resolved" value={String(tickets.filter((row) => row.status === 'Resolved').length)} sub="Closed today trend" icon={BadgeCheck} color="text-emerald-600" /><StatCard label="Owning Teams" value={String(new Set(tickets.map((row) => row.owner)).size)} sub="Cross-functional response" icon={Users} color="text-blue-600" /></div><Card><CardHeader><CardTitle className="text-base">Log Ticket</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2"><Input placeholder="Issue title" value={ticketDraft.title} onChange={(event) => setTicketDraft((current) => ({ ...current, title: event.target.value }))} /><Input placeholder="Department" value={ticketDraft.department} onChange={(event) => setTicketDraft((current) => ({ ...current, department: event.target.value }))} /><Select value={ticketDraft.priority} onValueChange={(value) => setTicketDraft((current) => ({ ...current, priority: value }))}><SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="Critical">Critical</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Low">Low</SelectItem></SelectContent></Select><Input placeholder="Owner" value={ticketDraft.owner} onChange={(event) => setTicketDraft((current) => ({ ...current, owner: event.target.value }))} /><Textarea placeholder="Ticket note" className="md:col-span-2" value={ticketDraft.note} onChange={(event) => setTicketDraft((current) => ({ ...current, note: event.target.value }))} /><Button disabled={submitting === 'ticket' || !ticketDraft.title} onClick={handleCreateTicket} className="bg-teal-600 hover:bg-teal-700 md:col-span-2">Create Ticket</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Service Desk Queue</CardTitle></CardHeader><CardContent><SectionTable headers={['ID', 'Issue', 'Department', 'Priority', 'Status', 'Owner', 'Aging', 'Actions']} rows={tickets.map((row) => editingTicketId === row.id ? [row.id, <div className="space-y-2"><Input value={editingTicket.title} onChange={(event) => setEditingTicket((current) => ({ ...current, title: event.target.value }))} /><Textarea value={editingTicket.note} onChange={(event) => setEditingTicket((current) => ({ ...current, note: event.target.value }))} /></div>, <Input value={editingTicket.department} onChange={(event) => setEditingTicket((current) => ({ ...current, department: event.target.value }))} />, <Select value={editingTicket.priority} onValueChange={(value) => setEditingTicket((current) => ({ ...current, priority: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Critical">Critical</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Low">Low</SelectItem></SelectContent></Select>, <Select value={editingTicket.status} onValueChange={(value) => setEditingTicket((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Open">Open</SelectItem><SelectItem value="In Progress">In Progress</SelectItem><SelectItem value="Escalated">Escalated</SelectItem><SelectItem value="Resolved">Resolved</SelectItem></SelectContent></Select>, <Input value={editingTicket.owner} onChange={(event) => setEditingTicket((current) => ({ ...current, owner: event.target.value }))} />, row.aging, <div className="flex gap-2"><Button size="sm" disabled={Boolean(submitting)} onClick={() => handleSaveTicket(row.id)}>Save</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => setEditingTicketId(null)}>Cancel</Button></div>] : [row.id, <div><div>{row.title}</div>{row.note ? <div className="mt-1 text-xs text-muted-foreground">{row.note}</div> : null}</div>, row.department, <ToneBadge value={row.priority} />, <ToneBadge value={row.status} />, row.owner, row.aging, <div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => startEditTicket(row)}>Edit</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleDeleteTicket(row.id)}>Delete</Button></div>])} /></CardContent></Card><HistoryFilterBar rows={data?.ticketHistory ?? []} actionFilter={historyActionFilter} actorFilter={historyActorFilter} onActionChange={setHistoryActionFilter} onActorChange={setHistoryActorFilter} /><HistoryPanel title="Ticket Activity" rows={ticketHistory} /></PageShell>;
};

export const ITEDPUsersPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const [userDraft, setUserDraft] = useState({ name: '', department: '', role: '', state: 'Provisioning', access: '', note: '' });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState({ name: '', department: '', role: '', state: 'Provisioning', access: '', note: '' });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyActionFilter, setHistoryActionFilter] = useState('All');
  const [historyActorFilter, setHistoryActorFilter] = useState('All');
  const users = data?.users ?? [];
  const userHistory = filterHistoryRows(data?.userHistory ?? [], historyActionFilter, historyActorFilter);

  const startEditUser = (user: typeof users[number]) => {
    setEditingUserId(user.id);
    setEditingUser({ name: user.name, department: user.department, role: user.role, state: user.state, access: user.access, note: user.note || '' });
  };

  const handleCreateUser = async () => {
    try {
      setSubmitting('user');
      setActionError(null);
      await createITEDPUserProvision(userDraft);
      setUserDraft({ name: '', department: '', role: '', state: 'Provisioning', access: '', note: '' });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to create user provisioning request');
    } finally {
      setSubmitting(null);
    }
  };

  const handleSaveUser = async (id: string) => {
    try {
      setSubmitting(id);
      setActionError(null);
      await updateITEDPUserProvision(id, editingUser);
      setEditingUserId(null);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update user provisioning request');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      setSubmitting(`delete-${id}`);
      setActionError(null);
      await deleteITEDPUserProvision(id);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to delete user provisioning request');
    } finally {
      setSubmitting(null);
    }
  };

  return <PageShell title="User Accounts" subtitle="Identity lifecycle, clinical access posture, and account activation state" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Users</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Users className="h-4 w-4" />Provision Access</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><ActionError error={actionError} /><Card><CardHeader><CardTitle className="text-base">Provision User Access</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2"><Input placeholder="User name" value={userDraft.name} onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))} /><Input placeholder="Department" value={userDraft.department} onChange={(event) => setUserDraft((current) => ({ ...current, department: event.target.value }))} /><Input placeholder="Role" value={userDraft.role} onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))} /><Select value={userDraft.state} onValueChange={(value) => setUserDraft((current) => ({ ...current, state: value }))}><SelectTrigger><SelectValue placeholder="State" /></SelectTrigger><SelectContent><SelectItem value="Provisioning">Provisioning</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Suspended">Suspended</SelectItem></SelectContent></Select><Input placeholder="Access bundle" value={userDraft.access} onChange={(event) => setUserDraft((current) => ({ ...current, access: event.target.value }))} /><Textarea placeholder="Provisioning note" className="md:col-span-2" value={userDraft.note} onChange={(event) => setUserDraft((current) => ({ ...current, note: event.target.value }))} /><Button disabled={submitting === 'user' || !userDraft.name} onClick={handleCreateUser} className="bg-teal-600 hover:bg-teal-700 md:col-span-2">Create Provisioning Task</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Identity & Access Queue</CardTitle></CardHeader><CardContent><SectionTable headers={['User', 'Department', 'Role', 'State', 'Access', 'Last Seen', 'Actions']} rows={users.map((row) => editingUserId === row.id ? [<div className="space-y-2"><Input value={editingUser.name} onChange={(event) => setEditingUser((current) => ({ ...current, name: event.target.value }))} /><Textarea value={editingUser.note} onChange={(event) => setEditingUser((current) => ({ ...current, note: event.target.value }))} /></div>, <Input value={editingUser.department} onChange={(event) => setEditingUser((current) => ({ ...current, department: event.target.value }))} />, <Input value={editingUser.role} onChange={(event) => setEditingUser((current) => ({ ...current, role: event.target.value }))} />, <Select value={editingUser.state} onValueChange={(value) => setEditingUser((current) => ({ ...current, state: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Provisioning">Provisioning</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Suspended">Suspended</SelectItem></SelectContent></Select>, <Input value={editingUser.access} onChange={(event) => setEditingUser((current) => ({ ...current, access: event.target.value }))} />, row.lastSeen, <div className="flex gap-2"><Button size="sm" disabled={Boolean(submitting)} onClick={() => handleSaveUser(row.id)}>Save</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => setEditingUserId(null)}>Cancel</Button></div>] : [<div><div>{row.name}</div>{row.note ? <div className="mt-1 text-xs text-muted-foreground">{row.note}</div> : null}</div>, row.department, row.role, <ToneBadge value={row.state} />, row.access, row.lastSeen, <div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => startEditUser(row)}>Edit</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleDeleteUser(row.id)}>Delete</Button></div>])} /></CardContent></Card><HistoryFilterBar rows={data?.userHistory ?? []} actionFilter={historyActionFilter} actorFilter={historyActorFilter} onActionChange={setHistoryActionFilter} onActorChange={setHistoryActorFilter} /><HistoryPanel title="Provisioning Activity" rows={userHistory} /></PageShell>;
};

export const ITEDPAssetsPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const [assetDraft, setAssetDraft] = useState({ asset: '', assetTag: '', type: 'Workstation', location: '', owner: '', lifecycle: 'Active', labelStatus: 'Pending', note: '' });
  const [labelDraft, setLabelDraft] = useState({ assetTag: '', asset: '', template: 'Asset QR', owner: '', status: 'Pending', note: '' });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState({ asset: '', type: 'Workstation', location: '', owner: '', lifecycle: 'Active', labelStatus: 'Pending', note: '' });
  const [historyActionFilter, setHistoryActionFilter] = useState('All');
  const [historyActorFilter, setHistoryActorFilter] = useState('All');
  const assets = data?.assets ?? [];
  const assetLabels = data?.assetLabels ?? [];
  const assetHistory = filterHistoryRows(data?.assetHistory ?? [], historyActionFilter, historyActorFilter);

  const startEditAsset = (asset: typeof assets[number]) => {
    setEditingAssetId(asset.assetTag);
    setEditingAsset({ asset: asset.asset, type: asset.type, location: asset.location, owner: asset.owner, lifecycle: asset.lifecycle, labelStatus: asset.labelStatus, note: asset.note || '' });
  };
  const handleCreateAsset = async () => {
    try {
      setSubmitting('asset');
      setActionError(null);
      await createITEDPAsset({
        asset: assetDraft.asset,
        assetTag: assetDraft.assetTag || undefined,
        type: assetDraft.type || undefined,
        location: assetDraft.location || undefined,
        lifecycle: assetDraft.lifecycle,
        labelStatus: assetDraft.labelStatus,
        owner: assetDraft.owner || undefined,
        note: assetDraft.note || undefined,
      });
      setAssetDraft({ asset: '', assetTag: '', type: 'Workstation', location: '', owner: '', lifecycle: 'Active', labelStatus: 'Pending', note: '' });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to create asset');
    } finally {
      setSubmitting(null);
    }
  };

  const handleCreateLabel = async () => {
    try {
      setSubmitting('label');
      setActionError(null);
      await createITEDPAssetLabel({
        assetTag: labelDraft.assetTag,
        asset: labelDraft.asset || undefined,
        template: labelDraft.template || undefined,
        status: labelDraft.status,
        owner: labelDraft.owner || undefined,
        note: labelDraft.note || undefined,
      });
      setLabelDraft({ assetTag: '', asset: '', template: 'Asset QR', owner: '', status: 'Pending', note: '' });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to create asset label action');
    } finally {
      setSubmitting(null);
    }
  };

  const handleAssetLifecycle = async (assetTag: string, lifecycle: string, labelStatus?: string, note?: string) => {
    try {
      setSubmitting(assetTag);
      setActionError(null);
      await updateITEDPAsset(assetTag, { lifecycle, ...(labelStatus ? { labelStatus } : {}), ...(note ? { note } : {}) });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update asset');
    } finally {
      setSubmitting(null);
    }
  };

  const handleLabelStatus = async (assetTag: string, status: string) => {
    try {
      setSubmitting(`label-${assetTag}`);
      setActionError(null);
      await updateITEDPAssetLabel(assetTag, { status, note: status === 'Printed' ? 'Label printed from portal' : 'Label queued for reprint' });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update label');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDeleteAsset = async (assetTag: string) => {
    try {
      setSubmitting(`delete-${assetTag}`);
      setActionError(null);
      await deleteITEDPAsset(assetTag);
      await deleteITEDPAssetLabel(assetTag);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to delete asset');
    } finally {
      setSubmitting(null);
    }
  };

  const handleSaveAsset = async (assetTag: string) => {
    try {
      setSubmitting(assetTag);
      setActionError(null);
      await updateITEDPAsset(assetTag, editingAsset);
      setEditingAssetId(null);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update asset');
    } finally {
      setSubmitting(null);
    }
  };

  return <PageShell title="Asset Management" subtitle="Endpoint, server, and peripheral inventory with lifecycle ownership and asset labeling" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Inventory</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Tag className="h-4 w-4" />Print Labels</Button><Button size="sm" className="gap-1 bg-slate-900 hover:bg-slate-800 text-white"><Package className="h-4 w-4" />Add Asset</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><ActionError error={actionError} /><div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><StatCard label="Managed Assets" value={String(assets.length)} sub="Tracked in current register" icon={Package} color="text-blue-600" /><StatCard label="Labels Printed" value={String(assetLabels.filter((row) => row.status === 'Printed').length)} sub="QR / rack labels ready" icon={Tag} color="text-emerald-600" /><StatCard label="Reprint Queue" value={String(assetLabels.filter((row) => row.status === 'Reprint').length)} sub="Damaged or missing labels" icon={AlertTriangle} color="text-red-600" /><StatCard label="At-Risk Assets" value={String(assets.filter((row) => row.lifecycle === 'At Risk').length)} sub="Needs refresh or repair plan" icon={Database} color="text-amber-600" /></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><Card><CardHeader><CardTitle className="text-base">Register Asset</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3"><Input placeholder="Asset name" value={assetDraft.asset} onChange={(event) => setAssetDraft((current) => ({ ...current, asset: event.target.value }))} /><Input placeholder="Asset tag" value={assetDraft.assetTag} onChange={(event) => setAssetDraft((current) => ({ ...current, assetTag: event.target.value }))} /><Input placeholder="Location" value={assetDraft.location} onChange={(event) => setAssetDraft((current) => ({ ...current, location: event.target.value }))} /><Input placeholder="Owner" value={assetDraft.owner} onChange={(event) => setAssetDraft((current) => ({ ...current, owner: event.target.value }))} /><Select value={assetDraft.type} onValueChange={(value) => setAssetDraft((current) => ({ ...current, type: value }))}><SelectTrigger><SelectValue placeholder="Asset type" /></SelectTrigger><SelectContent><SelectItem value="Workstation">Workstation</SelectItem><SelectItem value="Peripheral">Peripheral</SelectItem><SelectItem value="Network">Network</SelectItem><SelectItem value="Storage">Storage</SelectItem><SelectItem value="Server">Server</SelectItem></SelectContent></Select><Select value={assetDraft.lifecycle} onValueChange={(value) => setAssetDraft((current) => ({ ...current, lifecycle: value }))}><SelectTrigger><SelectValue placeholder="Lifecycle" /></SelectTrigger><SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Repair">Repair</SelectItem><SelectItem value="At Risk">At Risk</SelectItem></SelectContent></Select><Select value={assetDraft.labelStatus} onValueChange={(value) => setAssetDraft((current) => ({ ...current, labelStatus: value }))}><SelectTrigger><SelectValue placeholder="Label status" /></SelectTrigger><SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Printed">Printed</SelectItem><SelectItem value="Reprint">Reprint</SelectItem></SelectContent></Select><Textarea placeholder="Asset note" className="md:col-span-2" value={assetDraft.note} onChange={(event) => setAssetDraft((current) => ({ ...current, note: event.target.value }))} /><Button disabled={submitting === 'asset' || !assetDraft.asset} onClick={handleCreateAsset} className="bg-teal-600 hover:bg-teal-700 md:col-span-2">Create Asset</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Queue Asset Label</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3"><Input placeholder="Asset tag" value={labelDraft.assetTag} onChange={(event) => setLabelDraft((current) => ({ ...current, assetTag: event.target.value }))} /><Input placeholder="Asset name" value={labelDraft.asset} onChange={(event) => setLabelDraft((current) => ({ ...current, asset: event.target.value }))} /><Input placeholder="Owner" value={labelDraft.owner} onChange={(event) => setLabelDraft((current) => ({ ...current, owner: event.target.value }))} /><Select value={labelDraft.template} onValueChange={(value) => setLabelDraft((current) => ({ ...current, template: value }))}><SelectTrigger><SelectValue placeholder="Label template" /></SelectTrigger><SelectContent><SelectItem value="Asset QR">Asset QR</SelectItem><SelectItem value="Workstation QR">Workstation QR</SelectItem><SelectItem value="Peripheral QR">Peripheral QR</SelectItem><SelectItem value="Network Rack Label">Network Rack Label</SelectItem></SelectContent></Select><Select value={labelDraft.status} onValueChange={(value) => setLabelDraft((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Printed">Printed</SelectItem><SelectItem value="Reprint">Reprint</SelectItem></SelectContent></Select><Textarea placeholder="Label note" className="md:col-span-2" value={labelDraft.note} onChange={(event) => setLabelDraft((current) => ({ ...current, note: event.target.value }))} /><Button disabled={submitting === 'label' || !labelDraft.assetTag} onClick={handleCreateLabel} className="bg-teal-600 hover:bg-teal-700 md:col-span-2">Create Label Action</Button></CardContent></Card></div><Card><CardHeader><CardTitle className="text-base">Managed Asset Register</CardTitle></CardHeader><CardContent><SectionTable headers={['Asset Tag', 'Asset', 'Type', 'Location', 'Lifecycle', 'Label', 'Owner', 'Actions']} rows={assets.map((row) => editingAssetId === row.assetTag ? [row.assetTag, <div className="space-y-2"><Input value={editingAsset.asset} onChange={(event) => setEditingAsset((current) => ({ ...current, asset: event.target.value }))} /><Textarea value={editingAsset.note} onChange={(event) => setEditingAsset((current) => ({ ...current, note: event.target.value }))} /></div>, <Select value={editingAsset.type} onValueChange={(value) => setEditingAsset((current) => ({ ...current, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Workstation">Workstation</SelectItem><SelectItem value="Peripheral">Peripheral</SelectItem><SelectItem value="Network">Network</SelectItem><SelectItem value="Storage">Storage</SelectItem><SelectItem value="Server">Server</SelectItem></SelectContent></Select>, <Input value={editingAsset.location} onChange={(event) => setEditingAsset((current) => ({ ...current, location: event.target.value }))} />, <Select value={editingAsset.lifecycle} onValueChange={(value) => setEditingAsset((current) => ({ ...current, lifecycle: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Repair">Repair</SelectItem><SelectItem value="At Risk">At Risk</SelectItem></SelectContent></Select>, <Select value={editingAsset.labelStatus} onValueChange={(value) => setEditingAsset((current) => ({ ...current, labelStatus: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Printed">Printed</SelectItem><SelectItem value="Reprint">Reprint</SelectItem></SelectContent></Select>, <Input value={editingAsset.owner} onChange={(event) => setEditingAsset((current) => ({ ...current, owner: event.target.value }))} />, <div className="flex gap-2"><Button size="sm" disabled={Boolean(submitting)} onClick={() => handleSaveAsset(row.assetTag)}>Save</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => setEditingAssetId(null)}>Cancel</Button></div>] : [row.assetTag, <div><div>{row.asset}</div>{row.note ? <div className="mt-1 text-xs text-muted-foreground">{row.note}</div> : null}</div>, row.type, row.location, <ToneBadge value={row.lifecycle} />, <ToneBadge value={row.labelStatus} />, row.owner, <div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => startEditAsset(row)}>Edit</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleAssetLifecycle(row.assetTag, row.lifecycle === 'Active' ? 'At Risk' : 'Active', row.lifecycle === 'Active' ? 'Reprint' : 'Printed', row.lifecycle === 'Active' ? 'Flagged from portal review' : 'Restored to active service')}>{row.lifecycle === 'Active' ? 'Flag Risk' : 'Mark Active'}</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleDeleteAsset(row.assetTag)}>Delete</Button></div>])} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Asset Label Operations</CardTitle></CardHeader><CardContent><SectionTable headers={['Asset Tag', 'Asset', 'Template', 'Status', 'Last Action', 'Owner', 'Actions']} rows={assetLabels.map((row) => [row.assetTag, <div><div>{row.asset}</div>{row.note ? <div className="mt-1 text-xs text-muted-foreground">{row.note}</div> : null}</div>, row.template, <ToneBadge value={row.status} />, row.lastAction, row.owner, <div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleLabelStatus(row.assetTag, row.status === 'Printed' ? 'Reprint' : 'Printed')}>{row.status === 'Printed' ? 'Reprint' : 'Mark Printed'}</Button></div>])} /></CardContent></Card><HistoryFilterBar rows={data?.assetHistory ?? []} actionFilter={historyActionFilter} actorFilter={historyActorFilter} onActionChange={setHistoryActionFilter} onActorChange={setHistoryActorFilter} /><HistoryPanel title="Asset Activity" rows={assetHistory} /></PageShell>;
};

export const ITEDPSystemsPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const systems = data?.systems ?? [];
  return <PageShell title="System Monitor" subtitle="Clinical application availability, compute health, and ownership at a glance" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Health</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Server className="h-4 w-4" />Open NOC View</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Core Service Health</CardTitle></CardHeader><CardContent><SectionTable headers={['System', 'Status', 'Uptime', 'CPU', 'Memory', 'Owner']} rows={systems.map((row) => [row.name, <ToneBadge value={row.status} />, row.uptime, row.cpu, row.memory, row.owner])} /></CardContent></Card></PageShell>;
};

export const ITEDPNetworkPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const [changeDraft, setChangeDraft] = useState({ scope: '', admin: '', changeWindow: '', note: '' });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingChangeId, setEditingChangeId] = useState<string | null>(null);
  const [editingChange, setEditingChange] = useState({ scope: '', admin: '', changeWindow: '', configState: 'Ready', note: '' });
  const [historyActionFilter, setHistoryActionFilter] = useState('All');
  const [historyActorFilter, setHistoryActorFilter] = useState('All');
  const network = data?.network ?? [];
  const networkAdmin = data?.networkAdmin ?? [];
  const networkHistory = filterHistoryRows(data?.networkHistory ?? [], historyActionFilter, historyActorFilter);

  const startEditChange = (change: typeof networkAdmin[number]) => {
    setEditingChangeId(change.id);
    setEditingChange({ scope: change.scope, admin: change.admin, changeWindow: change.changeWindow, configState: change.configState, note: change.note || '' });
  };
  const handleCreateChange = async () => {
    try {
      setSubmitting('network');
      setActionError(null);
      await createITEDPNetworkAdmin({
        scope: changeDraft.scope,
        admin: changeDraft.admin || undefined,
        changeWindow: changeDraft.changeWindow || undefined,
        note: changeDraft.note || undefined,
      });
      setChangeDraft({ scope: '', admin: '', changeWindow: '', note: '' });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to create network admin change');
    } finally {
      setSubmitting(null);
    }
  };

  const handleUpdateChange = async (id: string, configState: string) => {
    try {
      setSubmitting(id);
      setActionError(null);
      await updateITEDPNetworkAdmin(id, { configState });
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update network admin change');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDeleteChange = async (id: string) => {
    try {
      setSubmitting(`delete-${id}`);
      setActionError(null);
      await deleteITEDPNetworkAdmin(id);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to delete network admin change');
    } finally {
      setSubmitting(null);
    }
  };

  const handleSaveChange = async (id: string) => {
    try {
      setSubmitting(id);
      setActionError(null);
      await updateITEDPNetworkAdmin(id, editingChange);
      setEditingChangeId(null);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Failed to update network admin change');
    } finally {
      setSubmitting(null);
    }
  };

  return <PageShell title="Network Status" subtitle="Ward, clinical, and perimeter connectivity plus network administration controls" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Links</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Router className="h-4 w-4" />Open Network Admin</Button><Button size="sm" className="gap-1 bg-slate-900 hover:bg-slate-800 text-white"><Wifi className="h-4 w-4" />Open Network Map</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><ActionError error={actionError} /><div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><StatCard label="Network Zones" value={String(network.length)} sub="Clinically monitored segments" icon={Wifi} color="text-blue-600" /><StatCard label="Degraded Zones" value={String(network.filter((row) => row.health === 'Degraded' || row.health === 'Watch').length)} sub="Requires proactive remediation" icon={AlertTriangle} color="text-amber-600" /><StatCard label="Admin Changes" value={String(networkAdmin.length)} sub="Current config/change workflows" icon={Router} color="text-violet-600" /><StatCard label="Approved Windows" value={String(networkAdmin.filter((row) => row.configState === 'Approved').length)} sub="Ready for controlled rollout" icon={BadgeCheck} color="text-emerald-600" /></div><Card><CardHeader><CardTitle className="text-base">Create Network Change</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3"><Input placeholder="Scope" value={changeDraft.scope} onChange={(event) => setChangeDraft((current) => ({ ...current, scope: event.target.value }))} /><Input placeholder="Admin owner" value={changeDraft.admin} onChange={(event) => setChangeDraft((current) => ({ ...current, admin: event.target.value }))} /><Input placeholder="Change window" value={changeDraft.changeWindow} onChange={(event) => setChangeDraft((current) => ({ ...current, changeWindow: event.target.value }))} /><Textarea placeholder="Change note" className="md:col-span-2" value={changeDraft.note} onChange={(event) => setChangeDraft((current) => ({ ...current, note: event.target.value }))} /><Button disabled={submitting === 'network' || !changeDraft.scope} onClick={handleCreateChange} className="bg-teal-600 hover:bg-teal-700 md:col-span-2">Create Network Change</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Campus Connectivity Matrix</CardTitle></CardHeader><CardContent><SectionTable headers={['Zone', 'Health', 'WAN', 'WiFi', 'Latency']} rows={network.map((row) => [row.zone, <ToneBadge value={row.health} />, row.wan, row.wifi, row.latency])} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Network Admin Control Queue</CardTitle></CardHeader><CardContent><SectionTable headers={['Scope', 'Admin', 'Change Window', 'Config State', 'Note', 'Actions']} rows={networkAdmin.map((row) => editingChangeId === row.id ? [<Input value={editingChange.scope} onChange={(event) => setEditingChange((current) => ({ ...current, scope: event.target.value }))} />, <Input value={editingChange.admin} onChange={(event) => setEditingChange((current) => ({ ...current, admin: event.target.value }))} />, <Input value={editingChange.changeWindow} onChange={(event) => setEditingChange((current) => ({ ...current, changeWindow: event.target.value }))} />, <Select value={editingChange.configState} onValueChange={(value) => setEditingChange((current) => ({ ...current, configState: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Ready">Ready</SelectItem><SelectItem value="Review">Review</SelectItem><SelectItem value="Approved">Approved</SelectItem><SelectItem value="Scheduled">Scheduled</SelectItem></SelectContent></Select>, <Textarea value={editingChange.note} onChange={(event) => setEditingChange((current) => ({ ...current, note: event.target.value }))} />, <div className="flex gap-2"><Button size="sm" disabled={Boolean(submitting)} onClick={() => handleSaveChange(row.id)}>Save</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => setEditingChangeId(null)}>Cancel</Button></div>] : [row.scope, row.admin, row.changeWindow, <ToneBadge value={row.configState} />, row.note, <div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => startEditChange(row)}>Edit</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleUpdateChange(row.id, row.configState === 'Approved' ? 'Scheduled' : 'Approved')}>{row.configState === 'Approved' ? 'Schedule' : 'Approve'}</Button><Button size="sm" variant="outline" disabled={Boolean(submitting)} onClick={() => handleDeleteChange(row.id)}>Delete</Button></div>])} /></CardContent></Card><HistoryFilterBar rows={data?.networkHistory ?? []} actionFilter={historyActionFilter} actorFilter={historyActorFilter} onActionChange={setHistoryActionFilter} onActorChange={setHistoryActorFilter} /><HistoryPanel title="Network Change History" rows={networkHistory} /></PageShell>;
};

export const ITEDPBackupPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const backups = data?.backups ?? [];
  return <PageShell title="Backup & Recovery" subtitle="Backup execution posture, DR readiness, and RPO assurance for hospital systems" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export DR Report</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><HardDrive className="h-4 w-4" />Run Restore Drill</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Backup Assurance Console</CardTitle></CardHeader><CardContent><SectionTable headers={['Workload', 'Last Run', 'Result', 'RPO', 'Owner']} rows={backups.map((row) => [row.workload, row.lastRun, <ToneBadge value={row.result} />, row.rpo, row.owner])} /></CardContent></Card></PageShell>;
};

export const ITEDPSecurityPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const security = data?.security ?? [];
  return <PageShell title="Security Logs" subtitle="IT security controls, endpoint posture, and privileged governance actions" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Controls</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Shield className="h-4 w-4" />Open Security Review</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Security Operations Watchlist</CardTitle></CardHeader><CardContent><SectionTable headers={['Control', 'State', 'Owner', 'Note']} rows={security.map((row) => [row.control, <ToneBadge value={row.state} />, row.owner, row.note])} /></CardContent></Card></PageShell>;
};

export const ITEDPAccessPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const access = data?.access ?? [];
  return <PageShell title="Access Control" subtitle="Joiner, mover, leaver and role-based entitlement governance across hospital systems" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Requests</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><KeyRound className="h-4 w-4" />Review Entitlements</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Access Governance Queue</CardTitle></CardHeader><CardContent><SectionTable headers={['Queue', 'Count', 'Detail', 'Status']} rows={access.map((row) => [row.queue, row.count, row.detail, <ToneBadge value={row.status} />])} /></CardContent></Card></PageShell>;
};

export const ITEDPReportsPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const reports = data?.reports ?? [];
  return <PageShell title="Reports" subtitle="Operational analytics, leadership reporting, and service assurance dashboards" actions={<><Button variant="outline" size="sm" className="gap-1"><BarChart3 className="h-4 w-4" />Schedule Mailout</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Download className="h-4 w-4" />Generate Pack</Button></>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">IT/EDP Reporting Catalogue</CardTitle></CardHeader><CardContent><SectionTable headers={['Report', 'Cadence', 'Audience', 'Status']} rows={reports.map((row) => [row.name, row.cadence, row.audience, <ToneBadge value={row.status} />])} /></CardContent></Card></PageShell>;
};

export const ITEDPSettingsPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const settings = data?.settings ?? [];
  return <PageShell title="Settings" subtitle="Operational policies, clinical change governance, and identity controls" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Settings className="h-4 w-4" />Save Controls</Button>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><div className="grid grid-cols-1 xl:grid-cols-3 gap-5">{settings.map((row) => <Card key={row.title}><CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{row.text}</CardContent></Card>)}</div></PageShell>;
};

export const ITEDPSupportPage = () => {
  const { data, loading, error, refresh } = useITEDPPortalData();
  const support = data?.support ?? [];
  return <PageShell title="Help & Support" subtitle="Operational support channels for clinical systems, endpoints, and recovery operations" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><LifeBuoy className="h-4 w-4" />Open Escalation</Button>}><ITEDPDataState loading={loading} error={error} refresh={refresh} /><div className="grid grid-cols-1 xl:grid-cols-3 gap-5">{support.map((row) => <Card key={row.title}><CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>{row.text}</p><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="font-medium text-slate-900 dark:text-white">SLA</p><p className="mt-1">Clinical outage: immediate bridge. Workstation failure: same shift. Access issue: under 2 hours. Backup failure: same-day remediation.</p></div></CardContent></Card>)}</div></PageShell>;
};

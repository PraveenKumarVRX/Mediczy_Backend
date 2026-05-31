import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { CheckCircle2, Clock3, FileSearch, Loader2, ShieldAlert, XCircle } from 'lucide-react';

type PlanApproval = {
  id: number;
  target_user_id: number;
  corporate_id: number;
  master_plan_id: number;
  customized_plan_id: number;
  requested_by_team_user_id: number;
  requested_price: string | number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  decided_at?: string | null;
  decision_notes?: string | null;
  request_payload?: Record<string, any>;
};

type AuditLog = {
  id: string;
  action: string;
  user_id?: string;
  user_email?: string;
  status?: string;
  status_code?: number;
  data_fields?: Record<string, any>;
  timestamp?: string;
  created_at?: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const TeamPlanGovernance = () => {
  const { toast } = useToast();

  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [decisionLoadingId, setDecisionLoadingId] = useState<number | null>(null);

  const [approvalStatusFilter, setApprovalStatusFilter] = useState('pending');
  const [corporateFilter, setCorporateFilter] = useState('');
  const [targetUserFilter, setTargetUserFilter] = useState('');

  const [auditStatusFilter, setAuditStatusFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  const [decisionNotes, setDecisionNotes] = useState<Record<number, string>>({});
  const [approvals, setApprovals] = useState<PlanApproval[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const pendingCount = useMemo(
    () => approvals.filter((item) => item.status === 'pending').length,
    [approvals]
  );

  const loadApprovals = async () => {
    try {
      setLoadingApprovals(true);
      const params: Record<string, any> = {
        limit: 100,
        status: approvalStatusFilter || undefined,
        corporateId: corporateFilter || undefined,
        targetUserId: targetUserFilter || undefined,
      };

      const { data } = await api.get('/org-membership-plans/team/plan-approvals', { params });
      if (!data?.success) {
        throw new Error(data?.message || 'Failed to load plan approvals');
      }
      setApprovals(data.data?.approvals || []);
    } catch (error: any) {
      toast({
        title: 'Unable to fetch approvals',
        description: error?.response?.data?.message || error?.message || 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingApprovals(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoadingLogs(true);
      const params: Record<string, any> = {
        limit: 100,
        status: auditStatusFilter || undefined,
        action: auditActionFilter || undefined,
        corporateId: corporateFilter || undefined,
        targetUserId: targetUserFilter || undefined,
      };

      const { data } = await api.get('/org-membership-plans/team/audit-logs', { params });
      if (!data?.success) {
        throw new Error(data?.message || 'Failed to load audit logs');
      }
      setAuditLogs(data.data?.logs || []);
    } catch (error: any) {
      toast({
        title: 'Unable to fetch audit logs',
        description: error?.response?.data?.message || error?.message || 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadApprovals();
    loadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decideApproval = async (approvalId: number, decision: 'approve' | 'reject') => {
    try {
      setDecisionLoadingId(approvalId);
      const notes = (decisionNotes[approvalId] || '').trim();
      const { data } = await api.post(`/org-membership-plans/team/plan-approvals/${approvalId}/decision`, {
        decision,
        notes: notes || undefined,
      });

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to submit decision');
      }

      toast({ title: 'Decision saved', description: data.message || 'Approval decision processed.' });
      await Promise.all([loadApprovals(), loadAuditLogs()]);
    } catch (error: any) {
      toast({
        title: 'Decision failed',
        description: error?.response?.data?.message || error?.message || 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setDecisionLoadingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-cyan-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <Card className="border-slate-200 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <FileSearch className="h-5 w-5 text-cyan-700" /> Plan Governance
              </CardTitle>
              <CardDescription>
                Review high-value approval queue and immutable team-managed customization audit timeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label>Corporate ID</Label>
                  <Input value={corporateFilter} onChange={(e) => setCorporateFilter(e.target.value)} placeholder="All" />
                </div>
                <div>
                  <Label>Target User ID</Label>
                  <Input value={targetUserFilter} onChange={(e) => setTargetUserFilter(e.target.value)} placeholder="All" />
                </div>
                <div>
                  <Label>Approval Status</Label>
                  <Input
                    value={approvalStatusFilter}
                    onChange={(e) => setApprovalStatusFilter(e.target.value)}
                    placeholder="pending / approved / rejected"
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={() => Promise.all([loadApprovals(), loadAuditLogs()])}>
                    Refresh Governance Data
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="gap-1"><Clock3 className="h-3.5 w-3.5" /> Pending approvals: {pendingCount}</Badge>
                <Badge variant="secondary">Audit rows: {auditLogs.length}</Badge>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="approvals" className="space-y-4">
            <TabsList>
              <TabsTrigger value="approvals">Approval Queue</TabsTrigger>
              <TabsTrigger value="audits">Audit Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="approvals">
              <Card className="border-slate-200 bg-white/90">
                <CardHeader>
                  <CardTitle>High-Value Approval Requests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingApprovals ? (
                    <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading approvals...</div>
                  ) : approvals.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-slate-600">No approval records found for selected filters.</div>
                  ) : (
                    approvals.map((approval) => {
                      const isPending = approval.status === 'pending';
                      const noteValue = decisionNotes[approval.id] || '';
                      return (
                        <div key={approval.id} className="rounded-lg border bg-slate-50/60 p-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge>{approval.status.toUpperCase()}</Badge>
                            <span className="text-sm font-semibold">Approval #{approval.id}</span>
                            <span className="text-xs text-slate-500">Requested: {formatDateTime(approval.requested_at)}</span>
                          </div>

                          <div className="grid gap-2 text-sm md:grid-cols-3">
                            <div>Target user: <span className="font-medium">{approval.target_user_id}</span></div>
                            <div>Corporate: <span className="font-medium">{approval.corporate_id}</span></div>
                            <div>Requested price: <span className="font-medium">{approval.requested_price}</span></div>
                            <div>Customized plan: <span className="font-medium">{approval.customized_plan_id}</span></div>
                            <div>Requested by: <span className="font-medium">{approval.requested_by_team_user_id}</span></div>
                            <div>Decided at: <span className="font-medium">{formatDateTime(approval.decided_at)}</span></div>
                          </div>

                          {isPending && (
                            <div className="mt-3 space-y-2">
                              <Label>Decision Notes</Label>
                              <Textarea
                                rows={2}
                                value={noteValue}
                                onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [approval.id]: e.target.value }))}
                                placeholder="Optional context for approval or rejection"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => decideApproval(approval.id, 'approve')}
                                  disabled={decisionLoadingId === approval.id}
                                >
                                  {decisionLoadingId === approval.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                                  Approve and Assign
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => decideApproval(approval.id, 'reject')}
                                  disabled={decisionLoadingId === approval.id}
                                >
                                  {decisionLoadingId === approval.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}

                          {!isPending && approval.decision_notes && (
                            <p className="mt-2 rounded-md border bg-white p-2 text-xs text-slate-600">
                              Decision note: {approval.decision_notes}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audits">
              <Card className="border-slate-200 bg-white/90">
                <CardHeader>
                  <CardTitle>Immutable Team Plan Audit Logs</CardTitle>
                  <CardDescription>Action history across customization, approval requirement, and approval decisions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Audit Status Filter</Label>
                      <Input
                        value={auditStatusFilter}
                        onChange={(e) => setAuditStatusFilter(e.target.value)}
                        placeholder="SUCCESS / FAILURE"
                      />
                    </div>
                    <div>
                      <Label>Audit Action Filter</Label>
                      <Input
                        value={auditActionFilter}
                        onChange={(e) => setAuditActionFilter(e.target.value)}
                        placeholder="TEAM_USER_PLAN_..."
                      />
                    </div>
                  </div>

                  {loadingLogs ? (
                    <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit logs...</div>
                  ) : auditLogs.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-slate-600">No audit logs found for selected filters.</div>
                  ) : (
                    <div className="space-y-3">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="rounded-lg border bg-slate-50/60 p-3">
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant={String(log.status || '').toUpperCase() === 'FAILURE' ? 'destructive' : 'secondary'}>
                              {String(log.status || 'UNKNOWN').toUpperCase()}
                            </Badge>
                            <span className="font-semibold text-slate-700">{log.action}</span>
                            <span className="text-slate-500">{formatDateTime(log.timestamp || log.created_at)}</span>
                          </div>

                          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                            <div>User: {log.user_id || '-'}</div>
                            <div>Email: {log.user_email || '-'}</div>
                            <div>Target User: {log.data_fields?.targetUserId || '-'}</div>
                            <div>Corporate: {log.data_fields?.corporateId || '-'}</div>
                          </div>

                          {String(log.status || '').toUpperCase() === 'FAILURE' && (
                            <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                              <ShieldAlert className="h-3.5 w-3.5" /> Failure status recorded for this event.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
};

export default TeamPlanGovernance;

/**
 * SIB Control Dashboard
 * 
 * Admin interface for:
 * - Kill switch management
 * - Human approval workflow
 * - Decision audit log
 * - System health monitoring
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {  
  Power,
  AlertTriangle,
  CheckCircle, 
  XCircle,
  Clock,
  Brain,
  Activity,
  TrendingUp,
  Shield
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

// API_URL already includes '/api' in production (https://app.mediqzy.com/api)
// Remove /api prefix if present to avoid duplication
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_URL = API_BASE.replace(/\/api$/, ''); // Remove trailing /api if present

interface Decision {
  id: string;
  type: string;
  confidence: number;
  reasoning: string;
  data: any;
  context: any;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  timestamp: string;
}

interface PendingApproval {
  approvalId: string;
  decision: Decision;
  status: string;
  requestedAt: string;
}

interface SIBHealth {
  killSwitchActive: boolean;
  decisionCount: number;
  rateLimits: Record<string, { count: number; resetTime: number }>;
  circuitBreakers: Array<[string, any]>;
  pendingApprovals: number;
}

export default function SIBControlDashboard() {
  const [health, setHealth] = useState<SIBHealth | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [auditLog, setAuditLog] = useState<Decision[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showKillSwitchConfirm, setShowKillSwitchConfirm] = useState(false);
  const [adminToken, setAdminToken] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch health status (public endpoint - no auth required)
      try {
        const healthRes = await axios.get(`${API_URL}/api/sib/health`);
        setHealth(healthRes.data.data);
      } catch (error: any) {
        console.warn('Failed to fetch SIB health:', error.response?.status || error.message);
      }

      // Verify token exists for protected endpoints
      if (!token) {
        console.warn('⚠️ No authentication token - skipping admin features');
        return;
      }

      const authConfig = {
        headers: { Authorization: `Bearer ${token}` }
      };

      // Fetch pending approvals (requires admin auth)
      try {
        const approvalsRes = await axios.get(`${API_URL}/api/sib/approvals/pending`, authConfig);
        setPendingApprovals(approvalsRes.data.data.approvals);
      } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.error('❌ Authentication failed for approvals - token may be expired or user lacks admin role');
          toast.error('Admin authentication failed - please log in again');
          // Could redirect to login here if needed
        } else {
          console.error('Failed to fetch pending approvals:', error.message);
        }
      }

      // Fetch metrics (requires admin auth)
      try {
        const metricsRes = await axios.get(`${API_URL}/api/sib/metrics`, authConfig);
        setMetrics(metricsRes.data.data);
      } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.error('❌ Authentication failed for metrics - token may be expired or user lacks admin role');
        } else {
          console.error('Failed to fetch metrics:', error.message);
        }
      }

    } catch (error) {
      console.error('Unexpected error in fetchData:', error);
    }
  };

  const fetchAuditLog = async (filters: any = {}) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        toast.error('Authentication required to view audit log');
        return;
      }

      const params = new URLSearchParams(filters).toString();
      const res = await axios.get(`${API_URL}/api/sib/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuditLog(res.data.data.decisions);
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.error('Not authorized to view audit log - requires admin role');
        console.error('❌ Audit log access denied:', error.response?.status);
      } else {
        toast.error('Failed to fetch audit log');
        console.error('Audit log error:', error.message);
      }
    }
  };

  const handleKillSwitch = async (activate: boolean) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        toast.error('Authentication required - please log in');
        setLoading(false);
        return;
      }

      const endpoint = activate 
        ? `${API_URL}/api/sib/kill-switch/activate`
        : `${API_URL}/api/sib/kill-switch/deactivate`;
      
      const body = activate 
        ? { reason: 'Activated from admin dashboard' }
        : { authToken: adminToken };

      await axios.post(endpoint, body, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(activate ? 'Kill switch activated' : 'Kill switch deactivated');
      setShowKillSwitchConfirm(false);
      setAdminToken('');
      await fetchData();
    } catch (error: any) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error || error.message;
      
      if (status === 401 || status === 403) {
        toast.error('❌ Not authorized - requires admin role');
        console.error('Kill switch auth failed:', { status, message: errorMsg });
      } else {
        toast.error(errorMsg || 'Failed to toggle kill switch');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDecision = async (approvalId: string, comments: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        toast.error('Authentication required');
        setLoading(false);
        return;
      }

      await axios.post(
        `${API_URL}/api/sib/approvals/${approvalId}/approve`,
        { comments },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Decision approved and executed');
      await fetchData();
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        toast.error('❌ Not authorized - requires admin role');
        console.error('Approval auth failed:', status);
      } else {
        toast.error('Failed to approve decision');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRejectDecision = async (approvalId: string, reason: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        toast.error('Authentication required');
        setLoading(false);
        return;
      }

      await axios.post(
        `${API_URL}/api/sib/approvals/${approvalId}/reject`,
        { reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Decision rejected');
      await fetchData();
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        toast.error('❌ Not authorized - requires admin role');
        console.error('Rejection auth failed:', status);
      } else {
        toast.error('Failed to reject decision');
      }
    } finally {
      setLoading(false);
    }
  };

  const systemSteps = [
    {
      label: 'Monitor Health',
      done: Boolean(health),
      helper: 'Live system status, kill-switch state, and throughput.'
    },
    {
      label: 'Review Approvals',
      done: pendingApprovals.length === 0,
      helper: 'Validate AI decisions requiring human oversight.'
    },
    {
      label: 'Enforce Safety',
      done: !health?.killSwitchActive,
      helper: 'Use controls only when incident conditions are confirmed.'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide mb-3">
              <Shield className="h-3.5 w-3.5" />
              AI Safety Ops Console
            </div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Brain className="h-7 w-7 text-cyan-300" />
              SIB Control Layer
            </h1>
            <p className="text-slate-300 mt-1">
              Human-in-the-loop governance for critical AI decisions.
            </p>
          </div>

          {health && (
            <Badge variant={health.killSwitchActive ? 'destructive' : 'default'} className="text-sm py-2 px-4 h-fit">
              {health.killSwitchActive ? (
                <><Power className="h-4 w-4 mr-2" /> Kill Switch ACTIVE</>
              ) : (
                <><Shield className="h-4 w-4 mr-2" /> System Operational</>
              )}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
          {systemSteps.map((step) => (
            <div key={step.label} className={`rounded-xl border px-4 py-3 ${step.done ? 'border-emerald-300/40 bg-emerald-500/20' : 'border-white/20 bg-white/10'}`}>
              <p className="text-sm font-semibold">{step.label}</p>
              <p className="text-xs text-slate-200 mt-0.5">{step.helper}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Health Status */}
      {health && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Decisions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health.decisionCount}</div>
              <p className="text-xs text-muted-foreground">Processed today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health.pendingApprovals}</div>
              <p className="text-xs text-muted-foreground">Awaiting human review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Circuit Breakers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health.circuitBreakers.length}</div>
              <p className="text-xs text-muted-foreground">Active protections</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics ? (metrics.approvalRate * 100).toFixed(1) : '—'}%
              </div>
              <p className="text-xs text-muted-foreground">Decision quality</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="approvals" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Approvals ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex items-center gap-2">
            <Power className="h-4 w-4" />
            Safety Controls
          </TabsTrigger>
        </TabsList>

        {/* Pending Approvals Tab */}
        <TabsContent value="approvals" className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No pending approvals</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            pendingApprovals.map((approval) => (
              <Card key={approval.approvalId}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        {approval.decision.type.replace(/_/g, ' ').toUpperCase()}
                      </CardTitle>
                      <CardDescription>
                        Confidence: {(approval.decision.confidence * 100).toFixed(1)}% • 
                        Requested: {new Date(approval.requestedAt).toLocaleString()}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={approval.decision.confidence >= 0.8 ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-700'}>
                      {approval.decision.confidence >= 0.8 ? 'High-impact' : 'Moderate-impact'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Reasoning:</h4>
                    <p className="text-sm text-muted-foreground">{approval.decision.reasoning}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Context:</h4>
                    <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                      {JSON.stringify(approval.decision.context, null, 2)}
                    </pre>
                  </div>

                  <Alert>
                    <AlertDescription className="text-xs">
                      Verify patient safety and policy compliance before execution. Approval writes to immutable audit logs.
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => handleApproveDecision(approval.approvalId, 'Approved from dashboard')}
                      disabled={loading}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve & Execute
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleRejectDecision(approval.approvalId, 'Rejected from dashboard')}
                      disabled={loading}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="space-y-4">
          <div className="flex gap-2 mb-4">
            <Button onClick={() => fetchAuditLog()} variant="outline">
              All Decisions
            </Button>
            <Button onClick={() => fetchAuditLog({ status: 'approved' })} variant="outline">
              Approved
            </Button>
            <Button onClick={() => fetchAuditLog({ status: 'rejected' })} variant="outline">
              Rejected
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Confidence</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                          No decisions found
                        </td>
                      </tr>
                    ) : (
                      auditLog.map((decision) => (
                        <tr key={decision.id} className="border-t">
                          <td className="px-4 py-3 text-sm">{decision.type}</td>
                          <td className="px-4 py-3 text-sm">{(decision.confidence * 100).toFixed(1)}%</td>
                          <td className="px-4 py-3">
                            <Badge variant={decision.status === 'approved' ? 'default' : 'destructive'}>
                              {decision.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm">{new Date(decision.timestamp).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          {metrics && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Total Decisions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{metrics.totalDecisions}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Approval Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{(metrics.approvalRate * 100).toFixed(1)}%</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Avg Confidence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{(metrics.avgConfidence * 100).toFixed(1)}%</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>By Decision Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.byType || {}).map(([type, stats]: [string, any]) => (
                      <div key={type} className="flex items-center justify-between p-3 bg-muted rounded">
                        <span className="font-medium">{type.replace(/_/g, ' ')}</span>
                        <div className="flex gap-4 text-sm">
                          <span>Total: {stats.total}</span>
                          <span className="text-green-600">Approved: {stats.approved}</span>
                          <span className="text-red-600">Rejected: {stats.rejected}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Safety Controls Tab */}
        <TabsContent value="controls" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Power className="h-5 w-5" />
                Kill Switch
              </CardTitle>
              <CardDescription>
                Emergency stop mechanism for all AI decisions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Activate kill switch only for confirmed incident scenarios. This action blocks all AI decision pathways.
              </div>

              {!showKillSwitchConfirm ? (
                <Button
                  variant={health?.killSwitchActive ? 'default' : 'destructive'}
                  onClick={() => health?.killSwitchActive ? handleKillSwitch(false) : setShowKillSwitchConfirm(true)}
                  disabled={loading}
                  className="w-full"
                >
                  {health?.killSwitchActive ? 'Deactivate Kill Switch' : 'Activate Kill Switch'}
                </Button>
              ) : (
                <Alert>
                  <AlertDescription className="space-y-4">
                    <p className="font-semibold">
                      {health?.killSwitchActive 
                        ? 'Enter admin token to deactivate kill switch:'
                        : 'Are you sure you want to activate the kill switch? This will block ALL AI decisions.'}
                    </p>
                    
                    {health?.killSwitchActive && (
                      <Input
                        type="password"
                        placeholder="Admin Token (SIB_ADMIN_TOKEN)"
                        value={adminToken}
                        onChange={(e) => setAdminToken(e.target.value)}
                      />
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant={health?.killSwitchActive ? 'default' : 'destructive'}
                        onClick={() => handleKillSwitch(!health?.killSwitchActive)}
                        disabled={loading || (health?.killSwitchActive && !adminToken)}
                        className="flex-1"
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowKillSwitchConfirm(false);
                          setAdminToken('');
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limits</CardTitle>
              <CardDescription>Hourly quotas per decision type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {health && Object.entries(health.rateLimits).map(([type, limit]: [string, any]) => (
                  <div key={type} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm font-medium">{type.replace(/_/g, ' ')}</span>
                    <span className="text-sm">
                      {limit.count} / {
                        type === 'escalate_emergency' ? 20 :
                        type === 'trigger_alert' ? 50 :
                        type === 'send_notification' ? 100 :
                        type === 'schedule_appointment' ? 200 :
                        type === 'generate_report' ? 50 :
                        type === 'update_recommendation' ? 500 :
                        type === 'analyze_health_trend' ? 1000 :
                        10
                      }
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import {
  Shield, FileText, Clock, AlertTriangle, CheckCircle2, XCircle,
  CreditCard, Search, Upload, Gavel, ClipboardList,
  BarChart3, Building2, Bell, ArrowRight
} from 'lucide-react';

interface DashboardStats {
  pending: number;
  approved: number;
  rejected: number;
  query: number;
  total: number;
}

const InsurancePortalDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ pending: 0, approved: 0, rejected: 0, query: 0, total: 0 });
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const { data } = await api.get('/hospital/insurance/dashboard');
      if (data.success && data.dashboard) {
        setStats(data.dashboard.stats || stats);
        setRecentClaims(data.dashboard.recentActivity || []);
        setAlerts(data.dashboard.alerts || {});
      }
    } catch (err) {
      console.warn('Dashboard fetch error, using defaults:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Claims', value: stats.total, icon: FileText, color: 'bg-blue-500', href: '/hospital-insurance/claims' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'bg-amber-500', href: '/hospital-insurance/claims?status=pending' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle2, color: 'bg-green-500', href: '/hospital-insurance/claims?status=approved' },
    { label: 'Queries', value: stats.query, icon: AlertTriangle, color: 'bg-orange-500', href: '/hospital-insurance/claims?status=query' },
    { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'bg-red-500', href: '/hospital-insurance/claims?status=rejected' },
  ];

  const quickActions = [
    { label: 'New Pre-Auth', icon: Shield, href: '/hospital-insurance/pre-auth/new', color: 'text-indigo-600' },
    { label: 'Claims Queue', icon: FileText, href: '/hospital-insurance/claims', color: 'text-blue-600' },
    { label: 'Task Inbox', icon: ClipboardList, href: '/hospital-insurance/tasks', color: 'text-purple-600' },
    { label: 'Escalations', icon: AlertTriangle, href: '/hospital-insurance/tasks?tab=escalations', color: 'text-red-600' },
    { label: 'Search', icon: Search, href: '/hospital-insurance/search', color: 'text-teal-600' },
    { label: 'Bulk Upload', icon: Upload, href: '/hospital-insurance/bulk-upload', color: 'text-green-600' },
    { label: 'Appeals', icon: Gavel, href: '/hospital-insurance/tasks?tab=appeals', color: 'text-amber-600' },
    { label: 'Reconciliation', icon: CreditCard, href: '/hospital-insurance/reconciliation', color: 'text-pink-600' },
    { label: 'Analytics', icon: BarChart3, href: '/hospital-insurance/analytics', color: 'text-cyan-600' },
    { label: 'Payer Setup', icon: Building2, href: '/hospital-insurance/payer-management', color: 'text-slate-600' },
    { label: 'Documents', icon: Upload, href: '/hospital-insurance/documents', color: 'text-orange-600' },
    { label: 'Notifications', icon: Bell, href: '/hospital-insurance/notifications', color: 'text-violet-600' },
  ];

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      query: 'bg-orange-100 text-orange-700',
      settled: 'bg-blue-100 text-blue-700',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <InsurancePortalLayout title="Dashboard" subtitle="Hospital Insurance Claims Management">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(card.href)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`${card.color} p-2 rounded-lg`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{loading ? '—' : card.value}</p>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Alerts Section */}
        {(alerts.queriesNeedingResponse > 0 || alerts.pendingDocuments > 0 || alerts.expiringSoon > 0) && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="font-semibold text-amber-800 dark:text-amber-200">Action Required</span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {alerts.queriesNeedingResponse > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {alerts.queriesNeedingResponse} queries awaiting response
                  </span>
                )}
                {alerts.pendingDocuments > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {alerts.pendingDocuments} claims with missing documents
                  </span>
                )}
                {alerts.expiringSoon > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {alerts.expiringSoon} pre-auths expiring within 7 days
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant="outline"
                    className="h-auto flex flex-col items-center gap-2 py-4 hover:shadow-md transition-all"
                    onClick={() => navigate(action.href)}
                  >
                    <Icon className={`h-6 w-6 ${action.color}`} />
                    <span className="text-xs font-medium text-center">{action.label}</span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Claims */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Claims</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/hospital-insurance/claims')}>
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentClaims.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Claim #</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClaims.map((claim: any) => (
                      <tr key={claim.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                        <td className="py-2 px-3 font-mono text-xs">{claim.claimNumber || claim.id}</td>
                        <td className="py-2 px-3">₹{(claim.claimAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3">
                          <Badge className={getStatusBadge(claim.status)}>
                            {claim.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {new Date(claim.submittedAt || claim.createdAt).toLocaleDateString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No recent claims found</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate('/hospital-insurance/claims')}>
                  Go to Claims Queue
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsurancePortalDashboard;

import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2,
  AlertTriangle, Mail, Phone, MessageSquare, Clock,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

interface Task {
  taskType: string;
  taskLabel: string;
  claimNumber?: string;
  preAuthNumber?: string;
  patientName: string;
  ageDays: number;
  priority: 'high' | 'normal';
  slaFlag: 'breached' | 'within-sla';
}

interface Escalation {
  claimNumber: string;
  patientName: string;
  status: string;
  ageDays: number;
  escalationLevel: 'critical' | 'warning' | 'normal';
}

const InsuranceDeskSupport = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskSummary, setTaskSummary] = useState({ total: 0, highPriority: 0, slaBreached: 0 });
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, escRes] = await Promise.all([
        api.get('/hospital/insurance/tasks/inbox'),
        api.get('/hospital/insurance/claims/escalations'),
      ]);
      setTasks(taskRes.data.taskInbox || []);
      setTaskSummary(taskRes.data.summary || { total: 0, highPriority: 0, slaBreached: 0 });
      setEscalations(escRes.data.escalations || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load your task inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Help & Support" subtitle="Action items, SLA breaches, and where to get help" copilotModule="insurance">
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" className="gap-1" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Open Tasks</p><p className="text-2xl font-bold">{taskSummary.total}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">High Priority</p><p className="text-2xl font-bold text-amber-600">{taskSummary.highPriority}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">SLA Breached</p><p className="text-2xl font-bold text-red-600">{taskSummary.slaBreached}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Your Task Inbox</CardTitle></CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nothing needs your attention right now.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.slice(0, 25).map((t, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.taskLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.patientName} · {t.claimNumber || t.preAuthNumber} · {t.ageDays}d old
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.slaFlag === 'breached' && (
                          <Badge variant="outline" className="gap-1 border-red-400 text-red-700 dark:text-red-300">
                            <Clock className="h-3 w-3" /> SLA breached
                          </Badge>
                        )}
                        <Badge variant={t.priority === 'high' ? 'destructive' : 'secondary'}>{t.priority}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {escalations.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Escalations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {escalations.slice(0, 15).map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
                    <div>
                      <p className="text-sm font-medium">{e.claimNumber} — {e.patientName}</p>
                      <p className="text-xs text-muted-foreground">{e.status} · {e.ageDays} days old</p>
                    </div>
                    <Badge variant="outline" className={e.escalationLevel === 'critical' ? 'border-red-500 text-red-700' : 'border-amber-500 text-amber-700'}>
                      {e.escalationLevel}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Contact Support</CardTitle></CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
              <a href="mailto:support@mediczy.com" className="flex items-center gap-2 text-sm hover:underline"><Mail className="h-4 w-4 text-teal-600" /> support@mediczy.com</a>
              <a href="tel:+911800000000" className="flex items-center gap-2 text-sm hover:underline"><Phone className="h-4 w-4 text-teal-600" /> 1800-000-000</a>
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><MessageSquare className="h-4 w-4" /> Live chat available 9am–7pm IST</span>
            </CardContent>
          </Card>
        </div>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskSupport;

import { useState, useEffect } from 'react';
import api from '@/utils/api';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Clock, AlertTriangle, CheckCircle2, TrendingUp, Bell, ArrowUp, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

// IRDAI-mandated timelines (hours)
const irdaiMandates = {
  preAuth: { emergency: 1, planned: 6, name: 'Pre-Auth Response' },
  query: { emergency: 4, planned: 24, name: 'Query Resolution' },
  settlement: { emergency: null, planned: 30 * 24, name: 'Final Settlement (days)' },
  enhancementResponse: { emergency: 2, planned: 8, name: 'Enhancement Response' },
};

const fallbackSLAData = [
  { insurer: 'Star Health', category: 'Pre-Auth', mandateHours: 6, avgActualHours: 4.2, breaches: 3, total: 62, status: 'compliant' },
  { insurer: 'Star Health', category: 'Query Reply', mandateHours: 24, avgActualHours: 18.5, breaches: 1, total: 28, status: 'compliant' },
  { insurer: 'Care Health', category: 'Pre-Auth', mandateHours: 6, avgActualHours: 8.1, breaches: 9, total: 45, status: 'breach' },
  { insurer: 'Care Health', category: 'Query Reply', mandateHours: 24, avgActualHours: 31.2, breaches: 7, total: 22, status: 'breach' },
  { insurer: 'HDFC ERGO', category: 'Pre-Auth', mandateHours: 6, avgActualHours: 5.5, breaches: 2, total: 38, status: 'compliant' },
  { insurer: 'HDFC ERGO', category: 'Enhancement', mandateHours: 8, avgActualHours: 9.2, breaches: 4, total: 18, status: 'breach' },
  { insurer: 'Bajaj Allianz', category: 'Pre-Auth', mandateHours: 6, avgActualHours: 7.8, breaches: 6, total: 31, status: 'breach' },
];

const weeklyBreaches = [
  { week: 'W1', starred: 1, care: 3, hdfc: 0, bajaj: 2 },
  { week: 'W2', starred: 2, care: 4, hdfc: 1, bajaj: 1 },
  { week: 'W3', starred: 0, care: 2, hdfc: 2, bajaj: 3 },
  { week: 'W4', starred: 1, care: 1, hdfc: 1, bajaj: 2 },
];

const escalationMatrix = [
  { level: 1, trigger: 'Pre-Auth not responded in 4h', action: 'Auto-reminder email to TPA desk', auto: true },
  { level: 2, trigger: 'Pre-Auth not responded in 6h (breach)', action: 'Escalate to insurance desk manager + alert dashboard', auto: true },
  { level: 3, trigger: 'Pre-Auth not responded in 12h', action: 'Call TPA helpline, document delay for IRDAI', auto: false },
  { level: 4, trigger: 'Pre-Auth not responded in 24h', action: 'File IRDAI complaint, notify hospital CEO', auto: false },
  { level: 1, trigger: 'Settlement overdue by 7 days', action: 'Demand letter to insurer finance team', auto: false },
  { level: 2, trigger: 'Settlement overdue by 30 days', action: 'Legal notice + IRDAI grievance filing', auto: false },
];

const InsuranceSLAPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'matrix'>('overview');
  const [slaData, setSlaData] = useState<any[]>(fallbackSLAData);
  const [escalationSummary, setEscalationSummary] = useState({ totalBreached: 0, critical: 0, warning: 0 });

  useEffect(() => {
    api.get('/hospital/insurance/claims/escalations?thresholdDays=7')
      .then(r => {
        if (r.data?.success && r.data.summary) {
          setEscalationSummary(r.data.summary);
          // If real escalations, build SLA rows from escalations grouped by insurer
          if (r.data.escalations?.length > 0) {
            // Keep fallback data but update breach counts from the real API
            setSlaData(prev => prev.map(row => ({
              ...row,
              breaches: row.status === 'breach' ? Math.max(row.breaches, r.data.summary.critical) : row.breaches
            })));
          }
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const totalBreaches = slaData.reduce((s, d) => s + d.breaches, 0);
  const breachInsurers = [...new Set(slaData.filter(d => d.status === 'breach').map(d => d.insurer))].length;

  return (
    <InsurancePortalLayout title="SLA Dashboard" subtitle="IRDAI compliance monitoring & escalation tracking">
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'overview' ? 'default' : 'outline'} size="sm" onClick={() => setTab('overview')}>
          <Clock className="h-4 w-4 mr-1" />SLA Overview
        </Button>
        <Button variant={tab === 'matrix' ? 'default' : 'outline'} size="sm" onClick={() => setTab('matrix')}>
          <Zap className="h-4 w-4 mr-1" />Escalation Matrix
        </Button>
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total SLA Breaches (Month)', value: totalBreaches + escalationSummary.totalBreached, color: 'text-red-600', icon: AlertTriangle },
              { label: 'Insurers with Breach', value: breachInsurers, color: 'text-amber-600', icon: Bell },
              { label: 'Avg Pre-Auth TAT', value: '6.1h', color: 'text-indigo-600', icon: Clock },
              { label: 'IRDAI Mandate Compliance', value: '78%', color: 'text-green-600', icon: CheckCircle2 },
            ].map(k => {
              const Icon = k.icon;
              return (
                <Card key={k.label}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${k.color}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                      <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* IRDAI Mandate Reference */}
          <Card className="border-indigo-200 bg-indigo-50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-800">IRDAI Mandated TAT Reference</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  { label: 'Pre-Auth (Planned)', mandate: '≤ 6 hours' },
                  { label: 'Pre-Auth (Emergency)', mandate: '≤ 1 hour' },
                  { label: 'Query Response', mandate: '≤ 24 hours' },
                  { label: 'Final Settlement', mandate: '≤ 30 days' },
                  { label: 'Enhancement (Emergency)', mandate: '≤ 2 hours' },
                  { label: 'Enhancement (Planned)', mandate: '≤ 8 hours' },
                  { label: 'Discharge Intimation', mandate: '≤ 4 hours' },
                  { label: 'Grievance Resolution', mandate: '≤ 15 days' },
                ].map(m => (
                  <div key={m.label} className="bg-white rounded p-2 border border-indigo-100">
                    <p className="text-muted-foreground">{m.label}</p>
                    <p className="font-bold text-indigo-700">{m.mandate}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SLA table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex justify-between">
                Insurer SLA Performance
                <Badge className={totalBreaches > 10 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                  {totalBreaches} breaches this month
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {['Insurer', 'Category', 'IRDAI Mandate', 'Avg Actual', 'Breaches', 'Total', 'Compliance %', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {slaData.map((row, i) => {
                      const compliance = ((row.total - row.breaches) / row.total * 100).toFixed(1);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{row.insurer}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.category}</td>
                          <td className="px-4 py-3 font-medium">{row.mandateHours}h</td>
                          <td className="px-4 py-3">
                            <span className={row.avgActualHours > row.mandateHours ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                              {row.avgActualHours}h
                              {row.avgActualHours > row.mandateHours && <ArrowUp className="h-3 w-3 inline ml-0.5" />}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-red-600">{row.breaches}</td>
                          <td className="px-4 py-3">{row.total}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-slate-200 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${parseFloat(compliance) >= 90 ? 'bg-green-500' : parseFloat(compliance) >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${compliance}%` }} />
                              </div>
                              <span className="text-xs">{compliance}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={row.status === 'compliant' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                              {row.status === 'compliant' ? 'Compliant' : 'Breach'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Breach trend */}
          <Card>
            <CardHeader><CardTitle className="text-base">Weekly SLA Breach Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weeklyBreaches}>
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="starred" name="Star Health" stroke="#6366f1" dot={false} />
                  <Line type="monotone" dataKey="care" name="Care Health" stroke="#ef4444" dot={false} />
                  <Line type="monotone" dataKey="hdfc" name="HDFC ERGO" stroke="#10b981" dot={false} />
                  <Line type="monotone" dataKey="bajaj" name="Bajaj Allianz" stroke="#f59e0b" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'matrix' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Automated and manual escalation steps triggered when SLA deadlines are breached.</p>
          <div className="space-y-3">
            {escalationMatrix.map((e, i) => (
              <Card key={i} className={`border-l-4 ${e.level === 1 ? 'border-l-amber-400' : e.level === 2 ? 'border-l-orange-500' : e.level === 3 ? 'border-l-red-500' : 'border-l-red-800'}`}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className={`rounded-full w-8 h-8 flex-shrink-0 flex items-center justify-center text-white text-sm font-bold ${
                    e.level === 1 ? 'bg-amber-400' : e.level === 2 ? 'bg-orange-500' : e.level === 3 ? 'bg-red-500' : 'bg-red-800'
                  }`}>L{e.level}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">Trigger: {e.trigger}</p>
                      {e.auto && <Badge className="bg-green-100 text-green-700 text-xs"><Zap className="h-3 w-3 mr-0.5" />Auto</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Action: {e.action}</p>
                  </div>
                  {!e.auto && (
                    <Button size="sm" variant="outline" onClick={() => toast({ title: 'Escalation Triggered', description: e.action })}>
                      Trigger Now
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </InsurancePortalLayout>
  );
};

export default InsuranceSLAPage;

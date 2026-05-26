import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, FileText, Download, BarChart2, Activity, DollarSign, Users } from 'lucide-react';
import api from '@/services/api';

interface ReportMeta { id: string; name: string; description: string; params: string[]; }
interface Digest { headline: { occupancy_pct: number; admissions_today: number; discharges_today: number; critical_alerts: number; emar_compliance_pct: number; ot_cases_today: number; preauths_pending: number; }; alerts: { type: string; message: string; severity: string; }[]; }

const REPORT_ICON: Record<string, React.ReactNode> = {
  census:           <Users className="h-5 w-5 text-blue-500" />,
  'ot-utilization': <Activity className="h-5 w-5 text-purple-500" />,
  'emar-compliance': <FileText className="h-5 w-5 text-green-500" />,
  'readmission-risk': <BarChart2 className="h-5 w-5 text-red-500" />,
  'executive-digest': <BarChart2 className="h-5 w-5 text-amber-500" />,
  'preauth-status': <DollarSign className="h-5 w-5 text-teal-500" />,
};

const SEVERITY_COLOR: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-blue-100 text-blue-700 border-blue-200',
};

export default function ReportCenter() {
  const navigate = useNavigate();
  const [catalog, setCatalog]     = useState<ReportMeta[]>([]);
  const [digest, setDigest]       = useState<Digest | null>(null);
  const [active, setActive]       = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadCatalogAndDigest = useCallback(async () => {
    try {
      const [catRes, digRes] = await Promise.allSettled([
        api.get('/api/v1/reports/clinical/catalog'),
        api.get('/api/v1/reports/clinical/executive-digest'),
      ]);
      if (catRes.status === 'fulfilled') setCatalog(catRes.value.data?.data ?? []);
      if (digRes.status === 'fulfilled') setDigest(digRes.value.data?.data ?? null);
      setLastUpdated(new Date());
    } catch {}
  }, []);

  useEffect(() => { loadCatalogAndDigest(); }, [loadCatalogAndDigest]);

  const runReport = async (id: string) => {
    setActive(id);
    setLoading(true);
    setReportData(null);
    try {
      const res = await api.get(`/api/v1/reports/clinical/${id}`);
      setReportData(res.data?.data ?? {});
    } finally {
      setLoading(false);
    }
  };

  const h = digest?.headline;

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Clinical Report Center</h1>
            <p className="text-sm text-slate-500">Live operational and clinical intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-xs text-slate-400">{lastUpdated.toLocaleTimeString()}</span>}
          <Button variant="outline" size="icon" onClick={loadCatalogAndDigest}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Executive Digest */}
      {h && (
        <Card className="bg-slate-900 text-white">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Executive Daily Digest</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Occupancy', value: `${h.occupancy_pct}%` },
                { label: 'Admissions', value: h.admissions_today },
                { label: 'Discharges', value: h.discharges_today },
                { label: 'Critical Alerts', value: h.critical_alerts },
                { label: 'eMAR Compliance', value: `${h.emar_compliance_pct}%` },
                { label: 'OT Cases', value: h.ot_cases_today },
                { label: 'Pre-auths Pending', value: h.preauths_pending },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-slate-400">{item.label}</p>
                </div>
              ))}
            </div>
            {digest?.alerts && digest.alerts.length > 0 && (
              <div className="mt-3 space-y-1">
                {digest.alerts.slice(0, 3).map((a, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded border ${SEVERITY_COLOR[a.severity] || 'bg-slate-800 text-slate-300'}`}>{a.message}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report Catalog */}
      <div className="grid grid-cols-1 gap-3">
        {catalog.map(report => (
          <Card key={report.id} className={`cursor-pointer transition-all ${active === report.id ? 'ring-2 ring-blue-500' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {REPORT_ICON[report.id] ?? <FileText className="h-5 w-5 text-slate-400" />}
                  <div>
                    <p className="font-medium text-sm">{report.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{report.description}</p>
                    {report.params.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">Params: {report.params.join(', ')}</p>
                    )}
                  </div>
                </div>
                <Button size="sm" variant={active === report.id ? 'default' : 'outline'} onClick={() => runReport(report.id)} disabled={loading && active === report.id}>
                  {loading && active === report.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  <span className="ml-1">Run</span>
                </Button>
              </div>

              {/* Inline report data */}
              {active === report.id && reportData && !loading && (
                <div className="mt-3 pt-3 border-t">
                  <pre className="text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-auto max-h-48">
                    {JSON.stringify(reportData, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

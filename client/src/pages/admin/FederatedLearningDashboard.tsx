/**
 * Federated Learning Dashboard — admin view of FL model status and rounds
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import api from '@/utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Cpu, RefreshCw, Shield, Layers, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';

interface FederatedStatus {
  models?: Array<{
    modelName: string;
    status: string;
    roundNumber?: number;
    pendingUpdates?: number;
    includedUpdates?: number;
    lastAggregatedAt?: string;
  }>;
  totalUpdates?: number;
  pendingReview?: number;
}

export default function FederatedLearningDashboard() {
  const [status, setStatus] = useState<FederatedStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/v3/ai-deeptech/federated/status');
      setStatus(res.data?.data ?? res.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to load federated status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const models = status?.models || [];

  return (
    <AdminLayout title="Federated Learning" subtitle="Privacy-preserving model updates across hospitals">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/hypergrid-ai" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to HyperGrid AI
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Cpu className="h-8 w-8 text-violet-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Registered Models</p>
                  <p className="text-2xl font-bold">{models.length || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Layers className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Updates</p>
                  <p className="text-2xl font-bold">{status?.totalUpdates ?? '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-emerald-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className="text-2xl font-bold">{status?.pendingReview ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              {error}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Model Registry</CardTitle>
            <CardDescription>Federated averaging rounds — PHI never leaves the hospital boundary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <p className="text-sm text-muted-foreground">Loading federated status…</p>}
            {!loading && models.length === 0 && (
              <p className="text-sm text-muted-foreground">No federated models registered yet. Submit local updates via the DeepTech API.</p>
            )}
            {models.map((m) => (
              <div key={m.modelName} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium">{m.modelName}</span>
                  </div>
                  <Badge variant="outline">{m.status || 'active'}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Round</span><p className="font-semibold">{m.roundNumber ?? 0}</p></div>
                  <div><span className="text-muted-foreground">Pending</span><p className="font-semibold">{m.pendingUpdates ?? 0}</p></div>
                  <div><span className="text-muted-foreground">Included</span><p className="font-semibold">{m.includedUpdates ?? 0}</p></div>
                  <div><span className="text-muted-foreground">Last aggregated</span><p className="font-semibold text-xs">{m.lastAggregatedAt ? new Date(m.lastAggregatedAt).toLocaleString() : '—'}</p></div>
                </div>
                <Progress value={Math.min(100, ((m.includedUpdates || 0) / Math.max(1, (m.pendingUpdates || 0) + (m.includedUpdates || 0))) * 100)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

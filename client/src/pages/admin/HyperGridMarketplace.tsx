/**
 * HyperGrid App Marketplace — browse, install, and rate SMART / native apps
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import api from '@/utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store, Search, Download, Star, ArrowLeft, RefreshCw, CheckCircle2, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  'All',
  'Clinical Decision Support',
  'Revenue Cycle',
  'Patient Engagement',
  'Analytics',
  'IoT / Device',
  'AI Diagnostics',
  'Pharmacy',
  'Insurance',
  'Scheduling',
  'Telemedicine',
  'Supply Chain',
  'Education',
  'Other',
];

interface MarketplaceApp {
  id: number;
  name: string;
  description: string;
  category: string;
  logo_url?: string;
  avg_rating?: number;
  install_count?: number;
  pricing?: { model?: string };
  tags?: string[];
  installed?: boolean;
}

export default function HyperGridMarketplace() {
  const { toast } = useToast();
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [installing, setInstalling] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { status: 'approved', limit: '50' };
      if (category !== 'All') params.category = category;
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/hypergrid/marketplace/apps', { params });
      setApps(res.data?.apps || res.data?.data || []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => { load(); }, [load]);

  const installApp = async (appId: number) => {
    setInstalling(appId);
    try {
      await api.post(`/hypergrid/marketplace/apps/${appId}/install`);
      toast({ title: 'App installed', description: 'App is now available in your HyperGrid tenant.' });
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, installed: true } : a)));
    } catch (e: unknown) {
      toast({ title: 'Install failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    } finally {
      setInstalling(null);
    }
  };

  const uninstallApp = async (appId: number) => {
    try {
      await api.delete(`/hypergrid/marketplace/apps/${appId}/install`);
      toast({ title: 'App uninstalled' });
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, installed: false } : a)));
    } catch (e: unknown) {
      toast({ title: 'Uninstall failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  return (
    <AdminLayout title="HyperGrid Marketplace" subtitle="SMART on FHIR apps and HyperGrid native integrations">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/hypergrid" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> HyperGrid Dashboard
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search apps…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={load}>Search</Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading marketplace…</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Card key={app.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      {app.logo_url ? (
                        <img src={app.logo_url} alt="" className="w-8 h-8 rounded" />
                      ) : (
                        <Package className="h-5 w-5 text-indigo-600" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">{app.name}</CardTitle>
                      <Badge variant="outline" className="text-xs mt-1">{app.category}</Badge>
                    </div>
                  </div>
                  {app.installed && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="line-clamp-2">{app.description}</CardDescription>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{Number(app.avg_rating || 0).toFixed(1)}</span>
                  <span className="flex items-center gap-1"><Download className="h-3.5 w-3.5" />{app.install_count || 0}</span>
                  <span>{app.pricing?.model || 'free'}</span>
                </div>
                {app.installed ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => uninstallApp(app.id)}>Uninstall</Button>
                ) : (
                  <Button size="sm" className="w-full gap-1" disabled={installing === app.id} onClick={() => installApp(app.id)}>
                    <Store className="h-4 w-4" />
                    {installing === app.id ? 'Installing…' : 'Install'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {!loading && apps.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No apps found. Submit your app via the developer portal API.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

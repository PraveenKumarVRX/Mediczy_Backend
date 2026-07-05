import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Globe, Network, Shield, UserCircle, Store, Loader2, CheckCircle2,
} from 'lucide-react';
import {
  getPlatformStatus, getFederationStatus, listNetworkOrgs, getCareIdentity,
  listMarketplaceApps, getGovernmentDashboard, getEmergencySummary, listNetworkSignals,
} from '@/services/careos.service';
import { HEALTH_OS } from '@/config/brand';

export default function CareOSEcosystem() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<any>(null);
  const [federation, setFederation] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [identity, setIdentity] = useState<any>(null);
  const [marketplace, setMarketplace] = useState<any[]>([]);
  const [gov, setGov] = useState<any>(null);
  const [emergency, setEmergency] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, f, o, i] = await Promise.all([
          getPlatformStatus(),
          getFederationStatus(),
          listNetworkOrgs(),
          getCareIdentity(),
        ]);
        setPlatform(p?.data);
        setFederation(f?.data);
        setOrgs(o?.data || []);
        setIdentity(i?.data);
      } catch { /* partial */ } finally { setLoading(false); }
    })();
  }, []);

  const loadStage4 = async () => {
    const [m, g, e, s] = await Promise.all([
      listMarketplaceApps().catch(() => ({ data: [] })),
      getGovernmentDashboard().catch(() => ({ data: null })),
      getEmergencySummary().catch(() => ({ data: null })),
      listNetworkSignals().catch(() => ({ data: [] })),
    ]);
    setMarketplace(m?.data || []);
    setGov(g?.data);
    setEmergency(e?.data);
    setSignals(s?.data || []);
  };

  const stages = platform?.stages || {};
  const summary = platform?.summary;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Network className="h-7 w-7 text-teal-400" />
              {HEALTH_OS.brandLine}
            </h1>
            <p className="text-slate-300 text-sm">All phases implemented — Land · Expand · Network · Platform</p>
          </div>
          {summary && (
            <Badge className="bg-green-600 text-white">
              {summary.liveModules}/{summary.totalModules} modules live
            </Badge>
          )}
        </div>

        <Tabs defaultValue="overview" onValueChange={(v) => { if (v === 'platform') loadStage4(); }}>
          <TabsList className="bg-white/10">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stages">All Stages</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="platform">Platform</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="bg-white/5 border-white/10 text-white">
              <CardContent className="pt-6">
                <p className="text-lg text-slate-200">
                  <strong className="text-teal-300">Mediqzy - HealthOS</strong> is the AI-native healthcare operating system
                  for hospitals, health systems, and cross-border care — not another HIS.
                </p>
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <Card key={n} className="bg-teal-950/30 border-teal-700/50 text-white">
                  <CardHeader className="pb-1"><CardTitle className="text-sm">Stage {n}: {stages[n]?.name}</CardTitle></CardHeader>
                  <CardContent className="text-xs text-slate-300">{stages[n]?.goal}</CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="stages" className="space-y-4">
            {loading ? <Loader2 className="animate-spin" /> : [1, 2, 3, 4].map((n) => (
              <Card key={n} className="bg-white/5 border-white/10 text-white">
                <CardHeader>
                  <CardTitle className="text-base">Stage {n}: {stages[n]?.name}</CardTitle>
                  <p className="text-xs text-slate-400">{stages[n]?.goal}</p>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-2">
                  {(stages[n]?.modules || []).map((m: any) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm border border-white/10 rounded-lg p-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                      <span>{m.label}</span>
                      <Badge className="ml-auto bg-green-900 text-green-200 text-[10px]">{m.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="network" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Federation</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p>Registered: <strong>{federation?.registered ? 'Yes' : 'No'}</strong></p>
                  <p>Trust agreements: <strong>{federation?.activeTrusts ?? 0}</strong></p>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4" /> Care Identity</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {identity ? (
                    <>
                      <p className="font-mono text-xs text-teal-300">{identity.careos_professional_id}</p>
                      <p>{identity.display_name}</p>
                    </>
                  ) : <p className="text-slate-400">Clinician login required</p>}
                </CardContent>
              </Card>
            </div>
            {orgs.length > 0 && (
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base">Network Organizations</CardTitle></CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
                  {orgs.map((o) => (
                    <div key={o.id} className="border border-white/10 rounded-lg p-3">
                      <p className="font-medium">{o.display_name}</p>
                      <p className="text-slate-400 text-xs">{o.country_code} · {o.org_type}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="platform" className="space-y-4">
            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Care Marketplace</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
                {marketplace.map((a) => (
                  <div key={a.id} className="border border-white/10 rounded-lg p-3">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-slate-400 text-xs">{a.category} · {a.vendor}</p>
                  </div>
                ))}
                {!marketplace.length && <p className="text-slate-400">Loading marketplace…</p>}
              </CardContent>
            </Card>
            {gov && (
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Care Government</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  <p>Active signals: {gov.activeSignals}</p>
                  <p>Emergency resource types: {gov.emergencyCapacity?.length || 0}</p>
                </CardContent>
              </Card>
            )}
            {emergency && (
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base">Global Emergency Network</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {(emergency.resources || []).map((r: any) => (
                    <p key={r.resource_type}>{r.resource_type}: {r.total_available} available across {r.org_count} orgs</p>
                  ))}
                </CardContent>
              </Card>
            )}
            {signals.length > 0 && (
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base">Network Signals</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  {signals.map((s) => (
                    <div key={s.id} className="border border-amber-500/30 rounded p-2">
                      <p className="font-medium">{s.title}</p>
                      <p className="text-slate-400 text-xs">{s.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap gap-3">
          <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => navigate('/hmis/command-center')}>Care Command</Button>
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => navigate('/hmis/ai-ops')}>Care AI</Button>
        </div>
      </div>
    </div>
  );
}

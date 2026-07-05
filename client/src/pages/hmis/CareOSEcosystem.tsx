import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Globe, Network, Shield, UserCircle, Store, Loader2, CheckCircle2,
  Key, Webhook, FlaskConical, BarChart3, Send, Trash2,
} from 'lucide-react';
import {
  getPlatformStatus, getFederationStatus, listNetworkOrgs, getCareIdentity,
  listMarketplaceApps, getGovernmentDashboard, getEmergencySummary, listNetworkSignals,
  installMarketplaceApp, listInstalledApps, createApiKey, listApiKeys, revokeApiKey,
  registerWebhook, listWebhooks, listReferrals, createReferral, acceptReferral,
  listClinicalTrials, getPopulationDashboard, resolveSignal, detectNetworkSignals,
  getFederationGatewayStatus,
} from '@/services/careos.service';
import { HEALTH_OS } from '@/config/brand';

export default function CareOSEcosystem() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<any>(null);
  const [federation, setFederation] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [identity, setIdentity] = useState<any>(null);
  const [marketplace, setMarketplace] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [trials, setTrials] = useState<any[]>([]);
  const [population, setPopulation] = useState<any>(null);
  const [gov, setGov] = useState<any>(null);
  const [emergency, setEmergency] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [gateway, setGateway] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState('timeline.event,referral.created');
  const [referFrom, setReferFrom] = useState('');
  const [referTo, setReferTo] = useState('');
  const [referPatient, setReferPatient] = useState('');
  const [referReason, setReferReason] = useState('');

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
    const [m, g, e, s, inst, keys, hooks, refs, tr, pop] = await Promise.all([
      listMarketplaceApps().catch(() => ({ data: [] })),
      getGovernmentDashboard().catch(() => ({ data: null })),
      getEmergencySummary().catch(() => ({ data: null })),
      listNetworkSignals().catch(() => ({ data: [] })),
      listInstalledApps().catch(() => ({ data: [] })),
      listApiKeys().catch(() => ({ data: [] })),
      listWebhooks().catch(() => ({ data: [] })),
      listReferrals().catch(() => ({ data: [] })),
      listClinicalTrials().catch(() => ({ data: [] })),
      getPopulationDashboard().catch(() => ({ data: null })),
    ]);
    setMarketplace(m?.data || []);
    setGov(g?.data);
    setEmergency(e?.data);
    setSignals(s?.data || []);
    setInstalled(inst?.data || []);
    setApiKeys(keys?.data || []);
    setWebhooks(hooks?.data || []);
    setReferrals(refs?.data || []);
    setTrials(tr?.data || []);
    setPopulation(pop?.data);
  };

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 4000); };

  const handleInstall = async (appId: number) => {
    await installMarketplaceApp(appId);
    flash('App installed');
    const inst = await listInstalledApps();
    setInstalled(inst?.data || []);
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    const res = await createApiKey(newKeyName.trim(), ['read', 'write']);
    setCreatedKey(res?.data?.apiKey || res?.data?.key || null);
    setNewKeyName('');
    const keys = await listApiKeys();
    setApiKeys(keys?.data || []);
    flash('API key created — copy it now');
  };

  const handleRevokeKey = async (keyId: number) => {
    await revokeApiKey(keyId);
    const keys = await listApiKeys();
    setApiKeys(keys?.data || []);
    flash('API key revoked');
  };

  const handleRegisterWebhook = async () => {
    if (!webhookUrl.trim()) return;
    const events = webhookEvents.split(',').map((e) => e.trim()).filter(Boolean);
    await registerWebhook(webhookUrl.trim(), events);
    setWebhookUrl('');
    const hooks = await listWebhooks();
    setWebhooks(hooks?.data || []);
    flash('Webhook registered');
  };

  const handleCreateReferral = async () => {
    if (!referFrom || !referTo || !referPatient || !referReason) return;
    await createReferral({
      fromOrgId: Number(referFrom),
      toOrgId: Number(referTo),
      patientId: Number(referPatient),
      reason: referReason,
      urgency: 'routine',
    });
    setReferReason('');
    const refs = await listReferrals();
    setReferrals(refs?.data || []);
    flash('Referral sent');
  };

  const handleAcceptReferral = async (id: number) => {
    await acceptReferral(id);
    const refs = await listReferrals();
    setReferrals(refs?.data || []);
    flash('Referral accepted');
  };

  const handleResolveSignal = async (id: number) => {
    await resolveSignal(id);
    const s = await listNetworkSignals();
    setSignals(s?.data || []);
    flash('Signal resolved');
  };

  const handleDetectSignals = async () => {
    await detectNetworkSignals();
    const s = await listNetworkSignals();
    setSignals(s?.data || []);
    flash('Network signals refreshed');
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
            <p className="text-slate-300 text-sm">API complete across all phases — Land · Expand · Network · Platform</p>
          </div>
          {summary && (
            <Badge className="bg-teal-700 text-white">
              {summary.liveModules}/{summary.totalModules} modules ready
            </Badge>
          )}
        </div>

        {actionMsg && (
          <div className="bg-teal-900/50 border border-teal-600 rounded-lg px-4 py-2 text-sm text-teal-100">{actionMsg}</div>
        )}

        <Tabs defaultValue="overview" onValueChange={(v) => {
          if (v === 'platform' || v === 'network') loadStage4();
          if (v === 'network') getFederationGatewayStatus().then((r) => setGateway(r?.data)).catch(() => {});
        }}>
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
                      <CheckCircle2 className={`h-4 w-4 shrink-0 ${m.status === 'live' ? 'text-green-400' : 'text-amber-400'}`} />
                      <span>{m.label}</span>
                      <Badge className={`ml-auto text-[10px] ${m.status === 'live' ? 'bg-green-900 text-green-200' : 'bg-amber-900 text-amber-200'}`}>{m.status}</Badge>
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
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" /> Federation Gateway</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {gateway ? (
                    <>
                      <p>Multitenancy: <strong>{gateway.multitenancy}</strong></p>
                      <p>Active trusts: <strong>{gateway.activeTrusts}</strong></p>
                      <p>Edge gateways: <strong>{gateway.edgeGateways?.online}/{gateway.edgeGateways?.total} online</strong></p>
                      <p className="text-xs text-slate-400">{(gateway.capabilities || []).join(' · ')}</p>
                    </>
                  ) : <p className="text-slate-400">Loading gateway status…</p>}
                </CardContent>
              </Card>
            </div>
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

            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" /> Federated Referrals</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-4 gap-2">
                  <Input placeholder="From org ID" value={referFrom} onChange={(e) => setReferFrom(e.target.value)} className="bg-white/5 border-white/20" />
                  <Input placeholder="To org ID" value={referTo} onChange={(e) => setReferTo(e.target.value)} className="bg-white/5 border-white/20" />
                  <Input placeholder="Patient ID" value={referPatient} onChange={(e) => setReferPatient(e.target.value)} className="bg-white/5 border-white/20" />
                  <Input placeholder="Reason" value={referReason} onChange={(e) => setReferReason(e.target.value)} className="bg-white/5 border-white/20" />
                </div>
                <Button size="sm" onClick={handleCreateReferral} disabled={!referReason}>Send referral</Button>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {referrals.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs border border-white/10 rounded p-2">
                      <span className="flex-1">#{r.id} P{r.patient_id}: {r.reason}</span>
                      <Badge variant="outline">{r.status}</Badge>
                      {r.status === 'pending' && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleAcceptReferral(r.id)}>Accept</Button>
                      )}
                    </div>
                  ))}
                  {!referrals.length && <p className="text-slate-400 text-sm">No referrals yet</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Network Signals</CardTitle>
                <Button size="sm" variant="outline" className="border-white/20" onClick={handleDetectSignals}>Detect signals</Button>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {signals.map((s) => (
                  <div key={s.id} className="border border-amber-500/30 rounded p-2 flex items-start gap-2">
                    <div className="flex-1">
                      <p className="font-medium">{s.title}</p>
                      <p className="text-slate-400 text-xs">{s.description}</p>
                    </div>
                    {s.status !== 'resolved' && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleResolveSignal(s.id)}>Resolve</Button>
                    )}
                  </div>
                ))}
                {!signals.length && <p className="text-slate-400">No active signals</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="platform" className="space-y-4">
            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Care Marketplace</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
                {marketplace.map((a) => (
                  <div key={a.id} className="border border-white/10 rounded-lg p-3 flex flex-col gap-2">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-slate-400 text-xs">{a.category} · {a.vendor}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-white/20 w-fit" onClick={() => handleInstall(a.id)}>
                      Install
                    </Button>
                  </div>
                ))}
                {!marketplace.length && <p className="text-slate-400">Loading marketplace…</p>}
              </CardContent>
              {installed.length > 0 && (
                <CardContent className="border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-400 mb-2">Installed ({installed.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {installed.map((a) => <Badge key={a.id || a.app_id} variant="secondary">{a.name || a.app_name}</Badge>)}
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Developer API Keys</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input placeholder="Key name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="bg-white/5 border-white/20" />
                    <Button size="sm" onClick={handleCreateKey}>Create</Button>
                  </div>
                  {createdKey && (
                    <div className="bg-amber-950/50 border border-amber-600 rounded p-2 text-xs break-all">
                      <p className="text-amber-200 font-medium mb-1">Copy now — shown once:</p>
                      <code>{createdKey}</code>
                    </div>
                  )}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {apiKeys.map((k) => (
                      <div key={k.id} className="flex items-center gap-2 text-xs border border-white/10 rounded p-2">
                        <span className="flex-1">{k.name} <code className="text-slate-400">{k.key_prefix}…</code></span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRevokeKey(k.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhooks</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="https://your-server.com/webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="bg-white/5 border-white/20" />
                  <Input placeholder="Events (comma-separated)" value={webhookEvents} onChange={(e) => setWebhookEvents(e.target.value)} className="bg-white/5 border-white/20" />
                  <Button size="sm" onClick={handleRegisterWebhook}>Register webhook</Button>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {webhooks.map((w) => (
                      <div key={w.id} className="text-xs border border-white/10 rounded p-2">
                        <p className="truncate">{w.url}</p>
                        <p className="text-slate-400">{(w.events || []).join(', ')}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Research Trials</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2 max-h-48 overflow-y-auto">
                  {trials.map((t) => (
                    <div key={t.id} className="border border-white/10 rounded p-2">
                      <p className="font-medium">{t.title || t.name}</p>
                      <p className="text-slate-400 text-xs">{t.condition || t.phase}</p>
                    </div>
                  ))}
                  {!trials.length && <p className="text-slate-400">No trials listed</p>}
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Population Analytics</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {population ? (
                    <>
                      <p>Total patients: <strong>{population.totalPatients ?? population.patientCount ?? '—'}</strong></p>
                      <p>Active admissions: <strong>{population.activeAdmissions ?? '—'}</strong></p>
                      <p>High-risk cohort: <strong>{population.highRiskCount ?? '—'}</strong></p>
                    </>
                  ) : <p className="text-slate-400">Loading analytics…</p>}
                </CardContent>
              </Card>
            </div>

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

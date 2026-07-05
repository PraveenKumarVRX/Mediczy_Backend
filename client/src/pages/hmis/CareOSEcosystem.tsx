import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Globe, Network, Shield, UserCircle, GitBranch, Cloud,
  Store, FlaskConical, GraduationCap, Wallet, Radio, Building2, Home, Loader2,
} from 'lucide-react';
import { getCareOSHealth, getFederationStatus, listNetworkOrgs, getCareIdentity } from '@/services/careos.service';

const PILLARS = [
  { id: 'care_workspace', label: 'Care Workspace', icon: Globe, stage: 1, status: 'live' },
  { id: 'care_ai', label: 'Care AI', icon: FlaskConical, stage: 1, status: 'partial' },
  { id: 'care_graph', label: 'Care Graph', icon: GitBranch, stage: 2, status: 'scaffold' },
  { id: 'care_identity', label: 'Care Identity', icon: UserCircle, stage: 2, status: 'scaffold' },
  { id: 'care_cloud', label: 'Care Cloud', icon: Cloud, stage: 3, status: 'planned' },
  { id: 'care_video', label: 'Care Video', icon: Radio, stage: 1, status: 'partial' },
  { id: 'care_marketplace', label: 'Care Marketplace', icon: Store, stage: 4, status: 'planned' },
  { id: 'care_research', label: 'Care Research', icon: FlaskConical, stage: 3, status: 'planned' },
  { id: 'care_finance', label: 'Care Finance', icon: Wallet, stage: 2, status: 'planned' },
  { id: 'care_command', label: 'Care Command', icon: Building2, stage: 2, status: 'partial' },
  { id: 'care_government', label: 'Care Government', icon: Shield, stage: 4, status: 'planned' },
  { id: 'care_home', label: 'Care Home', icon: Home, stage: 2, status: 'planned' },
];

const STAGES = [
  { n: 1, name: 'Land', desc: 'AI-native hospital + Care Workspace' },
  { n: 2, name: 'Expand', desc: 'Labs, pharmacy, wearables, passport' },
  { n: 3, name: 'Network', desc: 'Cross-border collaboration' },
  { n: 4, name: 'Platform', desc: 'APIs, marketplace, research' },
];

const STATUS_COLOR: Record<string, string> = {
  live: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  scaffold: 'bg-blue-100 text-blue-800',
  planned: 'bg-slate-100 text-slate-600',
};

export default function CareOSEcosystem() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<any>(null);
  const [federation, setFederation] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [identity, setIdentity] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [h, f, o, i] = await Promise.all([
          getCareOSHealth(),
          getFederationStatus(),
          listNetworkOrgs(),
          getCareIdentity(),
        ]);
        setHealth(h);
        setFederation(f?.data);
        setOrgs(o?.data || []);
        setIdentity(i?.data);
      } catch {
        // partial load ok
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Network className="h-7 w-7 text-teal-400" />
              Mediqzy CareOS
            </h1>
            <p className="text-slate-300 text-sm">The Intelligent Operating System for Global Healthcare</p>
          </div>
        </div>

        <Card className="bg-white/5 border-white/10 text-white">
          <CardContent className="pt-6">
            <p className="text-lg leading-relaxed text-slate-200">
              Not another HIS — a <strong className="text-teal-300">system of intelligence and collaboration</strong> that
              connects hospitals, clinics, labs, pharmacies, insurers, devices, and patients across borders —
              with consent, identity, and FHIR-based interoperability.
            </p>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-4 gap-3">
          {STAGES.map((s) => (
            <Card key={s.n} className={`border ${health?.stage === s.n ? 'border-teal-400 bg-teal-950/40' : 'bg-white/5 border-white/10'} text-white`}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Stage {s.n}: {s.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-300">{s.desc}</CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-5 w-5 text-teal-400" /> Platform Pillars
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <Card key={p.id} className="bg-white/5 border-white/10 text-white">
                  <CardContent className="pt-4 flex items-start gap-3">
                    <Icon className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{p.label}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge className={`text-[10px] ${STATUS_COLOR[p.status]}`}>{p.status}</Badge>
                        <Badge variant="outline" className="text-[10px] border-white/20">Stage {p.stage}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-teal-400" /> Federation Status
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <p>Network registered: <strong>{federation?.registered ? 'Yes' : 'Not yet'}</strong></p>
                  <p>Active trust agreements: <strong>{federation?.activeTrusts ?? 0}</strong></p>
                  <p className="text-slate-400 text-xs">Cross-border collaboration requires federation trust + patient consent via Medical Passport.</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-teal-400" /> Your Care Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {identity ? (
                <>
                  <p className="font-mono text-xs text-teal-300">{identity.careos_professional_id}</p>
                  <p>{identity.display_name || 'Clinician'}</p>
                  <p className="text-slate-400">{identity.affiliations?.length || 0} affiliation(s)</p>
                </>
              ) : (
                <p className="text-slate-400">Sign in as clinician to view identity</p>
              )}
            </CardContent>
          </Card>
        </div>

        {orgs.length > 0 && (
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader><CardTitle className="text-base">CareOS Network Organizations</CardTitle></CardHeader>
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

        <div className="flex flex-wrap gap-3">
          <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => navigate('/hmis/command-center')}>
            Care Command Center
          </Button>
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => navigate('/hmis/ai-ops')}>
            Care AI Hub
          </Button>
        </div>
      </div>
    </div>
  );
}

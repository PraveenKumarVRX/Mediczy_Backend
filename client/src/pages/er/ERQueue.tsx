import { useState, useEffect, useCallback } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle, Clock, Zap, ShieldAlert, ArrowUpRight, Plus,
  RefreshCw, Siren, HeartPulse, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type LegacyColour = 'red' | 'yellow' | 'green';

interface ERPatient {
  id: number;
  temp_id?: string;
  patient_id?: number;
  patient_name: string;
  age?: number;
  gender?: string;
  triage_level?: LegacyColour | null;
  esi_level?: number | null;
  triage_source?: string | null;
  triage_reviewed?: boolean;
  chief_complaint?: string;
  mlc_case: boolean;
  arrival_time: string;
  status: string;
}

interface ByEsi {
  esi1: ERPatient[];
  esi2: ERPatient[];
  esi3: ERPatient[];
  esi4: ERPatient[];
  esi5: ERPatient[];
  unclassified: ERPatient[];
}

const EMPTY_BY_ESI: ByEsi = { esi1: [], esi2: [], esi3: [], esi4: [], esi5: [], unclassified: [] };

// ── ESI lane configuration (RCP/ESI standard 5-level triage) ─────────────────

const ESI_LANES = [
  { key: 'esi1' as const, level: 1, label: 'ESI-1 · Resuscitation', short: 'Immediate, life-threatening',
    header: 'bg-red-600', badge: 'bg-red-100 text-red-700', border: 'border-red-300', dot: 'bg-red-600', icon: Siren },
  { key: 'esi2' as const, level: 2, label: 'ESI-2 · Emergent', short: 'High-risk, severe distress',
    header: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', border: 'border-orange-300', dot: 'bg-orange-500', icon: AlertCircle },
  { key: 'esi3' as const, level: 3, label: 'ESI-3 · Urgent', short: 'Needs multiple resources',
    header: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500', icon: Clock },
  { key: 'esi4' as const, level: 4, label: 'ESI-4 · Less Urgent', short: 'Needs one resource',
    header: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700', border: 'border-blue-300', dot: 'bg-blue-500', icon: HeartPulse },
  { key: 'esi5' as const, level: 5, label: 'ESI-5 · Non-Urgent', short: 'No resources expected',
    header: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-300', dot: 'bg-emerald-500', icon: CheckCircle2 },
];

const LEGACY_COLOUR_BADGE: Record<LegacyColour, string> = {
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-amber-100 text-amber-700',
  green: 'bg-emerald-100 text-emerald-700',
};

// ── Helper ────────────────────────────────────────────────────────────────────

function waitTime(arrival: string) {
  const mins = Math.floor((Date.now() - new Date(arrival).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Patient Card ──────────────────────────────────────────────────────────────

function ERPatientCard({ patient, onActivateOT, onConvertToIP, onAssignEsi }: {
  patient: ERPatient;
  onActivateOT: (p: ERPatient) => void;
  onConvertToIP: (p: ERPatient) => void;
  onAssignEsi: (p: ERPatient, esiLevel: number) => void;
}) {
  const needsReview = patient.triage_reviewed === false;

  return (
    <Card className={`border ${needsReview ? 'border-dashed border-slate-300 bg-slate-50' : 'bg-white'} shadow-sm`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 truncate">{patient.patient_name}</span>
              {patient.mlc_case && (
                <Badge className="bg-purple-100 text-purple-700 text-xs shrink-0">MLC</Badge>
              )}
              {patient.triage_level && (
                <Badge className={`text-xs shrink-0 ${LEGACY_COLOUR_BADGE[patient.triage_level]}`}>
                  {patient.triage_level}
                </Badge>
              )}
              {needsReview && (
                <Badge className="bg-slate-200 text-slate-600 text-xs shrink-0 gap-1">
                  <AlertTriangle className="h-3 w-3" /> Unreviewed
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {patient.age ? `${patient.age}y` : ''}
              {patient.gender ? ` · ${patient.gender}` : ''}
              {patient.temp_id ? ` · ID: ${patient.temp_id}` : ''}
              {patient.triage_source ? ` · via ${patient.triage_source}` : ''}
            </div>
            {patient.chief_complaint && (
              <div className="text-xs text-slate-600 mt-1 font-medium">{patient.chief_complaint}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold text-slate-600">Wait</div>
            <div className={`text-sm font-bold ${patient.esi_level === 1 ? 'text-red-600' : 'text-slate-700'}`}>
              {waitTime(patient.arrival_time)}
            </div>
          </div>
        </div>

        {needsReview && (
          <div className="flex items-center gap-2 pt-1 border-t border-dashed border-slate-200">
            <span className="text-xs text-slate-500 shrink-0">Assign ESI:</span>
            <Select onValueChange={(v) => onAssignEsi(patient, Number(v))}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Select level 1-5" />
              </SelectTrigger>
              <SelectContent>
                {ESI_LANES.map(l => (
                  <SelectItem key={l.level} value={String(l.level)} className="text-xs">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
            onClick={() => onActivateOT(patient)}
          >
            <Zap className="h-3 w-3" /> Emergency OT
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => onConvertToIP(patient)}
          >
            <ArrowUpRight className="h-3 w-3" /> Admit IP
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ERQueue() {
  const navigate = useNavigate();
  const [byEsi, setByEsi] = useState<ByEsi>(EMPTY_BY_ESI);
  const [total, setTotal] = useState(0);
  const [unreviewed, setUnreviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadQueue = useCallback(async () => {
    try {
      const res = await api.get('/v1/er/queue');
      const json = res.data;
      if (json.success) {
        setByEsi({ ...EMPTY_BY_ESI, ...json.byEsi });
        setTotal(json.total ?? 0);
        setUnreviewed(json.unreviewed ?? 0);
      }
    } catch {}
    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 15_000);
    return () => clearInterval(interval);
  }, [loadQueue]);

  const handleActivateOT = async (patient: ERPatient) => {
    const procedureName = prompt(`Emergency OT — Procedure name for ${patient.patient_name}:`);
    if (!procedureName) return;

    try {
      const res = await api.post('/v1/er/emergency-ot', {
        patientId: patient.patient_id,
        procedureName,
        notes: `Emergency OT from ER queue — ${patient.chief_complaint || ''}`,
      });
      const json = res.data;
      if (json.success) {
        alert(`Emergency OT activated — Room allocated. Booking #${json.data?.id}`);
      } else {
        alert(`OT activation failed: ${json.message}`);
      }
    } catch (e) {
      alert('Network error activating OT');
    }
  };

  const handleConvertToIP = (patient: ERPatient) => {
    navigate(`/hospital/adt/er-to-ip?patientId=${patient.patient_id || ''}&erId=${patient.id}&name=${encodeURIComponent(patient.patient_name)}`);
  };

  const handleAssignEsi = async (patient: ERPatient, esiLevel: number) => {
    try {
      const res = await api.put(`/v1/er/triage/${patient.id}`, { esiLevel });
      const json = res.data;
      if (!json.success) {
        alert(`Could not assign ESI level: ${json.message}`);
        return;
      }
      await loadQueue();
    } catch (e) {
      alert('Network error assigning ESI level');
    }
  };

  return (
    <HospitalLayout title="Emergency Queue" subtitle="ESI triage & fast-track">
      <div className="p-4 md:p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Siren className="h-6 w-6 text-red-500" /> Emergency Queue
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total} patient{total !== 1 ? 's' : ''} · Updated {lastUpdated.toLocaleTimeString()}
              {unreviewed > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" /> {unreviewed} awaiting ESI review
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadQueue} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => navigate('/hospital/er/register')}
            >
              <Plus className="h-3.5 w-3.5" /> Register Patient
            </Button>
          </div>
        </div>

        {/* ESI KPIs */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {ESI_LANES.map(lane => {
            const count = byEsi[lane.key]?.length || 0;
            return (
              <Card key={lane.key} className={`border-2 ${lane.border}`}>
                <CardContent className="p-3 text-center">
                  <lane.icon className={`h-5 w-5 mx-auto mb-1 ${lane.dot.replace('bg-', 'text-')}`} />
                  <div className="text-2xl font-bold text-slate-800">{loading ? '—' : count}</div>
                  <div className="text-[11px] font-medium text-slate-600 leading-tight">ESI-{lane.level}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Unclassified banner */}
        {byEsi.unclassified.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {byEsi.unclassified.length} patient{byEsi.unclassified.length !== 1 ? 's' : ''} not yet triaged at all — assign an ESI level below.
          </div>
        )}

        {/* ESI Swimlanes */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...ESI_LANES, {
            key: 'unclassified' as const, level: 0, label: 'Unclassified', short: 'No triage decision yet',
            header: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500', icon: ShieldAlert,
          }].map(lane => {
            const patients = byEsi[lane.key] || [];
            return (
              <div key={lane.key} className="space-y-2">
                <div className={`rounded-lg px-3 py-2 ${lane.header} text-white flex items-center justify-between`}>
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <lane.icon className="h-4 w-4" /> {lane.label}
                  </span>
                  <Badge className="bg-white/20 text-white text-xs">{patients.length}</Badge>
                </div>
                <div className="space-y-2 min-h-32">
                  {loading ? (
                    <p className="text-xs text-slate-400 text-center py-8">Loading...</p>
                  ) : patients.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No patients</p>
                  ) : patients.map(p => (
                    <ERPatientCard
                      key={p.id}
                      patient={p}
                      onActivateOT={handleActivateOT}
                      onConvertToIP={handleConvertToIP}
                      onAssignEsi={handleAssignEsi}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </HospitalLayout>
  );
}

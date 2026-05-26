import { useState, useEffect, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle, Clock, Zap, User, ArrowUpRight, Plus,
  RefreshCw, Siren, HeartPulse, Stethoscope
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ERPatient {
  id: number;
  temp_id?: string;
  patient_id?: number;
  patient_name: string;
  age?: number;
  gender?: string;
  triage_level: 'red' | 'yellow' | 'green';
  chief_complaint?: string;
  mlc_case: boolean;
  arrival_time: string;
  status: string;
}

interface ERQueue {
  red: ERPatient[];
  yellow: ERPatient[];
  green: ERPatient[];
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const triageConfig = {
  red: {
    label: 'Immediate',
    bg: 'bg-red-50 border-red-200',
    header: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    icon: AlertCircle,
  },
  yellow: {
    label: 'Urgent',
    bg: 'bg-amber-50 border-amber-200',
    header: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    icon: Clock,
  },
  green: {
    label: 'Non-Urgent',
    bg: 'bg-emerald-50 border-emerald-200',
    header: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    icon: HeartPulse,
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────

function waitTime(arrival: string) {
  const mins = Math.floor((Date.now() - new Date(arrival).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Patient Card ──────────────────────────────────────────────────────────────

function ERPatientCard({ patient, onActivateOT, onConvertToIP }: {
  patient: ERPatient;
  onActivateOT: (p: ERPatient) => void;
  onConvertToIP: (p: ERPatient) => void;
}) {
  const cfg = triageConfig[patient.triage_level];

  return (
    <Card className={`border ${cfg.bg} shadow-sm`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${cfg.dot} shrink-0`} />
              <span className="text-sm font-semibold text-slate-800 truncate">{patient.patient_name}</span>
              {patient.mlc_case && (
                <Badge className="bg-purple-100 text-purple-700 text-xs shrink-0">MLC</Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {patient.age ? `${patient.age}y` : ''}
              {patient.gender ? ` · ${patient.gender}` : ''}
              {patient.temp_id ? ` · ID: ${patient.temp_id}` : ''}
            </div>
            {patient.chief_complaint && (
              <div className="text-xs text-slate-600 mt-1 font-medium">{patient.chief_complaint}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold text-slate-600">Wait</div>
            <div className={`text-sm font-bold ${patient.triage_level === 'red' ? 'text-red-600' : 'text-slate-700'}`}>
              {waitTime(patient.arrival_time)}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
            onClick={() => onActivateOT(patient)}
          >
            <Siren className="h-3 w-3" /> Emergency OT
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
  const [queue, setQueue] = useState<ERQueue>({ red: [], yellow: [], green: [] });
  const [loading, setLoading] = useState(true);
  const [activatingOT, setActivatingOT] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/er/queue', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setQueue(json.data);
    } catch {}
    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 15_000);
    return () => clearInterval(interval);
  }, [loadQueue]);

  const totalPatients = (queue.red?.length || 0) + (queue.yellow?.length || 0) + (queue.green?.length || 0);

  const handleActivateOT = async (patient: ERPatient) => {
    const procedureName = prompt(`Emergency OT — Procedure name for ${patient.patient_name}:`);
    if (!procedureName) return;

    setActivatingOT(patient.id);
    try {
      const res = await fetch('/api/v1/er/emergency-ot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.patient_id,
          procedureName,
          notes: `Emergency OT from ER queue — ${patient.chief_complaint || ''}`
        })
      });
      const json = await res.json();
      if (json.success) {
        alert(`Emergency OT activated — Room allocated. Booking #${json.data?.id}`);
      } else {
        alert(`OT activation failed: ${json.message}`);
      }
    } catch (e) {
      alert('Network error activating OT');
    }
    setActivatingOT(null);
  };

  const handleConvertToIP = (patient: ERPatient) => {
    navigate(`/hospital/adt/er-to-ip?patientId=${patient.patient_id || ''}&erId=${patient.id}&name=${encodeURIComponent(patient.patient_name)}`);
  };

  return (
    <HospDeptLayout>
      <div className="p-4 md:p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Siren className="h-6 w-6 text-red-500" /> Emergency Queue
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {totalPatients} patient{totalPatients !== 1 ? 's' : ''} · Updated {lastUpdated.toLocaleTimeString()}
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

        {/* Triage KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {(['red', 'yellow', 'green'] as const).map(level => {
            const cfg = triageConfig[level];
            const count = queue[level]?.length || 0;
            return (
              <Card key={level} className={`border-2 ${level === 'red' ? 'border-red-300' : level === 'yellow' ? 'border-amber-300' : 'border-emerald-300'}`}>
                <CardContent className="p-4 text-center">
                  <cfg.icon className={`h-6 w-6 mx-auto mb-1 ${level === 'red' ? 'text-red-500' : level === 'yellow' ? 'text-amber-500' : 'text-emerald-500'}`} />
                  <div className="text-3xl font-bold text-slate-800">{loading ? '—' : count}</div>
                  <div className="text-sm font-medium text-slate-600">{cfg.label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Triage Swimlanes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['red', 'yellow', 'green'] as const).map(level => {
            const cfg = triageConfig[level];
            const patients = queue[level] || [];
            return (
              <div key={level} className="space-y-2">
                <div className={`rounded-lg px-3 py-2 ${cfg.header} text-white flex items-center justify-between`}>
                  <span className="text-sm font-semibold flex items-center gap-1">
                    <cfg.icon className="h-4 w-4" /> {cfg.label}
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
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </HospDeptLayout>
  );
}

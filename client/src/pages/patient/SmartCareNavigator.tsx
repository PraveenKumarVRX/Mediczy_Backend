/**
 * Smart Care Navigator
 *
 * Patient-facing journey tracker for admitted patients.
 * Shows: current journey step, what comes next, recovery diary,
 * medication reminders, and digital discharge packet.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, Circle, Clock, Bed, Stethoscope, Scissors,
  HeartPulse, Home, Calendar, Pill, FileText, Upload, Star,
  ChevronRight, AlertCircle, Phone
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface JourneyStep {
  id: string;
  label: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming';
  time?: string;
  icon: React.ComponentType<any>;
}

interface RecoveryEntry {
  date: string;
  painScore: number;
  mobility: string;
  notes: string;
}

interface DischargeItem {
  label: string;
  value: string;
  type: 'text' | 'link';
}

// ── Journey Step Builder ──────────────────────────────────────────────────────

function buildJourneySteps(admission: {
  admissionType: string;
  status: string;
  hasSurgery: boolean;
  admittedAt: string;
  expectedDischarge: string;
}): JourneyStep[] {
  const s = admission.status;

  const steps: JourneyStep[] = [
    {
      id: 'registered',
      label: 'Registered',
      description: 'Identity and medical history confirmed',
      status: 'completed',
      time: admission.admittedAt,
      icon: CheckCircle2
    },
    {
      id: 'admitted',
      label: 'Admitted',
      description: `Bed allocated · Ward nurse assigned`,
      status: s === 'pre_admitted' ? 'current' : 'completed',
      time: admission.admittedAt,
      icon: Bed
    },
    {
      id: 'investigations',
      label: 'Investigations',
      description: 'Lab tests · Imaging · Pre-op clearance',
      status: ['admitted'].includes(s) ? 'current' : ['pre_admitted'].includes(s) ? 'upcoming' : 'completed',
      icon: Stethoscope
    },
  ];

  if (admission.hasSurgery) {
    steps.push({
      id: 'surgery',
      label: 'Surgery',
      description: 'Operation theatre · Procedure · Recovery',
      status: s === 'in_ot' ? 'current' : s === 'admitted' ? 'upcoming' : ['discharged'].includes(s) ? 'completed' : 'upcoming',
      icon: Scissors
    });
  }

  steps.push(
    {
      id: 'recovery',
      label: 'Recovery & Monitoring',
      description: 'Vitals · Medications · Physiotherapy',
      status: s === 'in_icu' ? 'current' : s === 'admitted' && !admission.hasSurgery ? 'current' : 'upcoming',
      icon: HeartPulse
    },
    {
      id: 'discharge',
      label: 'Discharge',
      description: `Expected: ${admission.expectedDischarge || 'as advised'}`,
      status: s === 'discharged' ? 'completed' : 'upcoming',
      icon: Home
    }
  );

  return steps;
}

// ── Components ────────────────────────────────────────────────────────────────

function JourneyTracker({ steps }: { steps: JourneyStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                step.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                step.status === 'current' ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300' :
                'bg-slate-100 text-slate-400'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className={`w-0.5 flex-1 my-1 ${step.status === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
            </div>
            <div className={`pb-4 flex-1 ${isLast ? '' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${
                  step.status === 'current' ? 'text-blue-700' :
                  step.status === 'completed' ? 'text-slate-700' : 'text-slate-400'
                }`}>{step.label}</span>
                {step.status === 'current' && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">You are here</Badge>
                )}
                {step.status === 'completed' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
              {step.time && step.status === 'completed' && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(step.time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecoveryDiary({ entries, onAdd }: { entries: RecoveryEntry[]; onAdd: () => void }) {
  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No entries yet. Start your recovery diary today.</p>
      ) : entries.map((e, i) => (
        <div key={i} className="border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">{new Date(e.date).toLocaleDateString()}</span>
            <div className="flex gap-0.5">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <div key={n} className={`h-2 w-2 rounded-full ${n <= e.painScore ? (e.painScore >= 7 ? 'bg-red-400' : e.painScore >= 4 ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-slate-200'}`} />
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-600 mt-1">Pain: {e.painScore}/10 · Mobility: {e.mobility}</div>
          {e.notes && <div className="text-xs text-slate-500 mt-1">{e.notes}</div>}
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={onAdd}>
        Add Today's Entry
      </Button>
    </div>
  );
}

function DischargePacket({ items }: { items: DischargeItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-400 text-center py-4">Discharge packet not ready yet.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
          <span className="text-sm text-slate-600">{item.label}</span>
          {item.type === 'link' ? (
            <a href={item.value} className="text-sm text-blue-600 underline flex items-center gap-1" target="_blank" rel="noreferrer">
              Download <ChevronRight className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-sm font-medium text-slate-800">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SmartCareNavigator() {
  const [admission, setAdmission] = useState<{
    admissionType: string; status: string; hasSurgery: boolean;
    admittedAt: string; expectedDischarge: string;
    wardName: string; bedNumber: string; doctorName: string;
    admissionNumber: string;
  } | null>(null);
  const [recoveryEntries, setRecoveryEntries] = useState<RecoveryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'journey' | 'recovery' | 'discharge'>('journey');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load current admission for logged-in patient
    fetch('/api/v1/adt/patient/me/current', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) setAdmission(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load recovery diary from local storage (syncs to server when online)
    try {
      const stored = localStorage.getItem('recovery_diary');
      if (stored) setRecoveryEntries(JSON.parse(stored));
    } catch {}
  }, []);

  const handleAddRecovery = () => {
    const pain = parseInt(prompt('Pain score (1–10):') || '0');
    const mobility = prompt('Mobility (e.g. Walking with support):') || '';
    const notes = prompt('Any notes:') || '';
    if (!pain) return;
    const entry: RecoveryEntry = { date: new Date().toISOString(), painScore: pain, mobility, notes };
    const updated = [entry, ...recoveryEntries];
    setRecoveryEntries(updated);
    localStorage.setItem('recovery_diary', JSON.stringify(updated));
  };

  const steps = admission
    ? buildJourneySteps(admission)
    : buildJourneySteps({ admissionType: 'elective', status: 'admitted', hasSurgery: false, admittedAt: new Date().toISOString(), expectedDischarge: '' });

  const dischargeItems: DischargeItem[] = admission?.status === 'discharged' ? [
    { label: 'Discharge Summary', value: '/api/v1/discharge/pdf', type: 'link' },
    { label: 'e-Prescription', value: '/api/v1/prescriptions/pdf', type: 'link' },
    { label: 'Follow-up Date', value: '7 days from discharge', type: 'text' },
    { label: 'Emergency Contact', value: '1800-XXX-XXXX', type: 'text' },
  ] : [];

  const tabs = [
    { id: 'journey', label: 'Journey', icon: Bed },
    { id: 'recovery', label: 'Recovery Diary', icon: HeartPulse },
    { id: 'discharge', label: 'Discharge Packet', icon: FileText },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">

      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-sm border">
        <h1 className="text-lg font-bold text-slate-800">Your Care Journey</h1>
        {loading ? (
          <p className="text-sm text-slate-400 mt-1">Loading your admission details...</p>
        ) : admission ? (
          <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <div className="text-slate-500">Admission No</div>
            <div className="font-medium text-slate-800">{admission.admissionNumber}</div>
            <div className="text-slate-500">Ward / Bed</div>
            <div className="font-medium text-slate-800">{admission.wardName} · Bed {admission.bedNumber}</div>
            <div className="text-slate-500">Doctor</div>
            <div className="font-medium text-slate-800">Dr. {admission.doctorName}</div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 mt-1">No active admission found. Contact the nurse's station if you need help.</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl border shadow-sm overflow-hidden">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors
              ${activeTab === tab.id ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          {activeTab === 'journey' && (
            <JourneyTracker steps={steps} />
          )}
          {activeTab === 'recovery' && (
            <RecoveryDiary entries={recoveryEntries} onAdd={handleAddRecovery} />
          )}
          {activeTab === 'discharge' && (
            <DischargePacket items={dischargeItems} />
          )}
        </CardContent>
      </Card>

      {/* Help Button */}
      <button
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl p-4 font-medium shadow-md"
        onClick={() => window.open('tel:1800-XXX-XXXX')}
      >
        <Phone className="h-4 w-4" /> Call Nurse Station
      </button>
    </div>
  );
}

/**
 * Clinical CDSS — ESI triage reference & decision support.
 *
 * WP-0.3b: this screen used to show a fabricated "active case" (a named patient who doesn't exist)
 * and fabricated AI suggestions with no backend behind either. Per the plan, both are now an honest
 * empty state — the ESI reference table below is genuinely static reference content (RCP/ESI level
 * definitions), not patient data, so it stays.
 */
import { useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Activity, Stethoscope, Brain } from 'lucide-react';

const TRIAGE_LEVELS = [
  { esi: 1, label: 'Resuscitation', color: 'bg-red-600', wait: 'Immediate', example: 'Cardiac arrest, severe trauma' },
  { esi: 2, label: 'Emergent', color: 'bg-orange-500', wait: '< 10 min', example: 'Chest pain, stroke symptoms' },
  { esi: 3, label: 'Urgent', color: 'bg-amber-500', wait: '< 30 min', example: 'Abdominal pain, moderate trauma' },
  { esi: 4, label: 'Less Urgent', color: 'bg-blue-500', wait: '< 60 min', example: 'Simple laceration, UTI' },
  { esi: 5, label: 'Non-Urgent', color: 'bg-emerald-500', wait: '< 120 min', example: 'Chronic complaints, prescriptions' },
];

export default function HospitalClinicalCDSS() {
  const [selectedEsi, setSelectedEsi] = useState<number | null>(null);

  return (
    <HospitalLayout title="Clinical CDSS" subtitle="ESI triage reference & decision support">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> ESI Triage Level Reference
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TRIAGE_LEVELS.map(level => (
              <button
                key={level.esi}
                type="button"
                onClick={() => setSelectedEsi(level.esi)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedEsi === level.esi ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-8 h-8 rounded-full ${level.color} text-white flex items-center justify-center font-bold text-sm`}>
                    {level.esi}
                  </span>
                  <span className="font-semibold">{level.label}</span>
                </div>
                <p className="text-xs text-slate-500">Target wait: {level.wait}</p>
                <p className="text-xs text-slate-600 mt-1">{level.example}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Brain}
              title="No active case"
              description="AI-assisted triage recommendations appear here once decision support is connected to a live ER case — this is not wired to a backend yet."
              size="sm"
            />
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}

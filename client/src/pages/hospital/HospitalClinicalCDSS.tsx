/**
 * Clinical CDSS — ESI triage & decision support (hospital portal demo).
 */
import { useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, AlertTriangle, CheckCircle2, Activity, Stethoscope } from 'lucide-react';

const TRIAGE_LEVELS = [
  { esi: 1, label: 'Resuscitation', color: 'bg-red-600', wait: 'Immediate', example: 'Cardiac arrest, severe trauma' },
  { esi: 2, label: 'Emergent', color: 'bg-orange-500', wait: '< 10 min', example: 'Chest pain, stroke symptoms' },
  { esi: 3, label: 'Urgent', color: 'bg-amber-500', wait: '< 30 min', example: 'Abdominal pain, moderate trauma' },
  { esi: 4, label: 'Less Urgent', color: 'bg-blue-500', wait: '< 60 min', example: 'Simple laceration, UTI' },
  { esi: 5, label: 'Non-Urgent', color: 'bg-emerald-500', wait: '< 120 min', example: 'Chronic complaints, prescriptions' },
];

const CDSS_SUGGESTIONS = [
  { type: 'warning', text: 'Consider ACS workup — troponin + ECG within 10 minutes' },
  { type: 'info', text: 'Drug interaction: Metformin + contrast — hold 48h post-CT' },
  { type: 'success', text: 'Sepsis screen negative — qSOFA score 0' },
];

export default function HospitalClinicalCDSS() {
  const [selectedEsi, setSelectedEsi] = useState<number | null>(3);

  return (
    <HospitalLayout title="Clinical CDSS" subtitle="ESI triage & AI decision support">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card className="border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-purple-50">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-fuchsia-600" />
              <div>
                <p className="font-semibold">Active case: Rahul Mehta — Chest discomfort</p>
                <p className="text-sm text-slate-600">ER Bay 2 · Vitals stable · Awaiting labs</p>
              </div>
            </div>
            <Badge className="bg-fuchsia-600">AI CDSS</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> ESI Triage Level
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
          <CardContent className="space-y-3">
            {CDSS_SUGGESTIONS.map((s, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                s.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
                s.type === 'success' ? 'bg-emerald-50 border border-emerald-200' :
                'bg-blue-50 border border-blue-200'
              }`}>
                {s.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /> :
                 s.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> :
                 <Brain className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                <p>{s.text}</p>
              </div>
            ))}
            <Button className="w-full bg-fuchsia-600 hover:bg-fuchsia-700">Apply Triage & Notify ER Team</Button>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}

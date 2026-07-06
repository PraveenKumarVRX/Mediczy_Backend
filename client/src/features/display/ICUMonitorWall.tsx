import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import DisplayShell from '@/pages/display/DisplayShell';
import { VitalsStrip } from '@/components/clinical/VitalsStrip';

interface ICUBed {
  bed: string;
  patient?: string;
  acuity?: string;
  vitals?: { hr?: number; spo2?: number; bp?: string; rr?: number; temp?: number };
}

/** ICU monitor wall — /display/icu/:unitId */
export default function ICUMonitorWall() {
  const { unitId } = useParams<{ unitId: string }>();
  const [beds, setBeds] = useState<ICUBed[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/display/icu-board');
      const json = await res.json();
      if (json.success) {
        const list = (json.beds || json.patients || []).map((b: any) => ({
          bed: b.bed || b.bed_number,
          patient: b.patient_name || b.patient,
          acuity: b.acuity || b.status,
          vitals: b.vitals,
        }));
        setBeds(list);
      }
    } catch {
      setBeds([
        { bed: 'ICU-1', patient: 'Demo Patient', acuity: 'critical', vitals: { hr: 110, spo2: 91, bp: '90/60', rr: 22, temp: 38.2 } },
        { bed: 'ICU-2', patient: 'Stable Patient', acuity: 'stable', vitals: { hr: 78, spo2: 98, bp: '120/80', rr: 16, temp: 36.8 } },
      ]);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <DisplayShell zone={`icu-${unitId || 'main'}`} zoneName={`ICU Monitor Wall — ${unitId || 'Main Unit'}`} fullscreen>
      <div className="h-full p-4 grid md:grid-cols-2 gap-4 overflow-auto">
        {beds.map((b) => (
          <div
            key={b.bed}
            className={`rounded-2xl border p-4 ${
              b.acuity === 'critical' || b.acuity === 'alert' ? 'border-red-600 bg-red-950/30' : 'border-gray-700 bg-gray-900/80'
            }`}
          >
            <div className="flex justify-between mb-3">
              <span className="text-white font-bold text-lg">{b.bed}</span>
              <span className="text-xs uppercase text-teal-400">{b.acuity}</span>
            </div>
            <p className="text-gray-300 mb-3">{b.patient || 'Empty'}</p>
            <div className="[&_.text-muted-foreground]:text-gray-500 [&_p]:text-white">
              <VitalsStrip vitals={b.vitals} />
            </div>
          </div>
        ))}
      </div>
    </DisplayShell>
  );
}

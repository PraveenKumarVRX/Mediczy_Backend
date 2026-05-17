import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface ICUBed {
  bed_number: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  diagnosis: string | null;
  spo2: number | null;
  hr: number | null;
  bp: string | null;
  temp: number | null;
  rr: number | null;
  news2: number | null;
  alert_level: 'green' | 'yellow' | 'orange' | 'red';
  status?: string;
}

const ALERT_STYLES: Record<string, string> = {
  green: 'border-green-600 bg-green-950/40',
  yellow: 'border-yellow-500 bg-yellow-950/40',
  orange: 'border-orange-500 bg-orange-950/40',
  red: 'border-red-500 bg-red-950/40 animate-pulse',
};

const NEWS2_COLOR = (n: number | null) => {
  if (n === null) return 'text-gray-500';
  if (n >= 7) return 'text-red-400 font-black';
  if (n >= 5) return 'text-orange-400 font-bold';
  if (n >= 3) return 'text-yellow-400 font-semibold';
  return 'text-green-400';
};

function Vital({ label, value, unit = '' }: { label: string; value: string | number | null; unit?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="text-center">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-white font-semibold text-sm">{value}<span className="text-gray-400 text-xs ml-0.5">{unit}</span></p>
    </div>
  );
}

export default function ICUBoardDisplay() {
  const [beds, setBeds] = useState<ICUBed[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchICU = useCallback(async () => {
    try {
      const res = await fetch('/api/display/icu-board');
      const json = await res.json();
      if (json.success) {
        setBeds(json.beds);
        setLastUpdated(new Date());
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchICU();
    const t = setInterval(fetchICU, 15000);
    return () => clearInterval(t);
  }, [fetchICU]);

  const criticalCount = beds.filter(b => b.alert_level === 'red').length;
  const alertCount = beds.filter(b => b.alert_level === 'orange').length;
  const occupiedCount = beds.filter(b => b.status !== 'available').length;

  return (
    <DisplayShell zone="icu" zoneName="ICU Nursing Station" fullscreen>
      <div className="h-full flex flex-col p-4 gap-4">

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {[
            { label: 'Total Beds', value: beds.length, color: 'text-white' },
            { label: 'Occupied', value: occupiedCount, color: 'text-blue-400' },
            { label: 'Alert', value: alertCount, color: 'text-orange-400' },
            { label: 'Critical', value: criticalCount, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl border border-gray-700 p-3 text-center">
              <p className="text-gray-500 text-xs uppercase tracking-widest">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bed grid */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 overflow-auto">
          {beds.map(bed => (
            <div
              key={bed.bed_number}
              className={`rounded-xl border-2 p-4 transition-all ${ALERT_STYLES[bed.alert_level] ?? 'border-gray-700 bg-gray-800/40'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-teal-400 font-bold text-sm">{bed.bed_number}</span>
                {bed.news2 !== null && (
                  <span className={`text-xs font-semibold ${NEWS2_COLOR(bed.news2)}`}>NEWS2: {bed.news2}</span>
                )}
              </div>

              {bed.status === 'available' ? (
                <div className="flex items-center justify-center h-16 text-green-500 font-semibold text-sm">
                  Available
                </div>
              ) : (
                <>
                  <p className="text-white font-semibold text-sm truncate">{bed.patient_name}</p>
                  <p className="text-gray-400 text-xs mb-3">
                    {bed.age ? `${bed.age}y` : ''}{bed.gender ? ` · ${bed.gender}` : ''}{bed.diagnosis ? ` · ${bed.diagnosis}` : ''}
                  </p>
                  <div className="grid grid-cols-3 gap-2 bg-gray-900/50 rounded-lg p-2">
                    <Vital label="SpO₂" value={bed.spo2} unit="%" />
                    <Vital label="HR" value={bed.hr} unit="/min" />
                    <Vital label="RR" value={bed.rr} unit="/min" />
                    <Vital label="Temp" value={bed.temp} unit="°C" />
                    <div className="col-span-2 text-center">
                      <p className="text-gray-500 text-xs">BP</p>
                      <p className="text-white font-semibold text-sm">{bed.bp ?? '—'}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs text-right shrink-0">
          Last updated: {lastUpdated.toLocaleTimeString('en-IN')} · Auto-refresh every 15 s
        </p>
      </div>
    </DisplayShell>
  );
}

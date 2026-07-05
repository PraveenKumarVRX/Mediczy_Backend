import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import DisplayShell from '@/pages/display/DisplayShell';

interface WardBed {
  bed_number: string;
  patient_name: string;
  status: string;
  diagnosis?: string;
  nurse?: string;
  vitals?: { spo2?: number; hr?: number; bp?: string };
}

/** Ward board display — /display/ward/:wardId */
export default function WardBoard() {
  const { wardId } = useParams<{ wardId: string }>();
  const [beds, setBeds] = useState<WardBed[]>([]);
  const [wardName, setWardName] = useState('Ward');

  const fetchWard = useCallback(async () => {
    try {
      const url = wardId
        ? `/api/display/ward?ward=${encodeURIComponent(wardId)}`
        : '/api/display/ward';
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setBeds(json.beds || []);
        if (json.wardName) setWardName(json.wardName);
      }
    } catch {
      /* display may run kiosk without auth */
    }
  }, [wardId]);

  useEffect(() => {
    fetchWard();
    const t = setInterval(fetchWard, 15_000);
    return () => clearInterval(t);
  }, [fetchWard]);

  return (
    <DisplayShell zone={`ward-${wardId || 'general'}`} zoneName={`Ward Board — ${wardName}`} fullscreen>
      <div className="h-full p-4 flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {[
            { label: 'Occupied', value: beds.filter((b) => b.status !== 'available').length },
            { label: 'Alerts', value: beds.filter((b) => b.status === 'alert').length },
            { label: 'Available', value: beds.filter((b) => b.status === 'available').length },
            { label: 'Total beds', value: beds.length },
          ].map((k) => (
            <div key={k.label} className="bg-gray-900/80 border border-gray-700 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs uppercase">{k.label}</p>
              <p className="text-3xl font-black text-teal-300 mt-1">{k.value}</p>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-auto space-y-2">
          {beds.map((b) => (
            <div
              key={b.bed_number}
              className={`grid grid-cols-6 gap-2 p-3 rounded-lg border ${
                b.status === 'alert' ? 'bg-red-950/40 border-red-700' : 'bg-gray-900/60 border-gray-700'
              }`}
            >
              <span className="font-bold text-white">{b.bed_number}</span>
              <span className="col-span-2 text-gray-200">{b.patient_name || '—'}</span>
              <span className="text-gray-400 text-sm">{b.diagnosis || '—'}</span>
              <span className="text-gray-400 text-sm">{b.nurse || '—'}</span>
              <span className="text-xs uppercase text-teal-400">{b.status}</span>
            </div>
          ))}
          {!beds.length && (
            <p className="text-center text-gray-500 py-12">No ward data — check ward ID or display API.</p>
          )}
        </div>
      </div>
    </DisplayShell>
  );
}

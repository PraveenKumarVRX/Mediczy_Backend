import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface WardBed {
  bed_number: string;
  patient_name: string;
  age: number | null;
  status: 'stable' | 'monitoring' | 'alert' | 'available' | string;
  diagnosis?: string;
  nurse?: string;
  pending_orders?: number;
  medication_due?: boolean;
  vitals?: { spo2?: number; hr?: number; bp?: string };
}

const STATUS_STYLES: Record<string, { badge: string; row: string }> = {
  stable:    { badge: 'bg-green-800 text-green-200',  row: '' },
  monitoring: { badge: 'bg-blue-800 text-blue-200',   row: 'bg-blue-950/20' },
  alert:     { badge: 'bg-red-800 text-red-200',      row: 'bg-red-950/30 border-l-4 border-red-500' },
  available: { badge: 'bg-gray-700 text-gray-400',    row: 'opacity-60' },
};

export default function WardNursingDisplay() {
  const [beds, setBeds] = useState<WardBed[]>([]);
  const [wardName, setWardName] = useState('Ward');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const ward = new URLSearchParams(window.location.search).get('ward') ?? '';

  const fetchWard = useCallback(async () => {
    try {
      const url = ward ? `/api/display/ward?ward=${encodeURIComponent(ward)}` : '/api/display/ward';
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setBeds(json.beds);
        if (json.wardName) setWardName(json.wardName);
        setLastUpdated(new Date());
      }
    } catch (_) {}
  }, [ward]);

  useEffect(() => {
    fetchWard();
    const t = setInterval(fetchWard, 15000);
    return () => clearInterval(t);
  }, [fetchWard]);

  const alertCount = beds.filter(b => b.status === 'alert').length;
  const medicationDue = beds.filter(b => b.medication_due).length;
  const pendingOrders = beds.reduce((sum, b) => sum + (b.pending_orders ?? 0), 0);
  const occupied = beds.filter(b => b.status !== 'available').length;

  return (
    <DisplayShell zone={`ward-${ward || 'general'}`} zoneName={`Nursing Station — ${wardName}`} fullscreen>
      <div className="h-full flex flex-col p-4 gap-4">

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {[
            { label: 'Occupied', value: occupied, color: 'text-white' },
            { label: 'Alerts', value: alertCount, color: alertCount > 0 ? 'text-red-400' : 'text-gray-500' },
            { label: 'Meds Due', value: medicationDue, color: medicationDue > 0 ? 'text-amber-400' : 'text-gray-500' },
            { label: 'Pending Orders', value: pendingOrders, color: pendingOrders > 0 ? 'text-blue-400' : 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl border border-gray-700 p-3 text-center">
              <p className="text-gray-500 text-xs uppercase tracking-widest">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bed table */}
        <div className="flex-1 overflow-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr>
                {['Bed', 'Patient', 'Diagnosis', 'Status', 'Nurse', 'SpO₂', 'HR', 'BP', 'Orders', 'Meds'].map(h => (
                  <th key={h} className="text-left p-3 text-gray-400 font-medium text-xs uppercase tracking-widest border-b border-gray-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {beds.map(bed => {
                const style = STATUS_STYLES[bed.status] ?? STATUS_STYLES['stable'];
                return (
                  <tr key={bed.bed_number} className={`border-b border-gray-800 hover:bg-gray-800/30 ${style.row}`}>
                    <td className="p-3 font-mono text-teal-400 font-bold text-xs">{bed.bed_number}</td>
                    <td className="p-3">
                      <p className="text-white font-medium">{bed.patient_name}</p>
                      {bed.age && <p className="text-gray-500 text-xs">{bed.age}y</p>}
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{bed.diagnosis ?? '—'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}>
                        {bed.status}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{bed.nurse ?? '—'}</td>
                    <td className="p-3 text-center text-white font-mono text-sm">
                      {bed.vitals?.spo2 ? `${bed.vitals.spo2}%` : '—'}
                    </td>
                    <td className="p-3 text-center text-white font-mono text-sm">
                      {bed.vitals?.hr ?? '—'}
                    </td>
                    <td className="p-3 text-center text-white font-mono text-xs">
                      {bed.vitals?.bp ?? '—'}
                    </td>
                    <td className="p-3 text-center">
                      {(bed.pending_orders ?? 0) > 0 ? (
                        <span className="bg-blue-800 text-blue-200 text-xs font-bold px-2 py-0.5 rounded-full">{bed.pending_orders}</span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {bed.medication_due
                        ? <span className="text-amber-400 font-bold text-xs">⚠️ Due</span>
                        : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-gray-600 text-xs text-right shrink-0">
          {lastUpdated.toLocaleTimeString('en-IN')} · Auto-refresh every 15 s
        </p>
      </div>
    </DisplayShell>
  );
}

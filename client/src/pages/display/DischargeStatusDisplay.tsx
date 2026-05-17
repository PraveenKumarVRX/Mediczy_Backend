import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface DischargeEntry {
  patient_name: string;
  status: 'processing' | 'pending_billing' | 'ready' | string;
  step: string;
  eta: string | null;
}

const STATUS_STYLES: Record<string, { badge: string; row: string; icon: string }> = {
  ready:           { badge: 'bg-green-700 text-green-100',   row: 'border-l-4 border-green-500 bg-green-950/20', icon: '✅' },
  processing:      { badge: 'bg-blue-700 text-blue-100',     row: '',                                             icon: '⏳' },
  pending_billing: { badge: 'bg-amber-700 text-amber-100',   row: 'border-l-4 border-amber-500 bg-amber-950/20', icon: '🧾' },
};

export default function DischargeStatusDisplay() {
  const [discharges, setDischarges] = useState<DischargeEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchDischarges = useCallback(async () => {
    try {
      const res = await fetch('/api/display/discharge-status');
      const json = await res.json();
      if (json.success) { setDischarges(json.discharges); setLastUpdated(new Date()); }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchDischarges();
    const t = setInterval(fetchDischarges, 30000);
    return () => clearInterval(t);
  }, [fetchDischarges]);

  const readyCount = discharges.filter(d => d.status === 'ready').length;
  const processingCount = discharges.filter(d => d.status !== 'ready').length;

  return (
    <DisplayShell zone="discharge-lounge" zoneName="Discharge Status" fullscreen>
      <div className="h-full flex flex-col p-6 gap-6">
        <div className="text-center shrink-0">
          <h1 className="text-4xl font-black text-white mb-2">Discharge Status</h1>
          <p className="text-gray-400">Please take a seat. You will be called when ready.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 shrink-0">
          <div className="bg-green-900/40 border border-green-700 rounded-2xl p-5 text-center">
            <p className="text-green-400 uppercase text-xs tracking-widest mb-1">Ready for Discharge</p>
            <p className="text-6xl font-black text-green-300">{readyCount}</p>
          </div>
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5 text-center">
            <p className="text-gray-400 uppercase text-xs tracking-widest mb-1">In Progress</p>
            <p className="text-6xl font-black text-white">{processingCount}</p>
          </div>
        </div>

        {/* Discharge list */}
        <div className="flex-1 space-y-3 overflow-auto">
          {discharges.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-xl">
              No pending discharges
            </div>
          ) : (
            discharges.map((d, i) => {
              const style = STATUS_STYLES[d.status] ?? STATUS_STYLES['processing'];
              return (
                <div
                  key={i}
                  className={`rounded-2xl border border-gray-700 bg-gray-800/40 p-5 flex items-center gap-5 ${style.row}`}
                >
                  <span className="text-4xl shrink-0">{style.icon}</span>
                  <div className="flex-1">
                    <p className="text-xl font-bold text-white">{d.patient_name}</p>
                    <p className="text-gray-300 mt-1">{d.step}</p>
                    {d.eta && <p className="text-gray-500 text-sm mt-1">⏱ {d.eta}</p>}
                  </div>
                  <span className={`px-4 py-2 rounded-full text-sm font-bold shrink-0 ${style.badge}`}>
                    {d.status === 'ready' ? 'Ready' : d.status === 'pending_billing' ? 'Billing' : 'Processing'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer instructions */}
        <div className="bg-blue-900/30 border border-blue-800 rounded-xl p-4 text-center shrink-0">
          <p className="text-blue-200 text-sm">
            When your name shows <strong>Ready</strong>, please proceed to the Discharge Counter (Counter 4) to collect your documents and medicines.
          </p>
        </div>

        <p className="text-gray-600 text-xs text-right shrink-0">
          Updated: {lastUpdated.toLocaleTimeString('en-IN')} · Auto-refresh every 30 s
        </p>
      </div>
    </DisplayShell>
  );
}

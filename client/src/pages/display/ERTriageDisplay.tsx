import React, { useCallback, useEffect, useState } from 'react';
import DisplayShell from './DisplayShell';

interface ErEntry {
  id: number;
  tokenNumber: string;
  patientName: string;
  triageLevel: string;
  priorityScore: number;
  status: string;
  estimatedWaitMinutes: number;
}

const ESI_STYLE: Record<string, string> = {
  'ESI-1': 'bg-red-600',
  'ESI-2': 'bg-orange-600',
  'ESI-3': 'bg-yellow-600 text-black',
  'ESI-4': 'bg-blue-600',
  'ESI-5': 'bg-green-700',
};

export default function ERTriageDisplay() {
  const [entries, setEntries] = useState<ErEntry[]>([]);
  const [current, setCurrent] = useState<{ token: string; counter: string } | null>(null);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/display/er-triage');
      const json = await res.json();
      if (json.success) {
        setEntries(json.entries || []);
        if (json.current) setCurrent({ token: json.current.token, counter: json.current.counter });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchBoard();
    const es = new EventSource('/api/display/events?zone=er-triage');
    es.addEventListener('queue_token_called', fetchBoard);
    es.addEventListener('queue_token_issued', fetchBoard);
    es.addEventListener('queue_updated', fetchBoard);
    const t = setInterval(fetchBoard, 30000);
    return () => { es.close(); clearInterval(t); };
  }, [fetchBoard]);

  return (
    <DisplayShell zone="er-triage" zoneName="ER Triage Queue" fullscreen>
      <div className="h-full flex flex-col p-6 gap-6">
        <div className="text-center shrink-0">
          <p className="text-gray-500 uppercase tracking-widest text-sm">Now Serving</p>
          <p className="text-8xl font-black text-red-400">{current?.token || '—'}</p>
          <p className="text-gray-400">{current?.counter || 'Triage Bay'}</p>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 text-sm border-b border-gray-800">
                <th className="py-2">Token</th>
                <th>Patient</th>
                <th>ESI</th>
                <th>Status</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-gray-900">
                  <td className="py-3 font-mono text-2xl text-teal-300">{e.tokenNumber}</td>
                  <td>{e.patientName || '—'}</td>
                  <td>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${ESI_STYLE[e.triageLevel] || 'bg-gray-700'}`}>
                      {e.triageLevel || 'ESI-3'}
                    </span>
                  </td>
                  <td className="capitalize">{e.status}</td>
                  <td>{e.estimatedWaitMinutes}m</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && (
            <p className="text-center text-gray-600 py-12">No ER patients in queue</p>
          )}
        </div>
      </div>
    </DisplayShell>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface QueueEntry {
  id: number;
  tokenNumber: string;
  patientName: string;
  doctorName: string;
  counterId: string;
  status: string;
  priorityScore: number;
  estimatedWaitMinutes: number;
  queueType: string;
}

export default function QueueConsole() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const zone = new URLSearchParams(window.location.search).get('zone') || 'opd-waiting';

  const fetchConsole = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('staffToken');
      const res = await fetch(`/api/v1/queue/console?zone=${encodeURIComponent(zone)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.success && json.entries) setEntries(json.entries);
    } catch (_) {}
    finally { setLoading(false); }
  }, [zone]);

  useEffect(() => {
    fetchConsole();
    const es = new EventSource(`/api/display/events?zone=${encodeURIComponent(zone)}`);
    es.addEventListener('queue_updated', fetchConsole);
    es.addEventListener('queue_token_called', fetchConsole);
    const poll = setInterval(fetchConsole, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [zone, fetchConsole]);

  const callEntry = async (id: number) => {
    const token = localStorage.getItem('token') || localStorage.getItem('doctorToken');
      await fetch(`/api/v1/queue/${id}/call-staff`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    fetchConsole();
  };

  return (
    <DisplayShell zone={zone} zoneName="Queue Console" fullscreen={false}>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-teal-300 mb-4">Smart Queue Console — {zone}</h1>
        {loading ? <p className="text-gray-400">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="py-2">Token</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Counter</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>ETA</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-gray-800">
                    <td className="py-3 font-mono text-lg text-teal-300">{e.tokenNumber}</td>
                    <td>{e.patientName}</td>
                    <td>{e.doctorName || '—'}</td>
                    <td>{e.counterId}</td>
                    <td><span className="px-2 py-1 rounded bg-gray-800">{e.status}</span></td>
                    <td>{e.priorityScore}</td>
                    <td>{e.estimatedWaitMinutes}m</td>
                    <td>
                      {e.status === 'waiting' && (
                        <button onClick={() => callEntry(e.id)} className="px-3 py-1 bg-teal-700 rounded-lg text-xs">Call</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length === 0 && <p className="text-gray-500 py-8 text-center">No patients in queue today.</p>}
          </div>
        )}
      </div>
    </DisplayShell>
  );
}

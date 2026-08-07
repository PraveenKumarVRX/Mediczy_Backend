import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';
import { printQmsTokenSlip } from '@/utils/qmsPrintSlip';

interface QueueEntry {
  id: number;
  tokenNumber: string;
  department?: string;
  patientName: string;
  doctorName: string;
  counterId: string;
  status: string;
  priorityScore: number;
  estimatedWaitMinutes: number;
  queueType: string;
}

const NEXT_DEPTS = ['lab', 'radiology', 'pharmacy', 'opd', 'er'] as const;

interface QueueAnalytics {
  byDepartment: Array<{ department: string; completed: number; active: number; p50_wait: number; p90_wait: number }>;
  totals: { total_today?: number; completed_today?: number };
}

export default function QueueConsole() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [analytics, setAnalytics] = useState<QueueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const zone = new URLSearchParams(window.location.search).get('zone') || 'opd-waiting';

  const fetchConsole = useCallback(async () => {
    try {
      const token =
        localStorage.getItem('hospitalToken') ||
        localStorage.getItem('token') ||
        localStorage.getItem('staffToken');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/v1/queue/console?zone=${encodeURIComponent(zone)}`, { headers });
      const json = await res.json();
      if (json.success && json.entries) setEntries(json.entries);
      const aRes = await fetch('/api/v1/queue/analytics/hospital', { headers });
      const aJson = await aRes.json();
      if (aJson.success) setAnalytics(aJson.analytics);
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

  const authHeaders = () => {
    const token =
      localStorage.getItem('hospitalToken') ||
      localStorage.getItem('token') ||
      localStorage.getItem('doctorToken');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const callEntry = async (id: number) => {
    await fetch(`/api/v1/queue/${id}/call-staff`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    fetchConsole();
  };

  const transferEntry = async (id: number, nextDepartment: string) => {
    await fetch(`/api/v1/queue/${id}/transfer`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nextDepartment }),
    });
    fetchConsole();
  };

  return (
    <DisplayShell zone={zone} zoneName="Queue Console" fullscreen={false}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-teal-300">Smart Queue Console — {zone}</h1>
          <a
            href="/hospital/qms"
            className="px-3 py-2 rounded-lg bg-teal-800/80 hover:bg-teal-700 text-sm text-teal-50"
          >
            Open Walk-in Kiosk
          </a>
        </div>
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-800 rounded-xl p-3"><p className="text-xs text-gray-500">Today total</p><p className="text-2xl font-bold">{analytics.totals?.total_today ?? 0}</p></div>
            <div className="bg-gray-800 rounded-xl p-3"><p className="text-xs text-gray-500">Completed</p><p className="text-2xl font-bold text-green-400">{analytics.totals?.completed_today ?? 0}</p></div>
            {(analytics.byDepartment || []).slice(0, 2).map((d) => (
              <div key={d.department} className="bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase">{d.department} p50/p90 wait</p>
                <p className="text-lg font-bold">{Math.round(d.p50_wait || 0)}m / {Math.round(d.p90_wait || 0)}m</p>
              </div>
            ))}
          </div>
        )}
        {loading ? <p className="text-gray-400">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="py-2">Token</th>
                  <th>Patient</th>
                  <th>Dept</th>
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
                    <td className="uppercase text-xs text-slate-400">{e.department || '—'}</td>
                    <td>{e.doctorName || '—'}</td>
                    <td>{e.counterId}</td>
                    <td><span className="px-2 py-1 rounded bg-gray-800">{e.status}</span></td>
                    <td>{e.priorityScore}</td>
                    <td>{e.estimatedWaitMinutes}m</td>
                    <td className="space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => printQmsTokenSlip({
                          tokenNumber: e.tokenNumber,
                          journeyToken: e.tokenNumber,
                          department: e.department,
                          patientName: e.patientName,
                          doctorName: e.doctorName,
                          counterId: e.counterId,
                          estimatedWaitMinutes: e.estimatedWaitMinutes,
                          queueZone: zone,
                        })}
                        className="px-3 py-1 bg-slate-700 rounded-lg text-xs"
                      >
                        Print
                      </button>
                      {e.status === 'waiting' && (
                        <button type="button" onClick={() => callEntry(e.id)} className="px-3 py-1 bg-teal-700 rounded-lg text-xs">Call</button>
                      )}
                      {['waiting', 'called', 'serving'].includes(e.status) && (
                        <select
                          className="px-2 py-1 bg-slate-800 border border-slate-600 rounded-lg text-xs"
                          defaultValue=""
                          onChange={(ev) => {
                            const dept = ev.target.value;
                            if (dept) void transferEntry(e.id, dept);
                            ev.target.value = '';
                          }}
                        >
                          <option value="" disabled>
                            Send to…
                          </option>
                          {NEXT_DEPTS.filter((d) => d !== e.department).map((d) => (
                            <option key={d} value={d}>
                              → {d}
                            </option>
                          ))}
                        </select>
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

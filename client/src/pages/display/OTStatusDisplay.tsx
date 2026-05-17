import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface OTRoom {
  room_number: string;
  status: 'In Progress' | 'Prep / Anaesthesia' | 'Available' | 'Cleaning / Turnover' | string;
  case_type: string | null;
  surgeon: string | null;
  started_at: string | null;
  next_case: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; badge: string; dot: string }> = {
  'In Progress':         { bg: 'border-blue-600 bg-blue-950/50',    badge: 'bg-blue-700 text-blue-100',    dot: 'bg-blue-400 animate-pulse' },
  'Prep / Anaesthesia':  { bg: 'border-amber-600 bg-amber-950/40',  badge: 'bg-amber-700 text-amber-100',  dot: 'bg-amber-400 animate-pulse' },
  'Available':           { bg: 'border-green-600 bg-green-950/40',  badge: 'bg-green-700 text-green-100',  dot: 'bg-green-400' },
  'Cleaning / Turnover': { bg: 'border-gray-600 bg-gray-800/40',    badge: 'bg-gray-700 text-gray-300',    dot: 'bg-gray-500' },
};

function elapsed(startedAt: string | null): string {
  if (!startedAt) return '';
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default function OTStatusDisplay() {
  const [rooms, setRooms] = useState<OTRoom[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [, tick] = useState(0);

  const fetchOT = useCallback(async () => {
    try {
      const res = await fetch('/api/display/ot-status');
      const json = await res.json();
      if (json.success) { setRooms(json.rooms); setLastUpdated(new Date()); }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchOT();
    const poll = setInterval(fetchOT, 30000);
    // Tick every 60s to update elapsed timers
    const clock = setInterval(() => tick(n => n + 1), 60000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchOT]);

  const inProgress = rooms.filter(r => r.status === 'In Progress').length;
  const available = rooms.filter(r => r.status === 'Available').length;
  const prepping = rooms.filter(r => r.status === 'Prep / Anaesthesia').length;

  return (
    <DisplayShell zone="ot-complex" zoneName="Operation Theatre Status" fullscreen>
      <div className="h-full flex flex-col p-4 gap-4">

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {[
            { label: 'Total OTs', value: rooms.length, color: 'text-white' },
            { label: 'In Progress', value: inProgress, color: 'text-blue-400' },
            { label: 'Prepping', value: prepping, color: 'text-amber-400' },
            { label: 'Available', value: available, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl border border-gray-700 p-3 text-center">
              <p className="text-gray-500 text-xs uppercase tracking-widest">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* OT room cards */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto">
          {rooms.map(room => {
            const style = STATUS_STYLES[room.status] ?? STATUS_STYLES['Available'];
            return (
              <div key={room.room_number} className={`rounded-2xl border-2 p-5 ${style.bg}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black text-white">{room.room_number}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${style.badge}`}>
                      {room.status}
                    </span>
                  </div>
                </div>

                {room.status === 'Available' ? (
                  <div className="text-center py-4">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-green-400 font-semibold">Ready for next case</p>
                    {room.next_case && (
                      <p className="text-gray-400 text-xs mt-3">Next: {room.next_case}</p>
                    )}
                  </div>
                ) : (
                  <>
                    {room.case_type && (
                      <p className="text-white font-semibold mb-1">{room.case_type}</p>
                    )}
                    {room.surgeon && (
                      <p className="text-gray-400 text-sm mb-3">{room.surgeon}</p>
                    )}
                    {room.started_at && (
                      <div className="flex items-center gap-2 bg-gray-900/50 rounded-lg p-3 mb-3">
                        <span className="text-gray-500 text-xs">Elapsed</span>
                        <span className="text-white font-mono font-bold text-lg ml-auto">{elapsed(room.started_at)}</span>
                      </div>
                    )}
                    {room.next_case && (
                      <div className="bg-gray-900/40 rounded-lg p-2">
                        <p className="text-gray-500 text-xs">Next</p>
                        <p className="text-gray-300 text-sm">{room.next_case}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-gray-600 text-xs text-right shrink-0">
          Updated: {lastUpdated.toLocaleTimeString('en-IN')} · Auto-refresh every 30 s
        </p>
      </div>
    </DisplayShell>
  );
}

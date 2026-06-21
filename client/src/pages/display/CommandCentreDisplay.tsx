import React, { useCallback, useEffect, useState } from 'react';
import DisplayShell from './DisplayShell';

interface CommandData {
  census: {
    icuBeds: number;
    icuOccupied: number;
    icuCritical: number;
    otRooms: number;
    otInProgress: number;
  };
  queues: {
    opdWaiting: number;
    erWaiting: number;
    completedToday: number;
    byDepartment: Array<{
      department: string;
      completed: number;
      active: number;
      p50_wait: number;
      p90_wait: number;
    }>;
  };
  revenueToday: number;
  displays: { connected: number; byZone: Record<string, number> };
  live: boolean;
}

export default function CommandCentreDisplay() {
  const [data, setData] = useState<CommandData | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/display/command');
      const json = await res.json();
      if (json.success) {
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [fetchData]);

  const d = data || {
    census: { icuBeds: 6, icuOccupied: 4, icuCritical: 2, otRooms: 5, otInProgress: 2 },
    queues: { opdWaiting: 0, erWaiting: 0, completedToday: 0, byDepartment: [] },
    revenueToday: 0,
    displays: { connected: 0, byZone: {} },
    live: false,
  };

  return (
    <DisplayShell zone="command" zoneName="Hospital Command Centre" fullscreen>
      <div className="h-full p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 overflow-auto">
        {[
          { label: 'OPD Waiting', value: d.queues.opdWaiting, color: 'text-teal-300' },
          { label: 'ER Waiting', value: d.queues.erWaiting, color: 'text-amber-300' },
          { label: 'Completed Today', value: d.queues.completedToday, color: 'text-green-300' },
          { label: 'Revenue Today', value: `₹${d.revenueToday.toLocaleString('en-IN')}`, color: 'text-blue-300' },
          { label: 'ICU Occupied', value: `${d.census.icuOccupied}/${d.census.icuBeds}`, color: 'text-purple-300' },
          { label: 'ICU Critical', value: d.census.icuCritical, color: 'text-red-400' },
          { label: 'OT In Progress', value: `${d.census.otInProgress}/${d.census.otRooms}`, color: 'text-orange-300' },
          { label: 'Live Displays', value: d.displays.connected, color: 'text-gray-200' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-gray-900/80 border border-gray-700 rounded-2xl p-5">
            <p className="text-gray-500 text-xs uppercase tracking-widest">{kpi.label}</p>
            <p className={`text-4xl font-black mt-2 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}

        <div className="col-span-2 lg:col-span-4 bg-gray-900/60 border border-gray-700 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Queue by Department</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(d.queues.byDepartment.length ? d.queues.byDepartment : [
              { department: 'opd', completed: 0, active: d.queues.opdWaiting, p50_wait: 0, p90_wait: 0 },
            ]).map((dept) => (
              <div key={dept.department} className="bg-gray-800 rounded-xl p-4">
                <p className="text-teal-400 font-bold uppercase">{dept.department}</p>
                <p className="text-sm text-gray-400 mt-1">Active: {dept.active ?? 0}</p>
                <p className="text-sm text-gray-400">Done: {dept.completed ?? 0}</p>
                <p className="text-xs text-gray-500 mt-2">p50 wait: {Math.round(dept.p50_wait || 0)}m · p90: {Math.round(dept.p90_wait || 0)}m</p>
              </div>
            ))}
          </div>
        </div>

        <p className="col-span-2 lg:col-span-4 text-right text-xs text-gray-600">
          {data?.live ? 'Live data' : 'Demo / partial data'} · Updated {lastUpdated.toLocaleTimeString('en-IN')}
        </p>
      </div>
    </DisplayShell>
  );
}

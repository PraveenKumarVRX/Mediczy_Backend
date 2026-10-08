import React, { useCallback, useEffect, useState } from 'react';
import DisplayShell from './DisplayShell';
import { displayDeviceHeaders } from '@/utils/displayDeviceAuth';

interface FloorNode {
  id: string;
  name: string;
  floor: string;
  x: number;
  y: number;
  capacity: number | null;
  occupied: number | null;
  utilizationPct: number | null;
  status: 'normal' | 'moderate' | 'busy' | 'critical' | 'unknown';
}

interface FloorMapResponse {
  success: boolean;
  configured?: boolean;
  live?: boolean;
  floors?: { label: string; name: string | null }[];
  nodes?: FloorNode[];
}

const STATUS_FILL: Record<string, string> = {
  normal: '#16a34a',
  moderate: '#ca8a04',
  busy: '#ea580c',
  critical: '#dc2626',
  unknown: '#4b5563',
};

export function occupancyText(node: Pick<FloorNode, 'occupied' | 'capacity' | 'utilizationPct'>): string {
  if (node.utilizationPct === null || node.occupied === null) return 'No live count';
  return `${node.occupied}/${node.capacity} · ${node.utilizationPct}%`;
}

export default function HospitalFloorMapDisplay() {
  const [map, setMap] = useState<FloorMapResponse | null>(null);
  const [floor, setFloor] = useState('all');

  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/display/floor-map?floor=${encodeURIComponent(floor)}`, { headers: displayDeviceHeaders() });
      const json: FloorMapResponse = await res.json();
      if (json.success) setMap(json);
    } catch (_) { /* keep the last good map */ }
  }, [floor]);

  useEffect(() => {
    fetchMap();
    const t = setInterval(fetchMap, 30000);
    return () => clearInterval(t);
  }, [fetchMap]);

  const nodes = map?.nodes ?? [];
  const floors = ['all', ...(map?.floors ?? []).map((f) => f.label)];

  return (
    <DisplayShell zone="floor-map" zoneName="Floor Map" fullscreen>
      <div className="h-full flex flex-col p-4 gap-4">
        <div className="flex gap-2 shrink-0">
          {floors.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFloor(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${floor === f ? 'bg-teal-700' : 'bg-gray-800'}`}
            >
              {f === 'all' ? 'All Floors' : `Floor ${f}`}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500 self-center">
            {map?.live ? 'Live occupancy where available' : 'No live occupancy source'}
          </span>
        </div>

        {map && nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-lg text-center px-8">
            {map.configured
              ? 'No departments have been placed on this floor map yet.'
              : 'The floor map has not been set up for this hospital yet. It is configured under Hospital OS › Wayfinding.'}
          </div>
        ) : (
          <>
            <div className="flex-1 relative bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
              <svg viewBox="0 0 100 80" className="w-full h-full">
                <rect x="5" y="10" width="90" height="60" fill="#1f2937" stroke="#374151" strokeWidth="0.5" rx="2" />
                {nodes.map((node) => (
                  <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                    <rect x="-8" y="-6" width="16" height="12" rx="1.5" fill={STATUS_FILL[node.status] || STATUS_FILL.unknown} fillOpacity="0.85" />
                    <text x="0" y="10" textAnchor="middle" fill="#9ca3af" fontSize="3">{node.name}</text>
                    <text x="0" y="1" textAnchor="middle" fill="#fff" fontSize="3.5" fontWeight="bold">
                      {node.utilizationPct === null ? '–' : `${node.utilizationPct}%`}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0">
              {nodes.map((node) => (
                <div key={node.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-teal-300">{node.name}</p>
                  <p className="text-gray-400 text-xs">Floor {node.floor}</p>
                  <p className="text-white mt-1">{occupancyText(node)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DisplayShell>
  );
}

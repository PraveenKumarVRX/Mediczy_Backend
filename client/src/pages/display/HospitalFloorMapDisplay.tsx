import React, { useCallback, useEffect, useState } from 'react';
import DisplayShell from './DisplayShell';

interface FloorNode {
  id: string;
  name: string;
  floor: string;
  x: number;
  y: number;
  capacity: number;
  occupied: number;
  utilizationPct: number;
  status: 'normal' | 'moderate' | 'busy' | 'critical';
}

const STATUS_COLORS: Record<string, string> = {
  normal: 'bg-green-600/80 border-green-400',
  moderate: 'bg-yellow-600/80 border-yellow-400',
  busy: 'bg-orange-600/80 border-orange-400',
  critical: 'bg-red-600/80 border-red-400 animate-pulse',
};

export default function HospitalFloorMapDisplay() {
  const [nodes, setNodes] = useState<FloorNode[]>([]);
  const [floor, setFloor] = useState('all');
  const [live, setLive] = useState(false);

  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/display/floor-map?floor=${encodeURIComponent(floor)}`);
      const json = await res.json();
      if (json.success) {
        setNodes(json.nodes || []);
        setLive(json.live);
      }
    } catch (_) {}
  }, [floor]);

  useEffect(() => {
    fetchMap();
    const t = setInterval(fetchMap, 30000);
    return () => clearInterval(t);
  }, [fetchMap]);

  const floors = ['all', 'G', '2', '3'];

  return (
    <DisplayShell zone="floor-map" zoneName="Digital Twin — Floor Map" fullscreen>
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
          <span className="ml-auto text-xs text-gray-500 self-center">{live ? 'Live occupancy' : 'Estimated occupancy'}</span>
        </div>

        <div className="flex-1 relative bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
          <svg viewBox="0 0 100 80" className="w-full h-full">
            <rect x="5" y="10" width="90" height="60" fill="#1f2937" stroke="#374151" strokeWidth="0.5" rx="2" />
            {nodes.map((node) => (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <rect
                  x="-8"
                  y="-6"
                  width="16"
                  height="12"
                  rx="1.5"
                  className={STATUS_COLORS[node.status] || STATUS_COLORS.normal}
                />
                <text x="0" y="10" textAnchor="middle" fill="#9ca3af" fontSize="3">
                  {node.name}
                </text>
                <text x="0" y="-8" textAnchor="middle" fill="#fff" fontSize="3.5" fontWeight="bold">
                  {node.utilizationPct}%
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
              <p className="text-white mt-1">{node.occupied}/{node.capacity} · {node.utilizationPct}%</p>
            </div>
          ))}
        </div>
      </div>
    </DisplayShell>
  );
}

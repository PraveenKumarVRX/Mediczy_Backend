/**
 * Phase D: Imaging analytics dashboard panel (Lab RIS).
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart3, Activity, AlertTriangle, FileText, Loader2 } from 'lucide-react';

const PLATFORM_API = '/api/imaging/platform';

interface Analytics {
  total_studies: string;
  finalized_reports: string;
  stat_studies: string;
  triaged_studies: string;
  aiDrafts: number;
  openCriticalAlerts: number;
  trackedLesions: number;
  periodDays: number;
}

export default function ImagingAnalyticsPanel({ token }: { token: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${PLATFORM_API}/analytics`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setData(res.data.analytics))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 p-3">
        <Loader2 size={14} className="animate-spin" /> Loading analytics…
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { label: 'Studies', value: data.total_studies, icon: Activity },
    { label: 'Final reports', value: data.finalized_reports, icon: FileText },
    { label: 'AI drafts', value: data.aiDrafts, icon: BarChart3 },
    { label: 'Critical alerts', value: data.openCriticalAlerts, icon: AlertTriangle },
    { label: 'Tracked lesions', value: data.trackedLesions, icon: Activity },
  ];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
      <div className="text-xs font-semibold text-white mb-2 flex items-center gap-1">
        <BarChart3 size={12} className="text-indigo-400" />
        Imaging AI Analytics ({data.periodDays}d)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg bg-gray-950/60 px-2 py-1.5">
            <div className="text-[10px] text-gray-500 flex items-center gap-1">
              <Icon size={10} /> {label}
            </div>
            <div className="text-sm font-semibold text-white">{value ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

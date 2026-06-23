/**
 * AI reporting copilot panel — draft generation, prior comparison, critical alerts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Sparkles, AlertTriangle, History, Loader2, CheckCircle2 } from 'lucide-react';

const PLATFORM_API = '/api/imaging/platform';

interface Props {
  studyId: number;
  studyInstanceUID: string;
  patientName: string;
  token: string;
  onDraftGenerated: (text: string) => void;
}

export default function ImagingAICopilot({
  studyId,
  studyInstanceUID,
  patientName,
  token,
  onDraftGenerated,
}: Props) {
  const [drafting, setDrafting] = useState(false);
  const [priorText, setPriorText] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Array<{ id: number; finding_label: string; severity: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastGate, setLastGate] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const loadContext = useCallback(async () => {
    try {
      const [priorRes, alertRes] = await Promise.all([
        axios.get(`${PLATFORM_API}/priors/${studyId}/compare`, { headers }),
        axios.get(`${PLATFORM_API}/alerts/critical`, { headers }),
      ]);
      setPriorText(priorRes.data.comparison?.narrative || null);
      setAlerts(
        (alertRes.data.alerts || []).filter((a: { study_id: number }) => a.study_id === studyId),
      );
    } catch { /* optional */ }
  }, [studyId, token]);

  useEffect(() => { loadContext(); }, [loadContext]);

  const generateDraft = async () => {
    setDrafting(true);
    setError(null);
    try {
      const res = await axios.post(
        `${PLATFORM_API}/reports/draft`,
        { studyId, includePriorComparison: true },
        { headers },
      );
      if (res.data.success) {
        onDraftGenerated(res.data.draft?.draft_text || '');
        setLastGate(res.data.gateResult?.severity || 'review');
        if (res.data.priorComparison?.narrative) {
          setPriorText(res.data.priorComparison.narrative);
        }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Draft generation failed';
      setError(msg);
    } finally {
      setDrafting(false);
    }
  };

  const ackAlert = async (alertId: number) => {
    await axios.post(`${PLATFORM_API}/alerts/critical/${alertId}/acknowledge`, {}, { headers });
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  return (
    <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1">
          <Sparkles size={12} /> AI Copilot
        </span>
        {lastGate && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300">
            Gate: {lastGate}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={generateDraft}
        disabled={drafting}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold"
      >
        {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {drafting ? 'Generating draft…' : 'Generate AI Draft Report'}
      </button>

      <p className="text-[10px] text-gray-500">
        Level 1 assisted reporting — radiologist review and sign-off required.
      </p>

      {error && (
        <div className="text-[10px] text-red-400 flex items-center gap-1">
          <AlertTriangle size={10} /> {error}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
            <AlertTriangle size={10} /> Critical alerts
          </span>
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-[10px] bg-red-950/40 rounded px-2 py-1">
              <span className="text-red-300">{a.finding_label || 'Critical finding'}</span>
              <button type="button" onClick={() => ackAlert(a.id)} className="text-emerald-400 hover:underline">
                Ack
              </button>
            </div>
          ))}
        </div>
      )}

      {priorText && (
        <div className="text-[10px] text-gray-400">
          <span className="text-gray-300 flex items-center gap-1 mb-1">
            <History size={10} /> Prior comparison
          </span>
          <p className="whitespace-pre-wrap line-clamp-4">{priorText}</p>
        </div>
      )}

      <div className="text-[10px] text-gray-600 flex items-center gap-1">
        <CheckCircle2 size={10} />
        Study {studyInstanceUID.slice(-12)}
      </div>
    </div>
  );
}

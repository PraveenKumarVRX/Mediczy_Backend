/**
 * AI reporting copilot panel — draft generation, prior comparison, critical alerts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Sparkles, AlertTriangle, History, Loader2, CheckCircle2,
  ShieldCheck, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';

const PLATFORM_API = '/api/imaging/platform';

// Human-readable labels for ai_explanation.render_path — which of the
// report-generation paths actually produced this draft, strictest first.
const RENDER_PATH_LABELS: Record<string, string> = {
  assertion_only: 'Approved assertions only (strictest)',
  structured_json: 'Structured JSON, evidence-validated',
  free_prose: 'Free-form, evidence-grounded prompt',
  template_fallback: 'Template fallback (no LLM output)',
  deterministic_abstain: 'Deterministic template (no LLM)',
};

interface Props {
  studyId: number;
  studyInstanceUID: string;
  patientName: string;
  token: string;
  currentText: string;
  onDraftGenerated: (text: string) => void;
}

// "Why did AI say this" data — everything that belongs in an AI Evidence
// panel, kept out of the report text itself so the radiologist reads a
// normal report, not engineering/governance jargon. Shape matches
// generateReportDraft()'s ai_explanation return value on the server.
interface AIExplanation {
  analysis_status?: {
    status: 'ANALYZED' | 'ABSTAIN';
    reason?: string | null;
    reason_code?: string | null;
    reason_detail?: string[];
    available_models?: string[];
  };
  llm_called?: boolean;
  render_path?: 'assertion_only' | 'structured_json' | 'free_prose' | 'template_fallback' | 'deterministic_abstain' | null;
  model?: string | null;
  provider?: string | null;
  confidence?: number | null;
  gate?: {
    passed: boolean;
    severity: string;
    blockers?: Array<{ code?: string; message?: string }>;
  };
  fact_check?: { status: string; issues?: Array<{ code: string; message: string }> };
  matched_pathways?: Array<{ pathway: string; ruleId: string }>;
  knowledge_sources?: Array<{
    canonical_id?: string;
    preferred_name?: string;
    source_title?: string;
    source_url?: string;
  }>;
}

export default function ImagingAICopilot({
  studyId,
  studyInstanceUID,
  patientName,
  token,
  currentText,
  onDraftGenerated,
}: Props) {
  const [drafting, setDrafting] = useState(false);
  const [priorText, setPriorText] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Array<{ id: number; finding_label: string; severity: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastGate, setLastGate] = useState<string | null>(null);
  const [lastDraftId, setLastDraftId] = useState<number | null>(null);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

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
    // Generating overwrites whatever's in the report box — if the radiologist
    // has already typed something, confirm before replacing it. A silent
    // overwrite here would destroy in-progress work with no undo.
    if (currentText.trim().length > 0) {
      const proceed = window.confirm(
        'This report already has text in it. Generating a new AI draft will replace it. Continue?',
      );
      if (!proceed) return;
    }
    setDrafting(true);
    setError(null);
    setApproved(false);
    setAiExplanation(null);
    try {
      const res = await axios.post(
        `${PLATFORM_API}/reports/draft`,
        { studyId, includePriorComparison: true },
        { headers },
      );
      if (res.data.success) {
        // clinical_report.text is identical to draft.draft_text — the named
        // contract is preferred going forward, draft_text kept as a fallback
        // for a moment mid-rollout.
        onDraftGenerated(res.data.clinical_report?.text || res.data.draft?.draft_text || '');
        setLastDraftId(res.data.draft?.id ?? null);
        setLastGate(res.data.gateResult?.severity || 'review');
        setAiExplanation(res.data.ai_explanation || null);
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

  const approveAsIs = async () => {
    if (!lastDraftId) return;
    setApproving(true);
    setError(null);
    try {
      await axios.post(
        `${PLATFORM_API}/reports/draft/${lastDraftId}/approve`,
        { editedText: currentText },
        { headers },
      );
      setApproved(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not record approval';
      setError(msg);
    } finally {
      setApproving(false);
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

      {lastDraftId && (
        <button
          type="button"
          onClick={approveAsIs}
          disabled={approving || approved}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-70 ${
            approved
              ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {approving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {approved ? 'Draft approved by you' : approving ? 'Recording approval…' : 'Approve Draft As Reviewed'}
        </button>
      )}

      <p className="text-[10px] text-gray-500">
        Level 1 assisted reporting — radiologist review and sign-off required. Approving here records
        your review of the AI draft; use Save below to finalize the report itself.
      </p>

      {error && (
        <div className="text-[10px] text-red-400 flex items-center gap-1">
          <AlertTriangle size={10} /> {error}
        </div>
      )}

      {aiExplanation && (
        <div className="border border-indigo-900/40 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold text-indigo-300 bg-indigo-950/40 hover:bg-indigo-950/60"
          >
            <span className="flex items-center gap-1">
              <ShieldCheck size={11} /> View AI Evidence
            </span>
            {showEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showEvidence && (
            <div className="p-2 space-y-2 text-[10px] text-gray-400 bg-black/20">
              <div className="flex items-center justify-between">
                <span>Analysis status</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    aiExplanation.analysis_status?.status === 'ANALYZED'
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'bg-amber-900/50 text-amber-300'
                  }`}
                >
                  {aiExplanation.analysis_status?.status || 'unknown'}
                </span>
              </div>

              {aiExplanation.analysis_status?.status === 'ABSTAIN' && aiExplanation.analysis_status?.reason && (
                <p className="text-gray-300">{aiExplanation.analysis_status.reason}</p>
              )}

              {aiExplanation.analysis_status?.status === 'ABSTAIN'
                && (aiExplanation.analysis_status?.reason_detail?.length ?? 0) > 0 && (
                <details>
                  <summary className="text-gray-600 cursor-pointer hover:text-gray-500">Technical detail (audit)</summary>
                  <ul className="list-disc list-inside text-gray-600 space-y-0.5 mt-1">
                    {aiExplanation.analysis_status!.reason_detail!.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </details>
              )}

              <div className="flex items-center justify-between">
                <span>AI model used</span>
                <span className="text-gray-300 truncate max-w-[60%] text-right">
                  {aiExplanation.llm_called ? (aiExplanation.model || aiExplanation.provider || 'LLM') : 'None — deterministic template'}
                </span>
              </div>

              {aiExplanation.render_path && (
                <div className="flex items-center justify-between">
                  <span>Report generation path</span>
                  <span className="text-gray-300 text-right">
                    {RENDER_PATH_LABELS[aiExplanation.render_path] || aiExplanation.render_path}
                  </span>
                </div>
              )}

              {aiExplanation.confidence != null && (
                <div className="flex items-center justify-between">
                  <span>Confidence</span>
                  <span className="text-gray-300">{Math.round(aiExplanation.confidence * 100)}%</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span>QA gate</span>
                <span className={`font-semibold ${aiExplanation.gate?.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {aiExplanation.gate?.severity || (aiExplanation.gate?.passed ? 'passed' : 'blocked')}
                </span>
              </div>

              {(aiExplanation.gate?.blockers?.length ?? 0) > 0 && (
                <ul className="list-disc list-inside text-red-400 space-y-0.5">
                  {aiExplanation.gate!.blockers!.map((b, i) => <li key={i}>{b.message || b.code}</li>)}
                </ul>
              )}

              {aiExplanation.fact_check && (
                <div className="flex items-center justify-between">
                  <span>Fact check</span>
                  <span className={aiExplanation.fact_check.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}>
                    {aiExplanation.fact_check.status}
                  </span>
                </div>
              )}

              {(aiExplanation.matched_pathways?.length ?? 0) > 0 && (
                <div>
                  <span className="text-gray-300">Clinical pathways considered: </span>
                  {aiExplanation.matched_pathways!.map((p) => p.pathway).join(', ')}
                </div>
              )}

              {(aiExplanation.knowledge_sources?.length ?? 0) > 0 && (
                <div className="space-y-0.5">
                  <span className="text-gray-300">Knowledge sources</span>
                  {aiExplanation.knowledge_sources!.map((k, i) => (
                    <div key={k.canonical_id || i} className="flex items-center gap-1">
                      <span className="truncate">{k.preferred_name || k.source_title}</span>
                      {k.source_url && (
                        <a
                          href={k.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

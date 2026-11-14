/**
 * Phase C: Structured findings extraction — Python MONAI-ready + triage merge.
 */
import fetch from '../../integrations/fetch.js';
import llmProvider from '../ai-brain/llm-provider.js';

const TRIAGE_URL = process.env.IMAGING_TRIAGE_URL || 'http://127.0.0.1:8010';

export async function extractStructuredFindings({
  studyInstanceUID,
  modality,
  orthancStudyId,
  triageFindings = [],
}) {
  let modelFindings = null;
  try {
    const res = await fetch(`${TRIAGE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        study_instance_uid: studyInstanceUID,
        modality,
        orthanc_study_id: orthancStudyId,
      }),
      timeout: 120000,
    });
    if (res.ok) modelFindings = await res.json();
  } catch { /* fallback below */ }

  if (modelFindings?.findings) {
    return {
      source: modelFindings.model_version || 'imaging-analyze-v1',
      modality,
      items: mergeFindings(modelFindings.findings, triageFindings),
      measurements: modelFindings.measurements || [],
      critical: modelFindings.critical || false,
      confidence: modelFindings.confidence_score ?? 0.7,
      inference_backend: modelFindings.inference_backend || 'heuristic',
      feature_attributions: modelFindings.feature_attributions || [],
      dicom_loaded: modelFindings.dicom_loaded === true,
      // Real reason MR fell back to heuristic (governance lock, applicability
      // abstain, or a genuine fetch gap) — computed in Python's
      // inference/engine.py::mr_backend_status(), previously dropped here
      // silently even though the Python side already carried it correctly.
      applicability: modelFindings.applicability || null,
    };
  }

  return llmStructuredFindings(modality, studyInstanceUID, triageFindings);
}

function mergeFindings(modelItems, triageItems) {
  const map = new Map();
  for (const f of [...(modelItems || []), ...(triageItems || [])]) {
    const key = (f.label || f.name || '').toLowerCase();
    if (!key) continue;
    map.set(key, {
      label: f.label || f.name,
      severity: f.severity || 'low',
      note: f.note || f.description || '',
      present: f.present !== false,
      location: f.location || null,
      size_mm: f.size_mm || null,
    });
  }
  return Array.from(map.values());
}

async function llmStructuredFindings(modality, studyInstanceUID, triageFindings) {
  const resp = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: 'Return JSON only: {"items":[{"label","severity","note","present","location","size_mm"}],"measurements":[],"critical":false}. Screening suggestions only — not diagnoses.',
      },
      {
        role: 'user',
        content: `Modality ${modality}, study ${studyInstanceUID}. Triage hints: ${JSON.stringify(triageFindings)}. Suggest 0-5 review items.`,
      },
    ],
    maxTokens: 600,
    temperature: 0.1,
  });
  try {
    const match = (resp.content || '').match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { items: triageFindings };
    return {
      source: 'llm-structured-v1',
      modality,
      items: parsed.items || triageFindings,
      measurements: parsed.measurements || [],
      critical: parsed.critical || false,
      confidence: 0.5,
    };
  } catch {
    return {
      source: 'triage-only',
      modality,
      items: triageFindings,
      measurements: [],
      critical: false,
      confidence: 0.4,
    };
  }
}

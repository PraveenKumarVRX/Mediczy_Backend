/**
 * Patient-Facing AI Copilot (Upgrade Plan Track B, Phase B6)
 *
 * POST /api/patient-copilot/ask — natural-language Q&A over the caller's
 * OWN longitudinal record only, with citations.
 *
 * Safety boundary: patientId is always req.user.id, taken from the
 * authenticated session — never accepted from the request body or query
 * string. The real enforcement is at the database layer: rag-pipeline.js's
 * search() now filters sib_embeddings by patient_id when one is passed
 * (it previously had no patient filter at all — every caller's vector
 * search could surface any patient's embedded record; fixed as part of
 * this phase). The prompt-level instruction below is defense-in-depth,
 * not the security boundary itself.
 *
 * Action routing: when the question reads as a scheduling request, the
 * response includes a suggestedAction the CLIENT confirms and then submits
 * to the existing POST /api/appointments itself — this endpoint never
 * calls that API on the patient's behalf. That keeps "no new write path"
 * literally true and keeps a human confirmation step between the model's
 * suggestion and any real booking.
 *
 * Refill requests are deliberately NOT covered here: the real order-
 * creation path (POST /api/patient/pharmacy-orders) requires an uploaded
 * prescription file, which a chat-suggested action can't represent
 * cleanly — flagged rather than forced into a shape that doesn't fit.
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import ragPipeline from '../services/ai-brain/rag-pipeline.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

const router = express.Router();

router.post('/ask', authUser, async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({ success: false, message: 'question is required' });
    }

    const patientId = req.user.id; // hard-locked — see file header

    const retrieval = await ragPipeline.agenticRetrieve(question, { patientId, topK: 6 });

    if (!retrieval.retrieved) {
      return res.json({
        success: true,
        data: {
          answer: "I couldn't find anything in your record to answer that. Please ask your care team directly.",
          citations: [],
          retrieved: 0,
        },
      });
    }

    const systemPrompt = `You are a patient's personal health record assistant.
Answer ONLY using the provided context, which belongs exclusively to this one patient.
Never state or imply information about any other patient, even hypothetically.
If the context doesn't answer the question, say so plainly — do not guess or extrapolate.
Cite every factual claim with the source label shown in the context.
If the question is actually a request to book/schedule an appointment (not just asking about
one), include a suggestedAction — you are proposing this for the patient to confirm, you are
never booking it yourself.
Output JSON: {
  "answer", "citations": [{ "source", "excerpt" }], "confidence": 0-1,
  "suggestedAction": null | { "type": "schedule_appointment", "reason", "suggestedConsultationType": "video|audio|chat|in-person|follow-up" }
}`;

    const llm = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${retrieval.context}\n\nQuestion: ${question}` },
      ],
      temperature: 0.1,
      maxTokens: 900,
      responseFormat: { type: 'json_object' },
      skipCache: true,
    });

    let parsed;
    try {
      parsed = JSON.parse(llm.content || '{}');
    } catch {
      parsed = { answer: llm.content || 'Unable to generate an answer right now.', citations: [], confidence: 0.3 };
    }

    // suggestedAction is a proposal only — it names the existing endpoint
    // the client must call itself, with the patient's own confirmation,
    // never called from here.
    const suggestedAction = parsed.suggestedAction
      ? { ...parsed.suggestedAction, confirmEndpoint: 'POST /api/appointments', autoExecuted: false }
      : null;

    res.json({
      success: true,
      data: {
        answer: parsed.answer,
        citations: parsed.citations || [],
        confidence: parsed.confidence ?? null,
        suggestedAction,
        retrieved: retrieval.retrieved,
        provider: llm.provider,
      },
    });
  } catch (err) {
    console.error('[PatientCopilot] /ask failed:', err.message);
    res.status(500).json({ success: false, message: 'Unable to answer right now' });
  }
});

export default router;

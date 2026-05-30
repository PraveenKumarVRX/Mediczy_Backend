import healthRiskAssessmentModel from '../models/healthRiskAssessment.model.intelligent.js';
import {
  MAX_THEORETICAL_SCORE,
  RISK_SCORE_BANDS,
  calculateRiskScore,
  TOTAL_QUESTIONS
} from '../config/health-risk.schema.js';
import { runBayesianInference } from '../services/bayesianInference.service.js';
import { deriveEvidenceStates } from '../lib/bayesian-evidence.js';

const resolveAdminName = (user) => {
  if (!user) return null;
  if (user.firstName || user.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  }
  return user.email || user.id || null;
};

// Maps DB model fields to the API response shape expected by consumers
const serializeAssessment = (record) => {
  const scores = record.scores || {};
  const meta = record.metadata || {};
  return {
    id: record.id,
    userId: record.userId,
    assessmentType: record.assessmentType,
    // Canonical field names consumed by frontend
    score: scores.totalScore ?? 0,
    totalScore: scores.totalScore ?? 0,
    riskLevel: record.riskLevel ?? 'Unknown',
    riskBandLabel: record.riskLevel ?? 'Unknown',
    completionPct: scores.completionPct ?? 0,
    sectionBreakdown: scores.sectionBreakdown ?? [],
    band: scores.band ?? null,
    responses: record.responses ?? {},
    // Metadata
    memberName: meta.memberName ?? null,
    memberSegment: meta.memberSegment ?? null,
    notes: meta.notes ?? null,
    flags: meta.flags ?? [],
    createdByName: meta.createdByName ?? null,
    bayesianInference: meta.bayesianInference ?? null,
    // Timestamps
    assessedAt: record.createdAt,
    createdAt: record.createdAt,
  };
};

export const getMemberHealthRiskHistory = async (req, res) => {
  const { memberId } = req.params;
  const limit = Number.parseInt(req.query.limit ?? '20', 10);
  const offset = Number.parseInt(req.query.offset ?? '0', 10);

  if (!memberId) {
    return res.status(400).json({ success: false, message: 'memberId parameter is required' });
  }

  try {
    const { rows, count } = await healthRiskAssessmentModel.findAndCountAll({
      where: { userId: memberId },          // FIX: was `memberId`, model column is `userId`
      order: [['createdAt', 'DESC']],
      limit: Number.isNaN(limit) ? 20 : Math.max(1, Math.min(100, limit)),
      offset: Number.isNaN(offset) ? 0 : Math.max(0, offset)
    });

    const history = rows.map((entry) => ({
      id: entry.id,
      date: entry.createdAt,
      score: entry.scores?.totalScore ?? 0,
      totalScore: entry.scores?.totalScore ?? 0,
      band: entry.riskLevel ?? 'Unknown',
      riskLevel: entry.riskLevel ?? 'Unknown',
      completionPct: entry.scores?.completionPct ?? 0,
      createdBy: entry.metadata?.createdByName ?? null,
      notes: entry.metadata?.notes ?? null,
      bayesianInference: entry.metadata?.bayesianInference ?? null,
      assessedAt: entry.createdAt,
    }));

    return res.json({
      success: true,
      memberId,
      total: count,
      limit,
      offset,
      hasMore: offset + rows.length < count,
      history,
      latestAssessment: rows[0] ? serializeAssessment(rows[0]) : null,
      meta: {
        maxScore: MAX_THEORETICAL_SCORE,
        totalQuestions: TOTAL_QUESTIONS,
        bands: RISK_SCORE_BANDS
      }
    });
  } catch (error) {
    console.error('Health risk history fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load health risk history', error: error.message });
  }
};

export const createHealthRiskAssessment = async (req, res) => {
  const memberIdFromParams = req.params.memberId;
  const {
    memberId: memberIdFromBody,
    memberName,
    memberSegment,
    memberSnapshot,
    responses = {},
    notes = null,
    flags = []
  } = req.body || {};

  const memberId = memberIdFromParams || memberIdFromBody;

  if (!memberId || !memberName) {
    return res.status(400).json({ success: false, message: 'memberId and memberName are required' });
  }

  try {
    const scoring = calculateRiskScore(responses);

    // Save assessment immediately — do NOT block on Bayesian inference
    const assessment = await healthRiskAssessmentModel.create({
      userId: memberId,                       // FIX: was `memberId`, model column is `userId`
      assessmentType: 'comprehensive',
      responses,
      scores: {
        totalScore: Math.max(0, Math.min(MAX_THEORETICAL_SCORE, scoring.totalScore)),
        completionPct: scoring.completionPct,
        sectionBreakdown: scoring.sectionBreakdown,
        band: scoring.band,
      },
      riskLevel: scoring.band.label,          // FIX: maps to model's `riskLevel` column
      metadata: {
        memberName,
        memberSegment: memberSegment || null,
        memberSnapshot: memberSnapshot || null,
        notes,
        flags,
        bayesianInference: null,              // populated async below
        createdById: req.user?.id || null,
        createdByName: resolveAdminName(req.user),
        createdByEmail: req.user?.email || null,
      }
    });

    // Run Bayesian inference async — does NOT block the HTTP response
    setImmediate(async () => {
      try {
        const { evidence, states } = deriveEvidenceStates(scoring.sectionBreakdown);
        if (Object.keys(states).length > 0) {
          const inference = await runBayesianInference(states);
          const bayesianInference = { ...inference, evidence, generatedAt: new Date().toISOString() };
          await healthRiskAssessmentModel.update(
            {
              metadata: {
                ...assessment.metadata,
                bayesianInference
              }
            },
            { where: { id: assessment.id } }
          );
        }
      } catch (bayesError) {
        console.warn('Async Bayesian inference failed:', bayesError.message);
      }
    });

    return res.status(201).json({
      success: true,
      assessment: serializeAssessment(assessment),
      meta: {
        maxScore: MAX_THEORETICAL_SCORE,
        totalQuestions: TOTAL_QUESTIONS,
        bands: RISK_SCORE_BANDS,
        bayesianStatus: 'computing'   // tells frontend to poll if needed
      }
    });
  } catch (error) {
    console.error('Health risk assessment create error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create health risk assessment', error: error.message });
  }
};

export const runHealthRiskInference = async (req, res) => {
  const {
    responses = {},
    sectionBreakdown = null,
    evidence: incomingEvidence = {},
    context = {}
  } = req.body || {};

  try {
    let breakdown = Array.isArray(sectionBreakdown) && sectionBreakdown.length > 0
      ? sectionBreakdown
      : null;

    if (!breakdown) {
      breakdown = calculateRiskScore(responses).sectionBreakdown;
    }

    const { evidence, states } = deriveEvidenceStates(breakdown);
    const mergedStates = { ...states };
    Object.entries(incomingEvidence).forEach(([node, payload]) => {
      if (typeof payload === 'string') {
        mergedStates[node] = payload;
        return;
      }
      if (payload && typeof payload === 'object' && typeof payload.state === 'string') {
        mergedStates[node] = payload.state;
      }
    });

    if (!Object.keys(mergedStates).length) {
      return res.status(400).json({ success: false, message: 'Insufficient data to compute Bayesian evidence.' });
    }

    const inference = await runBayesianInference(mergedStates);
    return res.json({
      success: true,
      inference: {
        ...inference,
        evidence,
        generatedAt: new Date().toISOString()
      },
      context: {
        ...context,
        nodesReceived: Object.keys(mergedStates).length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    const statusCode = /evidence node/i.test(error.message) ? 400 : 500;
    console.error('Bayesian inference error:', error);
    return res.status(statusCode).json({
      success: false,
      message: 'Failed to run Bayesian inference',
      error: error.message
    });
  }
};

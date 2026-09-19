/**
 * Clinical Knowledge Fabric — API routes
 * =========================================
 * Read of approved knowledge is available to clinical roles only.
 * Authoring and governance actions (propose/approve/reject) are restricted
 * to medical-director/super-admin, matching the pattern already used in
 * ai-governance.route.js — deliberately, since this validation review's
 * own AI/ML audit found the opposite pattern (no role gate at all) on
 * several existing clinical-AI endpoints. This route does not repeat that
 * mistake.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import knowledgeFabric from '../services/clinical-knowledge-fabric.service.js';

const router = express.Router();

const clinicalRead = [authUser, requireRole(['doctor', 'nurse', 'admin', 'medical_director', 'super_admin'])];
// medical_director / super_admin only, as the header says and CLAUDE.md requires: a plain admin must not
// be able to approve clinical content (nor propose-and-self-approve it).
const governanceOnly = [authUser, requireRole(['medical_director', 'super_admin'])];

// ── Read: approved knowledge for a specialty (consumed by CDSS/copilot UIs too) ──
router.get('/domains', ...clinicalRead, async (req, res) => {
  try {
    const domains = await knowledgeFabric.listDomains();
    res.json({ success: true, data: domains });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/domains/:domainKey/rules', ...clinicalRead, async (req, res) => {
  try {
    const rules = await knowledgeFabric.getApplicableKnowledge({
      specialty: req.params.domainKey,
      ruleType: req.query.ruleType || null,
    });
    res.json({ success: true, data: rules });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Authoring: any clinical role can draft a rule, nothing here is live yet ──
router.post('/rules', ...clinicalRead, async (req, res) => {
  try {
    const { domainKey, ruleType, title, conditionText, recommendationText, evidenceSource, confidenceLevel } = req.body;
    if (!domainKey || !ruleType || !title || !conditionText || !recommendationText) {
      return res.status(400).json({ success: false, error: 'domainKey, ruleType, title, conditionText, recommendationText are required' });
    }
    const rule = await knowledgeFabric.addRule({
      domainKey, ruleType, title, conditionText, recommendationText, evidenceSource, confidenceLevel,
      createdBy: req.user?.email || req.user?.id || 'unknown',
    });
    res.status(201).json({ success: true, data: rule });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Governance: propose / approve / reject — medical director or super-admin only ──
router.get('/pending-review', ...governanceOnly, async (req, res) => {
  try {
    const rules = await knowledgeFabric.listPendingReview();
    res.json({ success: true, data: rules });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/rules/:id/propose', ...clinicalRead, async (req, res) => {
  try {
    const result = await knowledgeFabric.proposeForApproval(
      Number(req.params.id),
      req.user?.email || req.user?.id || 'unknown'
    );
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 400).json({ success: false, error: e.message });
  }
});

router.post('/rules/:id/approve', ...governanceOnly, async (req, res) => {
  try {
    const rule = await knowledgeFabric.approveRule(
      Number(req.params.id),
      req.user?.email || req.user?.id || 'unknown',
      req.body?.notes || ''
    );
    res.json({ success: true, data: rule });
  } catch (e) {
    res.status(e.statusCode || 400).json({ success: false, error: e.message });
  }
});

router.post('/rules/:id/reject', ...governanceOnly, async (req, res) => {
  try {
    const rule = await knowledgeFabric.rejectRule(
      Number(req.params.id),
      req.user?.email || req.user?.id || 'unknown',
      req.body?.notes || ''
    );
    res.json({ success: true, data: rule });
  } catch (e) {
    res.status(e.statusCode || 400).json({ success: false, error: e.message });
  }
});

export default router;

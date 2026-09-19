/**
 * Hospital Branch — API routes (Multi-Branch Architecture Phase 1)
 */

import express from 'express';
import { authUser, requireRole, requireRoleOrHospitalAdmin } from '../middleware/auth.middleware.js';
import branchService from '../services/hospital-branch.service.js';

const router = express.Router();

const clinicalRead = [authUser, requireRole(['doctor', 'nurse', 'admin', 'assistant', 'hospital', 'hospital_admin'])];
const adminOnly = [authUser, requireRoleOrHospitalAdmin(['admin', 'hospital_admin', 'super_admin'])];

function orgId(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;
}

router.get('/branches', ...clinicalRead, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const branches = await branchService.listBranches(org);
    res.json({ success: true, data: branches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/branches', ...adminOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const { name, address } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const branch = await branchService.createBranch({ organizationId: org, name, address });
    res.status(201).json({ success: true, data: branch });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/branches/:id/staff', ...adminOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ success: false, error: 'userId and role are required' });
    // Branch must belong to the caller's organization (id comes from the URL, so never trust it).
    const branchId = await branchService.resolveBranchId(req.params.id, org);
    if (!branchId) return res.status(404).json({ success: false, error: 'Branch not found' });
    const assignment = await branchService.assignStaffToBranch({ userId, branchId, role });
    res.status(201).json({ success: true, data: assignment });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// A staff member can see their own branch assignments; admins can see assignments
// of any user but only within their own organization's branches.
router.get('/staff/:userId/branches', authUser, async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid userId' });
    }
    const isSelf = Number(req.user?.id) === targetUserId;
    const isAdmin = ['admin', 'hospital_admin', 'super_admin'].includes(req.user?.role);
    if (!isSelf && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });
    let scopeOrg = null;
    if (!isSelf) {
      scopeOrg = orgId(req);
      if (!scopeOrg) return res.status(400).json({ success: false, error: 'Organization context missing' });
    }
    const branches = await branchService.listStaffBranches(targetUserId, scopeOrg);
    res.json({ success: true, data: branches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/branches/:id/tariff-override', ...adminOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const { chargeMasterId, overridePrice, effectiveDate } = req.body;
    if (chargeMasterId == null || overridePrice == null || overridePrice === '') {
      return res.status(400).json({ success: false, error: 'chargeMasterId and overridePrice are required' });
    }
    const cmId = Number(chargeMasterId);
    const price = typeof overridePrice === 'number' || typeof overridePrice === 'string' ? Number(overridePrice) : NaN;
    if (!Number.isInteger(cmId) || cmId <= 0) {
      return res.status(400).json({ success: false, error: 'chargeMasterId must be a positive integer' });
    }
    if (!Number.isFinite(price) || price < 0 || price >= 1e10) {
      return res.status(400).json({ success: false, error: 'overridePrice must be a non-negative number' });
    }
    const branchId = await branchService.resolveBranchId(req.params.id, org);
    if (!branchId) return res.status(404).json({ success: false, error: 'Branch not found' });
    const override = await branchService.setTariffOverride({
      branchId, chargeMasterId: cmId, overridePrice: price, effectiveDate,
    });
    res.status(201).json({ success: true, data: override });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/patients/:patientId/branch-summary', ...clinicalRead, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const summary = await branchService.getPatientBranchSummary(Number(req.params.patientId), org);
    res.json({ success: true, data: summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;

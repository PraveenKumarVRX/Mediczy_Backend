/**
 * Family Member Routes
 * Handles family member CRUD operations with membership validation
 */

import express from 'express';
import { randomUUID } from 'crypto';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import {
  inferFamilyMemberAttributes,
  validateFamilyMemberAddition,
  getFamilyMemberLimits,
  normalizeGender,
  STORABLE_RELATIONSHIPS
} from '../services/family-member-validation.service.js';

const router = express.Router();

// pg_advisory_xact_lock namespace ("FM") serialising one member's adds, so
// two concurrent saves cannot both pass the plan-limit count.
const FAMILY_LOCK_NAMESPACE = 0x464d;

/**
 * Runs `work(transaction)` with the row-level-security context of the signed-in
 * member and commits it.
 *
 * family_members has FORCED row-level security (policy family_members_isolation:
 * "userId" = current_app_user_id() OR is_platform_admin()). Outside such a
 * transaction every INSERT is refused ("new row violates row-level security
 * policy", the QA-02 500) and every SELECT/COUNT silently returns no rows, which
 * also disabled the plan-limit count. The policy has no organisation term, so the
 * org GUC is set to 0 rather than from organization_id (which can hold a uid).
 */
async function withFamilyRls(req, work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await setRlsContext(transaction, { orgId: 0, userId: req.user.id });
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

class FamilyInputError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

const STRING_LIMITS = {
  firstName: 100,
  lastName: 100,
  phoneNumber: 20,
  email: 255,
  bloodType: 10,
  abhaHealthId: 50,
  profileImage: 500
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed string, null for blank, undefined when absent; 400 when too long or not text. */
function optionalText(body, field) {
  if (!(field in body)) return undefined;
  const value = body[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new FamilyInputError(`${field} must be text`);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (STRING_LIMITS[field] && text.length > STRING_LIMITS[field]) {
    throw new FamilyInputError(`${field} must be at most ${STRING_LIMITS[field]} characters`);
  }
  return text;
}

function optionalList(body, field) {
  if (!(field in body)) return undefined;
  const value = body[field];
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v).trim()));
  }
  throw new FamilyInputError(`${field} must be a list`);
}

function optionalObject(body, field) {
  if (!(field in body)) return undefined;
  const value = body[field];
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new FamilyInputError(`${field} must be an object`);
  }
  return value;
}

/** "YYYY-MM-DD" or ISO date; null when blank; 400 when not a real, past date. */
function optionalDateOfBirth(body) {
  if (!('dateOfBirth' in body)) return undefined;
  const value = body.dateOfBirth;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim();
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(date.getTime())) {
    throw new FamilyInputError('dateOfBirth must be a date (YYYY-MM-DD)');
  }
  if (date.getTime() > Date.now()) {
    throw new FamilyInputError('dateOfBirth cannot be in the future');
  }
  if (date.getUTCFullYear() < 1900) {
    throw new FamilyInputError('dateOfBirth must be after 1900');
  }
  return text;
}

/**
 * The family-member fields present in `body`, validated and normalised. Fields the
 * body does not mention are undefined (so PUT keeps the stored value).
 */
function readMemberInput(body = {}) {
  const input = {
    firstName: optionalText(body, 'firstName'),
    lastName: optionalText(body, 'lastName'),
    dateOfBirth: optionalDateOfBirth(body),
    phoneNumber: optionalText(body, 'phoneNumber'),
    email: optionalText(body, 'email'),
    bloodType: optionalText(body, 'bloodType'),
    abhaHealthId: optionalText(body, 'abhaHealthId'),
    profileImage: optionalText(body, 'profileImage'),
    allergies: optionalList(body, 'allergies'),
    medications: optionalList(body, 'medications'),
    chronicConditions: optionalList(body, 'chronicConditions'),
    medicalHistory: optionalObject(body, 'medicalHistory'),
    emergencyContact: optionalObject(body, 'emergencyContact')
  };
  if (input.email && !EMAIL_RE.test(input.email)) {
    throw new FamilyInputError('email is not a valid email address');
  }
  if (body.gender !== undefined && body.gender !== null && String(body.gender).trim() !== ''
      && normalizeGender(body.gender) === undefined) {
    throw new FamilyInputError('gender must be Male, Female or Other');
  }
  return input;
}

/** 400 unless the inferred relationship is one the enum can store. */
function assertStorableRelationship(relationship) {
  if (!STORABLE_RELATIONSHIPS.includes(relationship)) {
    const genderNeeded = ['child', 'parent', 'sibling', 'grandchild', 'grandparent'].includes(relationship);
    throw new FamilyInputError(
      genderNeeded
        ? `Relationship '${relationship}' needs a gender (Male or Female), or choose e.g. son/daughter`
        : `Relationship '${relationship}' is not supported. Use one of: ${STORABLE_RELATIONSHIPS.join(', ')}`
    );
  }
}

/**
 * The 4xx response for an error caused by the request, or null for a server fault.
 * Bad input must never surface as a 500.
 */
function clientErrorResponse(error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return { status: error.statusCode, message: error.message };
  }
  const code = error?.parent?.code || error?.original?.code;
  if (error?.name === 'SequelizeUniqueConstraintError' || code === '23505') {
    const abha = JSON.stringify(error?.fields || {}).includes('abhaHealthId')
      || String(error?.parent?.constraint || '').includes('abhaHealthId');
    return {
      status: 409,
      message: abha ? 'This ABHA Health ID is already registered' : 'This family member already exists'
    };
  }
  if (error?.name === 'SequelizeValidationError') {
    const details = (error.errors || []).map((e) => e.message).filter(Boolean).join('; ');
    return { status: 400, message: details || 'Invalid family member details' };
  }
  // invalid enum/text, value too long, bad date, NOT NULL
  if (['22P02', '22001', '22007', '22008', '23502'].includes(code)) {
    return { status: 400, message: 'Invalid family member details' };
  }
  return null;
}

/** Positive integer id from the path, or null (a non-numeric id is a 404, not a 500). */
function parseMemberId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

function sendFailure(res, error, logLabel, fallbackMessage) {
  const client = clientErrorResponse(error);
  if (client) {
    return res.status(client.status).json({ success: false, message: client.message });
  }
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

/**
 * GET /api/family-members/limits
 * Get family member limits based on membership type
 */
router.get('/limits', authUser, async (req, res) => {
  try {
    const limits = await withFamilyRls(req, (transaction) => getFamilyMemberLimits(req.user.id, { transaction }));
    
    res.json({
      success: true,
      limits
    });
  } catch (error) {
    sendFailure(res, error, 'Get family member limits error', 'Failed to get family member limits');
  }
});

/**
 * GET /api/family-members
 * Get all family members for the logged-in user
 */
router.get('/', authUser, async (req, res) => {
  try {
    const familyMembers = await withFamilyRls(req, (transaction) => FamilyMember.findAll({
      where: {
        userId: req.user.id,
        isActive: true
      },
      order: [['createdAt', 'DESC']],
      transaction
    }));
    
    res.json({
      success: true,
      data: familyMembers
    });
  } catch (error) {
    sendFailure(res, error, 'Get family members error', 'Failed to fetch family members');
  }
});

/**
 * GET /api/family-members/:id
 * Get a specific family member
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const memberId = parseMemberId(req.params.id);
    const familyMember = memberId && await withFamilyRls(req, (transaction) => FamilyMember.findOne({
      where: {
        id: memberId,
        userId: req.user.id
      },
      transaction
    }));
    
    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }
    
    res.json({
      success: true,
      data: familyMember
    });
  } catch (error) {
    sendFailure(res, error, 'Get family member error', 'Failed to fetch family member');
  }
});

/**
 * POST /api/family-members
 * Add a new family member with membership validation
 */
router.post('/', authUser, async (req, res) => {
  try {
    const body = req.body || {};
    const input = readMemberInput(body);

    // Validate required fields
    if (!input.firstName || !input.lastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firstName, lastName'
      });
    }

    const inferred = inferFamilyMemberAttributes({
      relationship: body.relationship,
      relationshipHint: body.relationshipHint,
      gender: body.gender
    });
    if (!inferred.relationship) {
      return res.status(400).json({
        success: false,
        message: 'Relationship is required (or provide relationshipHint for AI inference)'
      });
    }
    assertStorableRelationship(inferred.relationship);

    const outcome = await withFamilyRls(req, async (transaction) => {
      await postgresSequelize.query('SELECT pg_advisory_xact_lock(:ns, :userId)', {
        replacements: { ns: FAMILY_LOCK_NAMESPACE, userId: req.user.id },
        transaction
      });

      // Validate family member addition based on membership type
      const validation = await validateFamilyMemberAddition(req.user.id, inferred.relationship, { transaction });
      if (!validation.allowed) {
        return { status: 403, body: { success: false, message: validation.reason } };
      }

      // A duplicate ABHA ID on another account is caught by the unique
      // constraint (RLS hides other members' rows) and answered with a 409.
      if (input.abhaHealthId) {
        const existingMember = await FamilyMember.findOne({
          where: { abhaHealthId: input.abhaHealthId },
          transaction
        });
        if (existingMember) {
          return { status: 409, body: { success: false, message: 'This ABHA Health ID is already registered' } };
        }
      }

      const familyMember = await FamilyMember.create({
        userId: req.user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        relationship: inferred.relationship,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: inferred.gender,
        phoneNumber: input.phoneNumber ?? null,
        email: input.email ?? null,
        bloodType: input.bloodType ?? null,
        allergies: input.allergies || [],
        medications: input.medications || [],
        chronicConditions: input.chronicConditions || [],
        abhaHealthId: input.abhaHealthId ?? null,
        medicalHistory: input.medicalHistory || {},
        emergencyContact: input.emergencyContact || {},
        metadata: {
          aiInference: inferred.aiInference,
          aiInferenceVersion: 'family-member-v1',
          aiInferredAt: new Date().toISOString()
        }
      }, { transaction });

      return {
        status: 201,
        body: {
          success: true,
          message: 'Family member added successfully',
          data: familyMember,
          remaining: validation.remaining,
          aiInference: inferred.aiInference
        }
      };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    sendFailure(res, error, 'Create family member error', 'Failed to add family member');
  }
});

/**
 * PUT /api/family-members/:id
 * Update a family member
 */
router.put('/:id', authUser, async (req, res) => {
  try {
    const memberId = parseMemberId(req.params.id);
    if (!memberId) {
      return res.status(404).json({ success: false, message: 'Family member not found' });
    }
    const body = req.body || {};
    const input = readMemberInput(body);
    if (('firstName' in body && !input.firstName) || ('lastName' in body && !input.lastName)) {
      return res.status(400).json({ success: false, message: 'firstName and lastName cannot be empty' });
    }

    const outcome = await withFamilyRls(req, async (transaction) => {
      const familyMember = await FamilyMember.findOne({
        where: {
          id: memberId,
          userId: req.user.id
        },
        transaction
      });

      if (!familyMember) {
        return { status: 404, body: { success: false, message: 'Family member not found' } };
      }

      const inferred = inferFamilyMemberAttributes({
        relationship: body.relationship || familyMember.relationship,
        relationshipHint: body.relationshipHint,
        gender: body.gender || familyMember.gender
      });

      if (!inferred.relationship) {
        return { status: 400, body: { success: false, message: 'Relationship is required' } };
      }
      assertStorableRelationship(inferred.relationship);

      // Check if ABHA ID already exists (excluding current member)
      if (input.abhaHealthId && input.abhaHealthId !== familyMember.abhaHealthId) {
        const existingMember = await FamilyMember.findOne({
          where: { abhaHealthId: input.abhaHealthId },
          transaction
        });
        if (existingMember) {
          return { status: 409, body: { success: false, message: 'This ABHA Health ID is already registered' } };
        }
      }

      const keep = (value, current) => (value !== undefined ? value : current);
      await familyMember.update({
        firstName: input.firstName || familyMember.firstName,
        lastName: input.lastName || familyMember.lastName,
        relationship: inferred.relationship,
        dateOfBirth: keep(input.dateOfBirth, familyMember.dateOfBirth),
        gender: inferred.gender,
        phoneNumber: keep(input.phoneNumber, familyMember.phoneNumber),
        email: keep(input.email, familyMember.email),
        bloodType: keep(input.bloodType, familyMember.bloodType),
        allergies: keep(input.allergies, familyMember.allergies),
        medications: keep(input.medications, familyMember.medications),
        chronicConditions: keep(input.chronicConditions, familyMember.chronicConditions),
        abhaHealthId: keep(input.abhaHealthId, familyMember.abhaHealthId),
        medicalHistory: keep(input.medicalHistory, familyMember.medicalHistory),
        emergencyContact: keep(input.emergencyContact, familyMember.emergencyContact),
        profileImage: keep(input.profileImage, familyMember.profileImage),
        metadata: {
          ...(familyMember.metadata || {}),
          aiInference: inferred.aiInference,
          aiInferenceVersion: 'family-member-v1',
          aiInferredAt: new Date().toISOString()
        }
      }, { transaction });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Family member updated successfully',
          data: familyMember,
          aiInference: inferred.aiInference
        }
      };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    sendFailure(res, error, 'Update family member error', 'Failed to update family member');
  }
});

/**
 * DELETE /api/family-members/:id
 * Delete (soft delete) a family member
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const memberId = parseMemberId(req.params.id);
    const removed = memberId && await withFamilyRls(req, async (transaction) => {
      const familyMember = await FamilyMember.findOne({
        where: {
          id: memberId,
          userId: req.user.id
        },
        transaction
      });
      if (!familyMember) return false;
      // Soft delete
      await familyMember.update({ isActive: false }, { transaction });
      return true;
    });

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }

    res.json({
      success: true,
      message: 'Family member removed successfully'
    });
  } catch (error) {
    sendFailure(res, error, 'Delete family member error', 'Failed to remove family member');
  }
});

/** The member's own active family member, read under the RLS context, or null. */
function findOwnActiveMember(req, transaction) {
  const memberId = parseMemberId(req.params.id);
  if (!memberId) return null;
  return FamilyMember.findOne({
    where: { id: memberId, userId: req.user.id, isActive: true },
    transaction
  });
}

/**
 * GET /api/family-members/:id/insurances
 * List all insurance policies for a family member
 */
router.get('/:id/insurances', authUser, async (req, res) => {
  try {
    const member = await withFamilyRls(req, (transaction) => findOwnActiveMember(req, transaction));
    if (!member) return res.status(404).json({ success: false, message: 'Family member not found' });

    const policies = (member.metadata?.insurancePolicies) || [];
    res.json({ success: true, data: policies });
  } catch (err) {
    sendFailure(res, err, 'Get family insurance error', 'Failed to fetch insurance policies');
  }
});

/**
 * POST /api/family-members/:id/insurances
 * Add an insurance policy for a family member
 * Body: insurerName*, policyNumber*, policyType, coverageAmount, premiumAmount,
 *       premiumFrequency, startDate, endDate, membersName, notes
 */
router.post('/:id/insurances', authUser, async (req, res) => {
  try {
    const { insurerName, policyNumber, policyType, coverageAmount, premiumAmount,
            premiumFrequency, startDate, endDate, membersName, notes } = req.body || {};

    if (!insurerName || !policyNumber) {
      return res.status(400).json({ success: false, message: 'insurerName and policyNumber are required' });
    }

    const policy = {
      id: randomUUID(),
      insurerName,
      policyNumber,
      policyType: policyType || 'individual',
      coverageAmount: coverageAmount ? parseFloat(coverageAmount) : null,
      premiumAmount: premiumAmount ? parseFloat(premiumAmount) : null,
      premiumFrequency: premiumFrequency || null,
      startDate: startDate || null,
      endDate: endDate || null,
      membersName: membersName || null,
      notes: notes || null,
      addedAt: new Date().toISOString(),
    };

    const added = await withFamilyRls(req, async (transaction) => {
      const member = await findOwnActiveMember(req, transaction);
      if (!member) return false;
      const existing = member.metadata?.insurancePolicies || [];
      const updated = { ...(member.metadata || {}), insurancePolicies: [...existing, policy] };
      await member.update({ metadata: updated }, { transaction });
      return true;
    });
    if (!added) return res.status(404).json({ success: false, message: 'Family member not found' });

    res.status(201).json({ success: true, message: 'Insurance policy added', data: policy });
  } catch (err) {
    sendFailure(res, err, 'Add family insurance error', 'Failed to add insurance policy');
  }
});

/**
 * DELETE /api/family-members/:id/insurances/:policyId
 * Remove an insurance policy from a family member
 */
router.delete('/:id/insurances/:policyId', authUser, async (req, res) => {
  try {
    const outcome = await withFamilyRls(req, async (transaction) => {
      const member = await findOwnActiveMember(req, transaction);
      if (!member) return 'member-missing';
      const existing = member.metadata?.insurancePolicies || [];
      const filtered = existing.filter(p => p.id !== req.params.policyId);
      if (filtered.length === existing.length) return 'policy-missing';
      const updated = { ...(member.metadata || {}), insurancePolicies: filtered };
      await member.update({ metadata: updated }, { transaction });
      return 'removed';
    });

    if (outcome === 'member-missing') return res.status(404).json({ success: false, message: 'Family member not found' });
    if (outcome === 'policy-missing') return res.status(404).json({ success: false, message: 'Policy not found' });
    res.json({ success: true, message: 'Insurance policy removed' });
  } catch (err) {
    sendFailure(res, err, 'Delete family insurance error', 'Failed to remove insurance policy');
  }
});

export default router;

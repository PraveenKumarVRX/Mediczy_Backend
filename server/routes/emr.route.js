/**
 * EMR (Electronic Medical Record) Folder Routes
 *
 * Every user has a personal EMR folder containing their complete health record.
 * Team members can read any user's folder; users can read only their own.
 *
 * Endpoints:
 *   GET /api/emr/my                  – current user views their own EMR folder
 *   GET /api/emr/user/:userId        – team/admin/doctor views any user's EMR folder
 *   GET /api/emr/users               – team/admin: list all users with EMR summaries
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

/* ── helpers ─────────────────────────────────────────────────────────────── */

const PRIVILEGED_ROLES = new Set(['admin', 'team', 'doctor', 'nurse', 'hospital']);

/**
 * Assemble the full EMR folder for a given user ID.
 * Returns { profile, healthRecord, medicalRecords, prescriptions, reports }
 */
async function buildEMRFolder(userId) {
  const uid = parseInt(userId, 10);

  const [profileRes, healthRes, medRes, rxRes, rptRes] = await Promise.all([
    // 1. Basic user profile
    sharedPool.query(
      `SELECT id, "firstName", "lastName", email, "phoneNumber",
              "dateOfBirth", gender, "bloodType",
              "address_city", "address_state", "address_street", "address_zipCode",
              "profileImage", "createdAt"
         FROM users WHERE id = $1`,
      [uid]
    ),

    // 2. Health profile (EHR baseline) — may not exist yet, that is fine
    sharedPool.query(
      `SELECT ehr_number, height, weight, blood_type, allergies,
              chronic_diseases, medications, emergency_contact, insurance_details,
              created_at, updated_at
         FROM ehr_records WHERE patient_id = $1 LIMIT 1`,
      [uid]
    ),

    // 3. Clinical medical records
    sharedPool.query(
      `SELECT id, record_number, record_type, record_date, diagnosis, treatment,
              symptoms, vital_signs, documents, doctor_id, created_at
         FROM medical_records WHERE patient_id = $1
         ORDER BY record_date DESC NULLS LAST, created_at DESC LIMIT 50`,
      [uid]
    ),

    // 4. Prescriptions
    sharedPool.query(
      `SELECT id, "prescriptionId", "appointmentId", "patientName",
              medications, "createdAt", status
         FROM prescriptions WHERE "patientId" = $1
         ORDER BY "createdAt" DESC LIMIT 50`,
      [uid]
    ),

    // 5. Medical reports / uploaded documents
    sharedPool.query(
      `SELECT id, "fileName", "fileUrl", "reportType", description,
              status, "createdAt"
         FROM reports WHERE "userId" = $1
         ORDER BY "createdAt" DESC LIMIT 50`,
      [uid]
    )
  ]);

  const user = profileRes.rows[0] || null;

  return {
    profile: user
      ? {
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          email: user.email,
          phone: user.phoneNumber,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          bloodGroup: user.bloodType,
          address: {
            street: user.address_street,
            city: user.address_city,
            state: user.address_state,
            zipCode: user.address_zipCode
          },
          profilePicture: user.profileImage,
          memberSince: user.createdAt
        }
      : null,
    healthRecord: healthRes.rows[0] || null,
    medicalRecords: medRes.rows,
    prescriptions: rxRes.rows,
    reports: rptRes.rows,
    summary: {
      medicalRecordsCount: medRes.rowCount,
      prescriptionsCount:  rxRes.rowCount,
      reportsCount:        rptRes.rowCount,
      hasHealthRecord:     healthRes.rowCount > 0
    }
  };
}

/* ── GET /api/emr/my ──────────────────────────────────────────────────────── */

router.get('/my', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const folder = await buildEMRFolder(userId);

    if (!folder.profile) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    return res.json({ success: true, data: folder });
  } catch (err) {
    console.error('[emr] GET /my error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load EMR folder' });
  }
});

/* ── GET /api/emr/user/:userId ────────────────────────────────────────────── */

router.get('/user/:userId', authUser, async (req, res) => {
  try {
    const requestingUserId = req.user?.id || req.user?.dataValues?.id;
    const role = req.user?.role || req.userRole;
    const targetId = parseInt(req.params.userId, 10);

    if (isNaN(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Access control: privileged roles can view any folder; users only their own
    if (!PRIVILEGED_ROLES.has(role) && targetId !== requestingUserId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const folder = await buildEMRFolder(targetId);

    if (!folder.profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      accessedBy: { id: requestingUserId, role },
      data: folder
    });
  } catch (err) {
    console.error('[emr] GET /user/:userId error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load EMR folder' });
  }
});

/* ── GET /api/emr/users ───────────────────────────────────────────────────── */
// Team / admin: browse all users with lightweight EMR summaries

router.get('/users', authUser, async (req, res) => {
  try {
    const role = req.user?.role || req.userRole;
    if (!PRIVILEGED_ROLES.has(role)) {
      return res.status(403).json({ success: false, message: 'Team or admin access required' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    let whereClause = "WHERE u.role IN ('user','patient','employee')";
    const params = [];
    let pi = 1;

    if (search) {
      whereClause += ` AND (
        u."firstName" ILIKE $${pi} OR u."lastName" ILIKE $${pi}
        OR u.email ILIKE $${pi} OR u."phoneNumber" ILIKE $${pi}
      )`;
      params.push(`%${search}%`);
      pi++;
    }

    const [rowsRes, countRes] = await Promise.all([
      sharedPool.query(
        `SELECT
           u.id,
           u."firstName",
           u."lastName",
           u.email,
           u."phoneNumber",
           u.gender,
           u."dateOfBirth",
           u."address_city",
           u."createdAt",
           (SELECT COUNT(*) FROM medical_records mr WHERE mr.patient_id = u.id)::int AS medical_records,
           (SELECT COUNT(*) FROM prescriptions px  WHERE px."patientId"  = u.id)::int AS prescriptions,
           (SELECT COUNT(*) FROM reports       rp  WHERE rp."userId"     = u.id)::int AS reports,
           (SELECT ehr.blood_type FROM ehr_records ehr WHERE ehr.patient_id=u.id LIMIT 1) AS blood_type
         FROM users u
         ${whereClause}
         ORDER BY u."createdAt" DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limit, offset]
      ),
      sharedPool.query(
        `SELECT COUNT(*) FROM users u ${whereClause}`,
        params
      )
    ]);

    const total = parseInt(countRes.rows[0].count, 10);

    return res.json({
      success: true,
      data: rowsRes.rows.map(u => ({
        userId: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        email: u.email,
        phone: u.phoneNumber,
        gender: u.gender,
        dateOfBirth: u.dateOfBirth,
        city: u.address_city,
        memberSince: u.createdAt,
        emrSummary: {
          medicalRecords: u.medical_records,
          prescriptions:  u.prescriptions,
          reports:        u.reports,
          bloodType:      u.blood_type
        }
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[emr] GET /users error:', err);
    return res.status(500).json({ success: false, message: 'Failed to list EMR folders' });
  }
});

export default router;

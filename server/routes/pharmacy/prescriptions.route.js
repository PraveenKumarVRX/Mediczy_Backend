/**
 * Pharmacy Prescriptions Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import n8nService from '../../services/n8n.service.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';
import emrOrderRouter from '../../services/emr-order-router.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

const CONTROLLED_SCHEDULES = new Set(['H', 'H1', 'X', 'NARCOTIC', 'CONTROLLED']);
const STATUS_MAP = {
  pending: { status: 'pending', verificationStatus: 'pending' },
  active: { status: 'active', verificationStatus: 'pending' },
  verified: { status: 'verified', verificationStatus: 'verified', verified: true },
  ready: { status: 'ready', verificationStatus: 'verified', verified: true },
  completed: { status: 'completed', verificationStatus: 'dispensed', verified: true, dispensed: true },
  dispensed: { status: 'dispensed', verificationStatus: 'dispensed', verified: true, dispensed: true },
  rejected: { status: 'rejected', verificationStatus: 'rejected', rejected: true }
};

const normalizeStatus = (value = '') => String(value).trim().toLowerCase();
const toSafeLimit = (value, fallback = 50) => Math.min(200, Math.max(1, Number.parseInt(value, 10) || fallback));
const toSafeOffset = (value) => Math.max(0, Number.parseInt(value, 10) || 0);

async function getPrescriptionMedicines(prescriptionId) {
  const result = await db.query([
    'SELECT pmx.*, m.name as medicine_name, m.schedule, COALESCE(m.is_controlled, false) as is_controlled',
    'FROM pharmacy_prescription_medicines pmx',
    'LEFT JOIN pharmacy_medicines m ON pmx.medicine_id = m.id',
    'WHERE pmx.prescription_id = $1',
    'ORDER BY pmx.id ASC;'
  ].join(' '), [prescriptionId]);
  return result.rows;
}

function hasControlledMedicine(medicines) {
  return medicines.some((medicine) => {
    const schedule = String(medicine.schedule || '').toUpperCase();
    return medicine.is_controlled === true || CONTROLLED_SCHEDULES.has(schedule);
  });
}

router.post('/', async (req, res) => {
  try {
    const { patientId, doctorId, medicines, notes, expiryDate } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ success: false, message: 'Medicines are required' });
    }

    for (const medicine of medicines) {
      if (!medicine.medicineId || Number(medicine.quantity) <= 0) {
        return res.status(400).json({ success: false, message: 'Each medicine requires medicineId and positive quantity' });
      }
    }

    const result = await db.query([
      'INSERT INTO pharmacy_prescriptions',
      '(pharmacy_id, patient_id, doctor_id, notes, expiry_date, status, verification_status, created_at)',
      "VALUES ($1, $2, $3, $4, $5, 'pending', 'pending', NOW())",
      'RETURNING *;'
    ].join(' '), [pharmacyId, patientId || null, doctorId || null, notes || null, expiryDate || null]);
    const prescription = result.rows[0];

    for (const medicine of medicines) {
      await db.query([
        'INSERT INTO pharmacy_prescription_medicines',
        '(prescription_id, medicine_id, quantity, dosage, frequency, days)',
        'VALUES ($1, $2, $3, $4, $5, $6)',
        'RETURNING *;'
      ].join(' '), [
        prescription.id,
        medicine.medicineId,
        Number(medicine.quantity),
        medicine.dosage || null,
        medicine.frequency || null,
        medicine.days || null
      ]);
    }

    await logPharmacyAudit({
      pharmacyId,
      actorId: req.pharmacyToken?.id,
      action: 'prescription.create',
      resourceType: 'prescription',
      resourceId: prescription.id,
      details: { patientId, doctorId, medicineCount: medicines.length },
      req
    });

    try {
      let patient;
      let doctor;
      if (patientId) {
        const patientResult = await db.query('SELECT name, phone, email FROM patients WHERE id = $1', [patientId]);
        patient = patientResult.rows?.[0];
      }
      if (doctorId) {
        const doctorResult = await db.query('SELECT name, phone, email FROM doctors WHERE id = $1', [doctorId]);
        doctor = doctorResult.rows?.[0];
      }
      n8nService.prescriptionIssued({
        id: prescription.id,
        patientId,
        patientName: patient?.name,
        patientEmail: patient?.email,
        patientPhone: patient?.phone,
        doctorName: doctor?.name,
        medications: medicines,
        instructions: notes,
        pharmacyPreference: 'pharmacy'
      }).catch((n8nError) => {
        console.error('Failed to trigger n8n prescription workflow:', n8nError);
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n prescription workflow:', n8nError);
    }

    res.json({ success: true, message: 'Prescription created successfully', prescription });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({ success: false, message: 'Failed to create prescription', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const limit = toSafeLimit(req.query.limit);
    const offset = toSafeOffset(req.query.offset);
    const pharmacyId = req.pharmacyId;
    const params = [pharmacyId];
    let statusClause = '';
    let sourceClause = '';

    if (status) {
      params.push(String(status));
      statusClause = 'AND LOWER(p.status) = LOWER($' + params.length + ')';
    }

    if (req.query.source === 'emr') {
      sourceClause = "AND p.source_type IN ('hospital_emr', 'emr')";
    }

    params.push(limit, offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;

    const query = [
      'SELECT p.*,',
      'CONCAT(pu."firstName", \' \', pu."lastName") as patient_name,',
      'CONCAT(du."firstName", \' \', du."lastName") as doctor_name,',
      'COUNT(pmx.id)::int as medicine_count',
      'FROM pharmacy_prescriptions p',
      'LEFT JOIN patients pt ON p.patient_id = pt.id',
      'LEFT JOIN users pu ON pt."userId" = pu.id',
      'LEFT JOIN doctors d ON p.doctor_id = d.id',
      'LEFT JOIN users du ON d."userId" = du.id',
      'LEFT JOIN pharmacy_prescription_medicines pmx ON p.id = pmx.prescription_id',
      'WHERE p.pharmacy_id = $1 ' + statusClause + ' ' + sourceClause,
      'GROUP BY p.id, pu."firstName", pu."lastName", du."firstName", du."lastName"',
      'ORDER BY p.created_at DESC',
      'LIMIT $' + limitIndex + ' OFFSET $' + offsetIndex + ';'
    ].join(' ');

    const result = await db.query(query, params);

    res.json({ success: true, prescriptions: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Fetch prescriptions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch prescriptions', error: error.message });
  }
});

router.get('/:prescriptionId', async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const pharmacyId = req.pharmacyId;

    const result = await db.query([
      'SELECT p.*,',
      'CONCAT(pu."firstName", \' \', pu."lastName") as patient_name,',
      'CONCAT(du."firstName", \' \', du."lastName") as doctor_name',
      'FROM pharmacy_prescriptions p',
      'LEFT JOIN patients pt ON p.patient_id = pt.id',
      'LEFT JOIN users pu ON pt."userId" = pu.id',
      'LEFT JOIN doctors d ON p.doctor_id = d.id',
      'LEFT JOIN users du ON d."userId" = du.id',
      'WHERE p.id = $1 AND p.pharmacy_id = $2;'
    ].join(' '), [prescriptionId, pharmacyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    const medicines = await getPrescriptionMedicines(prescriptionId);

    res.json({
      success: true,
      prescription: {
        ...result.rows[0],
        medicines,
        hasControlledMedicine: hasControlledMedicine(medicines)
      }
    });
  } catch (error) {
    console.error('Fetch prescription detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch prescription', error: error.message });
  }
});

router.put('/:prescriptionId/status', async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const pharmacyId = req.pharmacyId;
    const requestedStatus = normalizeStatus(req.body.status);
    const statusConfig = STATUS_MAP[requestedStatus];

    if (!statusConfig) {
      return res.status(400).json({ success: false, message: 'Unsupported prescription status' });
    }

    const currentResult = await db.query(
      'SELECT * FROM pharmacy_prescriptions WHERE id = $1 AND pharmacy_id = $2',
      [prescriptionId, pharmacyId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    const medicines = await getPrescriptionMedicines(prescriptionId);
    const controlled = hasControlledMedicine(medicines);
    const requiresConfirmedReview = controlled && ['ready', 'completed', 'dispensed'].includes(statusConfig.status);

    if (requiresConfirmedReview && req.body.pharmacistReviewConfirmed !== true) {
      return res.status(422).json({
        success: false,
        message: 'Pharmacist review confirmation is required before dispensing controlled or scheduled medicines'
      });
    }

    const updateResult = await db.query([
      'UPDATE pharmacy_prescriptions',
      'SET status = $1,',
      'verification_status = $2,',
      'pharmacist_notes = COALESCE($3, pharmacist_notes),',
      'rejected_reason = CASE WHEN $4::boolean THEN $5 ELSE rejected_reason END,',
      'verified_by = CASE WHEN $6::boolean THEN $7 ELSE verified_by END,',
      'verified_at = CASE WHEN $6::boolean THEN COALESCE(verified_at, NOW()) ELSE verified_at END,',
      'dispensed_at = CASE WHEN $8::boolean THEN COALESCE(dispensed_at, NOW()) ELSE dispensed_at END,',
      'updated_at = NOW()',
      'WHERE id = $9 AND pharmacy_id = $10',
      'RETURNING *;'
    ].join(' '), [
      statusConfig.status,
      statusConfig.verificationStatus,
      req.body.notes || req.body.pharmacistNotes || null,
      Boolean(statusConfig.rejected),
      req.body.rejectedReason || req.body.reason || null,
      Boolean(statusConfig.verified),
      req.pharmacyToken?.id || null,
      Boolean(statusConfig.dispensed),
      prescriptionId,
      pharmacyId
    ]);

    await logPharmacyAudit({
      pharmacyId,
      actorId: req.pharmacyToken?.id,
      action: 'prescription.status_update',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      details: {
        from: currentResult.rows[0].status,
        to: statusConfig.status,
        controlled,
        pharmacistReviewConfirmed: req.body.pharmacistReviewConfirmed === true
      },
      req
    });

    let billing = null;
    if (statusConfig.dispensed) {
      try {
        billing = await emrOrderRouter.finalizePharmacyDispenseBilling(Number(prescriptionId), {
          pharmacyId
        });
      } catch (billingError) {
        console.error('Pharmacy dispense billing error:', billingError);
      }
    }

    res.json({
      success: true,
      message: 'Prescription status updated successfully',
      prescription: updateResult.rows[0],
      billing
    });
  } catch (error) {
    console.error('Update prescription status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update prescription status', error: error.message });
  }
});

export default router;

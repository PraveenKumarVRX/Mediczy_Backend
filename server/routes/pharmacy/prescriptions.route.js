/**
 * Pharmacy Prescriptions Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import n8nService from '../../services/n8n.service.js';

const router = express.Router();

/**
 * POST /api/pharmacy/prescriptions
 * Create new prescription
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      patientId,
      doctorId,
      medicines, // [{medicineId, quantity, dosage, frequency, days}]
      notes,
      expiryDate
    } = req.body;

    if (!medicines || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Medicines are required'
      });
    }

    // Insert prescription
    const query = `
      INSERT INTO pharmacy_prescriptions 
      (pharmacy_id, patient_id, doctor_id, notes, expiry_date, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'active', NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [pharmacyId, patientId, doctorId, notes, expiryDate]);
    const prescription = result.rows[0];

    // Insert prescription medicines
    for (const medicine of medicines) {
      const medQuery = `
        INSERT INTO pharmacy_prescription_medicines 
        (prescription_id, medicine_id, quantity, dosage, frequency, days)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      await db.query(medQuery, [
        prescription.id,
        medicine.medicineId,
        medicine.quantity,
        medicine.dosage,
        medicine.frequency,
        medicine.days
      ]);
    }

    // Notify via n8n (best-effort)
    try {
      let patient;
      let doctor;

      if (patientId) {
        const patientResult = await db.query(
          'SELECT name, phone, email FROM patients WHERE id = $1',
          [patientId]
        );
        patient = patientResult.rows?.[0];
      }

      if (doctorId) {
        const doctorResult = await db.query(
          'SELECT name, phone, email FROM doctors WHERE id = $1',
          [doctorId]
        );
        doctor = doctorResult.rows?.[0];
      }

      await n8nService.prescriptionIssued({
        id: prescription.id,
        patientId,
        patientName: patient?.name,
        patientEmail: patient?.email,
        patientPhone: patient?.phone,
        doctorName: doctor?.name,
        medications: medicines,
        instructions: notes,
        pharmacyPreference: 'pharmacy'
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n prescription workflow:', n8nError);
    }

    res.json({
      success: true,
      message: 'Prescription created successfully',
      prescription
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/prescriptions
 * List all prescriptions
 */
router.get('/', async (req, res) => {
  try {
    const { pharmacyId, limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT p.*, 
        CONCAT(pu."firstName", ' ', pu."lastName") as patient_name, 
        CONCAT(d."firstName", ' ', d."lastName") as doctor_name
      FROM pharmacy_prescriptions p
      LEFT JOIN patients pt ON p.patient_id = pt.id
      LEFT JOIN users pu ON pt."userId" = pu.id
      LEFT JOIN doctors d ON p.doctor_id = d.id
      WHERE p.pharmacy_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      prescriptions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

export default router;

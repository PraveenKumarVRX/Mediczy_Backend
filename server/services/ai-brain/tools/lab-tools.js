/**
 * Lab Tools — 1 tool for lab results
 * get_lab_results
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';

register({
  name: 'get_lab_results',
  description: 'Get the patient\'s lab test results and orders. Shows test names, values, reference ranges, and results status.',
  category: 'lab',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID' },
      test_type: { type: 'string', description: 'Filter by test type (e.g., "CBC", "lipid panel", "thyroid")' },
      limit: { type: 'number', description: 'Max results (default 10)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = params.patient_id || ctx.userId;
    const limit = params.limit || 10;

    // Try lab_orders first
    const { rows } = await db.query(
      `SELECT lo.id, lo."testName", lo.status, lo."resultData", lo."reportUrl",
              lo."orderedAt", lo."completedAt", lo.notes,
              d."firstName" AS doctor_first, d."lastName" AS doctor_last
       FROM lab_orders lo
       LEFT JOIN doctors d ON d.id = lo."doctorId"
       WHERE lo."patientId" = $1
       ORDER BY lo."orderedAt" DESC
       LIMIT $2`,
      [patientId, limit]
    );

    if (rows.length > 0) {
      return {
        labResults: rows.map(r => ({
          id: r.id,
          testName: r.testName,
          status: r.status,
          results: r.resultData,
          reportUrl: r.reportUrl,
          orderedDate: r.orderedAt,
          completedDate: r.completedAt,
          notes: r.notes,
          orderedBy: r.doctor_first ? `Dr. ${r.doctor_first} ${r.doctor_last}` : null
        })),
        count: rows.length
      };
    }

    // Fallback to lab_tests table
    const { rows: ltRows } = await db.query(
      `SELECT id, name, category, description, price, "turnaroundTime"
       FROM lab_tests
       ORDER BY category, name
       LIMIT $1`,
      [limit]
    );

    return {
      labResults: [],
      availableTests: ltRows,
      message: 'No lab results found. Here are available tests.'
    };
  }
});

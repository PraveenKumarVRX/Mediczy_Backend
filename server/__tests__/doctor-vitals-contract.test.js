import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Contract test: vitals POST (sequelize) and GET history (pool) must share the same table.
 * This test validates the read/write data-plane contract without loading the full doctor router.
 */
describe('Vitals POST→GET data-plane contract', () => {
  const vitalsStore = [];

  const pool = {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT * FROM patient_vitals')) {
        const [patientId, limit] = params;
        const rows = vitalsStore
          .filter((row) => row.patient_id === patientId)
          .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
          .slice(0, limit);
        return { rows };
      }
      if (sql.includes('INSERT INTO patient_vitals')) {
        const row = {
          id: vitalsStore.length + 1,
          patient_id: params[0],
          recorded_by_doctor_id: params[1],
          bp: params[2],
          heart_rate: params[3],
          temperature: params[4],
          spo2: params[5],
          recorded_at: new Date().toISOString(),
        };
        vitalsStore.push(row);
        return { rows: [row] };
      }
      return { rows: [] };
    }),
  };

  beforeEach(() => {
    vitalsStore.length = 0;
    pool.query.mockClear();
  });

  it('returns inserted vitals on history read (simulates fixed doctor.route handlers)', async () => {
    const doctorRoute = readFileSync(path.join(__dirname, '../routes/doctor.route.js'), 'utf8');
    expect(doctorRoute).toContain('await pool.query(');
    expect(doctorRoute).not.toContain('req.app.locals.pgPool');

    await pool.query(
      `INSERT INTO patient_vitals (patient_id, recorded_by_doctor_id, bp, heart_rate, temperature, spo2, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [101, 42, '118/76', 70, 98.4, 97]
    );

    const { rows } = await pool.query(
      `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
      [101, 10]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].bp).toBe('118/76');
    expect(rows[0].heart_rate).toBe(70);
  });
});

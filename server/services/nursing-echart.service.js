/**
 * Nursing E-Charting (Electronic Bedside Flowsheet)
 * ─────────────────────────────────────────────────
 * Captures time-stamped nursing observations at the bedside:
 *   • Vital signs (BP, HR, SpO2, RR, Temp, GCS)
 *   • Intake & Output (I&O) entries
 *   • Nursing notes / free-text observations
 *   • Pain assessments
 *   • Neuro/skin/fall-risk checks
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS nursing_flowsheet_entries (
      id                  SERIAL PRIMARY KEY,
      admission_id        INTEGER NOT NULL,
      organization_id     INTEGER NOT NULL,
      entry_type          VARCHAR(50) NOT NULL,
      recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      recorded_by         INTEGER NOT NULL,
      -- Vitals
      bp_systolic         INTEGER,
      bp_diastolic        INTEGER,
      heart_rate          INTEGER,
      spo2                NUMERIC(5,2),
      respiratory_rate    INTEGER,
      temperature         NUMERIC(5,2),
      temperature_site    VARCHAR(20),
      gcs_eye             SMALLINT,
      gcs_verbal          SMALLINT,
      gcs_motor           SMALLINT,
      pain_score          SMALLINT,
      pain_location       VARCHAR(100),
      -- I&O
      io_type             VARCHAR(20),
      io_description      VARCHAR(100),
      io_volume_ml        NUMERIC(8,2),
      -- General observation
      observation_text    TEXT,
      -- Risk assessments
      fall_risk_score     SMALLINT,
      braden_score        SMALLINT,
      skin_integrity      VARCHAR(50),
      pupil_left          VARCHAR(30),
      pupil_right         VARCHAR(30),
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_flowsheet_admission
      ON nursing_flowsheet_entries(admission_id, recorded_at DESC)
  `);
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS nursing_io_summary (
      id              SERIAL PRIMARY KEY,
      admission_id    INTEGER NOT NULL,
      summary_date    DATE NOT NULL DEFAULT CURRENT_DATE,
      total_intake_ml NUMERIC(10,2) DEFAULT 0,
      total_output_ml NUMERIC(10,2) DEFAULT 0,
      net_balance_ml  NUMERIC(10,2) GENERATED ALWAYS AS (total_intake_ml - total_output_ml) STORED,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(admission_id, summary_date)
    )
  `);
}

ensureTables().catch(e => console.warn('[nursing-echart] table init:', e.message));

// ── Vitals / observation entry ────────────────────────────────────────────────

export async function recordEntry(data) {
  const {
    admissionId, organizationId, recordedBy, entryType = 'vitals', recordedAt,
    bpSystolic, bpDiastolic, heartRate, spo2, respiratoryRate,
    temperature, temperatureSite, gcsEye, gcsVerbal, gcsMotor,
    painScore, painLocation,
    ioType, ioDescription, ioVolumeMl,
    observationText,
    fallRiskScore, bradenScore, skinIntegrity, pupilLeft, pupilRight
  } = data;

  const [row] = await sequelize.query(`
    INSERT INTO nursing_flowsheet_entries (
      admission_id, organization_id, entry_type, recorded_at, recorded_by,
      bp_systolic, bp_diastolic, heart_rate, spo2, respiratory_rate,
      temperature, temperature_site, gcs_eye, gcs_verbal, gcs_motor,
      pain_score, pain_location,
      io_type, io_description, io_volume_ml,
      observation_text,
      fall_risk_score, braden_score, skin_integrity, pupil_left, pupil_right
    ) VALUES (
      :admissionId, :organizationId, :entryType, :recordedAt, :recordedBy,
      :bpSystolic, :bpDiastolic, :heartRate, :spo2, :respiratoryRate,
      :temperature, :temperatureSite, :gcsEye, :gcsVerbal, :gcsMotor,
      :painScore, :painLocation,
      :ioType, :ioDescription, :ioVolumeMl,
      :observationText,
      :fallRiskScore, :bradenScore, :skinIntegrity, :pupilLeft, :pupilRight
    ) RETURNING *
  `, {
    replacements: {
      admissionId, organizationId, recordedBy,
      entryType, recordedAt: recordedAt || new Date().toISOString(),
      bpSystolic: bpSystolic ?? null, bpDiastolic: bpDiastolic ?? null,
      heartRate: heartRate ?? null, spo2: spo2 ?? null,
      respiratoryRate: respiratoryRate ?? null,
      temperature: temperature ?? null, temperatureSite: temperatureSite ?? null,
      gcsEye: gcsEye ?? null, gcsVerbal: gcsVerbal ?? null, gcsMotor: gcsMotor ?? null,
      painScore: painScore ?? null, painLocation: painLocation ?? null,
      ioType: ioType ?? null, ioDescription: ioDescription ?? null, ioVolumeMl: ioVolumeMl ?? null,
      observationText: observationText ?? null,
      fallRiskScore: fallRiskScore ?? null, bradenScore: bradenScore ?? null,
      skinIntegrity: skinIntegrity ?? null, pupilLeft: pupilLeft ?? null, pupilRight: pupilRight ?? null
    },
    type: QueryTypes.INSERT
  });

  // Update I&O daily summary if this is an I&O entry
  if (ioType && ioVolumeMl) {
    const col = ioType === 'output' ? 'total_output_ml' : 'total_intake_ml';
    await sequelize.query(`
      INSERT INTO nursing_io_summary (admission_id, summary_date, ${col})
      VALUES (:admissionId, CURRENT_DATE, :vol)
      ON CONFLICT (admission_id, summary_date)
      DO UPDATE SET ${col} = nursing_io_summary.${col} + :vol, updated_at = NOW()
    `, { replacements: { admissionId, vol: ioVolumeMl }, type: QueryTypes.INSERT });
  }

  return row;
}

// ── Flowsheet retrieval ───────────────────────────────────────────────────────

export async function getFlowsheet(admissionId, { entryType, from, to, limit = 100 } = {}) {
  const conditions = ['admission_id = :admissionId'];
  const replacements = { admissionId, limit };

  if (entryType) { conditions.push('entry_type = :entryType'); replacements.entryType = entryType; }
  if (from)      { conditions.push('recorded_at >= :from');   replacements.from = from; }
  if (to)        { conditions.push('recorded_at <= :to');     replacements.to = to; }

  const rows = await sequelize.query(`
    SELECT * FROM nursing_flowsheet_entries
    WHERE ${conditions.join(' AND ')}
    ORDER BY recorded_at DESC
    LIMIT :limit
  `, { replacements, type: QueryTypes.SELECT });

  return rows;
}

export async function getLatestVitals(admissionId) {
  const [row] = await sequelize.query(`
    SELECT * FROM nursing_flowsheet_entries
    WHERE admission_id = :admissionId
      AND entry_type = 'vitals'
      AND heart_rate IS NOT NULL
    ORDER BY recorded_at DESC
    LIMIT 1
  `, { replacements: { admissionId }, type: QueryTypes.SELECT });
  return row ?? null;
}

// ── I&O summary ───────────────────────────────────────────────────────────────

export async function getIOSummary(admissionId, days = 3) {
  const rows = await sequelize.query(`
    SELECT * FROM nursing_io_summary
    WHERE admission_id = :admissionId
      AND summary_date >= CURRENT_DATE - :days
    ORDER BY summary_date DESC
  `, { replacements: { admissionId, days }, type: QueryTypes.SELECT });
  return rows;
}

// ── Vitals trend (for sparkline) ──────────────────────────────────────────────

export async function getVitalsTrend(admissionId, hours = 24) {
  const rows = await sequelize.query(`
    SELECT recorded_at, heart_rate, spo2, bp_systolic, bp_diastolic,
           respiratory_rate, temperature,
           (COALESCE(gcs_eye,0) + COALESCE(gcs_verbal,0) + COALESCE(gcs_motor,0)) AS gcs_total
    FROM nursing_flowsheet_entries
    WHERE admission_id = :admissionId
      AND entry_type = 'vitals'
      AND recorded_at >= NOW() - INTERVAL '1 hour' * :hours
    ORDER BY recorded_at ASC
  `, { replacements: { admissionId, hours }, type: QueryTypes.SELECT });
  return rows;
}

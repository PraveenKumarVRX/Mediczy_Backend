import express from 'express';
import { nursingHandler } from './nursing-http.js';
import { nursingContext,nursingQuery,assertAdmission } from '../services/nursing-context.service.js';
import { recordEntry } from '../services/nursing-echart.service.js';
import { clinicalAlerts,acknowledgeNursingAlert } from '../services/nursing-operations.service.js';
import { authUser } from '../middleware/auth.middleware.js';
import { auditHealthAccess } from '../middleware/audit.middleware.js';
import {
  saveVitals, getVitalsTrend, getActiveAlerts,
  acknowledgeAlert, resolveAlert, getLatestVitals
} from '../services/vitals-ews.service.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();
router.use(authUser);
// The general vitals API cannot bypass a nurse's admission and ward permissions.
router.use((req,res,next)=>{
  if(req.user?.role!=='nurse')return next();
  if(req.method==='POST'&&req.path==='/')return nursingHandler(r=>recordEntry({...r.body,heartRate:r.body.heartRate??r.body.pulse,entryType:'vitals',amendsId:null,idempotencyKey:r.get('Idempotency-Key')}),201)(req,res);
  if(req.method==='GET'&&['/alerts','/clinical-alerts'].includes(req.path))return nursingHandler(()=>clinicalAlerts())(req,res);
  const trend=req.path.match(/^\/(\d+)\/(trend|latest)$/);
  if(req.method==='GET'&&trend)return nursingHandler(async r=>{await assertAdmission(trend[1]);return trend[2]==='latest'?getLatestVitals(Number(trend[1]),nursingContext().organizationId):getVitalsTrend(Number(trend[1]),nursingContext().organizationId,{hours:Number(r.query.hours)||24});})(req,res);
  const alert=req.path.match(/^\/alerts\/(\d+)\/(acknowledge|resolve)$/);
  if(req.method==='POST'&&alert)return nursingHandler(async()=>{if(alert[2]==='acknowledge')return acknowledgeNursingAlert(alert[1]);const [row]=await nursingQuery('SELECT admission_id FROM early_warning_alerts WHERE id=:id AND organization_id=:org',{replacements:{id:Number(alert[1]),org:nursingContext().organizationId},type:QueryTypes.SELECT});await assertAdmission(row?.admission_id);return resolveAlert(Number(alert[1]),nursingContext().organizationId);})(req,res);
  return res.status(410).json({success:false,code:'USE_ADMISSION_NURSING_CHART',message:'Use the admission-linked nursing workspace.'});
});

// Clinical valid ranges — NEWS2 / NICE guidelines
const VITAL_RANGES = {
  temperature:     { min: 32,  max: 43   },   // °C (hypothermia to dangerous hyperthermia)
  heartRate:       { min: 20,  max: 300  },   // bpm
  pulse:           { min: 20,  max: 300  },
  respiratoryRate: { min: 4,   max: 60   },   // breaths/min
  spo2:            { min: 50,  max: 100  },   // %
  bpSystolic:      { min: 40,  max: 300  },   // mmHg
  bpDiastolic:     { min: 20,  max: 200  },
  bloodGlucose:    { min: 1,   max: 60   },   // mmol/L (or 18–1100 mg/dL)
  weight:          { min: 0.5, max: 700  },   // kg
  height:          { min: 20,  max: 250  },   // cm
};

function validateVitalRanges(body) {
  const errors = [];
  for (const [field, { min, max }] of Object.entries(VITAL_RANGES)) {
    const val = body[field];
    if (val === undefined || val === null) continue;
    const n = Number(val);
    if (isNaN(n) || n < min || n > max) {
      errors.push(`${field} must be between ${min} and ${max}`);
    }
  }
  return errors;
}

// POST /api/v1/vitals
router.post('/',  auditHealthAccess('VITALS_WRITE', { resourceType: 'VitalSigns' }), async (req, res) => {
  try {
    const rangeErrors = validateVitalRanges(req.body);
    if (rangeErrors.length) {
      return res.status(400).json({ success: false, message: 'Vital sign validation failed', errors: rangeErrors });
    }
    const organizationId = resolveTenantId(req.user);
    const record = await saveVitals({ ...req.body, organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/:admissionId/trend
router.get('/:admissionId/trend',  async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { hours } = req.query;
    const trend = await getVitalsTrend(parseInt(req.params.admissionId), organizationId, { hours: hours ? parseInt(hours) : 24 });
    res.json({ success: true, data: trend });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/:admissionId/latest
router.get('/:admissionId/latest',  async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const latest = await getLatestVitals(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/alerts
router.get('/alerts',  async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { admissionId, wardId, severity } = req.query;
    const alerts = await getActiveAlerts(organizationId, {
      admissionId: admissionId ? parseInt(admissionId) : undefined,
      wardId: wardId ? parseInt(wardId) : undefined,
      severity
    });
    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/vitals/alerts/:id/acknowledge
router.post('/alerts/:id/acknowledge',  async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await acknowledgeAlert(parseInt(req.params.id), organizationId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/vitals/alerts/:id/resolve
router.post('/alerts/:id/resolve',  async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await resolveAlert(parseInt(req.params.id), organizationId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/clinical-alerts — document §8 Phase 2: unified clinical alert feed
// Merges vitals EWS alerts + lab CDSS rule alerts into one feed
router.get('/clinical-alerts',  async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { patientId, admissionId, severity, limit = 50 } = req.query;

    const [vitalsAlerts, labAlerts] = await Promise.all([
      getActiveAlerts(organizationId, {
        admissionId: admissionId ? parseInt(admissionId) : undefined,
        severity
      }),
      sequelize.query(
        `SELECT id, patient_id, admission_id, rule_id, rule_name, severity, title, message,
                guideline, lab_values, status, created_at, acknowledged_at
         FROM lab_rule_alerts
         WHERE organization_id = :orgId
           ${patientId ? 'AND patient_id = :patientId' : ''}
           ${severity  ? 'AND severity = :severity'    : ''}
           AND status = 'active'
         ORDER BY created_at DESC
         LIMIT :lim`,
        {
          replacements: { orgId: organizationId, patientId: patientId ? parseInt(patientId) : null, severity: severity || null, lim: parseInt(limit) },
          type: QueryTypes.SELECT
        }
      ).catch(() => [])
    ]);

    const combined = [
      ...vitalsAlerts.map(a => ({ ...a, source: 'vitals_ews' })),
      ...labAlerts.map(a => ({ ...a, source: 'lab_cdss' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(0, parseInt(limit));

    res.json({ success: true, count: combined.length, data: combined });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

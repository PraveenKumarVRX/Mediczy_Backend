/**
 * HyperGrid Connector Factory API
 *
 * Provides adapter templates, mapping studio, and hospital packs
 * that turn integration into a repeatable product.
 *
 * GET    /api/hypergrid/connectors/templates          List adapter templates
 * GET    /api/hypergrid/connectors/templates/:id      Get template detail
 * POST   /api/hypergrid/connectors/packs              Apply a hospital pack
 * GET    /api/hypergrid/connectors/packs              List available hospital packs
 * POST   /api/hypergrid/connectors/mappings           Create field mapping
 * GET    /api/hypergrid/connectors/mappings           List tenant mappings
 * PUT    /api/hypergrid/connectors/mappings/:id       Update mapping
 * DELETE /api/hypergrid/connectors/mappings/:id       Delete mapping
 * POST   /api/hypergrid/connectors/mappings/test      Test a mapping against sample data
 * POST   /api/hypergrid/connectors/connectors         Register integration connector
 * GET    /api/hypergrid/connectors/connectors         List connectors
 * PATCH  /api/hypergrid/connectors/connectors/:id/status  Enable/disable connector
 * POST   /api/hypergrid/connectors/certify            Run certification harness
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';
import { resolveConcept }        from '../services/hypergrid-terminology.service.js';

const router = express.Router();

const ensureEquipmentInventoryTable = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hg_equipment_inventory (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, equipment_class VARCHAR(120) NOT NULL,
      device_name VARCHAR(200) NOT NULL, manufacturer VARCHAR(160), model VARCHAR(160), serial_number VARCHAR(160),
      department VARCHAR(160), location VARCHAR(160), protocol VARCHAR(80), owner_department VARCHAR(120),
      integration_status VARCHAR(32) NOT NULL DEFAULT 'identified', connector_id INTEGER, notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
};

// ── Built-in adapter templates ────────────────────────────────────────────────
const ADAPTER_TEMPLATES = [
  {
    id: 'his-hl7v2', name: 'HIS — HL7 v2', category: 'HIS',
    description: 'Hospital Information System via HL7 v2 ADT/ORU/ORM messages.',
    protocols: ['HL7v2'], canonicalMappings: ['PatientAdmitted', 'LabResultAvailable', 'DischargePlanned'],
    requiredFields: ['hl7Host', 'hl7Port', 'facilityId'],
  },
  {
    id: 'lis-fhir', name: 'LIS — FHIR R4', category: 'LIS',
    description: 'Laboratory Information System via FHIR R4 DiagnosticReport.',
    protocols: ['FHIR R4'], canonicalMappings: ['LabResultAvailable', 'LabOrderCreated'],
    requiredFields: ['fhirBaseUrl', 'clientId', 'clientSecret'],
  },
  {
    id: 'pacs-dicomweb', name: 'PACS — DICOMweb', category: 'RIS/PACS',
    description: 'Picture Archiving via STOW-RS / WADO-RS / QIDO-RS.',
    protocols: ['DICOMweb'], canonicalMappings: ['ImagingStudyStored', 'ImagingStudyCompleted'],
    requiredFields: ['wadoUrl', 'stowUrl', 'qidoUrl'],
  },
  {
    id: 'tpa-rest', name: 'TPA — REST/HTTPS', category: 'TPA',
    description: 'Third-party administrator claims pre-auth and adjudication API.',
    protocols: ['REST/HTTPS'], canonicalMappings: ['ClaimPreAuthSubmitted', 'ClaimStatusUpdated'],
    requiredFields: ['apiBaseUrl', 'apiKey', 'tpaCode'],
  },
  {
    id: 'iot-mqtt', name: 'IoT Gateway — MQTT', category: 'IoT',
    description: 'Medical device gateway publishing via MQTT topics.',
    protocols: ['MQTT'], canonicalMappings: ['VitalsObserved', 'DeviceAlertRaised', 'TelemetryReceived'],
    requiredFields: ['mqttBrokerUrl', 'deviceKey', 'apiSecret'],
  },
  {
    id: 'rfid-rtls', name: 'RFID/RTLS Asset Tracking', category: 'Asset',
    description: 'Real-time location system for assets and staff.',
    protocols: ['MQTT', 'REST'], canonicalMappings: ['AssetLocationUpdate', 'RFIDAssetMoved'],
    requiredFields: ['rtlsApiUrl', 'facilityMap'],
  },
  {
    id: 'pharmacy-rest', name: 'Pharmacy — REST', category: 'Pharmacy',
    description: 'Pharmacy system for dispensing and drug inventory.',
    protocols: ['REST/HTTPS'], canonicalMappings: ['PrescriptionDispensed', 'DrugInventoryUpdated'],
    requiredFields: ['apiBaseUrl', 'pharmacyCode'],
  },
  {
    id: 'ambulance-gps', name: 'Ambulance — GPS/MQTT', category: 'Ambulance',
    description: 'Ambulance fleet GPS telemetry and en-route vitals.',
    protocols: ['MQTT', 'REST'], canonicalMappings: ['AmbulanceEnRoute', 'VitalsObserved'],
    requiredFields: ['mqttBrokerUrl', 'fleetId'],
  },
];

// Built-in hospital packs
const HOSPITAL_PACKS = [
  { id: 'nabh-general',  name: 'NABH General Hospital',   templateIds: ['his-hl7v2', 'lis-fhir', 'pacs-dicomweb', 'tpa-rest'] },
  { id: 'apollo-chain',  name: 'Apollo-style Chain',       templateIds: ['his-hl7v2', 'lis-fhir', 'pacs-dicomweb', 'tpa-rest', 'iot-mqtt'] },
  { id: 'oncology',      name: 'Oncology Speciality',      templateIds: ['his-hl7v2', 'lis-fhir', 'pacs-dicomweb'] },
  { id: 'maternity',     name: 'Maternity / OBG',          templateIds: ['his-hl7v2', 'lis-fhir', 'iot-mqtt'] },
  { id: 'insurer-tpa',   name: 'Insurer + TPA',            templateIds: ['tpa-rest'] },
  { id: 'ambulance',     name: 'Ambulance Network',        templateIds: ['ambulance-gps', 'iot-mqtt'] },
  { id: 'rural-clinic',  name: 'Rural Clinic (minimal)',   templateIds: ['his-hl7v2'] },
];


const EQUIPMENT_INTEGRATION_CATALOG = [
  { id: 'bedside-monitor', name: 'Bedside / multiparameter monitor', category: 'Critical Care', protocols: ['MQTT', 'HL7v2', 'IEEE 11073'], canonicalEvents: ['VitalsObserved', 'DeviceAlertRaised'], coverage: 'supported' },
  { id: 'ventilator', name: 'Ventilator', category: 'Critical Care', protocols: ['MQTT', 'HL7v2'], canonicalEvents: ['VentilatorTelemetryReceived', 'DeviceAlertRaised'], coverage: 'supported' },
  { id: 'infusion-pump', name: 'Infusion pump', category: 'Medication Delivery', protocols: ['MQTT', 'REST'], canonicalEvents: ['InfusionTelemetryReceived', 'DeviceAlertRaised'], coverage: 'supported' },
  { id: 'ecg', name: 'ECG machine', category: 'Diagnostics', protocols: ['DICOM', 'HL7v2'], canonicalEvents: ['DiagnosticResultAvailable'], coverage: 'supported' },
  { id: 'lab-analyzer', name: 'Laboratory analyzer', category: 'Laboratory', protocols: ['HL7v2', 'FHIR R4', 'ASTM'], canonicalEvents: ['LabResultAvailable'], coverage: 'supported' },
  { id: 'ct-mri-xray', name: 'CT / MRI / X-ray / ultrasound', category: 'Imaging', protocols: ['DICOMweb', 'DICOM MWL'], canonicalEvents: ['ImagingStudyStored', 'ImagingStudyCompleted'], coverage: 'supported' },
  { id: 'dialysis', name: 'Dialysis machine', category: 'Renal', protocols: ['MQTT', 'HL7v2'], canonicalEvents: ['TreatmentTelemetryReceived'], coverage: 'adapter_ready' },
  { id: 'anesthesia', name: 'Anesthesia workstation', category: 'OT', protocols: ['HL7v2', 'MQTT'], canonicalEvents: ['AnesthesiaTelemetryReceived'], coverage: 'adapter_ready' },
  { id: 'sterilizer', name: 'Autoclave / sterilizer', category: 'CSSD', protocols: ['MQTT', 'REST'], canonicalEvents: ['SterilizationCycleUpdated'], coverage: 'adapter_ready' },
  { id: 'blood-bank', name: 'Blood-bank refrigerator / agitator', category: 'Blood Bank', protocols: ['MQTT', 'REST'], canonicalEvents: ['TemperatureObserved', 'DeviceAlertRaised'], coverage: 'adapter_ready' },
  { id: 'smart-bed', name: 'Smart bed / nurse call', category: 'Ward', protocols: ['MQTT', 'REST'], canonicalEvents: ['BedStateChanged', 'NurseCallRaised'], coverage: 'adapter_ready' },
  { id: 'rtls-rfid', name: 'RFID / RTLS / BLE tags', category: 'Asset Tracking', protocols: ['MQTT', 'REST'], canonicalEvents: ['AssetLocationUpdate'], coverage: 'supported' },
  { id: 'wearables', name: 'Wearables and home monitors', category: 'Remote Monitoring', protocols: ['REST', 'FHIR R4'], canonicalEvents: ['VitalsObserved'], coverage: 'supported' },
  { id: 'proprietary-device', name: 'Vendor-proprietary equipment', category: 'Custom', protocols: ['Vendor SDK', 'File Drop', 'Serial Bridge'], canonicalEvents: ['MappedPerVendor'], coverage: 'requires_vendor_adapter' },
];

// ── Get adapter templates ─────────────────────────────────────────────────────
router.get('/templates', authUser, (req, res) => {
  const { category } = req.query;
  const templates    = category
    ? ADAPTER_TEMPLATES.filter(t => t.category === category)
    : ADAPTER_TEMPLATES;
  res.json({ success: true, templates });
});

router.get('/templates/:id', authUser, (req, res) => {
  const tpl = ADAPTER_TEMPLATES.find(t => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, template: tpl });
});

// ── Hospital packs ────────────────────────────────────────────────────────────
router.get('/packs', authUser, (req, res) => {
  res.json({ success: true, packs: HOSPITAL_PACKS });
});


router.get('/equipment/catalog', authUser, (req, res) => {
  const { category, coverage } = req.query;
  const equipment = EQUIPMENT_INTEGRATION_CATALOG.filter((item) =>
    (!category || item.category === category) && (!coverage || item.coverage === coverage)
  );
  res.json({ success: true, equipment });
});

router.get('/equipment/coverage', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const tenantId = req.user.tenantId || req.user.id;
    const connectors = await pool.query(`SELECT connector_type, template_id, status FROM hg_connectors WHERE tenant_id=$1`, [tenantId]);
    const devices = await pool.query(`SELECT device_type, COUNT(*)::int AS count FROM hg_devices WHERE tenant_id=$1 AND active=TRUE GROUP BY device_type`, [tenantId]);
    const connectorTypes = new Set(connectors.rows.map((row) => String(row.connector_type || '').toLowerCase()));
    const deviceTypes = new Set(devices.rows.map((row) => String(row.device_type || '').toLowerCase()));
    const equipment = EQUIPMENT_INTEGRATION_CATALOG.map((item) => {
      const normalizedId = item.id.replace(/-/g, '_');
      const connected = deviceTypes.has(normalizedId)
        || item.protocols.some((protocol) => connectorTypes.has(protocol.toLowerCase()))
        || (item.category === 'Imaging' && connectorTypes.has('ris/pacs'))
        || (item.category === 'Laboratory' && connectorTypes.has('lis'));
      return { ...item, connected };
    });
    res.json({
      success: true,
      summary: {
        totalClasses: equipment.length,
        connectedClasses: equipment.filter((item) => item.connected).length,
        supportedClasses: equipment.filter((item) => item.coverage === 'supported').length,
        adapterReadyClasses: equipment.filter((item) => item.coverage === 'adapter_ready').length,
        vendorAdapterClasses: equipment.filter((item) => item.coverage === 'requires_vendor_adapter').length,
      },
      equipment,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to build equipment coverage' });
  }
});

router.get('/equipment/inventory', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    await ensureEquipmentInventoryTable(pool);
    const { status, department } = req.query;
    const { rows } = await pool.query(`SELECT * FROM hg_equipment_inventory WHERE tenant_id=$1 AND ($2::text IS NULL OR integration_status=$2) AND ($3::text IS NULL OR department=$3) ORDER BY created_at DESC`, [req.user.tenantId || req.user.id, status || null, department || null]);
    res.json({ success: true, equipment: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to list equipment inventory' });
  }
});
router.post('/equipment/inventory', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    await ensureEquipmentInventoryTable(pool);
    const { equipmentClass, deviceName, manufacturer, model, serialNumber, department, location, protocol, ownerDepartment, notes } = req.body;
    if (!equipmentClass || !deviceName) return res.status(400).json({ success: false, message: 'equipmentClass and deviceName required' });
    const { rows } = await pool.query(`INSERT INTO hg_equipment_inventory (tenant_id, equipment_class, device_name, manufacturer, model, serial_number, department, location, protocol, owner_department, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [req.user.tenantId || req.user.id, equipmentClass, deviceName, manufacturer || null, model || null, serialNumber || null, department || null, location || null, protocol || null, ownerDepartment || null, notes || null]);
    res.status(201).json({ success: true, equipment: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to register equipment' });
  }
});
router.patch('/equipment/inventory/:id', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const VALID = ['identified', 'protocol_confirmed', 'mapped', 'certified', 'active', 'blocked'];
    const { integrationStatus, protocol, connectorId, ownerDepartment, notes } = req.body;
    if (integrationStatus && !VALID.includes(integrationStatus)) return res.status(400).json({ success: false, message: `integrationStatus must be: ${VALID.join(', ')}` });
    const pool = await connectPostgres();
    await ensureEquipmentInventoryTable(pool);
    const { rows } = await pool.query(`UPDATE hg_equipment_inventory SET integration_status=COALESCE($3,integration_status), protocol=COALESCE($4,protocol), connector_id=COALESCE($5,connector_id), owner_department=COALESCE($6,owner_department), notes=COALESCE($7,notes), updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`, [req.params.id, req.user.tenantId || req.user.id, integrationStatus || null, protocol || null, connectorId || null, ownerDepartment || null, notes || null]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Equipment not found' });
    res.json({ success: true, equipment: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update equipment' });
  }
});
router.get('/equipment/rollout', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    await ensureEquipmentInventoryTable(pool);
    const { rows } = await pool.query(`SELECT integration_status, COUNT(*)::int AS count FROM hg_equipment_inventory WHERE tenant_id=$1 GROUP BY integration_status`, [req.user.tenantId || req.user.id]);
    const byStatus = Object.fromEntries(rows.map((row) => [row.integration_status, row.count]));
    res.json({ success: true, data: { byStatus, nextSteps: [
      'Register every physical device model in inventory',
      'Confirm protocol or vendor interface for each model',
      'Map data fields to canonical events',
      'Certify connector with live sample payloads',
      'Activate and monitor in production'
    ] } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to build rollout summary' });
  }
});

router.post('/packs', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { packId, config = {} } = req.body;
    if (!packId) return res.status(400).json({ success: false, message: 'packId required' });
    const pack = HOSPITAL_PACKS.find(p => p.id === packId);
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found' });

    const pool     = await connectPostgres();
    const tenantId = req.user.tenantId || req.user.id;
    const applied  = [];

    for (const tplId of pack.templateIds) {
      const tpl = ADAPTER_TEMPLATES.find(t => t.id === tplId);
      if (!tpl) continue;
      await pool.query(
        `INSERT INTO hg_connectors
           (connector_type, template_id, name, config, tenant_id, status, created_at)
         VALUES ($1,$2,$3,$4,$5,'configured',NOW())
         ON CONFLICT (template_id, tenant_id) DO NOTHING`,
        [tpl.category, tpl.id, tpl.name, JSON.stringify({ ...config, templateDefaults: tpl.requiredFields }), tenantId]
      );
      applied.push(tpl.name);
    }

    res.json({ success: true, pack: pack.name, connectors: applied,
      message: `Pack applied. Configure each connector's credentials to go live.` });
  } catch (err) {
    console.error('[Connector Factory] Pack error:', err);
    res.status(500).json({ success: false, message: 'Failed to apply pack' });
  }
});

// ── Field mappings ────────────────────────────────────────────────────────────
router.post('/mappings', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { connectorId, sourceField, targetCanonicalField, transformType,
            transformConfig, unit, validationRule, description } = req.body;
    if (!sourceField || !targetCanonicalField)
      return res.status(400).json({ success: false, message: 'sourceField and targetCanonicalField required' });
    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_field_mappings
         (connector_id, source_field, target_canonical_field, transform_type,
          transform_config, unit, validation_rule, description, tenant_id, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,NOW())
       RETURNING *`,
      [connectorId || null, sourceField, targetCanonicalField,
       transformType || 'passthrough', JSON.stringify(transformConfig || {}),
       unit || null, validationRule || null, description || null,
       req.user.tenantId || req.user.id]
    );
    res.status(201).json({ success: true, mapping: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create mapping' });
  }
});

router.get('/mappings', authUser, async (req, res) => {
  try {
    const { connectorId } = req.query;
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT * FROM hg_field_mappings
       WHERE tenant_id = $1
         AND ($2::int IS NULL OR connector_id = $2)
         AND active = TRUE
       ORDER BY created_at DESC`,
      [req.user.tenantId || req.user.id, connectorId ? parseInt(connectorId) : null]
    );
    res.json({ success: true, mappings: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list mappings' });
  }
});

router.put('/mappings/:id', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { transformType, transformConfig, unit, validationRule, description } = req.body;
    const pool = await connectPostgres();
    const r    = await pool.query(
      `UPDATE hg_field_mappings
       SET transform_type   = COALESCE($3, transform_type),
           transform_config = COALESCE($4, transform_config),
           unit             = COALESCE($5, unit),
           validation_rule  = COALESCE($6, validation_rule),
           description      = COALESCE($7, description),
           updated_at       = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.user.tenantId || req.user.id,
       transformType || null, transformConfig ? JSON.stringify(transformConfig) : null,
       unit || null, validationRule || null, description || null]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Mapping not found' });
    res.json({ success: true, mapping: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update mapping' });
  }
});

router.delete('/mappings/:id', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_field_mappings SET active = FALSE WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.tenantId || req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete mapping' });
  }
});

// ── Test a mapping ────────────────────────────────────────────────────────────
router.post('/mappings/test', authUser, async (req, res) => {
  try {
    const { sourceField, targetCanonicalField, transformType, sampleValue, unit } = req.body;
    if (!sourceField || sampleValue === undefined)
      return res.status(400).json({ success: false, message: 'sourceField and sampleValue required' });

    let transformedValue = sampleValue;
    let resolvedConcept  = null;

    if (transformType === 'terminology') {
      resolvedConcept  = await resolveConcept(String(sampleValue));
      transformedValue = resolvedConcept?.snomedCode || sampleValue;
    } else if (transformType === 'unit_convert' && unit) {
      // Simple unit awareness (extend with full unit library as needed)
      transformedValue = { value: sampleValue, unit, canonical: unit };
    }

    res.json({
      success: true,
      input:  { field: sourceField, value: sampleValue },
      output: { field: targetCanonicalField, value: transformedValue },
      resolvedConcept,
      valid: transformedValue !== null && transformedValue !== undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Test failed' });
  }
});

// ── Register integration connector ───────────────────────────────────────────
router.post('/connectors', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { name, connectorType, templateId, config, description } = req.body;
    if (!name || !connectorType)
      return res.status(400).json({ success: false, message: 'name and connectorType required' });
    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_connectors
         (name, connector_type, template_id, config, description, tenant_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',NOW())
       RETURNING *`,
      [name, connectorType, templateId || null, JSON.stringify(config || {}),
       description || null, req.user.tenantId || req.user.id]
    );
    res.status(201).json({ success: true, connector: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to register connector' });
  }
});

router.get('/connectors', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT id, name, connector_type, template_id, status, description, created_at
       FROM hg_connectors WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user.tenantId || req.user.id]
    );
    res.json({ success: true, connectors: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list connectors' });
  }
});

router.patch('/connectors/:id/status', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ['draft', 'configured', 'certified', 'active', 'disabled'];
    if (!VALID.includes(status))
      return res.status(400).json({ success: false, message: `status must be: ${VALID.join(', ')}` });
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_connectors SET status = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.tenantId || req.user.id, status]
    );
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update connector status' });
  }
});

// ── Certification harness ─────────────────────────────────────────────────────
router.post('/certify', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { connectorId } = req.body;
    if (!connectorId)
      return res.status(400).json({ success: false, message: 'connectorId required' });

    const pool      = await connectPostgres();
    const connR     = await pool.query(
      `SELECT * FROM hg_connectors WHERE id = $1 AND tenant_id = $2`,
      [connectorId, req.user.tenantId || req.user.id]
    );
    if (!connR.rows[0])
      return res.status(404).json({ success: false, message: 'Connector not found' });

    const connector = connR.rows[0];
    const checks    = [];
    let passed      = 0;

    // Certification checks
    const tests = [
      { name: 'Connector has a name',        pass: !!connector.name },
      { name: 'Connector type specified',    pass: !!connector.connector_type },
      { name: 'Config not empty',            pass: Object.keys(JSON.parse(connector.config || '{}')).length > 0 },
      { name: 'Template matched',            pass: !!connector.template_id },
      { name: 'At least one field mapping',  pass: false }, // checked below
    ];

    const mappings = await pool.query(
      `SELECT COUNT(*) FROM hg_field_mappings WHERE connector_id = $1 AND active = TRUE`,
      [connectorId]
    );
    tests[4].pass = parseInt(mappings.rows[0].count) > 0;

    for (const t of tests) {
      checks.push({ test: t.name, result: t.pass ? 'PASS' : 'FAIL' });
      if (t.pass) passed++;
    }

    const certified = passed === tests.length;
    if (certified) {
      await pool.query(
        `UPDATE hg_connectors SET status = 'certified', updated_at = NOW() WHERE id = $1`,
        [connectorId]
      );
    }

    res.json({
      success:      true,
      connectorId,
      certified,
      score:        `${passed}/${tests.length}`,
      checks,
      recommendation: certified
        ? 'Connector is certified. Set status to "active" to start processing.'
        : 'Fix the failing checks before going live.',
    });
  } catch (err) {
    console.error('[Connector] Certify error:', err);
    res.status(500).json({ success: false, message: 'Certification failed' });
  }
});

export default router;

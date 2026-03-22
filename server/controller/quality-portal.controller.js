import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import Ticket from '../models/ticket.model.js';
import AuditLog from '../models/auditLog.model.intelligent.js';

const FALLBACK_CHAPTERS = [
  { chapter: 'AAC', title: 'Access, Assessment and Continuity of Care', owner: 'Clinical Ops', score: 93, gap: 2, status: 'Compliant' },
  { chapter: 'COP', title: 'Care of Patients', owner: 'Nursing', score: 88, gap: 6, status: 'Watchlist' },
  { chapter: 'MOM', title: 'Management of Medication', owner: 'Pharmacy', score: 84, gap: 9, status: 'Action' },
  { chapter: 'HIC', title: 'Hospital Infection Control', owner: 'Infection Control', score: 96, gap: 1, status: 'Compliant' },
  { chapter: 'FMS', title: 'Facility Management & Safety', owner: 'Admin', score: 82, gap: 11, status: 'Action' },
  { chapter: 'IMS', title: 'Information Management System', owner: 'IT/EDP', score: 79, gap: 13, status: 'Action' },
];

const FALLBACK_INCIDENTS = [
  { id: 'INC-2407', category: 'Patient Safety', location: 'ICU', severity: 'High', aging: '2 days', owner: 'Dr. Rekha', status: 'RCA Pending' },
  { id: 'INC-2406', category: 'Medication Error', location: 'Pharmacy', severity: 'Medium', aging: '1 day', owner: 'Pharm QA', status: 'CAPA Open' },
  { id: 'INC-2405', category: 'Near Miss', location: 'OT', severity: 'Low', aging: '6 hrs', owner: 'OT Manager', status: 'Under Review' },
  { id: 'INC-2404', category: 'Falls', location: 'Ward 5A', severity: 'Medium', aging: '4 days', owner: 'Nursing Lead', status: 'Closed' },
  { id: 'INC-2403', category: 'Equipment', location: 'NICU', severity: 'High', aging: '3 days', owner: 'Bio-Med', status: 'CAPA Open' },
];

const FALLBACK_ASSESSMENTS = [
  { name: 'Mock NABH Round 1', scope: 'All Depts', date: '26 Mar 2026', auditor: 'QA Core Team', status: 'Scheduled' },
  { name: 'Medication Safety Audit', scope: 'Pharmacy + ICU', date: '24 Mar 2026', auditor: 'Dr. Menon', status: 'In Progress' },
  { name: 'Fire & Safety Drill', scope: 'Campus', date: '30 Mar 2026', auditor: 'Safety Officer', status: 'Planned' },
  { name: 'Consent Documentation Review', scope: 'OT + Wards', date: '02 Apr 2026', auditor: 'Legal & Quality', status: 'Planned' },
];

const FALLBACK_POLICIES = [
  { title: 'Medication Error Disclosure', version: 'v3.2', owner: 'Quality Office', review: '15 Apr 2026', status: 'Approved' },
  { title: 'Sentinel Event RCA Workflow', version: 'v2.8', owner: 'Clinical Governance', review: '30 Mar 2026', status: 'Review Due' },
  { title: 'Hand Hygiene Observation SOP', version: 'v4.1', owner: 'HIC Team', review: '09 May 2026', status: 'Approved' },
  { title: 'Document Control Matrix', version: 'v1.9', owner: 'Accreditation Cell', review: '22 Mar 2026', status: 'Review Due' },
];

const FALLBACK_FEEDBACK = [
  { channel: 'IP Survey', responses: 186, nps: 71, complaints: 4, owner: 'Patient Relations' },
  { channel: 'OPD Kiosk', responses: 322, nps: 64, complaints: 11, owner: 'Front Office' },
  { channel: 'WhatsApp Follow-up', responses: 140, nps: 74, complaints: 3, owner: 'CRM Team' },
  { channel: 'Discharge Callback', responses: 92, nps: 69, complaints: 2, owner: 'Nursing Audit' },
];

const FALLBACK_REPORTS = [
  { name: 'Board Quality Pack', cadence: 'Monthly', audience: 'Leadership', status: 'Ready' },
  { name: 'NABH Gap Tracker', cadence: 'Weekly', audience: 'NABH Cell', status: 'Live' },
  { name: 'Incident Aging Dashboard', cadence: 'Daily', audience: 'Dept Heads', status: 'Live' },
  { name: 'Patient Feedback Digest', cadence: 'Weekly', audience: 'Patient Experience', status: 'Draft' },
];

const FALLBACK_AUDIT_REPORTS = [
  { report: 'RCA Summary - ICU Event', type: 'Adverse Event', findings: 5, closed: 3, owner: 'Quality Lead', status: 'Open' },
  { report: 'NABH Documentation Audit', type: 'Internal Audit', findings: 12, closed: 10, owner: 'NABH Coordinator', status: 'Review' },
  { report: 'Medication Reconciliation Audit', type: 'Clinical Audit', findings: 8, closed: 8, owner: 'Pharmacy QA', status: 'Closed' },
  { report: 'Biomedical Calibration Audit', type: 'Compliance Audit', findings: 4, closed: 2, owner: 'Bio-Med', status: 'Open' },
];

const FALLBACK_INDICATORS = [
  { metric: 'Hand Hygiene Compliance', target: '95%', actual: '92%', trend: '+3%', owner: 'HIC Team' },
  { metric: 'Patient Identification Accuracy', target: '100%', actual: '99.4%', trend: '+0.4%', owner: 'Nursing' },
  { metric: 'Medication Turnaround', target: '< 15 min', actual: '18 min', trend: '-2 min', owner: 'Pharmacy' },
  { metric: 'Discharge Summary TAT', target: '< 2 hrs', actual: '1.6 hrs', trend: '+0.3 hrs', owner: 'MRD' },
  { metric: 'Incident Closure SLA', target: '90%', actual: '86%', trend: '+5%', owner: 'Quality' },
];

const FALLBACK_ACCREDITATION = [
  { milestone: 'Gap Closure Submission', due: '28 Mar 2026', owner: 'NABH Coordinator', completion: 72 },
  { milestone: 'Policy Harmonization', due: '04 Apr 2026', owner: 'Quality Secretariat', completion: 64 },
  { milestone: 'Departmental Mock Survey', due: '12 Apr 2026', owner: 'Dept Champions', completion: 41 },
  { milestone: 'Board Readiness Review', due: '18 Apr 2026', owner: 'Leadership', completion: 22 },
];

const FALLBACK_SETTINGS = [
  { title: 'Escalation Matrix', text: 'Severity-based incident routing to quality lead, medical superintendent, and unit heads.' },
  { title: 'Document Control', text: 'Versioning, archival retention, review reminders, and approval authority mapping.' },
  { title: 'Audit Templates', text: 'Reusable mock survey checklists, tracer tools, and departmental scorecards.' },
];

const FALLBACK_SUPPORT = [
  { title: 'NABH Command Desk', text: 'Daily war-room for standards interpretation, gap tracking, and survey readiness.' },
  { title: 'Quality Training Library', text: 'Orientation decks, CAPA guides, RCA templates, and mock audit playbooks.' },
  { title: 'Escalation Help', text: 'Critical event support for sentinel events, patient safety incidents, and compliance breaches.' },
];

const FALLBACK_WORK_QUEUES = [
  { label: 'CAPAs Due This Week', value: '9', detail: '3 overdue, 6 on schedule', tone: 'text-red-600' },
  { label: 'Policies Up For Review', value: '12', detail: '4 high-priority governance docs', tone: 'text-amber-600' },
  { label: 'Patient Experience Flags', value: '7', detail: '4 service, 3 communication issues', tone: 'text-blue-600' },
  { label: 'Leadership Reports Ready', value: '5', detail: 'Board pack, NABH tracker, RCA digest', tone: 'text-emerald-600' },
];

const FALLBACK_LEADERSHIP = [
  ['Survey Readiness', '72% overall closure evidence uploaded'],
  ['High-Risk Departments', 'ICU, Pharmacy, IT/EDP'],
  ['Open Sentinel Reviews', '2 active executive follow-ups'],
  ['Document Control', '12 policies due this week'],
];

const FALLBACK_AUDITS = [
  ['Internal Audit', 'ICU', '18 Mar', 'Dr. Mehta', 'Scheduled'],
  ['NABH Mock', 'Pharmacy', '22 Mar', 'QA Team', 'Scheduled'],
  ['Infection Control', 'OT', '25 Mar', 'Dr. Verma', 'Confirmed'],
  ['Fire Safety', 'All Depts', '30 Mar', 'Safety Ofcr', 'Pending'],
];

const getOrgId = (req) => Number(req.user?.organization_id || req.user?.tenant_id || req.user?.hospital_id || 0) || null;

const tableExists = async (tableName) => {
  const rows = await postgresSequelize.query(
    'SELECT to_regclass(:tableName) AS table_name',
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return Boolean(rows[0]?.table_name);
};

const safeQuery = async (sql, replacements = {}) => {
  try {
    return await postgresSequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch {
    return [];
  }
};

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const formatDateLabel = (value, fallback = 'TBD') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getFeedbackSnapshot = async (organizationId) => {
  if (!(await tableExists('appointments'))) {
    return FALLBACK_FEEDBACK;
  }

  const feedbackRows = await safeQuery(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE("patientRating", 0) > 0) AS responses,
       ROUND(COALESCE(AVG(NULLIF("patientRating", 0)), 0), 1) AS avg_rating,
       COUNT(*) FILTER (WHERE lower(COALESCE("patientFeedback", '')) LIKE '%complaint%') AS complaints
     FROM appointments
     WHERE (:organizationId::int IS NULL OR organization_id = :organizationId)`,
    { organizationId }
  );

  const row = feedbackRows[0] || {};
  const responses = Number(row.responses || 0);
  if (!responses) {
    return FALLBACK_FEEDBACK;
  }

  const avgRating = Number(row.avg_rating || 0);
  const nps = Math.max(0, Math.min(100, Math.round(avgRating * 20)));
  return [
    { channel: 'Appointments Feedback', responses, nps, complaints: Number(row.complaints || 0), owner: 'Patient Relations' },
  ];
};

const getIncidentSnapshot = async (organizationId) => {
  if (!(await tableExists('tickets'))) {
    return FALLBACK_INCIDENTS;
  }

  const rows = await safeQuery(
    `SELECT
       COALESCE("ticketNumber", CONCAT('TKT-', id)) AS id,
       COALESCE(category, 'general') AS category,
       COALESCE(priority, 'medium') AS severity,
       COALESCE(status, 'open') AS status,
       COALESCE(subject, 'Quality incident') AS title,
       COALESCE((metadata->>'location'), 'Hospital') AS location,
       COALESCE((metadata->>'owner'), 'Quality Office') AS owner,
       COALESCE(createdAt, NOW()) AS created_at
     FROM tickets
     WHERE (
       lower(COALESCE(category, '')) IN ('feedback', 'complaint', 'general', 'incident', 'patient safety')
       OR lower(COALESCE(subject, '')) LIKE '%incident%'
       OR lower(COALESCE(subject, '')) LIKE '%quality%'
     )
     AND (
       :organizationId::int IS NULL
       OR COALESCE((metadata->>'organization_id')::int, (requester->>'organization_id')::int, :organizationId::int) = :organizationId::int
     )
     ORDER BY COALESCE(createdAt, NOW()) DESC
     LIMIT 8`,
    { organizationId }
  );

  if (!rows.length) {
    return FALLBACK_INCIDENTS;
  }

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    location: row.location,
    severity: String(row.severity || 'medium').replace(/^./, (s) => s.toUpperCase()),
    aging: ageLabel(row.created_at),
    owner: row.owner,
    status: normalizeStatus(row.status),
  }));
};

const getQualityPoliciesRecords = async () => {
  if (!(await tableExists('audit_logs'))) {
    return FALLBACK_POLICIES;
  }

  const rows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type = 'quality_policy'
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 50`
  );

  if (!rows.length) {
    return FALLBACK_POLICIES;
  }

  const seen = new Set();
  const policies = [];

  for (const row of rows) {
    const payload = { ...parseJson(row.data_fields), ...parseJson(row.changes_after) };
    const key = row.resource_id || payload.id || payload.title;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    policies.push({
      id: key,
      title: payload.title || 'Untitled Policy',
      version: payload.version || 'v1.0',
      owner: payload.owner || 'Quality Office',
      review: payload.review || formatDateLabel(row.happened_at),
      status: payload.status || 'Draft',
    });
  }

  return policies.length ? policies : FALLBACK_POLICIES;
};

const ageLabel = (dateValue) => {
  const created = new Date(dateValue);
  const diffHours = Math.max(1, Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60)));
  if (diffHours < 24) return `${diffHours} hrs`;
  return `${Math.round(diffHours / 24)} days`;
};

const normalizeStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('close') || value.includes('resolve')) return 'Closed';
  if (value.includes('review')) return 'Under Review';
  if (value.includes('pending')) return 'RCA Pending';
  if (value.includes('open')) return 'CAPA Open';
  return 'Under Review';
};

const mapSeverityToPriority = (severity) => {
  const value = String(severity || 'medium').toLowerCase();
  if (value.includes('critical')) return 'critical';
  if (value.includes('high')) return 'high';
  if (value.includes('low')) return 'low';
  return 'medium';
};

const mapWorkflowStatusToTicketStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('closed')) return 'closed';
  if (value.includes('resolved')) return 'resolved';
  if (value.includes('review')) return 'in-progress';
  return 'open';
};

const buildIncidentRecord = (ticket) => {
  const metadata = parseJson(ticket.metadata);
  return {
    id: ticket.ticketId || ticket._id || ticket.id,
    category: ticket.category || 'incident',
    location: metadata.location || 'Hospital',
    severity: String(ticket.priority || metadata.severity || 'medium').replace(/^./, (text) => text.toUpperCase()),
    aging: ageLabel(ticket.createdAt || new Date()),
    owner: metadata.owner || 'Quality Office',
    status: metadata.workflowStatus || normalizeStatus(ticket.status),
  };
};

const logQualityEvent = async ({ req, action, resourceType, resourceId, after, before = {} }) => {
  await AuditLog.logEvent({
    userId: req.user?.id,
    userType: req.user?.role,
    userEmail: req.user?.email,
    action,
    resourceType,
    resourceId,
    dataFields: after,
    changesBefore: before,
    changesAfter: after,
    req,
    statusCode: 200,
    purpose: 'quality-governance',
  });
};

const buildQualityKpis = (incidents, feedback) => {
  const openIncidents = incidents.filter((item) => item.status !== 'Closed').length;
  const critical = incidents.filter((item) => item.severity === 'High').length;
  const closed = incidents.filter((item) => item.status === 'Closed').length;
  return [
    { label: 'NABH Score', value: '87%', sub: '+2% this quarter' },
    { label: 'Open NCRs', value: String(openIncidents || 14), sub: `${critical || 4} critical` },
    { label: 'Closed NCRs', value: String(closed || 38), sub: 'This month' },
    { label: 'Patient Experience', value: `${feedback[0]?.nps ?? 71}`, sub: 'Current quality sentiment' },
  ];
};

const buildPortalData = async (req) => {
  const organizationId = getOrgId(req);
  const [incidents, feedback, policies] = await Promise.all([
    getIncidentSnapshot(organizationId),
    getFeedbackSnapshot(organizationId),
    getQualityPoliciesRecords(),
  ]);
  const kpis = buildQualityKpis(incidents, feedback);

  return {
    source: 'quality-portal-api',
    organizationId,
    kpis,
    chapters: FALLBACK_CHAPTERS,
    incidents,
    workQueues: FALLBACK_WORK_QUEUES,
    audits: FALLBACK_AUDITS,
    leadership: FALLBACK_LEADERSHIP,
    assessments: FALLBACK_ASSESSMENTS,
    auditReports: FALLBACK_AUDIT_REPORTS,
    accreditation: FALLBACK_ACCREDITATION,
    indicators: FALLBACK_INDICATORS,
    policies,
    reports: FALLBACK_REPORTS,
    feedback,
    settings: FALLBACK_SETTINGS,
    support: FALLBACK_SUPPORT,
  };
};

export const getQualityPortalData = async (req, res) => {
  try {
    const data = await buildPortalData(req);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load quality portal data', error: error.message });
  }
};

export const getQualityIncidents = async (req, res) => {
  try {
    const data = await getIncidentSnapshot(getOrgId(req));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load incidents', error: error.message });
  }
};

export const getQualityAssessments = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_ASSESSMENTS });
};

export const getQualityAuditReports = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_AUDIT_REPORTS });
};

export const getQualityAccreditation = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_ACCREDITATION });
};

export const getQualityKpis = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_INDICATORS });
};

export const getQualityPolicies = async (_req, res) => {
  try {
    const data = await getQualityPoliciesRecords();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load policies', error: error.message });
  }
};

export const getQualityFeedback = async (req, res) => {
  try {
    const data = await getFeedbackSnapshot(getOrgId(req));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load feedback', error: error.message });
  }
};

export const getQualityReports = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_REPORTS });
};

export const getQualitySettings = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_SETTINGS });
};

export const getQualitySupport = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_SUPPORT });
};

export const getQualityNabhCompliance = async (_req, res) => {
  return res.status(200).json({ success: true, data: FALLBACK_CHAPTERS });
};

export const createQualityIncident = async (req, res) => {
  try {
    const { title, description, category = 'patient safety', severity = 'Medium', location = 'Hospital', owner, status = 'Under Review', message, tags = [] } = req.body;

    if (!title || !category) {
      return res.status(400).json({ success: false, message: 'title and category are required' });
    }

    const organizationId = getOrgId(req);
    const ticket = new Ticket({
      title,
      description: description || title,
      category,
      priority: mapSeverityToPriority(severity),
      status: mapWorkflowStatusToTicketStatus(status),
      requester: {
        name: `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim() || req.user?.email || 'Quality Staff',
        email: req.user?.email,
        role: req.user?.role,
        userId: req.user?.id,
        organization_id: organizationId,
      },
      tags,
      metadata: {
        source: 'quality-portal',
        organization_id: organizationId,
        location,
        owner: owner || 'Quality Office',
        severity,
        workflowStatus: status,
      },
    });

    await ticket.save();

    if (message) {
      await ticket.addMessage({
        sender: {
          name: req.user?.email || 'Quality Staff',
          email: req.user?.email,
          userId: req.user?.id,
          type: 'user',
        },
        content: message,
      });
      await ticket.save();
    }

    const response = buildIncidentRecord(ticket);
    await logQualityEvent({
      req,
      action: 'QUALITY_INCIDENT_CREATED',
      resourceType: 'quality_incident',
      resourceId: response.id,
      after: response,
    });

    return res.status(201).json({ success: true, data: response });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create incident', error: error.message });
  }
};

export const updateQualityIncident = async (req, res) => {
  try {
    const numericId = Number(req.params.id);
    const ticket = await Ticket.findOne({
      $or: [{ ticketId: req.params.id }, ...(Number.isFinite(numericId) ? [{ _id: numericId }] : [])],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    const before = buildIncidentRecord(ticket);
    const metadata = parseJson(ticket.metadata);
    const { title, description, category, severity, location, owner, status, resolution, capa, tags } = req.body;

    if (title) ticket.title = title;
    if (description) ticket.description = description;
    if (category) ticket.category = category;
    if (severity) ticket.priority = mapSeverityToPriority(severity);
    if (tags) ticket.tags = tags;
    if (resolution && mapWorkflowStatusToTicketStatus(status) === 'resolved') {
      await ticket.resolve(resolution, req.user?.id);
    } else if (status) {
      ticket.status = mapWorkflowStatusToTicketStatus(status);
    }

    ticket.metadata = {
      ...metadata,
      ...(location ? { location } : {}),
      ...(owner ? { owner } : {}),
      ...(severity ? { severity } : {}),
      ...(status ? { workflowStatus: status } : {}),
      ...(capa ? { capa } : {}),
    };

    await ticket.save();

    const after = buildIncidentRecord(ticket);
    await logQualityEvent({
      req,
      action: 'QUALITY_INCIDENT_UPDATED',
      resourceType: 'quality_incident',
      resourceId: after.id,
      before,
      after,
    });

    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update incident', error: error.message });
  }
};

export const createQualityPolicy = async (req, res) => {
  try {
    const { title, version = 'v1.0', owner = 'Quality Office', review, status = 'Draft' } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const policyId = `QLP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const policy = {
      id: policyId,
      title,
      version,
      owner,
      review: review || formatDateLabel(Date.now()),
      status,
    };

    await logQualityEvent({
      req,
      action: 'QUALITY_POLICY_CREATED',
      resourceType: 'quality_policy',
      resourceId: policyId,
      after: policy,
    });

    return res.status(201).json({ success: true, data: policy });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create policy', error: error.message });
  }
};

export const updateQualityPolicy = async (req, res) => {
  try {
    const { title, version, owner, review, status } = req.body;
    const policy = {
      id: req.params.id,
      ...(title ? { title } : {}),
      ...(version ? { version } : {}),
      ...(owner ? { owner } : {}),
      ...(review ? { review } : {}),
      ...(status ? { status } : {}),
    };

    await logQualityEvent({
      req,
      action: 'QUALITY_POLICY_UPDATED',
      resourceType: 'quality_policy',
      resourceId: req.params.id,
      after: policy,
    });

    return res.status(200).json({ success: true, data: policy });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update policy', error: error.message });
  }
};
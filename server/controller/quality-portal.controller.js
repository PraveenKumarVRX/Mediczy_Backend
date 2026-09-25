import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import Ticket from '../models/ticket.model.js';
import AuditLog from '../models/auditLog.model.intelligent.js';

const getOrgId = (req) => Number(req.user?.organization_id || req.user?.tenant_id || req.user?.hospital_id || 0) || null;

const tableExists = async (tableName) => {
  const rows = await postgresSequelize.query(
    'SELECT to_regclass(:tableName) AS table_name',
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return Boolean(rows[0]?.table_name);
};

const query = async (sql, replacements = {}) => (
  postgresSequelize.query(sql, { replacements, type: QueryTypes.SELECT })
);

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
  if (await tableExists('prems_responses')) {
    const premsRows = await query(
      `SELECT
         visit_type,
         COUNT(*) AS responses,
         ROUND(COALESCE(AVG(rating), 0), 1) AS avg_rating,
         COUNT(*) FILTER (WHERE negative_followup = TRUE) AS complaints
       FROM prems_responses
       WHERE (:organizationId::int IS NULL OR hospital_id = :organizationId)
       GROUP BY visit_type
       ORDER BY visit_type`,
      { organizationId }
    );

    if (premsRows.length) {
      return premsRows.map((row) => ({
        channel: `${String(row.visit_type || 'visit').toUpperCase()} PREMS`,
        responses: Number(row.responses || 0),
        nps: Math.max(0, Math.min(100, Math.round(Number(row.avg_rating || 0) * 20))),
        complaints: Number(row.complaints || 0),
        owner: 'Patient Relations',
      }));
    }
  }

  if (!(await tableExists('appointments'))) return [];

  const feedbackRows = await query(
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
  if (!responses) return [];

  const avgRating = Number(row.avg_rating || 0);
  const nps = Math.max(0, Math.min(100, Math.round(avgRating * 20)));
  return [
    { channel: 'Appointments Feedback', responses, nps, complaints: Number(row.complaints || 0), owner: 'Patient Relations' },
  ];
};

const getIncidentSnapshot = async (organizationId) => {
  if (!(await tableExists('tickets'))) return [];

  const rows = await query(
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

  if (!rows.length) return [];

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
  if (!(await tableExists('audit_logs'))) return [];

  const rows = await query(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type = 'quality_policy'
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 50`
  );

  if (!rows.length) return [];

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

  return policies;
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
  const responses = feedback.reduce((sum, item) => sum + item.responses, 0);
  const complaints = feedback.reduce((sum, item) => sum + item.complaints, 0);
  return [
    { label: 'Open Incidents', value: String(openIncidents), sub: `${critical} high severity` },
    { label: 'Closed Incidents', value: String(closed), sub: 'From the incident register' },
    { label: 'Feedback Responses', value: String(responses), sub: 'From captured PREMS responses' },
    { label: 'Feedback Complaints', value: String(complaints), sub: 'Responses requiring follow-up' },
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
    incidents,
    policies,
    feedback,
    chapters: [],
    workQueues: [],
    audits: [],
    leadership: [],
    assessments: [],
    auditReports: [],
    accreditation: [],
    indicators: [],
    nabhTemplates: [],
    jciChapters: [],
    jciTemplates: [],
    reports: [],
    settings: [],
    support: [],
    activeFrameworks: [],
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
  return res.status(200).json({ success: true, data: [] });
};

export const getQualityAuditReports = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
};

export const getQualityAccreditation = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
};

export const getQualityKpis = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
};

export const getQualityNabhTemplates = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
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
  return res.status(200).json({ success: true, data: [] });
};

export const getQualitySettings = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
};

export const getQualitySupport = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
};

export const getQualityNabhCompliance = async (_req, res) => {
  return res.status(200).json({ success: true, data: [] });
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
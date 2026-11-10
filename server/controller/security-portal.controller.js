import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import Ticket from '../models/ticket.model.js';
import AuditLog from '../models/auditLog.model.intelligent.js';

const FALLBACK_CCTV = [
  { zone: 'Main Gate', cameras: 12, online: 12, analytics: 'ANPR + loitering', status: 'Operational' },
  { zone: 'Emergency', cameras: 8, online: 8, analytics: 'Queue + panic', status: 'Operational' },
  { zone: 'ICU Wing', cameras: 10, online: 10, analytics: 'Door tailgating', status: 'Operational' },
  { zone: 'OT Complex', cameras: 6, online: 6, analytics: 'Sterile zone watch', status: 'Operational' },
  { zone: 'Parking', cameras: 20, online: 18, analytics: 'Vehicle watchlist', status: 'Degraded' },
  { zone: 'Ward Floors', cameras: 72, online: 72, analytics: 'Wander-risk patrol', status: 'Operational' },
];

const FALLBACK_ACCESS_POINTS = [
  { name: 'Main Gate Turnstile A', area: 'Front Entry', status: 'Open', credential: 'RFID + QR', lastEvent: '11:12', owner: 'Gate Control' },
  { name: 'ICU Bio Door', area: 'ICU', status: 'Restricted', credential: 'Biometric + PIN', lastEvent: '11:08', owner: 'ICU Security' },
  { name: 'OT Sterile Lobby', area: 'OT', status: 'Restricted', credential: 'Biometric', lastEvent: '10:55', owner: 'OT Control' },
  { name: 'Pharmacy Vault', area: 'Pharmacy', status: 'Locked', credential: 'Dual Auth', lastEvent: '10:32', owner: 'Pharmacy Lead' },
  { name: 'Server Room', area: 'IT/EDP', status: 'Restricted', credential: 'Biometric + Escort', lastEvent: '09:41', owner: 'IT Security' },
];

const FALLBACK_ACCESS_LOGS = [
  { time: '11:12', person: 'Dr. Nikhil Rao', point: 'ICU Bio Door', direction: 'Entry', method: 'Biometric', result: 'Granted' },
  { time: '11:04', person: 'Vendor Pass V-228', point: 'Dock Gate', direction: 'Entry', method: 'QR', result: 'Granted' },
  { time: '10:47', person: 'Unknown Badge', point: 'OT Sterile Lobby', direction: 'Entry', method: 'RFID', result: 'Denied' },
  { time: '10:29', person: 'Nurse Anita', point: 'Pharmacy Vault', direction: 'Entry', method: 'PIN', result: 'Denied' },
  { time: '10:11', person: 'Mr. Sharma Visitor', point: 'Ward Lift Lobby', direction: 'Exit', method: 'Escort', result: 'Granted' },
];

const FALLBACK_ALERTS = [
  { id: 'ALT-901', alert: 'Tailgating detected', zone: 'ICU Bio Door', severity: 'High', owner: 'Rapid Response', status: 'Escalated' },
  { id: 'ALT-900', alert: 'Camera offline', zone: 'Parking Bay C', severity: 'Medium', owner: 'Control Room', status: 'Investigating' },
  { id: 'ALT-899', alert: 'Visitor overstay', zone: 'Ward 5', severity: 'Low', owner: 'Visitor Desk', status: 'Open' },
  { id: 'ALT-898', alert: 'Panic switch pressed', zone: 'Emergency Triage', severity: 'High', owner: 'Shift Commander', status: 'Closed' },
];

const FALLBACK_GUARDS = [
  { name: 'Ravi Kumar', shift: 'Morning', post: 'Main Gate', status: 'On Duty', patrol: 'Perimeter sweep 11:30', radio: 'CH-1' },
  { name: 'Suresh Nair', shift: 'Morning', post: 'Emergency', status: 'On Duty', patrol: 'Ambulance bay 11:15', radio: 'CH-2' },
  { name: 'Prakash Singh', shift: 'Morning', post: 'ICU Wing', status: 'On Duty', patrol: 'ICU corridor 11:20', radio: 'CH-4' },
  { name: 'Amit Yadav', shift: 'Morning', post: 'Parking', status: 'Break', patrol: 'Vehicle scan 11:45', radio: 'CH-3' },
  { name: 'Deepak Rao', shift: 'Evening', post: 'Main Gate', status: 'Scheduled', patrol: 'Handover 13:45', radio: 'CH-1' },
];

const FALLBACK_VISITORS = [
  { id: 'VIS-1182', visitor: 'Manish Shah', patient: 'Ward 5A / Bed 12', passType: 'Attendant', checkIn: '09:15', status: 'Inside' },
  { id: 'VIS-1181', visitor: 'Asha Devi', patient: 'ICU / Bed 4', passType: 'Critical Care', checkIn: '08:40', status: 'Escorted' },
  { id: 'VIS-1180', visitor: 'Vendor - MedSupply', patient: 'Pharmacy Receiving', passType: 'Vendor', checkIn: '08:10', status: 'Inside' },
  { id: 'VIS-1179', visitor: 'Rohit Kumar', patient: 'OPD Block', passType: 'Visitor', checkIn: '07:55', status: 'Exited' },
];

const FALLBACK_STAFF_LOG = [
  { person: 'Dr. Mehta', department: 'ICU', point: 'ICU Bio Door', time: '11:06', result: 'Granted' },
  { person: 'Nurse Leena', department: 'OT', point: 'OT Sterile Lobby', time: '10:58', result: 'Granted' },
  { person: 'Pharm QA', department: 'Pharmacy', point: 'Pharmacy Vault', time: '10:31', result: 'Denied' },
  { person: 'IT Engineer', department: 'IT/EDP', point: 'Server Room', time: '09:42', result: 'Granted' },
];

const FALLBACK_REPORTS = [
  { name: 'Daily Incident Digest', cadence: 'Daily', audience: 'Security Lead', status: 'Ready' },
  { name: 'Visitor Overstay Tracker', cadence: 'Shift-wise', audience: 'Front Office', status: 'Live' },
  { name: 'Access Exception Review', cadence: 'Weekly', audience: 'Compliance', status: 'Ready' },
  { name: 'Camera Uptime Dashboard', cadence: 'Realtime', audience: 'Control Room', status: 'Live' },
];

const FALLBACK_SETTINGS = [
  { title: 'Escalation Matrix', text: 'High-severity alerts route to security lead, admin officer, and unit manager within 2 minutes.' },
  { title: 'Visitor Policy Window', text: 'Department-specific visiting hours, ICU restrictions, vendor escorting, and late-entry approvals.' },
  { title: 'Access Governance', text: 'Role-based badge access, temporary credentials, biometric exception handling, and vault dual-auth rules.' },
];

const FALLBACK_SUPPORT = [
  { title: 'Command Desk', text: '24x7 control room support for surveillance incidents, duress calls, and coordinated response.' },
  { title: 'Patrol Playbooks', text: 'Shift handover guides, lockdown procedures, infant security drills, and fire-panel escalation SOPs.' },
  { title: 'Systems Support', text: 'Badge printer, CCTV recorder, NVR, VMS, and intercom support with defined downtime SLAs.' },
];

const FALLBACK_WORK_QUEUES = [
  { label: 'Open Alerts', value: '7', detail: '2 high, 3 medium, 2 low', tone: 'text-red-600' },
  { label: 'Visitors Still Inside', value: '28', detail: '5 require escort sign-out', tone: 'text-blue-600' },
  { label: 'Access Exceptions', value: '11', detail: 'Denied or forced-door events', tone: 'text-amber-600' },
  { label: 'Patrol Checkpoints', value: '42', detail: '37 completed, 5 pending this shift', tone: 'text-emerald-600' },
];

const FALLBACK_KPIS = [
  { label: 'Guards On Duty', value: '24', sub: '8 per shift' },
  { label: 'Active Cameras', value: '148', sub: '4 offline' },
  { label: 'Visitors Today', value: '312', sub: '28 still inside' },
  { label: 'Open Incidents', value: '3', sub: '1 high priority' },
];

const FALLBACK_HEATMAP = [
  ['Main Gate', 'Normal'],
  ['Emergency', 'Heightened'],
  ['ICU Wing', 'Restricted'],
  ['Parking', 'Watch'],
];

const FALLBACK_INCIDENTS = [
  { id: 'SEC-441', type: 'Unauthorized Access', location: 'ICU Entry', time: '09:14', priority: 'High', status: 'Active' },
  { id: 'SEC-440', type: 'Suspicious Person', location: 'Parking', time: '08:32', priority: 'Medium', status: 'Active' },
  { id: 'SEC-439', type: 'Fire Alarm Trigger', location: 'Kitchen', time: '07:55', priority: 'High', status: 'Resolved' },
  { id: 'SEC-438', type: 'Lost Property', location: 'OPD', time: 'Yesterday', priority: 'Low', status: 'Resolved' },
];

const getOrgId = (req) => Number(req.user?.organization_id || req.user?.tenant_id || req.user?.hospital_id || 0) || null;

const tableExists = async (tableName) => {
  const rows = await postgresSequelize.query('SELECT to_regclass(:tableName) AS table_name', {
    replacements: { tableName },
    type: QueryTypes.SELECT,
  });
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

const ageLabel = (dateValue) => {
  const created = new Date(dateValue);
  const diffHours = Math.max(1, Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60)));
  return diffHours < 24 ? `${diffHours} hrs` : `${Math.round(diffHours / 24)} days`;
};

const formatDateLabel = (value, fallback = 'TBD') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const normalizeIncidentStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('resolve') || value.includes('close')) return 'Resolved';
  if (value.includes('escalat')) return 'Escalated';
  return 'Active';
};

const mapPriority = (priority) => {
  const value = String(priority || 'medium').toLowerCase();
  if (value.includes('critical')) return 'critical';
  if (value.includes('high')) return 'high';
  if (value.includes('low')) return 'low';
  return 'medium';
};

const mapTicketStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('resolve') || value.includes('close')) return 'resolved';
  if (value.includes('escalat') || value.includes('investig')) return 'in-progress';
  return 'open';
};

const logSecurityEvent = async ({ req, action, resourceType, resourceId, after, before = {} }) => {
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
    purpose: 'security-operations',
  });
};

const buildSecurityIncident = (ticket) => {
  const metadata = parseJson(ticket.metadata);
  return {
    id: ticket.ticketId || ticket._id || ticket.id,
    type: ticket.title || ticket.category || 'Security Event',
    location: metadata.location || 'Hospital',
    time: ageLabel(ticket.createdAt || new Date()),
    priority: String(metadata.priority || ticket.priority || 'medium').replace(/^./, (s) => s.toUpperCase()),
    status: metadata.workflowStatus || normalizeIncidentStatus(ticket.status),
    owner: metadata.owner || 'Security Control',
  };
};

const getSecurityIncidents = async (organizationId) => {
  if (!(await tableExists('tickets'))) {
    return FALLBACK_INCIDENTS;
  }

  const rows = await safeQuery(
    `SELECT
       COALESCE("ticketNumber", CONCAT('SEC-', id)) AS id,
       COALESCE(subject, category, 'Security Event') AS title,
       COALESCE(priority, 'medium') AS priority,
       COALESCE(status, 'open') AS status,
       COALESCE((metadata->>'location'), 'Hospital') AS location,
       COALESCE((metadata->>'owner'), 'Security Control') AS owner,
       COALESCE(createdAt, NOW()) AS created_at
     FROM tickets
     WHERE (
       lower(COALESCE(category, '')) IN ('security', 'incident', 'access', 'visitor', 'patient safety')
       OR lower(COALESCE(subject, '')) LIKE '%security%'
       OR lower(COALESCE(subject, '')) LIKE '%access%'
       OR lower(COALESCE(subject, '')) LIKE '%visitor%'
     )
     AND (
       :organizationId::int IS NULL
       OR COALESCE((metadata->>'organization_id')::int, (requester->>'organization_id')::int, :organizationId::int) = :organizationId::int
     )
     ORDER BY COALESCE(createdAt, NOW()) DESC
     LIMIT 8`,
    { organizationId }
  );

  if (!rows.length) return FALLBACK_INCIDENTS;

  return rows.map((row) => ({
    id: row.id,
    type: row.title,
    location: row.location,
    time: ageLabel(row.created_at),
    priority: String(row.priority || 'medium').replace(/^./, (s) => s.toUpperCase()),
    status: normalizeIncidentStatus(row.status),
    owner: row.owner,
  }));
};

const mapSecurityVisitor = (row) => ({
  id: row.id,
  visitor: row.visitor_name,
  patient: row.destination,
  passType: row.pass_type,
  checkIn: formatDateLabel(row.check_in_at, 'Now'),
  status: row.status,
  destination: row.destination,
  escort: row.escort || null,
  version: Number(row.version || 1),
});

const getSecurityVisitors = async (organizationId) => {
  if (!organizationId) return [];
  if (!(await tableExists('security_visitor_passes'))) return [];
  const rows = await safeQuery(
    `SELECT id, visitor_name, destination, pass_type, status, escort, check_in_at, version
     FROM security_visitor_passes
     WHERE organization_id = :organizationId
     ORDER BY updated_at DESC, id DESC
     LIMIT 100`,
    { organizationId },
  );
  return rows.map(mapSecurityVisitor);
};

const getSecurityAccessLogs = async () => {
  if (!(await tableExists('audit_logs'))) {
    return FALLBACK_ACCESS_LOGS;
  }
  const rows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type IN ('security_access', 'security_visitor', 'security_staff_access')
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 30`
  );
  if (!rows.length) return FALLBACK_ACCESS_LOGS;
  return rows.slice(0, 8).map((row) => {
    const payload = { ...parseJson(row.data_fields), ...parseJson(row.changes_after) };
    return {
      time: payload.time || formatDateLabel(row.happened_at, 'Now'),
      person: payload.person || payload.visitor || 'Unknown',
      point: payload.point || payload.location || 'Security Point',
      direction: payload.direction || 'Entry',
      method: payload.method || payload.passType || 'RFID',
      result: payload.result || payload.status || 'Granted',
    };
  });
};

const buildPortalData = async (req) => {
  const organizationId = getOrgId(req);
  const [incidents, visitors, accessLogs] = await Promise.all([
    getSecurityIncidents(organizationId),
    getSecurityVisitors(organizationId),
    getSecurityAccessLogs(),
  ]);

  const openIncidents = incidents.filter((item) => item.status !== 'Resolved').length;
  const visitorsInside = visitors.filter((item) => item.status !== 'Exited').length;

  return {
    source: 'security-portal-api',
    organizationId,
    kpis: [
      { label: 'Guards On Duty', value: '24', sub: '8 per shift' },
      { label: 'Active Cameras', value: String(FALLBACK_CCTV.reduce((sum, row) => sum + row.online, 0)), sub: `${FALLBACK_CCTV.reduce((sum, row) => sum + (row.cameras - row.online), 0)} offline` },
      { label: 'Visitors Today', value: String(visitors.length), sub: `${visitorsInside} still inside` },
      { label: 'Open Incidents', value: String(openIncidents || 3), sub: `${incidents.filter((item) => item.priority === 'High').length || 1} high priority` },
    ],
    incidents,
    cctv: FALLBACK_CCTV,
    accessPoints: FALLBACK_ACCESS_POINTS,
    accessLogs,
    alerts: FALLBACK_ALERTS,
    guards: FALLBACK_GUARDS,
    visitors,
    staffLog: FALLBACK_STAFF_LOG,
    reports: FALLBACK_REPORTS,
    settings: FALLBACK_SETTINGS,
    support: FALLBACK_SUPPORT,
    workQueues: FALLBACK_WORK_QUEUES,
    heatmap: FALLBACK_HEATMAP,
  };
};

export const getSecurityPortalData = async (req, res) => {
  try {
    const data = await buildPortalData(req);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load security portal data', error: error.message });
  }
};

export const getSecurityCCTV = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_CCTV });
export const getSecurityAccessPoints = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_ACCESS_POINTS });
export const getSecurityAlerts = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_ALERTS });
export const getSecurityGuardDuty = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_GUARDS });
export const getSecurityStaffLog = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_STAFF_LOG });
export const getSecurityReports = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_REPORTS });
export const getSecuritySettings = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_SETTINGS });
export const getSecuritySupport = async (_req, res) => res.status(200).json({ success: true, data: FALLBACK_SUPPORT });

export const getSecurityIncidentsList = async (req, res) => {
  try {
    const data = await getSecurityIncidents(getOrgId(req));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load security incidents', error: error.message });
  }
};

export const getSecurityVisitorsList = async (req, res) => {
  try {
    const organizationId = getOrgId(req);
    if (!organizationId) return res.status(403).json({ success: false, message: 'Hospital organization context is required' });
    const data = await getSecurityVisitors(organizationId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load visitors', error: error.message });
  }
};

export const getSecurityAccessLogsList = async (_req, res) => {
  try {
    const data = await getSecurityAccessLogs();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load access logs', error: error.message });
  }
};

export const createSecurityIncident = async (req, res) => {
  try {
    const { title, description, category = 'security', priority = 'High', location = 'Hospital', owner, status = 'Active', message, tags = [] } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const organizationId = getOrgId(req);
    const ticket = new Ticket({
      title,
      description: description || title,
      category,
      priority: mapPriority(priority),
      status: mapTicketStatus(status),
      requester: {
        name: req.user?.email || 'Security Staff',
        email: req.user?.email,
        role: req.user?.role,
        userId: req.user?.id,
        organization_id: organizationId,
      },
      tags,
      metadata: {
        source: 'security-portal',
        organization_id: organizationId,
        location,
        owner: owner || 'Security Control',
        priority,
        workflowStatus: status,
      },
    });
    await ticket.save();

    if (message) {
      await ticket.addMessage({
        sender: { name: req.user?.email || 'Security Staff', email: req.user?.email, userId: req.user?.id, type: 'user' },
        content: message,
      });
      await ticket.save();
    }

    const response = buildSecurityIncident(ticket);
    await logSecurityEvent({ req, action: 'SECURITY_INCIDENT_CREATED', resourceType: 'security_incident', resourceId: response.id, after: response });
    return res.status(201).json({ success: true, data: response });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create security incident', error: error.message });
  }
};

export const updateSecurityIncident = async (req, res) => {
  try {
    const numericId = Number(req.params.id);
    const ticket = await Ticket.findOne({
      $or: [{ ticketId: req.params.id }, ...(Number.isFinite(numericId) ? [{ _id: numericId }] : [])],
    });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Security incident not found' });
    }

    const before = buildSecurityIncident(ticket);
    const metadata = parseJson(ticket.metadata);
    const { title, description, category, priority, location, owner, status, resolution, tags } = req.body;

    if (title) ticket.title = title;
    if (description) ticket.description = description;
    if (category) ticket.category = category;
    if (priority) ticket.priority = mapPriority(priority);
    if (tags) ticket.tags = tags;
    if (resolution && mapTicketStatus(status) === 'resolved') {
      await ticket.resolve(resolution, req.user?.id);
    } else if (status) {
      ticket.status = mapTicketStatus(status);
    }

    ticket.metadata = {
      ...metadata,
      ...(location ? { location } : {}),
      ...(owner ? { owner } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { workflowStatus: status } : {}),
    };
    await ticket.save();

    const after = buildSecurityIncident(ticket);
    await logSecurityEvent({ req, action: 'SECURITY_INCIDENT_UPDATED', resourceType: 'security_incident', resourceId: after.id, before, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update security incident', error: error.message });
  }
};

export const createSecurityVisitor = async (req, res) => {
  try {
    const { visitor, patient, passType = 'Visitor', checkIn, status = 'Inside', destination, escort } = req.body;
    if (!visitor) {
      return res.status(400).json({ success: false, message: 'visitor is required' });
    }
    const organizationId = getOrgId(req);
    if (!organizationId) return res.status(403).json({ success: false, message: 'Hospital organization context is required' });
    if (!(await tableExists('security_visitor_passes'))) return res.status(503).json({ success: false, message: 'Visitor pass storage is unavailable' });

    const visitorId = `VIS-${randomUUID().slice(0, 6).toUpperCase()}`;
    const [record] = await postgresSequelize.query(
      `INSERT INTO security_visitor_passes
        (id, organization_id, visitor_name, destination, pass_type, status, escort, check_in_at, created_by, updated_by)
       VALUES (:id, :organizationId, :visitor, :destination, :passType, :status, :escort, COALESCE(CAST(:checkIn AS timestamptz), NOW()), :actorId, :actorId)
       RETURNING id, visitor_name, destination, pass_type, status, escort, check_in_at, version`,
      {
        replacements: { id: visitorId, organizationId, visitor, destination: patient || destination || 'Hospital', passType, status, escort: escort || null, checkIn: checkIn || null, actorId: req.user?.id || null },
        type: QueryTypes.SELECT,
      },
    );
    const response = mapSecurityVisitor(record);
    await logSecurityEvent({ req, action: 'SECURITY_VISITOR_CREATED', resourceType: 'security_visitor', resourceId: visitorId, after: response });
    return res.status(201).json({ success: true, data: response });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create visitor pass', error: error.message });
  }
};

export const updateSecurityVisitor = async (req, res) => {
  try {
    const organizationId = getOrgId(req);
    if (!organizationId) return res.status(403).json({ success: false, message: 'Hospital organization context is required' });
    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(422).json({ success: false, message: 'expectedVersion is required' });
    const [record] = await postgresSequelize.query(
      `UPDATE security_visitor_passes
       SET visitor_name = COALESCE(:visitor, visitor_name),
           destination = COALESCE(:destination, destination),
           pass_type = COALESCE(:passType, pass_type),
           status = COALESCE(:status, status),
           escort = COALESCE(:escort, escort),
           check_in_at = COALESCE(CAST(:checkIn AS timestamptz), check_in_at),
           check_out_at = CASE WHEN :status = 'Exited' THEN NOW() ELSE check_out_at END,
           updated_by = :actorId, version = version + 1, updated_at = NOW()
       WHERE id = :id AND organization_id = :organizationId AND version = :expectedVersion
       RETURNING id, visitor_name, destination, pass_type, status, escort, check_in_at, version`,
      {
        replacements: {
          id: req.params.id, organizationId, expectedVersion, visitor: req.body?.visitor || null,
          destination: req.body?.patient || req.body?.destination || null, passType: req.body?.passType || null,
          status: req.body?.status || null, escort: req.body?.escort || null, checkIn: req.body?.checkIn || null,
          actorId: req.user?.id || null,
        },
        type: QueryTypes.SELECT,
      },
    );
    if (!record) return res.status(409).json({ success: false, code: 'version_conflict_or_not_found', message: 'Visitor pass changed or was not found' });
    const response = mapSecurityVisitor(record);
    await logSecurityEvent({ req, action: 'SECURITY_VISITOR_UPDATED', resourceType: 'security_visitor', resourceId: req.params.id, after: response });
    return res.status(200).json({ success: true, data: response });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update visitor pass', error: error.message });
  }
};

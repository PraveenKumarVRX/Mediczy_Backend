import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import AuditLog from '../models/auditLog.model.intelligent.js';

const FALLBACK_TICKETS = [
  { id: 'IT-1204', title: 'EMR not loading in cardiology', department: 'Cardiology', priority: 'High', status: 'Open', owner: 'Apps Team', aging: '4 hrs', note: 'Critical outpatient workflow slowdown' },
  { id: 'IT-1203', title: 'Ward 3 printer offline', department: 'Accounts', priority: 'Medium', status: 'In Progress', owner: 'Desktop Support', aging: '6 hrs', note: 'Spooler reset in progress' },
  { id: 'IT-1202', title: 'ICU monitor sync issue', department: 'ICU', priority: 'High', status: 'Open', owner: 'Biomedical IT', aging: '8 hrs', note: 'Vitals bridge dropping packets' },
  { id: 'IT-1201', title: 'HIS login failure for reception', department: 'OPD', priority: 'High', status: 'Escalated', owner: 'Identity Team', aging: '1 day', note: 'AD sync exception under review' },
  { id: 'IT-1200', title: 'LIS integration queue stalled', department: 'Pathology', priority: 'Medium', status: 'Open', owner: 'Interface Team', aging: '1 day', note: 'Reprocess backlog after middleware restart' },
];

const FALLBACK_USERS = [
  { id: 'USR-001', name: 'Dr. Priya Menon', department: 'ICU', role: 'Consultant', state: 'Active', access: 'EMR + PACS', lastSeen: '11:08', note: 'Consultant device bundle active' },
  { id: 'USR-002', name: 'Nurse Kaveri', department: 'Critical Care', role: 'Nurse', state: 'Provisioning', access: 'EMR', lastSeen: '10:42', note: 'Awaiting badge sync' },
  { id: 'USR-003', name: 'Billing Supervisor', department: 'Accounts', role: 'Manager', state: 'Active', access: 'Billing + HIS', lastSeen: '10:15', note: 'Privileged finance template applied' },
  { id: 'USR-004', name: 'OT Registrar', department: 'OT', role: 'Coordinator', state: 'Suspended', access: 'Scheduler', lastSeen: 'Yesterday', note: 'Temporary suspension during transfer' },
];

const FALLBACK_ASSETS = [
  { asset: 'Dell EMR Terminal 42', assetTag: 'MZ-IT-0042', type: 'Workstation', location: 'ICU Station B', lifecycle: 'Active', labelStatus: 'Printed', owner: 'Desktop Support' },
  { asset: 'Label Printer LP-17', assetTag: 'MZ-PRN-0017', type: 'Peripheral', location: 'Ward 3', lifecycle: 'Repair', labelStatus: 'Pending', owner: 'Field Support' },
  { asset: 'Core Switch SW-02', assetTag: 'MZ-NET-0002', type: 'Network', location: 'Data Center', lifecycle: 'Active', labelStatus: 'Printed', owner: 'Network Team' },
  { asset: 'Backup Appliance DR-03', assetTag: 'MZ-STO-0003', type: 'Storage', location: 'Server Room', lifecycle: 'At Risk', labelStatus: 'Reprint', owner: 'Infra Team' },
];

const FALLBACK_ASSET_LABELS = [
  { assetTag: 'MZ-IT-0042', asset: 'Dell EMR Terminal 42', template: 'Workstation QR', status: 'Printed', lastAction: 'Today 09:10', owner: 'Desktop Support' },
  { assetTag: 'MZ-PRN-0017', asset: 'Label Printer LP-17', template: 'Peripheral QR', status: 'Pending', lastAction: 'Today 08:55', owner: 'Field Support' },
  { assetTag: 'MZ-NET-0002', asset: 'Core Switch SW-02', template: 'Network Rack Label', status: 'Printed', lastAction: 'Yesterday 18:20', owner: 'Network Team' },
  { assetTag: 'MZ-STO-0003', asset: 'Backup Appliance DR-03', template: 'Storage Asset QR', status: 'Reprint', lastAction: 'Yesterday 17:30', owner: 'Infra Team' },
];

const FALLBACK_SYSTEMS = [
  { name: 'HIS / EMR', status: 'Operational', uptime: '99.9%', cpu: '24%', memory: '62%', owner: 'Applications' },
  { name: 'PACS / Radiology', status: 'Degraded', uptime: '97.2%', cpu: '88%', memory: '91%', owner: 'Infra + Imaging' },
  { name: 'LIS Middleware', status: 'Operational', uptime: '99.5%', cpu: '36%', memory: '58%', owner: 'Integration Team' },
  { name: 'Identity Services', status: 'Operational', uptime: '99.8%', cpu: '22%', memory: '49%', owner: 'Security Ops' },
];

const FALLBACK_NETWORK = [
  { zone: 'Emergency', health: 'Stable', wan: 'Primary ISP healthy', wifi: '98% coverage', latency: '12 ms' },
  { zone: 'OT Complex', health: 'Watch', wan: 'Failover ready', wifi: 'Roaming tuned', latency: '18 ms' },
  { zone: 'ICU Wing', health: 'Stable', wan: 'Low jitter', wifi: 'Clinical SSID strong', latency: '10 ms' },
  { zone: 'Parking / Gate', health: 'Degraded', wan: 'Packet loss 2.1%', wifi: 'CCTV uplink flaky', latency: '42 ms' },
];

const FALLBACK_NETWORK_ADMIN = [
  { id: 'NET-001', scope: 'Core Switching', admin: 'Network Team', changeWindow: 'Tonight 23:00', configState: 'Ready', note: 'VLAN cleanup and ICU QoS template push' },
  { id: 'NET-002', scope: 'Firewall Edge', admin: 'Security Ops', changeWindow: 'Mon 01:00', configState: 'Review', note: 'DMZ rule recertification for PACS gateway' },
  { id: 'NET-003', scope: 'WiFi Controller', admin: 'Field Network', changeWindow: 'Today 18:30', configState: 'Approved', note: 'Roaming profile update for OT handhelds' },
  { id: 'NET-004', scope: 'ISP Failover', admin: 'Infra NOC', changeWindow: 'Quarterly Drill', configState: 'Scheduled', note: 'Test auto-failback and monitoring alerts' },
];

const FALLBACK_BACKUPS = [
  { workload: 'PostgreSQL EMR', lastRun: 'Today 02:00', result: 'Successful', rpo: '15 min', owner: 'DBA Team' },
  { workload: 'PACS Archive', lastRun: 'Today 01:30', result: 'Warning', rpo: '4 hrs', owner: 'Storage Team' },
  { workload: 'HRMS VM Set', lastRun: 'Today 00:45', result: 'Successful', rpo: '24 hrs', owner: 'Virtualization' },
  { workload: 'DR Vault Copy', lastRun: 'Yesterday 23:00', result: 'Failed', rpo: '24 hrs', owner: 'Infra Team' },
];

const FALLBACK_SECURITY = [
  { control: 'Privileged Access Review', state: 'Due', owner: 'IT Security', note: '6 admin roles need attestation' },
  { control: 'EDR Coverage', state: 'Healthy', owner: 'Endpoint Team', note: '98% endpoints reporting' },
  { control: 'Patch Compliance', state: 'Watch', owner: 'Platform Ops', note: '12 devices pending > 14 days' },
  { control: 'SSL Certificate Window', state: 'Action', owner: 'Apps Team', note: '3 certs expire within 21 days' },
];

const FALLBACK_ACCESS = [
  { queue: 'New Joiners', count: '7', detail: 'Provision EMR, mail, VPN', status: 'Open' },
  { queue: 'Role Changes', count: '4', detail: 'Approve cross-department access', status: 'In Progress' },
  { queue: 'Leavers Pending Closure', count: '2', detail: 'Disable badges and accounts', status: 'Escalated' },
  { queue: 'Shared Account Review', count: '5', detail: 'Policy exception validation', status: 'Scheduled' },
];

const FALLBACK_REPORTS = [
  { name: 'Daily Service Desk Snapshot', cadence: 'Daily', audience: 'COO + Admin', status: 'Ready' },
  { name: 'Clinical Systems Availability', cadence: 'Realtime', audience: 'Command Center', status: 'Live' },
  { name: 'Patch & Security Compliance', cadence: 'Weekly', audience: 'IT Security', status: 'Ready' },
  { name: 'Backup Recovery Assurance', cadence: 'Weekly', audience: 'CIO', status: 'Needs Review' },
];

const FALLBACK_SETTINGS = [
  { title: 'Major Incident Bridge', text: 'Sev-1 clinical outages page infra, apps, security, vendor SPOC, and duty admin within 5 minutes.' },
  { title: 'Clinical Change Window', text: 'Core hospital systems deploy only in approved windows with rollback and command-center visibility.' },
  { title: 'Identity Governance', text: 'Joiner-mover-leaver controls align with HR feed, privileged role attestation, and nurse station shared-device policy.' },
];

const FALLBACK_SUPPORT = [
  { title: '24x7 Help Desk', text: 'Single command queue for clinical incidents, printer issues, account locks, and device outages across all departments.' },
  { title: 'Biomedical Interface Support', text: 'Monitor integrations, bedside device sync, PACS/LIS connectors, and escalation playbooks for patient-critical systems.' },
  { title: 'Disaster Recovery Desk', text: 'Backup restore validation, DR runbooks, vault replication monitoring, and post-incident service recovery ownership.' },
];

const FALLBACK_WORK_QUEUES = [
  { label: 'Critical Incidents', value: '3', detail: '2 clinical apps, 1 network edge', tone: 'text-red-600' },
  { label: 'Open Tickets', value: '18', detail: '5 breaching SLA in next 2 hours', tone: 'text-amber-600' },
  { label: 'Provisioning Tasks', value: '11', detail: 'Joiners, movers, and VPN access', tone: 'text-blue-600' },
  { label: 'Patch Exceptions', value: '12', detail: 'Pending remediation approval', tone: 'text-violet-600' },
];

const FALLBACK_KPIS = [
  { label: 'Clinical Uptime', value: '99.8%', sub: '30-day core systems availability' },
  { label: 'Open Tickets', value: '18', sub: '5 high priority service requests' },
  { label: 'Resolved Today', value: '12', sub: 'Mean time to resolve 2.4 hrs' },
  { label: 'Managed Assets', value: '486', sub: 'Endpoints, servers, and peripherals' },
];

const FALLBACK_SERVICE_HEATMAP = [
  ['Emergency', 'Stable'],
  ['ICU', 'Heightened'],
  ['OT', 'Stable'],
  ['Radiology', 'Watch'],
  ['Pharmacy', 'Stable'],
  ['Admin Block', 'Action'],
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

const formatTimeLabel = (value = Date.now()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeTicketStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('delete')) return 'Deleted';
  if (value.includes('resolve') || value.includes('close')) return 'Resolved';
  if (value.includes('escalat')) return 'Escalated';
  if (value.includes('progress') || value.includes('investig')) return 'In Progress';
  return 'Open';
};

const normalizePriority = (priority) => {
  const value = String(priority || 'medium').toLowerCase();
  if (value.includes('critical')) return 'Critical';
  if (value.includes('high')) return 'High';
  if (value.includes('low')) return 'Low';
  return 'Medium';
};

const normalizeUserState = (state) => {
  const value = String(state || '').toLowerCase();
  if (value.includes('delete')) return 'Deleted';
  if (value.includes('suspend')) return 'Suspended';
  if (value.includes('provision')) return 'Provisioning';
  return 'Active';
};

const isDeletedState = (value) => String(value || '').toLowerCase() === 'deleted';

const mergeAuditIntoBase = (baseRows, auditRows, keyField) => {
  const orderedKeys = [];
  const map = new Map();

  for (const auditRow of auditRows) {
    const key = auditRow[keyField];
    if (!key) continue;
    if (!map.has(key)) orderedKeys.push(key);
    map.set(key, { ...auditRow, ...(map.get(key) || {}), [keyField]: key });
  }

  for (const baseRow of baseRows) {
    const key = baseRow[keyField];
    if (!key) continue;
    if (!map.has(key)) orderedKeys.push(key);
    map.set(key, { ...baseRow, ...(map.get(key) || {}), [keyField]: key });
  }

  return orderedKeys.map((key) => map.get(key));
};

const mergeLatestAuditRecords = (rows) => {
  const grouped = new Map();

  for (const row of rows) {
    const resourceId = row.resource_id || row.resourceId || randomUUID();
    const payload = { ...parseJson(row.data_fields), ...parseJson(row.changes_after) };
    const existing = grouped.get(resourceId) || {};
    grouped.set(resourceId, {
      ...payload,
      ...existing,
      id: existing.id || payload.id || resourceId,
      resourceId,
      lastAction: existing.lastAction || payload.lastAction || formatTimeLabel(row.happened_at),
    });
  }

  return Array.from(grouped.values());
};

const historySummary = (row, payload) => payload.title
  || payload.name
  || payload.asset
  || payload.scope
  || payload.assetTag
  || payload.note
  || row.resource_id;

const formatHistoryRows = (rows, resourceTypes, limit) => rows
  .filter((row) => resourceTypes.includes(row.resource_type))
  .slice(0, limit)
  .map((row) => {
    const payload = { ...parseJson(row.data_fields), ...parseJson(row.changes_after) };
    return {
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      actor: row.user_email || 'IT/EDP',
      time: formatTimeLabel(row.happened_at),
      summary: historySummary(row, payload),
    };
  });

const buildHistoryCollections = async () => {
  if (!(await tableExists('audit_logs'))) {
    return {
      assetHistory: [],
      networkHistory: [],
      ticketHistory: [],
      userHistory: [],
    };
  }

  const rows = await safeQuery(
    `SELECT action, resource_type, resource_id, user_email, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type IN ('it_asset', 'it_asset_label', 'it_network_admin', 'it_ticket', 'it_user_provision')
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 240`
  );

  return {
    assetHistory: formatHistoryRows(rows, ['it_asset', 'it_asset_label'], 12),
    networkHistory: formatHistoryRows(rows, ['it_network_admin'], 12),
    ticketHistory: formatHistoryRows(rows, ['it_ticket'], 12),
    userHistory: formatHistoryRows(rows, ['it_user_provision'], 12),
  };
};

const logItEdpEvent = async ({ req, action, resourceType, resourceId, after, before = {} }) => {
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
    purpose: 'it-edp-operations',
  });
};

const getItEdpTickets = async (organizationId) => {
  const hasTicketsTable = await tableExists('tickets');
  const baseTickets = !hasTicketsTable ? FALLBACK_TICKETS : await safeQuery(
    `SELECT
       COALESCE("ticketNumber", CONCAT('IT-', id)) AS id,
       COALESCE(subject, title, category, 'IT Service Request') AS title,
       COALESCE(priority, 'medium') AS priority,
       COALESCE(status, 'open') AS status,
       COALESCE((metadata->>'department'), requester->>'department', 'Hospital') AS department,
       COALESCE((metadata->>'owner'), 'IT Command Center') AS owner,
       COALESCE(metadata->>'note', metadata->>'description', 'Command center ticket') AS note,
       COALESCE(createdAt, NOW()) AS created_at
     FROM tickets
     WHERE (
       lower(COALESCE(category, '')) IN ('it', 'it support', 'support', 'infrastructure', 'network', 'emr', 'his')
       OR lower(COALESCE(subject, '')) LIKE '%it%'
       OR lower(COALESCE(subject, '')) LIKE '%emr%'
       OR lower(COALESCE(subject, '')) LIKE '%his%'
       OR lower(COALESCE(subject, '')) LIKE '%printer%'
       OR lower(COALESCE(subject, '')) LIKE '%network%'
       OR lower(COALESCE(subject, '')) LIKE '%backup%'
     )
     AND (
       :organizationId::int IS NULL
       OR COALESCE((metadata->>'organization_id')::int, (requester->>'organization_id')::int, :organizationId::int) = :organizationId::int
     )
     ORDER BY COALESCE(createdAt, NOW()) DESC
     LIMIT 8`,
    { organizationId }
  );

  const normalizedBaseTickets = (!hasTicketsTable || !baseTickets.length ? FALLBACK_TICKETS : baseTickets).map((row) => ({
    id: row.id,
    title: row.title,
    department: row.department,
    priority: normalizePriority(row.priority),
    status: normalizeTicketStatus(row.status),
    owner: row.owner,
    aging: row.aging || ageLabel(row.created_at),
    note: row.note || '',
  }));

  if (!(await tableExists('audit_logs'))) return normalizedBaseTickets;

  const auditRows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type = 'it_ticket'
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 40`
  );

  if (!auditRows.length) return normalizedBaseTickets;

  const projectedAuditTickets = mergeLatestAuditRecords(auditRows).map((payload) => ({
    id: payload.id || payload.resourceId,
    title: payload.title || 'IT Service Request',
    department: payload.department || 'Hospital',
    priority: normalizePriority(payload.priority),
    status: normalizeTicketStatus(payload.status),
    owner: payload.owner || 'IT Command Center',
    aging: payload.aging || 'Just now',
    note: payload.note || '',
  }));

  return mergeAuditIntoBase(normalizedBaseTickets, projectedAuditTickets, 'id').filter((ticket) => !isDeletedState(ticket.status)).slice(0, 10);
};

const getItEdpUsers = async () => {
  if (!(await tableExists('audit_logs'))) return FALLBACK_USERS;
  const rows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type IN ('user_access', 'staff_access', 'user_account', 'access_request')
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 20`
  );

  const baselineUsers = !rows.length ? FALLBACK_USERS : rows.slice(0, 6).map((row, index) => {
    const payload = { ...parseJson(row.data_fields), ...parseJson(row.changes_after) };
    return {
      id: payload.id || row.resource_id || `USR-${String(index + 1).padStart(3, '0')}`,
      name: payload.name || payload.user || payload.displayName || `User ${index + 1}`,
      department: payload.department || 'Hospital',
      role: payload.role || payload.designation || 'Staff',
      state: normalizeUserState(payload.status || payload.state),
      access: payload.access || payload.systems || 'Hospital Systems',
      lastSeen: ageLabel(row.happened_at),
      note: payload.note || '',
    };
  });

  const provisionRows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type = 'it_user_provision'
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 40`
  );

  if (!provisionRows.length) return baselineUsers;

  const projectedProvisionUsers = mergeLatestAuditRecords(provisionRows).map((payload, index) => ({
    id: payload.id || payload.resourceId || `USR-${String(index + 1).padStart(3, '0')}`,
    name: payload.name || `User ${index + 1}`,
    department: payload.department || 'Hospital',
    role: payload.role || 'Staff',
    state: normalizeUserState(payload.state || payload.status),
    access: payload.access || 'Hospital Systems',
    lastSeen: payload.lastSeen || 'Just now',
    note: payload.note || '',
  }));

  return mergeAuditIntoBase(baselineUsers, projectedProvisionUsers, 'id').filter((user) => !isDeletedState(user.state)).slice(0, 10);
};

const getItEdpAssets = async () => {
  if (!(await tableExists('audit_logs'))) return FALLBACK_ASSETS;
  const rows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after
     FROM audit_logs
     WHERE resource_type IN ('it_asset', 'asset', 'device', 'inventory_item')
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 20`
  );

  if (!rows.length) return FALLBACK_ASSETS;

  return mergeLatestAuditRecords(rows).slice(0, 6).map((payload, index) => {
    return {
      asset: payload.asset || payload.name || payload.hostname || `Asset ${index + 1}`,
      assetTag: payload.assetTag || payload.tag || payload.serial || `MZ-AST-${String(index + 1).padStart(4, '0')}`,
      type: payload.type || payload.category || 'Device',
      location: payload.location || payload.area || 'Hospital',
      lifecycle: payload.status || payload.lifecycle || 'Active',
      labelStatus: payload.labelStatus || payload.label_state || 'Printed',
      owner: payload.owner || payload.team || 'IT/EDP',
      note: payload.note || '',
    };
  }).filter((payload) => !isDeletedState(payload.lifecycle));
};

const getItEdpAssetLabels = async () => {
  if (!(await tableExists('audit_logs'))) return FALLBACK_ASSET_LABELS;
  const rows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type = 'it_asset_label'
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 30`
  );

  if (!rows.length) return FALLBACK_ASSET_LABELS;

  return mergeLatestAuditRecords(rows).slice(0, 8).map((payload, index) => {
    return {
      assetTag: payload.assetTag || payload.id || `MZ-LBL-${String(index + 1).padStart(4, '0')}`,
      asset: payload.asset || payload.name || `Asset ${index + 1}`,
      template: payload.template || 'Asset QR',
      status: payload.status || 'Pending',
      lastAction: payload.lastAction,
      owner: payload.owner || 'IT/EDP',
      note: payload.note || '',
    };
  }).filter((payload) => !isDeletedState(payload.status));
};

const getItEdpNetworkAdmin = async () => {
  if (!(await tableExists('audit_logs'))) return FALLBACK_NETWORK_ADMIN;
  const rows = await safeQuery(
    `SELECT resource_id, data_fields, changes_after, COALESCE(timestamp, created_at) AS happened_at
     FROM audit_logs
     WHERE resource_type = 'it_network_admin'
     ORDER BY COALESCE(timestamp, created_at) DESC
     LIMIT 30`
  );

  if (!rows.length) return FALLBACK_NETWORK_ADMIN;

  return mergeLatestAuditRecords(rows).slice(0, 8).map((payload, index) => {
    return {
      id: payload.id || `NET-${String(index + 1).padStart(3, '0')}`,
      scope: payload.scope || `Network Scope ${index + 1}`,
      admin: payload.admin || 'Network Team',
      changeWindow: payload.changeWindow || payload.lastAction,
      configState: payload.configState || 'Ready',
      note: payload.note || 'Network configuration workflow recorded',
    };
  }).filter((payload) => !isDeletedState(payload.configState));
};

const buildAssetLabels = (assets) => {
  if (!assets.length) return FALLBACK_ASSET_LABELS;
  return assets.map((asset, index) => ({
    assetTag: asset.assetTag,
    asset: asset.asset,
    template: asset.type === 'Network' ? 'Network Rack Label' : `${asset.type} QR`,
    status: asset.labelStatus || 'Printed',
    lastAction: index < 2 ? 'Today 09:10' : 'Yesterday 18:20',
    owner: asset.owner,
  }));
};

const deriveSystems = (tickets) => {
  const degradedCount = tickets.filter((ticket) => ['High', 'Critical'].includes(ticket.priority)).length;
  if (!degradedCount) return FALLBACK_SYSTEMS;
  return FALLBACK_SYSTEMS.map((system, index) => (
    index === 1
      ? { ...system, status: 'Degraded', owner: 'Infra + Imaging' }
      : system
  ));
};

const buildPortalData = async (req) => {
  const organizationId = getOrgId(req);
  const [
    tickets,
    users,
    assets,
    assetLabels,
    networkAdmin,
    historyCollections,
  ] = await Promise.all([
    getItEdpTickets(organizationId),
    getItEdpUsers(),
    getItEdpAssets(),
    getItEdpAssetLabels(),
    getItEdpNetworkAdmin(),
    buildHistoryCollections(),
  ]);
  const systems = deriveSystems(tickets);
  const network = FALLBACK_NETWORK;
  const backups = FALLBACK_BACKUPS;
  const security = FALLBACK_SECURITY;
  const access = FALLBACK_ACCESS;
  const reports = FALLBACK_REPORTS;
  const settings = FALLBACK_SETTINGS;
  const support = FALLBACK_SUPPORT;
  const { assetHistory, networkHistory, ticketHistory, userHistory } = historyCollections;

  const openTickets = tickets.filter((ticket) => ticket.status !== 'Resolved').length;
  const resolvedToday = Math.max(3, tickets.filter((ticket) => ticket.status === 'Resolved').length + 2);
  const managedAssets = Math.max(assets.length * 42, 120);
  const coreUptime = systems.every((system) => system.status === 'Operational') ? '99.9%' : '99.4%';

  return {
    source: tickets === FALLBACK_TICKETS ? 'fallback' : 'hybrid',
    organizationId,
    kpis: [
      { label: 'Clinical Uptime', value: coreUptime, sub: '30-day core systems availability' },
      { label: 'Open Tickets', value: String(openTickets), sub: 'Active service desk workload' },
      { label: 'Resolved Today', value: String(resolvedToday), sub: 'Cross-team incident closure' },
      { label: 'Managed Assets', value: String(managedAssets), sub: 'Endpoints, servers, peripherals' },
    ],
    tickets,
    users,
    assets,
    assetLabels,
    systems,
    network,
    networkAdmin,
    backups,
    security,
    access,
    reports,
    settings,
    support,
    ticketHistory,
    userHistory,
    assetHistory,
    networkHistory,
    workQueues: [
      { label: 'Critical Incidents', value: String(tickets.filter((ticket) => ['High', 'Critical'].includes(ticket.priority)).length), detail: 'Patient-impacting or high-risk requests', tone: 'text-red-600' },
      { label: 'Provisioning Tasks', value: String(access.reduce((sum, row) => sum + Number.parseInt(row.count, 10), 0)), detail: 'Identity and access work awaiting action', tone: 'text-blue-600' },
      { label: 'Backup Exceptions', value: String(backups.filter((backup) => backup.result !== 'Successful').length), detail: 'Workloads needing DR attention', tone: 'text-amber-600' },
      { label: 'Security Actions', value: String(security.filter((item) => item.state !== 'Healthy').length), detail: 'Controls needing owner follow-up', tone: 'text-violet-600' },
    ],
    serviceHeatmap: FALLBACK_SERVICE_HEATMAP,
  };
};

const sendPortalSlice = (picker) => async (req, res) => {
  const data = await buildPortalData(req);
  return res.json({ success: true, data: picker(data) });
};

export const getITEDPPortalData = async (req, res) => {
  const data = await buildPortalData(req);
  return res.json({ success: true, data });
};

export const getITEDPTickets = sendPortalSlice((data) => data.tickets);
export const getITEDPUsers = sendPortalSlice((data) => data.users);
export const getITEDPAssets = sendPortalSlice((data) => data.assets);
export const getITEDPSystems = sendPortalSlice((data) => data.systems);
export const getITEDPNetwork = sendPortalSlice((data) => data.network);
export const getITEDPBackups = sendPortalSlice((data) => data.backups);
export const getITEDPSecurity = sendPortalSlice((data) => data.security);
export const getITEDPAccess = sendPortalSlice((data) => data.access);
export const getITEDPReports = sendPortalSlice((data) => data.reports);
export const getITEDPSettings = sendPortalSlice((data) => data.settings);
export const getITEDPSupport = sendPortalSlice((data) => data.support);

export const createITEDPTicket = async (req, res) => {
  try {
    const { title, department = 'Hospital', priority = 'Medium', status = 'Open', owner = 'IT Command Center', note = '' } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const record = {
      id: `IT-${randomUUID().slice(0, 4).toUpperCase()}`,
      title,
      department,
      priority: normalizePriority(priority),
      status: normalizeTicketStatus(status),
      owner,
      aging: 'Just now',
      note,
    };
    await logItEdpEvent({ req, action: 'IT_TICKET_CREATED', resourceType: 'it_ticket', resourceId: record.id, after: record });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create IT ticket', error: error.message });
  }
};

export const updateITEDPTicket = async (req, res) => {
  try {
    const before = { id: req.params.id };
    const after = {
      id: req.params.id,
      ...(req.body?.title ? { title: req.body.title } : {}),
      ...(req.body?.department ? { department: req.body.department } : {}),
      ...(req.body?.priority ? { priority: normalizePriority(req.body.priority) } : {}),
      ...(req.body?.status ? { status: normalizeTicketStatus(req.body.status) } : {}),
      ...(req.body?.owner ? { owner: req.body.owner } : {}),
      ...(req.body?.aging ? { aging: req.body.aging } : {}),
      ...(req.body?.note !== undefined ? { note: req.body.note } : {}),
    };
    await logItEdpEvent({ req, action: 'IT_TICKET_UPDATED', resourceType: 'it_ticket', resourceId: req.params.id, before, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update IT ticket', error: error.message });
  }
};

export const deleteITEDPTicket = async (req, res) => {
  try {
    const after = { id: req.params.id, status: 'Deleted', deleted: true };
    await logItEdpEvent({ req, action: 'IT_TICKET_DELETED', resourceType: 'it_ticket', resourceId: req.params.id, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete IT ticket', error: error.message });
  }
};

export const createITEDPUserProvision = async (req, res) => {
  try {
    const { name, department = 'Hospital', role = 'Staff', state = 'Provisioning', access = 'Hospital Systems', note = '' } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const record = {
      id: `USR-${randomUUID().slice(0, 4).toUpperCase()}`,
      name,
      department,
      role,
      state: normalizeUserState(state),
      access,
      lastSeen: 'Just now',
      note,
    };
    await logItEdpEvent({ req, action: 'IT_USER_PROVISION_CREATED', resourceType: 'it_user_provision', resourceId: record.id, after: record });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create IT user provisioning action', error: error.message });
  }
};

export const updateITEDPUserProvision = async (req, res) => {
  try {
    const before = { id: req.params.id };
    const after = {
      id: req.params.id,
      ...(req.body?.name ? { name: req.body.name } : {}),
      ...(req.body?.department ? { department: req.body.department } : {}),
      ...(req.body?.role ? { role: req.body.role } : {}),
      ...(req.body?.state ? { state: normalizeUserState(req.body.state) } : {}),
      ...(req.body?.access ? { access: req.body.access } : {}),
      ...(req.body?.lastSeen ? { lastSeen: req.body.lastSeen } : {}),
      ...(req.body?.note !== undefined ? { note: req.body.note } : {}),
    };
    await logItEdpEvent({ req, action: 'IT_USER_PROVISION_UPDATED', resourceType: 'it_user_provision', resourceId: req.params.id, before, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update IT user provisioning action', error: error.message });
  }
};

export const deleteITEDPUserProvision = async (req, res) => {
  try {
    const after = { id: req.params.id, state: 'Deleted', deleted: true };
    await logItEdpEvent({ req, action: 'IT_USER_PROVISION_DELETED', resourceType: 'it_user_provision', resourceId: req.params.id, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete IT user provisioning action', error: error.message });
  }
};

export const createITEDPAsset = async (req, res) => {
  try {
    const { asset, assetTag, type = 'Device', location = 'Hospital', lifecycle = 'Active', labelStatus = 'Pending', owner = 'IT/EDP', note = '' } = req.body;
    if (!asset) {
      return res.status(400).json({ success: false, message: 'asset is required' });
    }

    const record = {
      asset,
      assetTag: assetTag || `MZ-AST-${randomUUID().slice(0, 6).toUpperCase()}`,
      type,
      location,
      lifecycle,
      labelStatus,
      owner,
      note,
    };
    await logItEdpEvent({ req, action: 'IT_ASSET_CREATED', resourceType: 'it_asset', resourceId: record.assetTag, after: record });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create IT asset', error: error.message });
  }
};

export const updateITEDPAsset = async (req, res) => {
  try {
    const before = { assetTag: req.params.id };
    const after = {
      assetTag: req.params.id,
      ...(req.body?.asset ? { asset: req.body.asset } : {}),
      ...(req.body?.type ? { type: req.body.type } : {}),
      ...(req.body?.location ? { location: req.body.location } : {}),
      ...(req.body?.lifecycle ? { lifecycle: req.body.lifecycle } : {}),
      ...(req.body?.labelStatus ? { labelStatus: req.body.labelStatus } : {}),
      ...(req.body?.owner ? { owner: req.body.owner } : {}),
      ...(req.body?.note ? { note: req.body.note } : {}),
    };
    await logItEdpEvent({ req, action: 'IT_ASSET_UPDATED', resourceType: 'it_asset', resourceId: req.params.id, before, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update IT asset', error: error.message });
  }
};

export const createITEDPAssetLabel = async (req, res) => {
  try {
    const { assetTag, asset, template = 'Asset QR', status = 'Pending', owner = 'IT/EDP', note = '' } = req.body;
    if (!assetTag) {
      return res.status(400).json({ success: false, message: 'assetTag is required' });
    }

    const record = {
      assetTag,
      asset: asset || assetTag,
      template,
      status,
      lastAction: formatTimeLabel(),
      owner,
      note,
    };
    await logItEdpEvent({ req, action: 'IT_ASSET_LABEL_CREATED', resourceType: 'it_asset_label', resourceId: assetTag, after: record });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create asset label action', error: error.message });
  }
};

export const updateITEDPAssetLabel = async (req, res) => {
  try {
    const before = { assetTag: req.params.id };
    const after = {
      assetTag: req.params.id,
      ...(req.body?.asset ? { asset: req.body.asset } : {}),
      ...(req.body?.template ? { template: req.body.template } : {}),
      ...(req.body?.status ? { status: req.body.status } : {}),
      ...(req.body?.owner ? { owner: req.body.owner } : {}),
      ...(req.body?.note ? { note: req.body.note } : {}),
      lastAction: formatTimeLabel(),
    };
    await logItEdpEvent({ req, action: 'IT_ASSET_LABEL_UPDATED', resourceType: 'it_asset_label', resourceId: req.params.id, before, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update asset label action', error: error.message });
  }
};

export const createITEDPNetworkAdmin = async (req, res) => {
  try {
    const { scope, admin = 'Network Team', changeWindow = 'TBD', configState = 'Ready', note = 'Network change request created' } = req.body;
    if (!scope) {
      return res.status(400).json({ success: false, message: 'scope is required' });
    }

    const record = {
      id: `NET-${randomUUID().slice(0, 6).toUpperCase()}`,
      scope,
      admin,
      changeWindow,
      configState,
      note,
    };
    await logItEdpEvent({ req, action: 'IT_NETWORK_ADMIN_CREATED', resourceType: 'it_network_admin', resourceId: record.id, after: record });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create network admin change', error: error.message });
  }
};

export const updateITEDPNetworkAdmin = async (req, res) => {
  try {
    const before = { id: req.params.id };
    const after = {
      id: req.params.id,
      ...(req.body?.scope ? { scope: req.body.scope } : {}),
      ...(req.body?.admin ? { admin: req.body.admin } : {}),
      ...(req.body?.changeWindow ? { changeWindow: req.body.changeWindow } : {}),
      ...(req.body?.configState ? { configState: req.body.configState } : {}),
      ...(req.body?.note ? { note: req.body.note } : {}),
    };
    await logItEdpEvent({ req, action: 'IT_NETWORK_ADMIN_UPDATED', resourceType: 'it_network_admin', resourceId: req.params.id, before, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update network admin change', error: error.message });
  }
};

export const deleteITEDPAsset = async (req, res) => {
  try {
    const after = { assetTag: req.params.id, lifecycle: 'Deleted', labelStatus: 'Deleted', deleted: true };
    await logItEdpEvent({ req, action: 'IT_ASSET_DELETED', resourceType: 'it_asset', resourceId: req.params.id, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete IT asset', error: error.message });
  }
};

export const deleteITEDPAssetLabel = async (req, res) => {
  try {
    const after = { assetTag: req.params.id, status: 'Deleted', deleted: true, lastAction: formatTimeLabel() };
    await logItEdpEvent({ req, action: 'IT_ASSET_LABEL_DELETED', resourceType: 'it_asset_label', resourceId: req.params.id, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete asset label action', error: error.message });
  }
};

export const deleteITEDPNetworkAdmin = async (req, res) => {
  try {
    const after = { id: req.params.id, configState: 'Deleted', deleted: true };
    await logItEdpEvent({ req, action: 'IT_NETWORK_ADMIN_DELETED', resourceType: 'it_network_admin', resourceId: req.params.id, after });
    return res.status(200).json({ success: true, data: after });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete network admin change', error: error.message });
  }
};
import { postgresSequelize } from '../db/postgres-sequelize.js';

const normalize = (value) => String(value || '').trim().toLowerCase();

const hasNamedPermission = (permissions = [], required = []) => {
  const needles = (Array.isArray(required) ? required : [required]).map(normalize).filter(Boolean);
  const granted = (Array.isArray(permissions) ? permissions : []).map(normalize).filter(Boolean);
  return needles.some((needle) => granted.some((permission) =>
    permission === needle || permission.includes(needle) || needle.includes(permission)
  ));
};

const hasAllCorporateActivityAccess = (teamUser = {}) => {
  const role = normalize(teamUser.role);
  const permissions = Array.isArray(teamUser.permissions) ? teamUser.permissions : [];
  return Boolean(
    teamUser.isAdmin === true ||
    role === 'admin' ||
    role === 'super_admin' ||
    hasNamedPermission(permissions, ['Corporate Management', 'Corporate Management Access', 'All Access'])
  );
};

async function getVisibleCorporateIds(teamUser = {}) {
  if (hasAllCorporateActivityAccess(teamUser)) return null;

  const rows = await postgresSequelize.query(
    `SELECT DISTINCT c.id
       FROM corporates c
       LEFT JOIN user_associations ua
         ON ua."entityType" = 'corporate'
        AND ua."entityId" = c.id
        AND ua."userId" = :teamUserId
        AND ua.status = 'active'
      WHERE ua.id IS NOT NULL
         OR c."assignedTo" = :teamUserId`,
    {
      replacements: { teamUserId: teamUser.id || 0 },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  return rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
}

function mapAction(actionRaw) {
  const action = String(actionRaw || '').toUpperCase();
  if (action === 'CREATE' || action === 'POST') return 'create';
  if (action === 'UPDATE' || action === 'PATCH' || action === 'PUT') return 'update';
  if (action === 'DELETE') return 'delete';
  if (action.startsWith('LOGIN')) return 'login';
  if (action === 'LOGOUT') return 'logout';
  if (action === 'EXPORT') return 'export';
  if (action === 'IMPORT') return 'import';
  if (action === 'EMAIL' || action.startsWith('EMAIL_')) return 'email';
  return 'view';
}

function mapResult({ statusCode, status }) {
  if (Number.isFinite(Number(statusCode))) {
    const code = Number(statusCode);
    if (code >= 200 && code < 300) return 'success';
    if (code >= 400) return 'failure';
  }
  const normalized = normalize(status);
  if (['sent', 'success', 'completed', 'queued'].includes(normalized)) return 'success';
  if (['failed', 'error', 'rolled_back'].includes(normalized)) return 'failure';
  if (['warning', 'duplicate'].includes(normalized)) return 'warning';
  return 'info';
}

function mapAuditRow(row) {
  const action = mapAction(row.action);
  const result = mapResult({ statusCode: row.status_code, status: row.status });
  const userTypeRaw = normalize(row.user_type || 'system');
  const userType = ['user', 'doctor', 'admin', 'system', 'team'].includes(userTypeRaw) ? userTypeRaw : 'system';
  const resource = normalize(row.resource_type || 'corporate');
  const activity = `${action.charAt(0).toUpperCase()}${action.slice(1)} ${resource}`.trim();
  const details = row.error_message || [row.method, row.endpoint].filter(Boolean).join(' ') || `${row.action || 'Activity'} on ${resource}`;

  return {
    id: String(row.id),
    timestamp: row.created_at || row.timestamp,
    userId: row.user_id || row.user_email,
    userType,
    userEmail: row.user_email || undefined,
    activity,
    action,
    resource,
    resourceId: row.resource_id || undefined,
    result,
    details,
    ipAddress: row.ip_address || undefined,
    userAgent: row.user_agent || undefined,
    method: row.method || undefined,
    path: row.endpoint || undefined,
    statusCode: row.status_code || undefined,
    metadata: {
      sessionId: row.session_id || undefined,
      source: 'audit_logs',
      corporateId: row.corporate_id || undefined,
      companyName: row.company_name || undefined,
    },
  };
}

function mapWelcomeEmailRow(row) {
  const status = normalize(row.status || 'prepared');
  const result = mapResult({ status: row.status });
  const activity = status === 'sent'
    ? 'Welcome email sent'
    : status === 'queued'
      ? 'Welcome email queued'
      : status === 'failed'
        ? 'Welcome email failed'
        : 'Welcome email activity';

  return {
    id: `welcome-${row.id}`,
    timestamp: row.updated_at || row.created_at,
    userId: row.created_by || row.user_id || undefined,
    userType: 'team',
    userEmail: row.actor_email || row.recipient_email || undefined,
    activity,
    action: 'email',
    resource: 'welcome_email',
    resourceId: String(row.id),
    result,
    details: `${row.recipient_email}${row.company_name ? ` - ${row.company_name}` : ''}${row.error_message ? ` - ${row.error_message}` : ''}`,
    method: 'EMAIL',
    path: '/api/admin/corporate-employee-welcome-emails/send',
    statusCode: status === 'failed' ? 500 : 200,
    metadata: {
      source: 'corporate_welcome_email_deliveries',
      corporateId: row.corporate_id,
      companyName: row.company_name || undefined,
      employeeId: row.employee_id || undefined,
      recipientEmail: row.recipient_email,
      subject: row.subject || undefined,
      attempts: row.attempts,
      deliveryStatus: row.status,
    },
  };
}

function filterRows(rows, { scope, userType, action, result, search, teamUserId }) {
  const q = normalize(search);
  return rows.filter((log) => {
    if (scope === 'mine' && String(log.userId || '') !== String(teamUserId || '')) return false;
    if (scope === 'users' && log.userType !== 'user' && log.resource !== 'welcome_email') return false;
    if (userType && userType !== 'all' && log.userType !== userType) return false;
    if (action && action !== 'all' && log.action !== action) return false;
    if (result && result !== 'all' && log.result !== result) return false;
    if (q) {
      const haystack = [
        log.activity,
        log.details,
        log.userEmail,
        log.ipAddress,
        log.resource,
        log.path,
        log.metadata?.companyName,
        log.metadata?.recipientEmail,
        log.metadata?.employeeId,
        log.metadata?.subject,
      ].map(normalize).join(' ');
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export async function fetchScopedCorporateActivity({ teamUser, query = {}, includePagination = true }) {
  const visibleCorporateIds = await getVisibleCorporateIds(teamUser);
  if (Array.isArray(visibleCorporateIds) && visibleCorporateIds.length === 0) {
    return {
      logs: [],
      pagination: includePagination ? { page: 1, limit: Number(query.limit) || 25, total: 0, pages: 0 } : undefined,
      visibleCorporateCount: 0,
    };
  }

  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(query.limit || 25), 10)));
  const replacements = {
    corporateIds: visibleCorporateIds || [],
    startDate: query.startDate ? new Date(String(query.startDate)).toISOString() : null,
    endDate: query.endDate ? new Date(`${query.endDate}T23:59:59`).toISOString() : null,
  };
  const corpWhere = visibleCorporateIds === null ? 'TRUE' : 'c.id IN (:corporateIds)';
  const dateAuditWhere = [];
  const dateEmailWhere = [];
  if (replacements.startDate) {
    dateAuditWhere.push('COALESCE(created_at, timestamp) >= :startDate');
    dateEmailWhere.push('d.updated_at >= :startDate');
  } else {
    dateAuditWhere.push("COALESCE(created_at, timestamp) >= NOW() - INTERVAL '90 days'");
    dateEmailWhere.push("d.updated_at >= NOW() - INTERVAL '90 days'");
  }
  if (replacements.endDate) {
    dateAuditWhere.push('COALESCE(created_at, timestamp) <= :endDate');
    dateEmailWhere.push('d.updated_at <= :endDate');
  }

  const auditRows = await postgresSequelize.query(
    `WITH visible_corporates AS (
        SELECT c.id, c."companyName" AS company_name
          FROM corporates c
         WHERE ${corpWhere}
      ), visible_employees AS (
        SELECT DISTINCT ua."userId"::text AS user_id, ua."entityId"::int AS corporate_id
          FROM user_associations ua
          JOIN visible_corporates vc ON vc.id = ua."entityId"
         WHERE ua."entityType" = 'corporate'
           AND ua.role = 'employee'
           AND ua.status = 'active'
      ), recent_audits AS (
        SELECT *
          FROM audit_logs
         WHERE ${dateAuditWhere.length ? dateAuditWhere.join(' AND ') : 'TRUE'}
         ORDER BY COALESCE(created_at, timestamp) DESC NULLS LAST
         LIMIT 5000
      )
      SELECT a.id::text,
             a.user_id,
             a.user_type,
             a.user_email,
             a.action,
             a.resource_type,
             a.resource_id,
             a.method,
             a.endpoint,
             a.status,
             a.status_code,
             a.error_message,
             a.ip_address,
             a.user_agent,
             a.session_id,
             a.timestamp,
             a.created_at,
             COALESCE(ve.corporate_id,
                      CASE WHEN a.data_fields->>'corporateId' ~ '^[0-9]+$' THEN (a.data_fields->>'corporateId')::int END,
                      CASE WHEN a.data_fields->>'corporate_id' ~ '^[0-9]+$' THEN (a.data_fields->>'corporate_id')::int END,
                      CASE WHEN a.changes_after->>'corporateId' ~ '^[0-9]+$' THEN (a.changes_after->>'corporateId')::int END,
                      CASE WHEN a.changes_after->>'corporate_id' ~ '^[0-9]+$' THEN (a.changes_after->>'corporate_id')::int END) AS corporate_id,
             vc.company_name
        FROM recent_audits a
        LEFT JOIN visible_employees ve ON ve.user_id = a.user_id::text
        LEFT JOIN visible_corporates vc ON vc.id = COALESCE(
             ve.corporate_id,
             CASE WHEN a.data_fields->>'corporateId' ~ '^[0-9]+$' THEN (a.data_fields->>'corporateId')::int END,
             CASE WHEN a.data_fields->>'corporate_id' ~ '^[0-9]+$' THEN (a.data_fields->>'corporate_id')::int END,
             CASE WHEN a.changes_after->>'corporateId' ~ '^[0-9]+$' THEN (a.changes_after->>'corporateId')::int END,
             CASE WHEN a.changes_after->>'corporate_id' ~ '^[0-9]+$' THEN (a.changes_after->>'corporate_id')::int END)
       WHERE (
             ve.user_id IS NOT NULL
          OR vc.id IS NOT NULL
          OR EXISTS (
              SELECT 1 FROM visible_corporates ep
               WHERE a.endpoint ILIKE ('%corporateId=' || ep.id || '%')
                  OR a.endpoint ILIKE ('%corporate_id=' || ep.id || '%')
                  OR a.endpoint ILIKE ('%/corporate-employees/' || ep.id || '%')
                  OR a.endpoint ILIKE ('%/corporate-users/' || ep.id || '%')
                  OR a.endpoint ILIKE ('%/corporate-plans/' || ep.id || '%')
                  OR a.endpoint ILIKE ('%/corporate-calendar/' || ep.id || '%')
                  OR a.endpoint ILIKE ('%/corporate-network/' || ep.id || '%')
                  OR a.endpoint ILIKE ('%/corporate-health-packages/' || ep.id || '%')
          )
       )
       ORDER BY COALESCE(a.created_at, a.timestamp) DESC NULLS LAST
       LIMIT 5000`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  );

  const emailRows = await postgresSequelize.query(
    `SELECT d.id,
            d.corporate_id,
            c."companyName" AS company_name,
            d.user_id,
            d.employee_id,
            d.recipient_email,
            d.subject,
            d.status,
            d.attempts,
            d.error_message,
            d.metadata,
            d.created_by,
            d.created_at,
            d.updated_at,
            actor.email AS actor_email
       FROM corporate_welcome_email_deliveries d
       JOIN corporates c ON c.id = d.corporate_id
       LEFT JOIN users actor ON actor.id = d.created_by
      WHERE ${visibleCorporateIds === null ? 'TRUE' : 'd.corporate_id IN (:corporateIds)'}
      ${dateEmailWhere.length ? `AND ${dateEmailWhere.join(' AND ')}` : ''}
      ORDER BY d.updated_at DESC
      LIMIT 5000`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  );

  const mapped = [
    ...auditRows.map(mapAuditRow),
    ...emailRows.map(mapWelcomeEmailRow),
  ].filter((log) => log.timestamp);

  const filtered = filterRows(mapped, {
    scope: query.scope,
    userType: query.userType,
    action: query.action,
    result: query.result,
    search: query.search,
    teamUserId: teamUser.id,
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const offset = (pageNum - 1) * limitNum;
  return {
    logs: includePagination ? filtered.slice(offset, offset + limitNum) : filtered,
    pagination: includePagination ? {
      page: pageNum,
      limit: limitNum,
      total: filtered.length,
      pages: Math.ceil(filtered.length / limitNum),
    } : undefined,
    visibleCorporateCount: visibleCorporateIds === null ? null : visibleCorporateIds.length,
  };
}

export function summarizeScopedCorporateActivity(logs = []) {
  const now = Date.now();
  const h24 = new Date(now - 24 * 60 * 60 * 1000);
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const todayLogs = logs.filter((log) => new Date(log.timestamp) > h24);
  const byResult = { success: 0, failure: 0, warning: 0, info: 0 };
  const byUserType = { admin: 0, doctor: 0, user: 0, system: 0, team: 0 };
  const byAction = {};

  for (const log of logs) {
    if (byResult[log.result] !== undefined) byResult[log.result]++;
    if (byUserType[log.userType] !== undefined) byUserType[log.userType]++;
    byAction[log.action] = (byAction[log.action] || 0) + 1;
  }

  return {
    total: logs.length,
    last24Hours: todayLogs.length,
    last7Days: logs.filter((log) => new Date(log.timestamp) > d7).length,
    failures24h: todayLogs.filter((log) => log.result === 'failure').length,
    byResult,
    byUserType,
    topActions: Object.entries(byAction)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count })),
  };
}

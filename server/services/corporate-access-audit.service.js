// Dependencies are injected so access decisions can be verified without booting the API.
export function corporateAccessAudit(database) {
  async function record(req, { resourceId, title, action }, transaction) {
    const user = req.user || {};
    const direct = user.role === 'corporate';
    const corporateId = user.corporateId;
    if (!corporateId) throw new Error('Corporate context required for audit');
    await database.query(
      `INSERT INTO corporate_report_access_log
        (corporate_id, report_id, report_title, accessed_by_type, accessed_by_user_id,
         accessed_by_name, action, ip_address, accessed_at)
       VALUES (:corporateId, :resourceId, :title, :actorType, :userId, :name, :action, :ip, NOW())`,
      { replacements: {
        corporateId, resourceId: String(resourceId).slice(0, 100), title: String(title || '').slice(0, 255),
        actorType: direct ? 'corporate' : 'hr',
        // Corporate credentials are not a users-table identity; integer IDs may collide.
        userId: direct ? null : user.userId || null,
        name: String(direct ? (user.email || req.corporateUser?.contactPersonName || 'Corporate') : `HR user ${user.userId || 'unknown'}`).slice(0, 255),
        action, ip: req.ip || null,
      }, transaction }
    );
  }

  async function requireHealthConsent(req, employee) {
    if (!['corporate', 'corporate_admin', 'hr_staff', 'corporate_cmo', 'corporate_ohc'].includes(req.user?.role)) {
      throw Object.assign(new Error('Your role cannot access employee health reports'), { statusCode: 403 });
    }
    const [rows] = await database.query(
      `SELECT 1 FROM corporate_employee_consents
        WHERE corporate_id = :corporateId AND employee_id = :employeeId
          AND consent_type = 'health_data' AND granted = true AND revoked_at IS NULL LIMIT 1`,
      { replacements: { corporateId: req.user.corporateId, employeeId: employee.employeeId } }
    );
    if (!rows.length) {
      throw Object.assign(new Error('Employee health-data consent is required to view or export reports'), {
        statusCode: 403, code: 'health_consent_required',
      });
    }
  }

  return { record, requireHealthConsent };
}

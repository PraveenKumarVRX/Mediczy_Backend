// Numeric ids remain private adapter details. New public chart selection uses a registered UID.
export async function resolveChatSubject(database, req, uid, canAccess) {
  const role = String(req.userRole || req.user?.role || '');
  if (!['doctor', 'medical_director', 'nurse', 'assistant'].includes(role)) throw Object.assign(new Error('Clinical chart access required'), { statusCode: 403 });
  if (!/^[A-Z0-9]{6}$/.test(uid || '')) throw Object.assign(new Error('Registered patient UID required'), { statusCode: 400 });
  const { rows } = await database.query(`SELECT u.id,u.unique_id,u.organization_id,u.organization_uid FROM users u WHERE u.unique_id=$1`, [uid]);
  const subject = rows[0];
  if (!subject || !(await canAccess(req, subject.id))) throw Object.assign(new Error('Patient access denied'), { statusCode: 403 });
  const org = req.tenant?.id ?? req.user?.organization_id;
  const orgUid=req.tenant?.unique_id || req.user?.organization_uid;
  if ((org && !orgUid) || (subject.organization_id && !subject.organization_uid)) throw Object.assign(new Error('Registered organization scope required for chart access'),{statusCode:403});
  if (orgUid && subject.organization_uid && orgUid!==subject.organization_uid) throw Object.assign(new Error('Patient organization access denied'), { statusCode: 403 });
  return subject;
}

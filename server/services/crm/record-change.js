// Persist system events as completed activities so they never become overdue
// follow-ups. Callers with a transaction include this in the same commit.
export async function recordCRMChange(db, user, entity, row, action) {
  const title = `${entity[0].toUpperCase() + entity.slice(1)} ${action}: ${row.name || row.title || row.id}`;
  const leadId = entity === 'lead' ? row.id : row.lead_id || null;
  const dealId = entity === 'deal' ? row.id : null;
  const contactId = entity === 'contact' ? row.id : row.contact_id || null;
  await db.query(`INSERT INTO crm_activities (type,title,description,lead_id,deal_id,contact_id,completed_at,created_by,tenant_uid)
    VALUES ('note',$1,$2,$3,$4,$5,NOW(),$6,$7)`, [title, `System record: ${entity} ${action}`, leadId, dealId, contactId, user.id, user.tenantUid]);
  await db.query(`INSERT INTO crm_audit_log (tenant_id,entity_type,entity_id,event_type,actor_user_id,new_value)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [user.tenantId, entity, row.id, action, user.id, JSON.stringify({ id:row.id, name:row.name || row.title, status:row.status || row.stage })]);
}

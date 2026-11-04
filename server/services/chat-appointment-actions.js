import crypto from 'node:crypto';
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const digest = token => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Confirmation and mutation receipt use the existing session/appointment transactions. */
export function createChatAppointmentActions({ database, repository, resolveActor, owns, cancel, reschedule, validateTarget }) {
  async function actorFor(req) {
    if (!['user', 'patient', 'doctor'].includes(req.userRole || req.user?.role)) throw fail(403, 'Patient or treating doctor required');
    return resolveActor(req);
  }
  return {
    async propose(req, owner, { kind, appointmentId, appointmentDate, appointmentTime, reason }) {
      if (!['cancel', 'reschedule'].includes(kind) || !Number.isSafeInteger(Number(appointmentId)) || Number(appointmentId) < 1) throw fail(400, 'Invalid appointment action');
      if (kind === 'reschedule') {
        const target = new Date(`${appointmentDate}T${appointmentTime}:00+05:30`);
        if (!Number.isFinite(target.getTime()) || target<=new Date() || new Date(`${appointmentDate}T12:00:00Z`).toISOString().slice(0,10)!==appointmentDate) throw fail(400,'Valid future appointment time required');
      }
      const actor = await actorFor(req);
      const appointment = await repository.findById(req, appointmentId);
      if (!appointment || !owns(appointment, actor)) throw fail(403, 'Appointment access denied');
      if (kind === 'reschedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate || '') || !/^\d{2}:\d{2}$/.test(appointmentTime || ''))) throw fail(400, 'Date and time required');
      const id = `chat_${crypto.randomBytes(16).toString('hex')}`;
      const token = crypto.randomBytes(24).toString('hex');
      const action = { kind, appointmentId: appointment.id, appointmentDate, appointmentTime, reason: String(reason || '').slice(0,500), confirmation: digest(token), expectedDate: appointment.appointmentDate instanceof Date ? appointment.appointmentDate.toISOString().slice(0,10) : String(appointment.appointmentDate).slice(0,10), expectedTime: appointment.appointmentTime, expectedStatus: appointment.status };
      await database.query(`INSERT INTO chatbot_sessions(session_id,owner_scope,expires_at,metadata) VALUES($1,$2,NOW()+INTERVAL '10 minutes',$3::jsonb)`, [id, owner, JSON.stringify({ action })]);
      return { actionId: id, confirmationToken: token, requiresConfirmation: true, action: { kind, appointmentId: appointment.id, appointmentDate, appointmentTime } };
    },
    async confirm(req, owner, { actionId, confirmationToken, confirmed }) {
      if (confirmed !== true || !/^chat_[a-f0-9]{32}$/.test(actionId || '') || !/^[a-f0-9]{48}$/.test(confirmationToken || '')) throw fail(400, 'Explicit action confirmation required');
      const actor = await actorFor(req);
      return repository.withTransaction(req, async transaction => {
        const [rows] = await repository.queryInTransaction(`SELECT metadata FROM chatbot_sessions WHERE session_id=:id AND owner_scope=:owner AND active AND expires_at>NOW() FOR UPDATE`, { id: actionId, owner }, transaction);
        const metadata = rows[0]?.metadata;
        if (!metadata || metadata.action.confirmation !== digest(confirmationToken)) throw fail(403, 'Invalid or expired confirmation');
        const current = await repository.findByIdForActorInTransaction(actor, metadata.action.appointmentId, transaction);
        if (!current || !owns(current, actor)) throw fail(403, 'Appointment access denied');
        if (metadata.result) return { ...metadata.result, replayed: true };
        const action = metadata.action;
        const currentDate = current.appointmentDate instanceof Date ? current.appointmentDate.toISOString().slice(0,10) : String(current.appointmentDate).slice(0,10);
        if (currentDate !== action.expectedDate || current.appointmentTime !== action.expectedTime || current.status !== action.expectedStatus) throw fail(409, 'Appointment changed; request a new confirmation');
        if (action.kind === 'reschedule') {
          if (!validateTarget) throw fail(503,'Availability validation unavailable');
          await validateTarget(current,action,transaction);
        }
        const nextReq = { ...req, chatTransaction: transaction, params: { id: action.appointmentId }, body: { appointmentDate: action.appointmentDate, appointmentTime: action.appointmentTime, reason: action.reason } };
        let status = 200, payload;
        const response = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
        await (action.kind === 'cancel' ? cancel : reschedule)(nextReq, response);
        if (status >= 400) throw fail(status, payload?.message || 'Appointment change failed');
        const result = { appointmentId: current.id, status: payload?.appointment?.status, kind: action.kind, committed: true };
        await repository.queryInTransaction(`UPDATE chatbot_sessions SET metadata=jsonb_set(jsonb_set(metadata,'{result}',CAST(:result AS jsonb)),'{delivery}',CAST(:delivery AS jsonb)),updated_at=NOW() WHERE session_id=:id`, { result: JSON.stringify(result), delivery: JSON.stringify({ status: 'pending', eventId: actionId, userId: current.userId, kind: action.kind, appointmentId: current.id, attempts: 0 }), id: actionId }, transaction);
        return result;
      });
    },
  };
}

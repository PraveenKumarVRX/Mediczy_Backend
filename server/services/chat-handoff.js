const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export function applyHandoffEvent(handoff, appointment, event) {
  const state = { status: 'offered', ...handoff };
  if (!event.id || (state.eventIds || []).includes(event.id)) return state;
  if (['completed','failed'].includes(state.status)) return state;
  const identity = event.participant?.identity;
  const doctor = identity === `doctor-${appointment.doctorId}`;
  const patient = identity === (appointment.userId ? `user-${appointment.userId}` : `guest-${appointment.id}`);
  if (event.event !== 'room_finished' && !doctor && !patient) return state;
  const timestamp = Number(event.createdAt || 0);
  if (timestamp && timestamp < (state.lastEventAt || 0)) return state;
  state.eventIds = [...(state.eventIds || []), event.id].slice(-100);
  state.lastEventAt = timestamp || state.lastEventAt;
  if (event.event === 'room_finished') {
    state.status = state.connectedAt ? 'completed' : 'failed';
  } else if (event.event === 'participant_joined') {
    if (doctor) { state.doctorJoined = true; state.acceptedAt ||= new Date().toISOString(); }
    if (patient) state.patientJoined = true;
    state.status = state.doctorJoined && state.patientJoined ? 'connected' : state.doctorJoined ? 'accepted' : 'offered';
    if (state.status === 'connected') state.connectedAt ||= new Date().toISOString();
  } else if (event.event === 'participant_left') {
    if (doctor) state.doctorJoined = false;
    if (patient) state.patientJoined = false;
    if (state.connectedAt) state.status = 'interrupted';
  }
  return state;
}

export function createChatHandoff({ repository, resolveActor, owns, verifyEvent }) {
  return {
    async read(req, id) {
      const actor = await resolveActor(req);
      const appointment = await repository.findById(req,id);
      if (!appointment || !owns(appointment,actor)) throw fail(403,'Consultation access denied');
      if (appointment.notes_json?.type!=='emergency_triage') throw fail(404,'No handoff requested');
      const state = appointment.notes_json?.handoff || { status: 'offered' };
      return { appointmentId: appointment.id, status: state.status, acceptedAt: state.acceptedAt, connectedAt: state.connectedAt };
    },
    async decide(req,id,status) {
      const actor = await resolveActor(req);
      if (actor.type !== 'doctor' || !['accepted','failed'].includes(status)) throw fail(403,'Assigned doctor decision required');
      return repository.withTransaction(req, async transaction => {
        const appointment = await repository.findByIdForActorInTransaction(actor,id,transaction);
        if (!appointment || !owns(appointment,actor) || appointment.notes_json?.type !== 'emergency_triage') throw fail(403,'Consultation access denied');
        const state = appointment.notes_json.handoff || { status:'offered' };
        if (state.status !== status && state.status !== 'offered') throw fail(409,'Handoff has already advanced');
        const next = { ...state, status, ...(status === 'accepted' ? { acceptedAt: new Date().toISOString() } : {}) };
        await appointment.update({ notes_json: { ...appointment.notes_json, handoff: next } }, { transaction });
        return { appointmentId: appointment.id, status: next.status };
      });
    },
    async provider(raw, authorization) {
      const event = await verifyEvent(raw,authorization);
      if (!event.room?.name || !event.id) throw fail(400,'Invalid provider event');
      return repository.withSystemTransaction(async transaction => {
        const appointment = await repository.findByMeetingForUpdate(event.room.name,transaction);
        if (!appointment || appointment.notes_json?.type !== 'emergency_triage') return { ignored: true };
        const state = applyHandoffEvent(appointment.notes_json.handoff,appointment,event);
        await appointment.update({ notes_json: { ...appointment.notes_json, handoff: state } }, { transaction });
        return { received: true };
      });
    },
  };
}

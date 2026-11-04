// A patient response must never carry the assigned clinician's join credentials.
export function patientVideoAccess({roomId,appointmentId,patientJoinUrl,livekitJoinData}) {
  return {roomId,appointmentId,joinUrl:patientJoinUrl,patientJoinUrl,platform:'LiveKit',livekit:livekitJoinData?.patient || null};
}

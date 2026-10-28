export function appointmentFee(doctor, availability, mode) {
  const online = doctor.onlineConsultationFee ?? availability?.videoConsultationFee ?? doctor.consultationFees;
  const value = mode === 'in-person' ? doctor.inPersonConsultationFee ?? availability?.inPersonConsultationFee ?? doctor.consultationFees
    : mode === 'audio' ? availability?.audioConsultationFee ?? online
    : mode === 'chat' ? availability?.chatConsultationFee ?? online : online;
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return Number(value);
}

const DIGITS_ONLY_REGEX = /^\d+$/;

const addIdCandidate = (targetSet, value) => {
  if (value === undefined || value === null) return;
  targetSet.add(value);
  const normalized = String(value).trim();
  if (!normalized) return;
  targetSet.add(normalized);
  if (DIGITS_ONLY_REGEX.test(normalized)) {
    targetSet.add(Number.parseInt(normalized, 10));
  }
};

export const resolveDoctorIdCandidates = async ({ actorId, actorDoctorId, actorEmail, UserModel }) => {
  const doctorIdCandidates = new Set();

  addIdCandidate(doctorIdCandidates, actorId);
  addIdCandidate(doctorIdCandidates, actorDoctorId);

  if (actorEmail && UserModel) {
    try {
      const linkedDoctorUser = await UserModel.findOne({
        where: { email: actorEmail, role: 'doctor' },
        attributes: ['id'],
      });
      addIdCandidate(doctorIdCandidates, linkedDoctorUser?.id);
    } catch (doctorLookupError) {
      console.warn('Could not resolve linked doctor user ID:', doctorLookupError?.message || doctorLookupError);
    }
  }

  return Array.from(doctorIdCandidates);
};

export const isDoctorOwnerFromCandidates = (appointmentDoctorId, doctorIdCandidates) => {
  if (!Array.isArray(doctorIdCandidates) || doctorIdCandidates.length === 0) {
    return false;
  }
  const normalizedDoctorId = String(appointmentDoctorId ?? '').trim();
  return doctorIdCandidates.some((candidate) => String(candidate ?? '').trim() === normalizedDoctorId);
};

export const findDoctorAuthorizedAppointment = async ({
  AppointmentModel,
  Op,
  appointmentId,
  doctorIdCandidates,
  include,
  transaction,
  allowMeetingFallback = true,
}) => {
  if (!Array.isArray(doctorIdCandidates) || doctorIdCandidates.length === 0) {
    return null;
  }

  const doctorWhere = { [Op.in]: doctorIdCandidates };
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const isNumericAppointmentId = DIGITS_ONLY_REGEX.test(normalizedAppointmentId);
  const numericAppointmentId = isNumericAppointmentId ? Number.parseInt(normalizedAppointmentId, 10) : NaN;
  const isSafeIntId = Number.isSafeInteger(numericAppointmentId) && numericAppointmentId > 0 && numericAppointmentId <= 2147483647;

  const queryBase = { include, transaction };

  let appointment = null;
  if (isSafeIntId) {
    appointment = await AppointmentModel.findOne({
      ...queryBase,
      where: { id: numericAppointmentId, doctorId: doctorWhere },
    });
  }

  if (!appointment && allowMeetingFallback) {
    const candidateMeetingIds = [normalizedAppointmentId, `apt-${normalizedAppointmentId}`];
    appointment = await AppointmentModel.findOne({
      ...queryBase,
      where: { doctorId: doctorWhere, meetingId: candidateMeetingIds },
    });

    if (!appointment) {
      const meetingIdToken = `room=${normalizedAppointmentId}`;
      const meetingIdTokenWithPrefix = `room=apt-${normalizedAppointmentId}`;
      appointment = await AppointmentModel.findOne({
        ...queryBase,
        where: {
          doctorId: doctorWhere,
          meetingLink: {
            [Op.or]: [
              { [Op.iLike]: `%${meetingIdToken}%` },
              { [Op.iLike]: `%${meetingIdTokenWithPrefix}%` },
            ],
          },
        },
      });
    }
  }

  return appointment;
};

import api from "@/utils/api";
import type {
  AppointmentAnalytics,
  AppointmentBooking,
  AppointmentListResponse,
  EnhancedAppointmentListResponse,
  JoinAppointmentVideoResponse,
  PatientAppointment,
  PrescriptionLookupResponse,
  RescheduleAppointmentPayload,
} from "@/types/appointments";

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asString = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const parseBackendId = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getDoctorName = (booking: Record<string, any>) => {
  const joinedName = [booking.doctor?.firstName, booking.doctor?.lastName].filter(Boolean).join(" ");
  return asString(booking.doctorName ?? booking.doctor_name ?? joinedName, "Doctor") || "Doctor";
};

const normalizeBooking = (booking: Record<string, any>): AppointmentBooking => ({
  id: asNumber(booking.id ?? booking.appointmentId ?? booking.appointment_id),
  doctorId: booking.doctorId ?? booking.doctor_id ?? booking.doctor?.id ?? booking.doctor?._id,
  doctorName: getDoctorName(booking),
  specialization: asString(
    booking.specialization ?? booking.doctor?.specialization ?? booking.specialty,
    "General Consultation"
  ),
  appointmentDate: asString(booking.appointmentDate ?? booking.date),
  appointmentTime: asString(booking.appointmentTime ?? booking.time, "00:00"),
  status: asString(booking.status, "scheduled"),
  consultationType: asString(booking.consultationType ?? booking.consultation_type, "video"),
  consultationFee: asNumber(booking.consultationFee ?? booking.fee ?? booking.amount),
  paymentStatus: asString(booking.paymentStatus ?? booking.payment_status, "pending"),
  symptoms: booking.symptoms,
  reason: booking.reason,
  notes: booking.notes,
  createdAt: booking.createdAt ?? booking.created_at,
  meetingLink: booking.meetingLink ?? booking.meeting_link,
  rating: booking.rating === undefined || booking.rating === null ? undefined : asNumber(booking.rating),
  feedback: booking.feedback,
});

const getPatientAppointmentStatus = (appointment: Record<string, any>): PatientAppointment["status"] => {
  const rawDate = appointment.appointmentDate ?? appointment.date;
  const originalStatus = asString(appointment.status, "scheduled");

  if (originalStatus === "cancelled") return "cancelled";

  const appointmentDate = new Date(asString(rawDate));
  appointmentDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = appointmentDate < today;

  if (!isPast && ["scheduled", "confirmed", "pending"].includes(originalStatus)) {
    return "upcoming";
  }

  return "completed";
};

const normalizePatientAppointment = (appointment: Record<string, any>): PatientAppointment => {
  const rawDate = asString(appointment.appointmentDate ?? appointment.date);
  const rawTime = asString(appointment.appointmentTime ?? appointment.time);
  const consultationType =
    appointment.consultationType === "walkin" || appointment.consultationType === "in-person"
      ? "walkin"
      : "online";
  const channel =
    appointment.channel === "phone" || appointment.consultationType === "audio"
      ? "phone"
      : appointment.consultationType === "in-person"
        ? "in-person"
        : "video";

  return {
    id: asString(appointment.id ?? appointment.appointmentId ?? appointment._id ?? crypto.randomUUID()),
    backendId: parseBackendId(appointment.id ?? appointment.appointmentId ?? appointment.appointment_id),
    doctor: {
      id: appointment.doctorId ?? appointment.doctor_id ?? appointment.doctor?._id ?? appointment.doctor?.id,
      name:
        appointment.doctorName ??
        (appointment.doctor ? [appointment.doctor.firstName, appointment.doctor.lastName].filter(Boolean).join(" ") : "Doctor"),
      specialty: appointment.specialization ?? appointment.doctor?.specialization ?? "",
      profileImage: appointment.doctorProfileImage ?? appointment.doctor?.profileImage,
    },
    meetingLink: appointment.meetingLink ?? appointment.meeting_link,
    roomId: appointment.roomId ?? appointment.videoRoomId ?? appointment.meetingId ?? appointment.meeting_id,
    meetingId: appointment.meetingId ?? appointment.meeting_id,
    date: rawDate,
    time: rawTime,
    consultationType,
    channel,
    clinicName:
      appointment.clinicName ??
      appointment.clinic?.name ??
      (consultationType === "walkin" ? appointment.location : undefined),
    clinicAddress:
      appointment.clinicAddress ??
      appointment.clinic?.address ??
      (consultationType === "walkin" ? appointment.location : undefined),
    location:
      consultationType === "walkin"
        ? appointment.location ?? appointment.clinic?.address ?? "Clinic / Hospital"
        : "Online",
    status: getPatientAppointmentStatus(appointment),
    originalStatus: appointment.status || "scheduled",
    paymentStatus: appointment.paymentStatus,
    symptoms: appointment.symptoms,
    notes: appointment.notes,
    reminderEnabled: true,
    estimatedDuration: asNumber(appointment.estimatedDuration, 30) || 30,
    fee: asNumber(
      appointment.consultationFee ?? appointment.serviceTierPrice ?? appointment.serviceTier?.price,
      0
    ),
  };
};

export const normalizeAppointmentList = (response: AppointmentListResponse | unknown): AppointmentBooking[] => {
  const data = response as AppointmentListResponse;
  const list = Array.isArray(data)
    ? data
    : data?.appointments && Array.isArray(data.appointments)
      ? data.appointments
      : data?.data?.appointments && Array.isArray(data.data.appointments)
        ? data.data.appointments
        : [];

  return list.map((item) => normalizeBooking(item as Record<string, any>));
};

export const normalizeEnhancedAppointmentList = (response: EnhancedAppointmentListResponse | unknown): PatientAppointment[] => {
  const data = response as EnhancedAppointmentListResponse;
  const list = Array.isArray(data)
    ? data
    : data?.appointments && Array.isArray(data.appointments)
      ? data.appointments
      : data?.data?.appointments && Array.isArray(data.data.appointments)
        ? data.data.appointments
        : [];

  return list.map((item) => normalizePatientAppointment(item as Record<string, any>));
};

export const appointmentsService = {
  async getAnalytics() {
    const { data } = await api.get<{ analytics?: AppointmentAnalytics } | AppointmentAnalytics>("/appointments/analytics/basic");
    return (data as { analytics?: AppointmentAnalytics }).analytics || (data as AppointmentAnalytics);
  },

  async getMyBookings() {
    const { data } = await api.get<AppointmentListResponse>("/appointments");
    return normalizeAppointmentList(data);
  },

  async getEnhancedAppointments() {
    const { data } = await api.get<EnhancedAppointmentListResponse>("/enhanced-appointments/my-appointments", {
      params: { limit: 500 },
    });
    return normalizeEnhancedAppointmentList(data);
  },

  async cancelAppointment(appointmentId: number, cancellationReason = "Cancelled by patient") {
    await api.patch(`/appointments/${appointmentId}/cancel`, { cancellationReason });
  },

  async rescheduleAppointment({ appointmentId, appointmentDate, appointmentTime }: RescheduleAppointmentPayload) {
    await api.patch(`/appointments/${appointmentId}/reschedule`, { appointmentDate, appointmentTime });
  },

  async downloadCalendar(appointmentId: number) {
    const response = await api.get<Blob>(`/appointments/${appointmentId}/calendar`, {
      responseType: "blob",
    });
    return response.data;
  },

  async joinVideo(appointmentId: number) {
    const { data } = await api.get<JoinAppointmentVideoResponse>(`/consultation/video/join/${appointmentId}`);
    return data;
  },

  async getPrescriptionForAppointment(appointmentId: number) {
    const { data } = await api.get<PrescriptionLookupResponse>(`/prescriptions/appointment/${appointmentId}`);
    return data;
  },
};

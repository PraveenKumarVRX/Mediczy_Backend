import api from "@/utils/api";

export type DoctorListParams = Record<string, string | number | boolean | undefined | null>;

export type DoctorSlotParams = {
  date?: string;
};

export type CreateMobileAppointmentPayload = {
  doctorId: number | string;
  appointmentDate: string;
  appointmentTime: string;
  type: "online" | "in-person";
  symptoms?: string;
  notes?: string | null;
};

export type CreateMobileAppointmentResponse = {
  appointment?: {
    id?: number;
  };
  data?: {
    appointment?: {
      id?: number;
    };
  };
};

export const doctorBookingService = {
  async getDoctors(path: string, params?: DoctorListParams) {
    const { data } = await api.get(path, params ? { params } : undefined);
    return data;
  },

  async getDoctorSlots(doctorId: string, params?: DoctorSlotParams) {
    const { data } = await api.get(`/doctors/${doctorId}/user-slots`, {
      params: params?.date ? { date: params.date } : {},
    });
    return data;
  },

  async createMobileAppointment(payload: CreateMobileAppointmentPayload) {
    const { data } = await api.post<CreateMobileAppointmentResponse>("/appointments", { ...payload, consultationType: payload.type === "in-person" ? "in-person" : "video" });
    return data;
  },
};

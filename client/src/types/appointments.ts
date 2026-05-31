export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "no-show"
  | string;

export type ConsultationType = "video" | "audio" | "chat" | "in-person" | string;

export type PaymentStatus = "pending" | "paid" | "refunded" | "failed" | string;

export type AppointmentBooking = {
  id: number;
  doctorId?: number | string;
  doctorName: string;
  specialization: string;
  appointmentDate: string;
  appointmentTime: string;
  status: AppointmentStatus;
  consultationType: ConsultationType;
  consultationFee: number;
  paymentStatus: PaymentStatus;
  symptoms?: string;
  reason?: string;
  notes?: string;
  createdAt?: string;
  meetingLink?: string;
  rating?: number;
  feedback?: string;
};

export type PatientAppointment = {
  id: string;
  backendId?: number;
  meetingLink?: string;
  roomId?: string;
  meetingId?: string;
  paymentStatus?: string;
  doctor: {
    id?: string;
    name: string;
    specialty: string;
    profileImage?: string;
  };
  date: string;
  time: string;
  location: string;
  consultationType: "online" | "walkin";
  channel: "video" | "phone" | "in-person";
  clinicName?: string;
  clinicAddress?: string;
  status: "upcoming" | "completed" | "cancelled" | "rescheduled";
  originalStatus?: string;
  symptoms?: string;
  notes?: string;
  reminderEnabled: boolean;
  estimatedDuration: number;
  fee: number;
};

export type AppointmentAnalytics = Record<string, unknown>;

export type AppointmentListResponse =
  | AppointmentBooking[]
  | {
      appointments?: AppointmentBooking[];
      data?: {
        appointments?: AppointmentBooking[];
      };
    };

export type EnhancedAppointmentListResponse =
  | Record<string, unknown>[]
  | {
      appointments?: Record<string, unknown>[];
      data?: {
        appointments?: Record<string, unknown>[];
      };
    };

export type JoinAppointmentVideoResponse = {
  success?: boolean;
  message?: string;
  video?: {
    meetingId?: string;
    meetingLink?: string;
    roomId?: string;
  };
};

export type RescheduleAppointmentPayload = {
  appointmentId: number;
  appointmentDate: string;
  appointmentTime: string;
};

export type PrescriptionLookupResponse = {
  success?: boolean;
  prescription?: {
    id?: number | string;
  };
};

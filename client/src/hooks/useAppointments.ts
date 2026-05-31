import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsService } from "@/services/appointments.service";
import type { RescheduleAppointmentPayload } from "@/types/appointments";

export const appointmentQueryKeys = {
  all: ["appointments"] as const,
  analytics: ["appointmentAnalytics"] as const,
  myBookings: (userId?: string | number) => ["appointments", "myBookings", userId ?? "anonymous"] as const,
  enhanced: ["enhancedAppointments"] as const,
};

export const useAppointmentAnalytics = () =>
  useQuery({
    queryKey: appointmentQueryKeys.analytics,
    queryFn: appointmentsService.getAnalytics,
    staleTime: 5 * 60_000,
  });

export const useMyBookings = (userId?: string | number) =>
  useQuery({
    queryKey: appointmentQueryKeys.myBookings(userId),
    queryFn: appointmentsService.getMyBookings,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

export const useEnhancedAppointments = () =>
  useQuery({
    queryKey: appointmentQueryKeys.enhanced,
    queryFn: appointmentsService.getEnhancedAppointments,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });

export const useCancelAppointment = (userId?: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId: number) => appointmentsService.cancelAppointment(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.myBookings(userId) });
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.enhanced });
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.analytics });
    },
  });
};

export const useRescheduleAppointment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RescheduleAppointmentPayload) => appointmentsService.rescheduleAppointment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.enhanced });
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.analytics });
    },
  });
};

export const useAppointmentCalendarDownload = () =>
  useMutation({
    mutationFn: (appointmentId: number) => appointmentsService.downloadCalendar(appointmentId),
  });

export const useJoinAppointmentVideo = () =>
  useMutation({
    mutationFn: (appointmentId: number) => appointmentsService.joinVideo(appointmentId),
  });

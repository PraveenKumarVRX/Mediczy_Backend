import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

// WP-0.3b: OTModulePages.tsx used to render 14 hardcoded seed arrays covering schedule, pre-op
// checklists, consent forms, teams, equipment, sterilization, implants, anesthesia, safety checklists,
// post-op patients, OT records, reports and analytics — plus a "live" theatre view that fabricated
// jittering vital signs for named patients during "active surgery" with zero backend behind it. This
// hook fetches what's real from server/routes/ot-scheduling.route.js (today's schedule, then each
// booking's checklist/implants/operative-note in parallel); pages with no real backend at all say so
// explicitly rather than inventing data — see OTModulePages.tsx for the full breakdown.

export interface OTChecklistPhase {
  completed: boolean;
  completedAt: string | null;
}

export interface OTImplant {
  implantName: string;
  manufacturer: string | null;
  modelNumber: string | null;
  lotNumber: string | null;
  bodyLocation: string | null;
  implantDate: string | null;
}

export interface OTOperativeNote {
  id: number;
  patientName: string | null;
  procedureName: string;
  findings: string | null;
  complications: string | null;
  bloodLossMl: number | null;
  status: string;
  signedBy: string | null;
  signedAt: string | null;
}

export interface OTBooking {
  id: number;
  otRoomId: number | null;
  roomName: string | null;
  patientId: number;
  procedureName: string;
  procedureCode: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  otStatus: string;
  bookingType: string;
  anesthesiaType: string | null;
  implantsRequired: boolean;
  checklist: { sign_in: OTChecklistPhase; time_out: OTChecklistPhase; sign_out: OTChecklistPhase } | null;
  implants: OTImplant[];
  operativeNote: OTOperativeNote | null;
}

export interface OTPortalData {
  bookings: OTBooking[];
  updatedAt: string;
}

export const fetchOTPortalData = async (): Promise<OTPortalData> => {
  const scheduleRes = await api.get('/v1/ot/schedule');
  const rawBookings: any[] = scheduleRes.data?.data ?? [];

  const bookings: OTBooking[] = await Promise.all(
    rawBookings.map(async (b): Promise<OTBooking> => {
      const [checklistRes, implantsRes, noteRes] = await Promise.allSettled([
        api.get(`/v1/ot/${b.id}/checklist-status`),
        api.get(`/v1/ot/${b.id}/implants`),
        api.get(`/v1/ot/${b.id}/operative-note`),
      ]);

      const checklistData = checklistRes.status === 'fulfilled' ? checklistRes.value.data?.data : null;
      const implantsData = implantsRes.status === 'fulfilled' ? (implantsRes.value.data?.data ?? []) : [];
      const noteData = noteRes.status === 'fulfilled' ? noteRes.value.data?.data : null;

      return {
        id: b.id,
        otRoomId: b.ot_room_id ?? null,
        roomName: b.room_name ?? null,
        patientId: b.patient_id,
        procedureName: b.procedure_name,
        procedureCode: b.procedure_code ?? null,
        scheduledStart: b.scheduled_start,
        scheduledEnd: b.scheduled_end,
        actualStart: b.actual_start ?? null,
        actualEnd: b.actual_end ?? null,
        otStatus: b.ot_status,
        bookingType: b.booking_type,
        anesthesiaType: b.anesthesia_type ?? null,
        implantsRequired: !!b.implants_required,
        checklist: checklistData
          ? {
              sign_in: { completed: !!checklistData.sign_in?.completed, completedAt: checklistData.sign_in?.completedAt ?? null },
              time_out: { completed: !!checklistData.time_out?.completed, completedAt: checklistData.time_out?.completedAt ?? null },
              sign_out: { completed: !!checklistData.sign_out?.completed, completedAt: checklistData.sign_out?.completedAt ?? null },
            }
          : null,
        implants: implantsData.map((im: any) => ({
          implantName: im.implant_name,
          manufacturer: im.manufacturer ?? null,
          modelNumber: im.model_number ?? null,
          lotNumber: im.lot_number ?? null,
          bodyLocation: im.body_location ?? null,
          implantDate: im.implant_date ?? null,
        })),
        operativeNote: noteData
          ? {
              id: noteData.id,
              patientName: noteData.patient_name ?? null,
              procedureName: noteData.procedure_name,
              findings: noteData.findings ?? null,
              complications: noteData.complications ?? null,
              bloodLossMl: noteData.blood_loss_ml ?? null,
              status: noteData.status,
              signedBy: noteData.signed_by ?? null,
              signedAt: noteData.signed_at ?? null,
            }
          : null,
      };
    })
  );

  return { bookings, updatedAt: new Date().toISOString() };
};

export const useOTPortalData = (pollMs = 0) => {
  const [data, setData] = useState<OTPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchOTPortalData();
      setData(next);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to fetch OT schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let intervalId: number | undefined;
    refresh();
    if (pollMs > 0) intervalId = window.setInterval(refresh, pollMs);
    return () => { if (intervalId) window.clearInterval(intervalId); };
  }, [pollMs, refresh]);

  return { data, loading, error, refresh };
};

import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

// WP-0.3b: this hook used to invent totalBeds/availableBeds (`occupied + 4`, `4`), a fixed "1:2" nurse
// ratio for every bed, and always returned an empty livePatients list. There is no real ICU bed-
// capacity/ward-config data source (confirmed against server/services/icu.service.js and its
// migration — icu_admissions has no capacity concept at all), so those fields are gone rather than
// replaced with a different guess. Everything below is either a real field from
// server/routes/icu.route.js's census/summary endpoints, or explicitly absent.

export interface ICUVentilatorChart {
  mode: string | null;
  fio2Percent: number | null;
  peepCmh2o: number | null;
  spo2Percent: number | null;
  chartedAt: string;
}

export interface ICUDrip {
  drugName: string;
  concentration: string | null;
  rateMlHr: number | null;
  doseValue: number | null;
  doseUnit: string | null;
}

export interface ICUDailyGoals {
  goals: string[];
  sedationTarget: string | null;
  painTarget: string | null;
  glucoseTarget: string | null;
  fluidBalanceMl: number | null;
  ventilatorWean: boolean;
  mobilityGoal: string | null;
  notes: string | null;
  goalDate: string;
}

export interface ICUSeverityScore {
  scoreType: string;
  totalScore: number | null;
  interpretation: string | null;
  mortalityRisk: number | null;
  scoredAt: string;
}

export interface ICUEvent {
  eventType: string;
  severity: string;
  description: string;
  actionTaken: string | null;
  reportedBy: string | null;
  eventAt: string;
}

export interface ICUPortalPatient {
  admissionId: number;
  patientId: number;
  bed: string;
  zone: string;
  patient: string;
  age: number | null;
  diagnosis: string;
  admittingDoctorId: string | null;
  admittedAt: string;
  hrs: number;
  ventilator: ICUVentilatorChart | null;
  activeDrips: ICUDrip[];
  dailyGoals: ICUDailyGoals | null;
  latestScore: ICUSeverityScore | null;
  recentEvents: ICUEvent[];
}

export interface ICUPortalData {
  summary: {
    occupiedBeds: number;
    onVentilator: number;
    withActiveDrips: number;
    /** Events recorded in the last 24h, across all currently-admitted patients. */
    eventsLast24h: number;
  };
  patients: ICUPortalPatient[];
  updatedAt: string;
}

const getICUAuthHeaders = () => {
  const token = window.localStorage.getItem('icuToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ageFromDob = (dob: string | null | undefined): number | null =>
  dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 3.156e10) : null;

export const fetchICUPortalData = async (): Promise<ICUPortalData> => {
  const headers = getICUAuthHeaders();
  const censusRes = await api.get('/v1/icu/census', { headers });
  const census: any[] = censusRes.data?.data ?? [];

  const patients: ICUPortalPatient[] = await Promise.all(
    census.map(async (p): Promise<ICUPortalPatient> => {
      const admissionId = p.id;
      let detail: any = null;
      try {
        const res = await api.get(`/v1/icu/${admissionId}/summary`, { headers });
        detail = res.data?.data;
      } catch {
        // A single patient's detail failing to load must not blank out the whole census — that
        // patient just shows without ventilator/drip/score/event detail below.
      }

      const latestVent = detail?.latestVentilator;
      const latestScoreRow = detail?.recentScores?.[0];

      return {
        admissionId,
        patientId: p.patient_id,
        bed: p.bed_number ?? '—',
        zone: p.icu_unit ?? 'General',
        patient: p.patient_name ?? '—',
        age: ageFromDob(p.date_of_birth),
        diagnosis: p.admitting_reason ?? '—',
        admittingDoctorId: p.admitting_doctor_id ?? null,
        admittedAt: p.admitted_at,
        hrs: p.admitted_at ? Math.round((Date.now() - new Date(p.admitted_at).getTime()) / 3600000) : 0,
        ventilator: latestVent
          ? {
              mode: latestVent.mode ?? null,
              fio2Percent: latestVent.fio2_percent ?? null,
              peepCmh2o: latestVent.peep_cmh2o ?? null,
              spo2Percent: latestVent.spo2_percent ?? null,
              chartedAt: latestVent.charted_at,
            }
          : null,
        activeDrips: (detail?.activeDrips ?? []).map((d: any) => ({
          drugName: d.drug_name,
          concentration: d.concentration ?? null,
          rateMlHr: d.rate_ml_hr ?? null,
          doseValue: d.dose_value ?? null,
          doseUnit: d.dose_unit ?? null,
        })),
        dailyGoals: detail?.dailyGoals
          ? {
              goals: Array.isArray(detail.dailyGoals.goals) ? detail.dailyGoals.goals : [],
              sedationTarget: detail.dailyGoals.sedation_target ?? null,
              painTarget: detail.dailyGoals.pain_target ?? null,
              glucoseTarget: detail.dailyGoals.glucose_target ?? null,
              fluidBalanceMl: detail.dailyGoals.fluid_balance_ml ?? null,
              ventilatorWean: !!detail.dailyGoals.ventilator_wean,
              mobilityGoal: detail.dailyGoals.mobility_goal ?? null,
              notes: detail.dailyGoals.notes ?? null,
              goalDate: detail.dailyGoals.goal_date,
            }
          : null,
        latestScore: latestScoreRow
          ? {
              scoreType: latestScoreRow.score_type,
              totalScore: latestScoreRow.total_score ?? null,
              interpretation: latestScoreRow.interpretation ?? null,
              mortalityRisk: latestScoreRow.mortality_risk ?? null,
              scoredAt: latestScoreRow.scored_at,
            }
          : null,
        recentEvents: (detail?.recentEvents ?? []).map((e: any) => ({
          eventType: e.event_type,
          severity: e.severity,
          description: e.description,
          actionTaken: e.action_taken ?? null,
          reportedBy: e.reported_by ?? null,
          eventAt: e.event_at,
        })),
      };
    })
  );

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const eventsLast24h = patients.reduce(
    (sum, p) => sum + p.recentEvents.filter((e) => new Date(e.eventAt).getTime() >= dayAgo).length,
    0
  );

  return {
    summary: {
      occupiedBeds: patients.length,
      onVentilator: patients.filter((p) => p.ventilator).length,
      withActiveDrips: patients.filter((p) => p.activeDrips.length > 0).length,
      eventsLast24h,
    },
    patients,
    updatedAt: new Date().toISOString(),
  };
};

export const useICUPortalData = (pollMs = 0) => {
  const [data, setData] = useState<ICUPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextData = await fetchICUPortalData();
      setData(nextData);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to fetch ICU portal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let intervalId: number | undefined;
    refresh();

    if (pollMs > 0) {
      intervalId = window.setInterval(refresh, pollMs);
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [pollMs, refresh]);

  return { data, loading, error, refresh };
};

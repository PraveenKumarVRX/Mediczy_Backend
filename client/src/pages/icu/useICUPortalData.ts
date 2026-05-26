import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

export interface ICUPortalPatient {
  patientId: number;
  bedId: number;
  bed: string;
  zone: string;
  type: string;
  nurseRatio: string;
  turnaround: string;
  patient: string;
  age: number | null;
  diagnosis: string;
  consultant: string;
  vent: string;
  status: string;
  score: string;
  hrs: number;
  latestVitals: {
    hr: number | null;
    spo2: number | null;
    systolic: number | null;
    diastolic: number | null;
    map: number | null;
    rr: number | null;
    temp: number | null;
    recordedAt: string | null;
  } | null;
}

export interface ICUPortalData {
  summary: {
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    reservedBeds: number;
    monitoredBeds: number;
    criticalPatients: number;
    stablePatients: number;
    openAlerts: number;
  };
  patients: ICUPortalPatient[];
  livePatients: Array<{
    bed: string;
    patient: string;
    mode: string;
    infusions: string;
    hr: number;
    spo2: number;
    map: number;
    rr: number;
    temp: number;
    score: string;
    risk: string;
  }>;
  beds: Array<{
    bed: string;
    zone: string;
    type: string;
    nurseRatio: string;
    status: string;
    turnaround: string;
    patient: string | null;
    diagnosis: string | null;
  }>;
  vitals: Array<{
    patient: string;
    bed: string;
    hr: number | null;
    spo2: number | null;
    map: number | null;
    rr: number | null;
    temp: number | null;
    status: string;
    recordedAt: string | null;
  }>;
  alerts: Array<{
    source: string;
    alert: string;
    severity: string;
    owner: string;
    time: string | null;
  }>;
  updatedAt: string;
}

const getICUAuthHeaders = () => {
  const token = window.localStorage.getItem('icuToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchICUPortalData = async (): Promise<ICUPortalData> => {
  try {
    // Primary: new HMIS ICU API
    const censusRes = await api.get('/api/v1/icu/census', { headers: getICUAuthHeaders() });
    const patients: ICUPortalPatient[] = (censusRes.data?.data ?? []).map((p: any) => ({
      patientId:   p.patient_id,
      bedId:       p.id,
      bed:         p.bed_number ?? 'ICU',
      zone:        p.icu_unit ?? 'General',
      type:        'ICU',
      nurseRatio:  '1:2',
      turnaround:  '—',
      patient:     p.patient_name ?? '—',
      age:         p.date_of_birth ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 3.156e10) : null,
      diagnosis:   p.admitting_reason ?? '—',
      consultant:  p.admitting_doctor_id ?? '—',
      vent:        '—',
      status:      'Active',
      score:       '—',
      hrs:         p.admitted_at ? Math.round((Date.now() - new Date(p.admitted_at).getTime()) / 3600000) : 0,
      latestVitals: null
    }));

    const occupied = patients.length;
    return {
      summary: {
        totalBeds: occupied + 4, occupiedBeds: occupied,
        availableBeds: 4, reservedBeds: 0,
        monitoredBeds: occupied, criticalPatients: 0,
        stablePatients: occupied, openAlerts: 0
      },
      patients,
      livePatients: [],
      beds: patients.map(p => ({ bed: p.bed, zone: p.zone, type: p.type, status: 'Occupied', patient: p.patient }))
    } as ICUPortalData;
  } catch {
    // Fallback to old portal route
    const response = await api.get('/hospital/practice/icu/portal-data', { headers: getICUAuthHeaders() });
    return response.data?.data as ICUPortalData;
  }
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
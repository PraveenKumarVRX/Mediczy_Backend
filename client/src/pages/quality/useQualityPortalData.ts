import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

export interface QualityPortalKpi {
  label: string;
  value: string;
  sub: string;
}

export interface QualityPortalChapter {
  chapter: string;
  title: string;
  owner: string;
  score: number;
  gap: number;
  status: string;
}

export interface QualityPortalIncident {
  id: string;
  category: string;
  location: string;
  severity: string;
  aging: string;
  owner: string;
  status: string;
}

export interface QualityPortalQueue {
  label: string;
  value: string;
  detail: string;
  tone: string;
}

export interface QualityPortalAssessment {
  name: string;
  scope: string;
  date: string;
  auditor: string;
  status: string;
}

export interface QualityPortalAuditReport {
  report: string;
  type: string;
  findings: number;
  closed: number;
  owner: string;
  status: string;
}

export interface QualityPortalAccreditation {
  milestone: string;
  due: string;
  owner: string;
  completion: number;
}

export interface QualityPortalIndicator {
  metric: string;
  target: string;
  actual: string;
  trend: string;
  owner: string;
}

export interface QualityPortalPolicy {
  id?: string;
  title: string;
  version: string;
  owner: string;
  review: string;
  status: string;
}

export interface QualityPortalNabhTemplate {
  code: string;
  title: string;
  version: string;
  owner: string;
  format: string;
  status: string;
}

export interface QualityPortalJciChapter {
  chapter: string;
  title: string;
  owner: string;
  score: number;
  gap: number;
  status: string;
}

export interface QualityPortalJciTemplate {
  code: string;
  title: string;
  version: string;
  owner: string;
  format: string;
  status: string;
}

export interface QualityPortalFeedback {
  channel: string;
  responses: number;
  nps: number;
  complaints: number;
  owner: string;
}

export interface QualityPortalSetting {
  title: string;
  text: string;
}

export interface QualityPortalSupport {
  title: string;
  text: string;
}

export interface QualityPortalData {
  source: string;
  organizationId: number | null;
  kpis: QualityPortalKpi[];
  chapters: QualityPortalChapter[];
  incidents: QualityPortalIncident[];
  workQueues: QualityPortalQueue[];
  audits: string[][];
  leadership: string[][];
  assessments: QualityPortalAssessment[];
  auditReports: QualityPortalAuditReport[];
  accreditation: QualityPortalAccreditation[];
  indicators: QualityPortalIndicator[];
  policies: QualityPortalPolicy[];
  nabhTemplates: QualityPortalNabhTemplate[];
  jciChapters: QualityPortalJciChapter[];
  jciTemplates: QualityPortalJciTemplate[];
  reports: Array<{ name: string; cadence: string; audience: string; status: string }>;
  feedback: QualityPortalFeedback[];
  settings: QualityPortalSetting[];
  support: QualityPortalSupport[];
  activeFrameworks: string[];
}

const getQualityAuthHeaders = () => {
  const token = window.localStorage.getItem('qualityToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchQualityPortalData = async () => {
  const response = await api.get('/hospital/staff/quality/portal-data', {
    headers: getQualityAuthHeaders(),
  });
  return response.data?.data as QualityPortalData;
};

export const useQualityPortalData = () => {
  const [data, setData] = useState<QualityPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextData = await fetchQualityPortalData();
      setData(nextData);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to fetch quality portal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
};
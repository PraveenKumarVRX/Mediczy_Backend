import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import TPASidebar from '@/components/tpa/TPASidebar';
import api from '@/utils/api';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calculator,
  Calendar,
  ClipboardCheck,
  Download,
  FileText,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';

type TPARecord = Record<string, any>;

interface TPADataPageProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  endpoint: string;
  recordKey?: string;
  mode?: 'list' | 'analytics' | 'settings' | 'profile';
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const humanize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatValue = (key: string, value: any): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && /(amount|premium|coverage|revenue|limit|sum)/i.test(key)) {
    return currency.format(value);
  }
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([nestedKey, nestedValue]) => `${humanize(nestedKey)}: ${formatValue(nestedKey, nestedValue)}`)
      .join(' · ');
  }
  return String(value);
};

const getStatusBadgeClass = (status: any) => {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'approved', 'available', 'closed', 'success'].includes(normalized)) {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (['pending', 'open', 'in_review', 'in review'].includes(normalized)) {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (['rejected', 'inactive', 'failed', 'disabled'].includes(normalized)) {
    return 'bg-red-100 text-red-700 border-red-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const pickRecords = (data: any, recordKey?: string): TPARecord[] => {
  if (!data) return [];
  if (recordKey && Array.isArray(data[recordKey])) return data[recordKey];
  for (const key of ['approvals', 'claims', 'corporates', 'members', 'policies', 'preAuths', 'reports', 'tickets']) {
    if (Array.isArray(data[key])) return data[key];
  }
  if (Array.isArray(data)) return data;
  return [];
};

const pickObjectPayload = (data: any, mode?: TPADataPageProps['mode']) => {
  if (!data) return {};
  if (mode === 'analytics') return data.analytics || data;
  if (mode === 'settings') return data.settings || data;
  if (mode === 'profile') return data.tpa || data.profile || data;
  return data;
};

const getPrimaryLine = (record: TPARecord) =>
  record.title ||
  record.subject ||
  record.companyName ||
  record.corporate ||
  record.name ||
  record.employeeName ||
  record.id ||
  'Record';

const getSecondaryLine = (record: TPARecord) =>
  record.description ||
  record.policyNumber ||
  record.employeeId ||
  record.hrContactEmail ||
  record.email ||
  record.type ||
  record.claimType ||
  record.treatmentType ||
  '';

const visibleEntries = (record: TPARecord) =>
  Object.entries(record)
    .filter(([key, value]) => {
      if (['id', 'title', 'subject', 'description', 'companyName', 'corporate', 'name', 'employeeName'].includes(key)) return false;
      if (typeof value === 'function') return false;
      return true;
    })
    .slice(0, 8);

const TPADataPage = ({ title, description, icon: Icon, endpoint, recordKey, mode = 'list' }: TPADataPageProps) => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const load = async () => {
    const token = localStorage.getItem('tpaToken');
    if (!token) {
      navigate('/tpa/login');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.get(endpoint);
      setData(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || `Could not load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const records = useMemo(() => pickRecords(data, recordKey), [data, recordKey]);
  const payload = useMemo(() => pickObjectPayload(data, mode), [data, mode]);
  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => JSON.stringify(record).toLowerCase().includes(needle));
  }, [records, search]);

  const handleReportDownload = async (report: TPARecord) => {
    const reportId = report.id;
    if (!reportId) return;

    setDownloadingReport(reportId);
    try {
      const response = await api.get(`/tpa/reports/download/${encodeURIComponent(reportId)}`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${reportId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not download report.');
    } finally {
      setDownloadingReport(null);
    }
  };

  const renderObjectMode = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Object.entries(payload).map(([section, value]) => (
        <Card key={section} className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{humanize(section)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeof value === 'object' && value !== null ? (
              Object.entries(value as TPARecord).map(([key, nestedValue]) => (
                <div key={key} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                  <span className="text-sm text-slate-500">{humanize(key)}</span>
                  <span className="text-sm font-medium text-slate-900 text-right">{formatValue(key, nestedValue)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm font-medium text-slate-900">{formatValue(section, value)}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />

      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm border border-purple-100 mb-3">
                <Icon className="h-3.5 w-3.5" />
                Live TPA Workspace
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
              <p className="text-gray-600 mt-1">{description}</p>
            </div>
            <Button onClick={load} disabled={loading} variant="outline" className="bg-white">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <Card className="mb-6 border-slate-200 bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-purple-600" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  Loading {title.toLowerCase()}...
                </div>
              ) : mode === 'analytics' || mode === 'settings' || mode === 'profile' ? (
                renderObjectMode()
              ) : (
                <>
                  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="relative max-w-md flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={`Search ${title.toLowerCase()}...`}
                        className="pl-9 bg-white"
                      />
                    </div>
                    <Badge variant="secondary" className="w-fit">
                      {filteredRecords.length} records
                    </Badge>
                  </div>

                  {filteredRecords.length === 0 ? (
                    <div className="text-center py-14">
                      <Icon className="h-14 w-14 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-700">No records found</h3>
                      <p className="text-sm text-slate-500 mt-1">Use refresh or adjust your search filters.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {filteredRecords.map((record, index) => (
                        <Card key={record.id || `${title}-${index}`} className="border-slate-200 hover:border-purple-200 hover:shadow-md transition-all">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div>
                                <h3 className="font-semibold text-slate-900">{getPrimaryLine(record)}</h3>
                                {getSecondaryLine(record) && (
                                  <p className="text-sm text-slate-500">{getSecondaryLine(record)}</p>
                                )}
                              </div>
                              {record.status && (
                                <Badge className={getStatusBadgeClass(record.status)}>
                                  {humanize(String(record.status))}
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                              {visibleEntries(record).map(([key, value]) => (
                                <div key={key}>
                                  <p className="text-xs uppercase tracking-wide text-slate-400">{humanize(key)}</p>
                                  <p className="text-sm font-medium text-slate-800 truncate">{formatValue(key, value)}</p>
                                </div>
                              ))}
                            </div>

                            {record.fileUrl && (
                              <Button
                                size="sm"
                                className="mt-4"
                                disabled={downloadingReport === record.id}
                                onClick={() => handleReportDownload(record)}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                {downloadingReport === record.id ? 'Downloading...' : 'Download'}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export const TPAPolicies = () => (
  <TPADataPage
    title="Policies Management"
    description="Manage insurance policies, coverage, renewals, premiums, and claims exposure."
    icon={FileText}
    endpoint="/tpa/policies"
    recordKey="policies"
  />
);

export const TPAPreAuth = () => (
  <TPADataPage
    title="Pre-Authorization"
    description="Review pre-authorization requests, planned admissions, documents, and approval status."
    icon={Calendar}
    endpoint="/tpa/pre-auth"
    recordKey="preAuths"
  />
);

export const TPAApprovals = () => (
  <TPADataPage
    title="Approvals"
    description="Track recently approved claims and pre-authorizations from one approval queue."
    icon={ShieldCheck}
    endpoint="/tpa/approvals"
    recordKey="approvals"
  />
);

export const TPAHospitalizationIntimations = () => (
  <TPADataPage
    title="Hospitalization Intimations"
    description="Track planned and emergency hospitalisation intimations with admission timing, hospital handoff, and SLA status."
    icon={Calendar}
    endpoint="/tpa/hospitalization-intimations"
    recordKey="intimations"
  />
);

export const TPADocumentIntelligence = () => (
  <TPADataPage
    title="Document AI Review"
    description="Review claim documents, OCR status, missing-document signals, and AI-generated claim-readiness checks."
    icon={ClipboardCheck}
    endpoint="/tpa/documents/intelligence"
    recordKey="documents"
  />
);

export const TPAFraudGuard = () => (
  <TPADataPage
    title="Fraud Guard"
    description="Monitor fraud, waste, and abuse alerts with risk scoring, rule triggers, and reviewer disposition."
    icon={ShieldCheck}
    endpoint="/tpa/fraud-guard"
    recordKey="alerts"
  />
);

export const TPAWeeklyMIS = () => (
  <TPADataPage
    title="Weekly MIS"
    description="View weekly corporate, claims, SLA, and settlement MIS packs for HR and TPA operations."
    icon={BarChart3}
    endpoint="/tpa/mis/weekly"
    recordKey="reports"
  />
);

export const TPAGrievances = () => (
  <TPADataPage
    title="Grievances"
    description="Manage grievance tickets, SLA deadlines, escalations, communication status, and closure evidence."
    icon={Ticket}
    endpoint="/tpa/grievances"
    recordKey="grievances"
  />
);

export const TPAAnalytics = () => (
  <TPADataPage
    title="Analytics"
    description="View claims trend, claim mix, SLA performance, and corporate performance insights."
    icon={TrendingUp}
    endpoint="/tpa/analytics"
    mode="analytics"
  />
);

export const TPAReports = () => (
  <TPADataPage
    title="Reports"
    description="Generate, view, and download operational TPA reports."
    icon={BarChart3}
    endpoint="/tpa/reports"
    recordKey="reports"
  />
);

export const TPASettings = () => (
  <TPADataPage
    title="Settings"
    description="Configure TPA organization, notification, and claims-processing settings."
    icon={Settings}
    endpoint="/tpa/settings"
    mode="settings"
  />
);

export const TPASupport = () => (
  <TPADataPage
    title="Support"
    description="View support tickets, priorities, and operational escalations."
    icon={Ticket}
    endpoint="/tpa/support"
    recordKey="tickets"
  />
);

export const TPACorporates = () => (
  <TPADataPage
    title="Corporates Management"
    description="Manage corporate clients, HR contacts, onboarding status, and employee coverage."
    icon={Building2}
    endpoint="/tpa/corporates"
    recordKey="corporates"
  />
);

export const TPAProfile = () => (
  <TPADataPage
    title="TPA Profile"
    description="View your TPA account, licensing, contact, and operating profile."
    icon={Users}
    endpoint="/tpa/profile"
    mode="profile"
  />
);

export default TPADataPage;

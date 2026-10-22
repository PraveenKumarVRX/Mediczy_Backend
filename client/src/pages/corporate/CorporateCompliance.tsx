import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, FileText, Users, CheckCircle, XCircle, Clock,
  AlertTriangle, Download, RefreshCw, Eye, Search, Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsentEmployee {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  granted: boolean | null;
  grantedAt: string | null;
  revokedAt: string | null;
}

interface AuditEntry {
  id: string;
  reportId: string;
  reportTitle: string;
  accessedByType: string;
  accessedByName: string;
  action: string;
  ipAddress: string;
  accessedAt: string;
}

interface ConsentSummary {
  total: number;
  granted: number;
  pending: number;
  consentRate: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

const CorporateCompliance: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'consent' | 'audit'>('consent');

  // Consent state
  const [consentSummary, setConsentSummary] = useState<ConsentSummary>({ total: 0, granted: 0, pending: 0, consentRate: 0 });
  const [consentEmployees, setConsentEmployees] = useState<ConsentEmployee[]>([]);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [consentSearch, setConsentSearch] = useState('');
  const [consentFilter, setConsentFilter] = useState<'all' | 'granted' | 'pending'>('all');
  const [updatingConsent, setUpdatingConsent] = useState<string | null>(null);

  // Audit state
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTotal, setAuditTotal] = useState(0);

  const loadConsent = useCallback(async () => {
    setConsentLoading(true);
    setConsentError('');
    try {
      const [summaryRes, empRes] = await Promise.all([
        api.get('/corporate/consent/summary'),
        api.get('/corporate/consent/employees'),
      ]);
      if (!summaryRes.data?.success || !summaryRes.data?.data || !empRes.data?.success || !Array.isArray(empRes.data?.data?.employees)) {
        throw new Error('Consent data was incomplete. Please retry.');
      }
      setConsentSummary(summaryRes.data.data);
      setConsentEmployees(empRes.data.data.employees);
    } catch {
      setConsentError('Consent data could not be refreshed. Previously loaded data may be out of date.');
      toast({ title: 'Failed to load consent data', variant: 'destructive' });
    } finally {
      setConsentLoading(false);
    }
  }, [toast]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data } = await api.get('/corporate/audit-log', { params: { limit: 200 } });
      setAuditEntries(data?.data?.entries || []);
      setAuditTotal(data?.data?.total || 0);
    } catch {
      toast({ title: 'Failed to load audit log', variant: 'destructive' });
    } finally {
      setAuditLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadConsent(); }, [loadConsent]);
  useEffect(() => { if (activeTab === 'audit') loadAudit(); }, [activeTab, loadAudit]);

  const handleBulkRequest = async () => {
    try {
      await api.post('/corporate/consent/bulk-request');
      toast({ title: 'Consent requests created', description: 'Pending employees now have a consent record to update.' });
      loadConsent();
    } catch {
      toast({ title: 'Failed to send requests', variant: 'destructive' });
    }
  };

  const handleConsentToggle = async (emp: ConsentEmployee, granted: boolean) => {
    setUpdatingConsent(emp.employeeId);
    try {
      await api.post('/corporate/consent/record', { employeeId: emp.employeeId, granted });
      toast({ title: granted ? 'Consent granted' : 'Consent revoked', description: `${emp.name || emp.employeeId}` });
      loadConsent();
    } catch {
      toast({ title: 'Failed to update consent', variant: 'destructive' });
    } finally {
      setUpdatingConsent(null);
    }
  };

  const exportCompliance = async (type: 'consents' | 'audit') => {
    try {
      const response=await api.get(`/corporate/programs/compliance/${type}/export`,{responseType:'blob'});
      const url=URL.createObjectURL(new Blob([response.data],{type:'text/csv'}));const link=document.createElement('a');
      link.href=url;link.download=`${type}-report.csv`;link.click();URL.revokeObjectURL(url);
    }catch{toast({title:'Compliance export failed',variant:'destructive'});}
  };
  const exportConsentCSV=()=>exportCompliance('consents');
  const exportAuditCSV=()=>exportCompliance('audit');

  const filteredConsent = consentEmployees.filter(e => {
    const matchSearch = !consentSearch || e.name?.toLowerCase().includes(consentSearch.toLowerCase()) || e.employeeId.toLowerCase().includes(consentSearch.toLowerCase());
    const matchFilter = consentFilter === 'all' ? true : consentFilter === 'granted' ? !!e.granted : !e.granted;
    return matchSearch && matchFilter;
  });

  const filteredAudit = auditEntries.filter(e =>
    !auditSearch || e.reportTitle?.toLowerCase().includes(auditSearch.toLowerCase()) || e.accessedByName?.toLowerCase().includes(auditSearch.toLowerCase())
  );

  return (
    <CorporateLayout title="Compliance">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={Shield}
          title="Compliance Centre"
          description="Employee consent management and report access audit trail"
          gradient="from-violet-500 to-violet-700"
          showRefresh={true}
          onRefresh={activeTab === 'consent' ? loadConsent : loadAudit}
          isRefreshing={consentLoading || auditLoading}
          stats={[
            { label: 'Consent Rate', value: `${consentSummary.consentRate}%` },
            { label: 'Granted', value: consentSummary.granted },
            { label: 'Pending', value: consentSummary.pending },
            { label: 'Audit Entries', value: auditTotal },
          ]}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'consent' | 'audit')}>
          <TabsList className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-1">
            <TabsTrigger value="consent" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 rounded-lg">
              <Users className="h-4 w-4 mr-2" />Employee Consent
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 rounded-lg">
              <Eye className="h-4 w-4 mr-2" />Access Audit Log
            </TabsTrigger>
          </TabsList>

          {/* ─── Consent Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="consent" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Total Employees', value: consentSummary.total, color: 'text-white', icon: Users },
                { label: 'Consent Granted', value: consentSummary.granted, color: 'text-emerald-400', icon: CheckCircle },
                { label: 'Awaiting Consent', value: consentSummary.pending, color: 'text-amber-400', icon: Clock },
              ].map(stat => (
                <Card key={stat.label} className="bg-slate-900/60 border-slate-700/60">
                  <CardContent className="pt-5 flex items-center gap-4">
                    <div className="p-3 bg-slate-800/60 rounded-xl">
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{stat.value}</p>
                      <p className="text-xs text-slate-400">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {consentSummary.pending > 0 && (
              <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-300">{consentSummary.pending} employees have not yet given data processing consent. Create consent records to begin tracking.</p>
                <Button size="sm" onClick={handleBulkRequest} disabled={consentLoading || !!consentError} className="ml-auto shrink-0 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30">
                  Create Pending Records
                </Button>
              </div>
            )}

            <Card className="bg-slate-900/60 border-slate-700/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-slate-100 text-base">Employee Consent Status</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <Input value={consentSearch} onChange={e => setConsentSearch(e.target.value)}
                        placeholder="Search employees…" className="pl-8 h-8 w-48 bg-slate-800/60 border-slate-700/60 text-sm text-slate-300" />
                    </div>
                    <div className="flex gap-1 bg-slate-800/50 rounded-lg p-0.5">
                      {(['all', 'granted', 'pending'] as const).map(f => (
                        <button key={f} onClick={() => setConsentFilter(f)}
                          className={`px-2.5 py-1 text-xs rounded-md transition-all ${consentFilter === f ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={exportConsentCSV} disabled={consentLoading || !!consentError}
                      className="h-8 bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white">
                      <Download className="h-3.5 w-3.5 mr-1" /> Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {consentError && <div role="alert" className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                  <p>{consentError}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={loadConsent} disabled={consentLoading}>Retry consent data</Button>
                </div>}
                {consentLoading ? (
                  <div className="text-center py-8 text-slate-500">Loading…</div>
                ) : filteredConsent.length === 0 ? (
                  !consentError && <div className="text-center py-8 text-slate-500">No employees found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/60 text-slate-400 text-xs uppercase">
                          <th className="text-left pb-2 font-medium">Employee</th>
                          <th className="text-left pb-2 font-medium">Department</th>
                          <th className="text-left pb-2 font-medium">Status</th>
                          <th className="text-left pb-2 font-medium">Date</th>
                          <th className="text-right pb-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredConsent.map(emp => (
                          <tr key={emp.employeeId} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3">
                              <p className="font-medium text-slate-200">{emp.name || emp.employeeId}</p>
                              <p className="text-xs text-slate-500">{emp.email || emp.employeeId}</p>
                            </td>
                            <td className="py-3 text-slate-400 text-xs">{emp.department || '—'}</td>
                            <td className="py-3">
                              {emp.granted === true ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Granted</Badge>
                              ) : emp.granted === false ? (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Revoked</Badge>
                              ) : (
                                <Badge className="bg-slate-700 text-slate-400 text-xs">Pending</Badge>
                              )}
                            </td>
                            <td className="py-3 text-slate-500 text-xs">
                              {emp.grantedAt ? new Date(emp.grantedAt).toLocaleDateString('en-IN') : emp.revokedAt ? new Date(emp.revokedAt).toLocaleDateString('en-IN') : '—'}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex justify-end gap-1">
                                {emp.granted !== true && (
                                  <Button size="sm" variant="outline" disabled={consentLoading || !!consentError || updatingConsent === emp.employeeId}
                                    onClick={() => handleConsentToggle(emp, true)}
                                    className="h-7 px-2 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20">
                                    <CheckCircle className="h-3 w-3 mr-1" /> Grant
                                  </Button>
                                )}
                                {emp.granted === true && (
                                  <Button size="sm" variant="outline" disabled={consentLoading || !!consentError || updatingConsent === emp.employeeId}
                                    onClick={() => handleConsentToggle(emp, false)}
                                    className="h-7 px-2 text-xs bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20">
                                    <XCircle className="h-3 w-3 mr-1" /> Revoke
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Audit Tab ───────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="space-y-4">
            <Card className="bg-slate-900/60 border-slate-700/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-slate-100 text-base">Report Access Audit Log</CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-1">
                      Report exports, health-record access, consent and employee status changes. {auditTotal} total entries.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <Input value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                        placeholder="Search log…" className="pl-8 h-8 w-44 bg-slate-800/60 border-slate-700/60 text-sm text-slate-300" />
                    </div>
                    <Button variant="outline" size="sm" onClick={loadAudit} disabled={auditLoading}
                      className="h-8 bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white">
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${auditLoading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportAuditCSV}
                      className="h-8 bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white">
                      <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="text-center py-8 text-slate-500">Loading audit log…</div>
                ) : filteredAudit.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <FileText className="h-8 w-8 text-slate-700 mx-auto" />
                    <p className="text-slate-500 text-sm">No audit entries yet.</p>
                    <p className="text-slate-600 text-xs">Report downloads will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/60 text-slate-400 text-xs uppercase">
                          <th className="text-left pb-2 font-medium">Resource</th>
                          <th className="text-left pb-2 font-medium">Action</th>
                          <th className="text-left pb-2 font-medium">Accessed By</th>
                          <th className="text-left pb-2 font-medium">IP</th>
                          <th className="text-left pb-2 font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredAudit.map(entry => (
                          <tr key={entry.id} className="hover:bg-slate-800/30">
                            <td className="py-3">
                              <p className="text-slate-200">{entry.reportTitle || entry.reportId || '—'}</p>
                            </td>
                            <td className="py-3">
                              <Badge className={entry.action === 'download' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs' : 'bg-slate-700 text-slate-400 text-xs'}>
                                {entry.action}
                              </Badge>
                            </td>
                            <td className="py-3">
                              <p className="text-slate-300">{entry.accessedByName || '—'}</p>
                              <p className="text-xs text-slate-500 capitalize">{entry.accessedByType}</p>
                            </td>
                            <td className="py-3 text-slate-500 text-xs font-mono">{entry.ipAddress || '—'}</td>
                            <td className="py-3 text-slate-400 text-xs">
                              {new Date(entry.accessedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CorporateLayout>
  );
};

export default CorporateCompliance;

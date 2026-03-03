import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import HospitalLayout from "@/components/hospital/HospitalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, FileText, Shield, AlertCircle, DollarSign } from "lucide-react";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

type ClaimItem = {
  id: number;
  claimNumber: string;
  claimAmount: number;
  status: string;
  policyNumber?: string;
  insuranceProvider?: string;
  submittedAt?: string;
  createdAt?: string;
};

type PreAuthItem = {
  id: number;
  preAuthNumber: string;
  estimatedAmount: number;
  status: string;
  submittedAt?: string;
};

type DashboardResponse = {
  stats?: {
    pending: number;
    approved: number;
    rejected: number;
    query: number;
    total: number;
  };
  alerts?: {
    queriesNeedingResponse: number;
    pendingDocuments: number;
    expiringSoon: number;
  };
};

type ClaimTimelineItem = {
  event: string;
  timestamp: string;
  status?: string;
  details?: string;
  reason?: string;
  approvedAmount?: number;
};

type TaskInboxItem = {
  taskType: string;
  taskLabel: string;
  claimId?: number;
  preAuthId?: number;
  claimNumber?: string;
  preAuthNumber?: string;
  patientName?: string;
  status: string;
  ageDays: number;
  priority: "high" | "normal";
  slaFlag: "breached" | "within-sla";
  rejectionReason?: string;
};

type EscalationItem = {
  claimId: number;
  claimNumber: string;
  patientName: string;
  status: string;
  ageDays: number;
  slaThreshold: number;
  slaFlag: "breached" | "within-sla";
  escalationLevel: "critical" | "warning" | "normal";
};

type AppealItem = {
  claimId: number;
  claimNumber: string;
  patientName: string;
  status: string;
  rejectionReason?: string;
  appealCount: number;
  latestAppeal?: {
    appealReason?: string;
    appealedAt?: string;
  };
};

const ALLOWED_TABS = new Set([
  "claims",
  "tasks",
  "escalations",
  "appeals",
  "preauth",
  "documents",
  "search",
  "analytics"
]);

const HospitalInsuranceClaimsDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const rawTab = searchParams.get("tab");
  const defaultTab = rawTab && ALLOWED_TABS.has(rawTab) ? rawTab : "claims";

  useEffect(() => {
    if (rawTab && !ALLOWED_TABS.has(rawTab)) {
      const next = new URLSearchParams(location.search);
      next.set("tab", "claims");
      navigate(`${location.pathname}?${next.toString()}`, { replace: true });
    }
  }, [rawTab, location.pathname, location.search, navigate]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [pendingPreAuth, setPendingPreAuth] = useState<PreAuthItem[]>([]);
  const [missingDocuments, setMissingDocuments] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any>(null);
  const [agingReport, setAgingReport] = useState<Record<string, number> | null>(null);
  const [trendReport, setTrendReport] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ClaimItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchType, setPatientSearchType] = useState<"name" | "mobile" | "abha" | "policy">("name");
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [eligibilityPolicyNumber, setEligibilityPolicyNumber] = useState("");
  const [eligibilityResult, setEligibilityResult] = useState<any>(null);
  const [selectedHistoryClaimId, setSelectedHistoryClaimId] = useState<number | null>(null);
  const [historyTimeline, setHistoryTimeline] = useState<ClaimTimelineItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [enhancingClaimId, setEnhancingClaimId] = useState<number | null>(null);
  const [taskInbox, setTaskInbox] = useState<TaskInboxItem[]>([]);
  const [taskSummary, setTaskSummary] = useState<{ total: number; highPriority: number; slaBreached: number } | null>(null);
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [escalationSummary, setEscalationSummary] = useState<{ totalBreached: number; critical: number; warning: number } | null>(null);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [appealingClaimId, setAppealingClaimId] = useState<number | null>(null);
  const [highlightTimeline, setHighlightTimeline] = useState(false);
  const historyPanelRef = useRef<HTMLDivElement | null>(null);

  const hospitalHeaders = () => {
    const token = localStorage.getItem("hospitalToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const formatAmount = (amount?: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amount || 0);

  const statusClass = (status: string) => {
    const key = status?.toLowerCase();
    if (key === "approved") return "bg-green-500/10 text-green-600";
    if (key === "pending") return "bg-blue-500/10 text-blue-600";
    if (key === "query") return "bg-amber-500/10 text-amber-600";
    if (key === "rejected") return "bg-red-500/10 text-red-600";
    return "bg-slate-500/10 text-slate-600";
  };

  const loadDashboard = async () => {
    try {
      const headers = { headers: hospitalHeaders() };
      const [dashRes, claimsRes, preAuthRes, docsRes, receivablesRes, agingRes, trendsRes, taskRes, escalationRes, appealsRes] = await Promise.all([
        api.get("/hospital/insurance/dashboard", headers),
        api.get("/hospital/insurance/claims/submitted", { ...headers, params: { page: 1, limit: 20 } }),
        api.get("/hospital/insurance/pre-auth/pending", { ...headers, params: { page: 1, limit: 20 } }),
        api.get("/hospital/insurance/documents/missing", headers),
        api.get("/hospital/insurance/revenue/receivables", headers),
        api.get("/hospital/insurance/reports/claims-aging", headers),
        api.get("/hospital/insurance/reports/query-rejection-trends", headers),
        api.get("/hospital/insurance/tasks/inbox", headers),
        api.get("/hospital/insurance/claims/escalations", headers),
        api.get("/hospital/insurance/claims/appeals", { ...headers, params: { page: 1, limit: 20 } })
      ]);

      setDashboard(dashRes.data.dashboard || null);
      setClaims(claimsRes.data.claims || []);
      setPendingPreAuth(preAuthRes.data.preAuths || []);
      setMissingDocuments(docsRes.data.missingDocuments || []);
      setReceivables(receivablesRes.data.receivables || null);
      setAgingReport(agingRes.data.agingReport || null);
      setTrendReport(trendsRes.data.trends || null);
      setTaskInbox(taskRes.data.taskInbox || []);
      setTaskSummary(taskRes.data.summary || null);
      setEscalations(escalationRes.data.escalations || []);
      setEscalationSummary(escalationRes.data.summary || null);
      setAppeals(appealsRes.data.appeals || []);
    } catch (error) {
      console.error("Hospital insurance dashboard load failed", error);
      toast({
        title: "Unable to load insurance dashboard",
        description: "Please try again or re-login.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("hospitalToken");
    if (!token) {
      navigate("/hospital/login");
      return;
    }

    const init = async () => {
      setLoading(true);
      await loadDashboard();
      setLoading(false);
    };

    init();
  }, [navigate]);

  useEffect(() => {
    if (!selectedHistoryClaimId || !historyPanelRef.current) {
      return;
    }

    historyPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    historyPanelRef.current.focus({ preventScroll: true });
  }, [selectedHistoryClaimId, historyLoading, historyTimeline]);

  useEffect(() => {
    if (!highlightTimeline) {
      return;
    }

    const timer = window.setTimeout(() => {
      setHighlightTimeline(false);
    }, 1600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightTimeline]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const handleClaimSearch = async () => {
    if (!searchTerm.trim()) return;
    try {
      setSearching(true);
      const response = await api.post(
        "/hospital/insurance/dashboard/search",
        { searchTerm: searchTerm.trim() },
        { headers: hospitalHeaders() }
      );
      setSearchResults(response.data.results || []);
    } catch (error) {
      console.error("Claim search failed", error);
      toast({
        title: "Search failed",
        description: "Unable to fetch claim results.",
        variant: "destructive"
      });
    } finally {
      setSearching(false);
    }
  };

  const handlePatientSearch = async () => {
    if (!patientSearchTerm.trim()) return;
    try {
      const response = await api.post(
        "/hospital/insurance/patient/search",
        { searchTerm: patientSearchTerm.trim(), searchType: patientSearchType },
        { headers: hospitalHeaders() }
      );
      const foundPatients = response.data.patients || [];
      setPatients(foundPatients);
      if (foundPatients[0]?.id) {
        setSelectedPatientId(String(foundPatients[0].id));
      }
    } catch (error) {
      console.error("Patient search failed", error);
      toast({
        title: "Patient search failed",
        description: "Please verify search inputs.",
        variant: "destructive"
      });
    }
  };

  const handleEligibilityCheck = async () => {
    if (!selectedPatientId || !eligibilityPolicyNumber.trim()) {
      toast({
        title: "Missing details",
        description: "Select patient and enter policy number first.",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await api.get(`/hospital/insurance/patient/${selectedPatientId}/eligibility`, {
        headers: hospitalHeaders(),
        params: { policyNumber: eligibilityPolicyNumber.trim() }
      });
      setEligibilityResult(response.data.eligibility || null);
    } catch (error) {
      console.error("Eligibility check failed", error);
      toast({
        title: "Eligibility check failed",
        description: "Unable to validate policy eligibility.",
        variant: "destructive"
      });
    }
  };

  const handleOpenClaimHistory = async (claimId: number) => {
    try {
      setHistoryLoading(true);
      const response = await api.get(`/hospital/insurance/claims/${claimId}/history`, {
        headers: hospitalHeaders()
      });
      setSelectedHistoryClaimId(claimId);
      setHistoryTimeline(response.data.timeline || []);
      setHighlightTimeline(true);
    } catch (error) {
      console.error("History fetch failed", error);
      toast({
        title: "History unavailable",
        description: "Unable to fetch claim timeline.",
        variant: "destructive"
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenClaimPdf = async (claimId: number) => {
    try {
      const response = await api.get(`/hospital/insurance/claims/${claimId}/pdf`, {
        headers: hospitalHeaders()
      });

      const pdfUrl = response.data?.pdfUrl;
      if (!pdfUrl) {
        throw new Error("PDF URL missing");
      }

      window.open(pdfUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("PDF open failed", error);
      toast({
        title: "PDF generation failed",
        description: "Unable to open claim PDF right now.",
        variant: "destructive"
      });
    }
  };

  const handleEnhanceClaim = async (claimId: number) => {
    const queryResponse = window.prompt("Enter clarification or query response for this claim:");
    if (!queryResponse || !queryResponse.trim()) {
      return;
    }

    try {
      setEnhancingClaimId(claimId);
      await api.post(
        `/hospital/insurance/claims/${claimId}/enhance`,
        { queryResponse: queryResponse.trim() },
        { headers: hospitalHeaders() }
      );

      toast({
        title: "Claim enhanced",
        description: "Clarification submitted successfully."
      });

      await loadDashboard();
      await handleOpenClaimHistory(claimId);
    } catch (error) {
      console.error("Enhance claim failed", error);
      toast({
        title: "Enhancement failed",
        description: "Unable to submit clarification.",
        variant: "destructive"
      });
    } finally {
      setEnhancingClaimId(null);
    }
  };

  const handleSubmitAppeal = async (claimId: number) => {
    const appealReason = window.prompt("Enter appeal reason for this denied claim:");
    if (!appealReason || !appealReason.trim()) return;

    const supportingNotes = window.prompt("Optional supporting notes (can be left blank):") || "";

    try {
      setAppealingClaimId(claimId);
      await api.post(
        `/hospital/insurance/claims/${claimId}/appeal`,
        { appealReason: appealReason.trim(), supportingNotes: supportingNotes.trim() },
        { headers: hospitalHeaders() }
      );

      toast({
        title: "Appeal submitted",
        description: "Denial appeal filed and moved to pending review."
      });

      await loadDashboard();
      await handleOpenClaimHistory(claimId);
    } catch (error) {
      console.error("Appeal submission failed", error);
      toast({
        title: "Appeal failed",
        description: "Unable to submit denial appeal.",
        variant: "destructive"
      });
    } finally {
      setAppealingClaimId(null);
    }
  };

  const statCards = useMemo(() => {
    const stats = dashboard?.stats;
    const alerts = dashboard?.alerts;
    return [
      { label: "Total Claims", value: stats?.total || 0, icon: FileText },
      { label: "Pending Queue", value: stats?.pending || 0, icon: AlertCircle },
      { label: "Query Cases", value: alerts?.queriesNeedingResponse || 0, icon: Shield },
      { label: "Receivables", value: formatAmount(receivables?.total), icon: DollarSign }
    ];
  }, [dashboard, receivables]);

  return (
    <HospitalLayout
      title="Insurance Operations Dashboard"
      subtitle="IHX-style hospital insurance workflows for claims, pre-auth, documents, and receivables"
    >
      <div className="flex flex-wrap gap-3 mb-6">
        <Button onClick={() => navigate('/hospital/insurance-billing')}>
          <FileText className="w-4 h-4 mr-2" />
          New / Manage Claims
        </Button>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{item.value}</div>
                  <Icon className="w-5 h-5 text-teal-600" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="claims">Claims Queue</TabsTrigger>
          <TabsTrigger value="tasks">Task Inbox</TabsTrigger>
          <TabsTrigger value="escalations">SLA Escalations</TabsTrigger>
          <TabsTrigger value="appeals">Denials & Appeals</TabsTrigger>
          <TabsTrigger value="preauth">Pre-Auth</TabsTrigger>
          <TabsTrigger value="documents">Document Alerts</TabsTrigger>
          <TabsTrigger value="search">Quick Search</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Task Inbox</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {taskSummary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-md p-2 text-sm">Total Tasks: <span className="font-semibold">{taskSummary.total}</span></div>
                  <div className="border rounded-md p-2 text-sm">High Priority: <span className="font-semibold">{taskSummary.highPriority}</span></div>
                  <div className="border rounded-md p-2 text-sm">SLA Breached: <span className="font-semibold">{taskSummary.slaBreached}</span></div>
                </div>
              )}

              {taskInbox.length === 0 ? (
                <p className="text-sm text-slate-500">No pending operational tasks.</p>
              ) : (
                taskInbox.map((task, index) => (
                  <div key={`${task.taskType}-${task.claimId || task.preAuthId || index}`} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{task.taskLabel}</p>
                      <p className="text-sm text-slate-500">
                        {task.claimNumber ? `Claim: ${task.claimNumber}` : `Pre-Auth: ${task.preAuthNumber}`} • {task.patientName || "Unknown"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Age: {task.ageDays} days</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={task.priority === "high" ? "bg-red-500/10 text-red-600" : "bg-blue-500/10 text-blue-600"}>
                        {task.priority}
                      </Badge>
                      <Badge className={task.slaFlag === "breached" ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}>
                        {task.slaFlag}
                      </Badge>
                      {!!task.claimId && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleOpenClaimHistory(task.claimId!)}>History</Button>
                          <Button size="sm" onClick={() => handleEnhanceClaim(task.claimId!)}>Act</Button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="escalations">
          <Card>
            <CardHeader>
              <CardTitle>SLA Escalations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {escalationSummary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-md p-2 text-sm">Breached: <span className="font-semibold">{escalationSummary.totalBreached}</span></div>
                  <div className="border rounded-md p-2 text-sm">Critical: <span className="font-semibold">{escalationSummary.critical}</span></div>
                  <div className="border rounded-md p-2 text-sm">Warning: <span className="font-semibold">{escalationSummary.warning}</span></div>
                </div>
              )}

              {escalations.length === 0 ? (
                <p className="text-sm text-slate-500">No SLA escalations right now.</p>
              ) : (
                escalations.map((item) => (
                  <div key={item.claimId} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{item.claimNumber}</p>
                      <p className="text-sm text-slate-500">{item.patientName} • {item.ageDays} days old</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusClass(item.status)}>{item.status}</Badge>
                      <Badge className={item.escalationLevel === "critical" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}>
                        {item.escalationLevel}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => handleOpenClaimHistory(item.claimId)}>History</Button>
                      <Button size="sm" onClick={() => handleEnhanceClaim(item.claimId)}>Follow Up</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appeals">
          <Card>
            <CardHeader>
              <CardTitle>Denials & Appeals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appeals.length === 0 ? (
                <p className="text-sm text-slate-500">No denial/appeal records available.</p>
              ) : (
                appeals.map((item) => (
                  <div key={item.claimId} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{item.claimNumber}</p>
                      <p className="text-sm text-slate-500">{item.patientName}</p>
                      <p className="text-xs text-slate-500 mt-1">Reason: {item.rejectionReason || "N/A"}</p>
                      <p className="text-xs text-slate-500">Appeals filed: {item.appealCount}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusClass(item.status)}>{item.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => handleOpenClaimHistory(item.claimId)}>History</Button>
                      <Button
                        size="sm"
                        onClick={() => handleSubmitAppeal(item.claimId)}
                        disabled={appealingClaimId === item.claimId}
                      >
                        {appealingClaimId === item.claimId ? "Submitting..." : "Submit Appeal"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <CardTitle>Submitted Claims</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">Loading claims...</p>
              ) : claims.length === 0 ? (
                <p className="text-sm text-slate-500">No submitted claims found.</p>
              ) : (
                claims.map((claim) => (
                  <div key={claim.id} className="flex flex-col md:flex-row md:items-center md:justify-between border rounded-lg p-3 gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{claim.claimNumber}</p>
                      <p className="text-sm text-slate-500">Policy: {claim.policyNumber || "N/A"}</p>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{formatAmount(claim.claimAmount)}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusClass(claim.status)}>{claim.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => handleOpenClaimHistory(claim.id)}>
                        History
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenClaimPdf(claim.id)}>
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleEnhanceClaim(claim.id)}
                        disabled={enhancingClaimId === claim.id}
                      >
                        {enhancingClaimId === claim.id ? "Enhancing..." : "Enhance"}
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {selectedHistoryClaimId !== null && (
                <div
                  ref={historyPanelRef}
                  tabIndex={-1}
                  className={`border rounded-lg p-3 mt-2 bg-slate-50/80 dark:bg-slate-900/40 outline-none transition-all duration-500 ${
                    highlightTimeline ? "ring-2 ring-teal-500/70 animate-pulse" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Claim Timeline: #{selectedHistoryClaimId}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedHistoryClaimId(null);
                        setHistoryTimeline([]);
                      }}
                    >
                      Close
                    </Button>
                  </div>

                  {historyLoading ? (
                    <p className="text-sm text-slate-500">Loading timeline...</p>
                  ) : historyTimeline.length === 0 ? (
                    <p className="text-sm text-slate-500">No timeline events available.</p>
                  ) : (
                    <div className="space-y-2">
                      {historyTimeline.map((item, index) => (
                        <div key={`${item.event}-${item.timestamp}-${index}`} className="border rounded-md p-2 bg-background">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900 dark:text-white">{item.event}</span>
                            <span className="text-xs text-slate-500">
                              {item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {item.status ? `Status: ${item.status}` : ""}
                            {item.details ? ` • ${item.details}` : ""}
                            {item.reason ? ` • ${item.reason}` : ""}
                            {typeof item.approvedAmount === "number" ? ` • Approved: ${formatAmount(item.approvedAmount)}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preauth">
          <Card>
            <CardHeader>
              <CardTitle>Pending Pre-Authorizations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingPreAuth.length === 0 ? (
                <p className="text-sm text-slate-500">No pending pre-authorization requests.</p>
              ) : (
                pendingPreAuth.map((item) => (
                  <div key={item.id} className="flex flex-col md:flex-row md:items-center md:justify-between border rounded-lg p-3 gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{item.preAuthNumber}</p>
                      <p className="text-sm text-slate-500">Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "-"}</p>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{formatAmount(item.estimatedAmount)}</div>
                    <Badge className={statusClass(item.status)}>{item.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Missing Document Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {missingDocuments.length === 0 ? (
                <p className="text-sm text-slate-500">No missing document alerts.</p>
              ) : (
                missingDocuments.map((doc) => (
                  <div key={doc.claimId} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{doc.claimNumber}</p>
                      <Badge className="bg-amber-500/10 text-amber-600">Documents Incomplete</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">Patient: {doc.patientName}</p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenClaimHistory(Number(doc.claimId))}
                        disabled={!doc.claimId}
                      >
                        History
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenClaimPdf(Number(doc.claimId))}
                        disabled={!doc.claimId}
                      >
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleEnhanceClaim(Number(doc.claimId))}
                        disabled={!doc.claimId || enhancingClaimId === Number(doc.claimId)}
                      >
                        {enhancingClaimId === Number(doc.claimId) ? "Enhancing..." : "Enhance"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Claim Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Claim ID / Policy No / Member ID"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Button onClick={handleClaimSearch} disabled={searching}>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div key={result.id} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{result.claimNumber}</p>
                        <p className="text-sm text-slate-500">Policy: {result.policyNumber || "N/A"}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusClass(result.status)}>{result.status}</Badge>
                        <Button size="sm" variant="outline" onClick={() => handleOpenClaimHistory(result.id)}>
                          History
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleOpenClaimPdf(result.id)}>
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleEnhanceClaim(result.id)}
                          disabled={enhancingClaimId === result.id}
                        >
                          {enhancingClaimId === result.id ? "Enhancing..." : "Enhance"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Patient Search & Eligibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Search patient"
                    value={patientSearchTerm}
                    onChange={(e) => setPatientSearchTerm(e.target.value)}
                  />
                  <select
                    value={patientSearchType}
                    onChange={(e) => setPatientSearchType(e.target.value as "name" | "mobile" | "abha" | "policy")}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="name">Name</option>
                    <option value="mobile">Mobile</option>
                    <option value="abha">ABHA</option>
                    <option value="policy">Policy</option>
                  </select>
                </div>
                <Button variant="outline" onClick={handlePatientSearch}>Find Patient</Button>

                {patients.length > 0 && (
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {patients.map((patient) => (
                      <option key={patient.id} value={String(patient.id)}>
                        {patient.firstName} {patient.lastName} ({patient.id})
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Policy number"
                    value={eligibilityPolicyNumber}
                    onChange={(e) => setEligibilityPolicyNumber(e.target.value)}
                  />
                  <Button onClick={handleEligibilityCheck}>Check</Button>
                </div>

                {eligibilityResult && (
                  <div className="border rounded-lg p-3 text-sm">
                    <p className="font-semibold text-slate-900 dark:text-white mb-2">Eligibility Result</p>
                    <pre className="whitespace-pre-wrap break-all text-slate-600 dark:text-slate-300">
                      {JSON.stringify(eligibilityResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Receivables Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Approved Not Settled</span><span>{formatAmount(receivables?.approvedNotSettled)}</span></div>
                <div className="flex items-center justify-between"><span>Settled</span><span>{formatAmount(receivables?.settled)}</span></div>
                <div className="flex items-center justify-between"><span>Pending</span><span>{formatAmount(receivables?.pending)}</span></div>
                <div className="flex items-center justify-between font-semibold"><span>Total</span><span>{formatAmount(receivables?.total)}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Claims Aging & Trends</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>&lt; 7 days</span><span>{agingReport?.['<7days'] || 0}</span></div>
                <div className="flex items-center justify-between"><span>7 - 15 days</span><span>{agingReport?.['7-15days'] || 0}</span></div>
                <div className="flex items-center justify-between"><span>15 - 30 days</span><span>{agingReport?.['15-30days'] || 0}</span></div>
                <div className="flex items-center justify-between"><span>&gt; 30 days</span><span>{agingReport?.['>30days'] || 0}</span></div>
                <div className="border-t pt-2 mt-2 flex items-center justify-between"><span>Queries</span><span>{trendReport?.queries || 0}</span></div>
                <div className="flex items-center justify-between"><span>Rejections</span><span>{trendReport?.rejections || 0}</span></div>
                <div className="flex items-center justify-between"><span>Approvals</span><span>{trendReport?.approvals || 0}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
};

export default HospitalInsuranceClaimsDashboard;

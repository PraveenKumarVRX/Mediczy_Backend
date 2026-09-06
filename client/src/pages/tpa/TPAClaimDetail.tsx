import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TPASidebar from '@/components/tpa/TPASidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import api from '@/utils/api';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Calculator,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileText,
  GitBranch,
  Hospital,
  RefreshCw,
  ShieldAlert,
  Upload,
  WandSparkles,
} from 'lucide-react';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const badgeClass = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'paid', 'settled', 'complete', 'delivered'].includes(normalized)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (['submitted', 'pending', 'queued', 'query_raised', 'pending_verification', 'incomplete', 'final_bill_review'].includes(normalized)) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (['rejected', 'failed', 'high'].includes(normalized)) return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const asArray = (value: any) => Array.isArray(value) ? value : [];

const TPAClaimDetail = () => {
  const { claimNumber } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const token = localStorage.getItem('tpaToken');
    if (!token) {
      navigate('/tpa/login');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/tpa/claims/${encodeURIComponent(claimNumber || '')}`);
      setDetail(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load claim detail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimNumber]);

  const runAction = async (
    action: 'document' | 'shortfall' | 'approve' | 'fwa' | 'file' | 'intelligence' | 'payable' | 'approval' | 'notify' | 'provider' | 'interop'
  ) => {
    if (!claimNumber) return;
    setBusy(action);
    setError(null);
    try {
      const encodedClaim = encodeURIComponent(claimNumber);
      if (action === 'document') {
        await api.post(`/tpa/claims/${encodedClaim}/documents`, {
          documentType: 'hospital_bill',
          fileName: `${claimNumber}-bill.pdf`,
          completenessScore: 88,
          extractedFields: { source: 'claim-detail-ui' }
        });
      } else if (action === 'file') {
        await api.post(`/tpa/claims/${encodedClaim}/files`, {
          documentType: 'discharge_summary',
          storageProvider: 'local',
          storageKey: `uploads/tpa-claims/${claimNumber}/ui-discharge-summary.pdf`,
          originalFileName: `${claimNumber}-discharge-summary.pdf`,
          mimeType: 'application/pdf',
          fileSize: 204800,
          checksumSha256: `ui-${Date.now()}`,
          completenessScore: 82,
        });
      } else if (action === 'intelligence') {
        await api.post(`/tpa/claims/${encodedClaim}/document-intelligence`, {
          requiredDocuments: ['hospital_bill', 'discharge_summary', 'bank_proof'],
        });
      } else if (action === 'payable') {
        await api.post(`/tpa/claims/${encodedClaim}/payable-estimate`, {
          roomDays: 2,
          roomRentClaimed: 12000,
        });
      } else if (action === 'approval') {
        await api.post(`/tpa/claims/${encodedClaim}/approval-requests`, {
          actionType: 'claim_approval',
          requestedPayload: { approvedAmount: detail?.claim?.claimedAmount || detail?.claim?.claimAmount || 0 },
        });
      } else if (action === 'notify') {
        await api.post(`/tpa/claims/${encodedClaim}/notifications`, {
          channel: 'whatsapp',
          recipient: detail?.claim?.memberId || detail?.claim?.employeeId || 'member-not-mapped',
          templateCode: 'claim_status_update',
        });
      } else if (action === 'provider') {
        await api.post('/tpa/provider-cases', {
          claimNumber,
          hospitalName: detail?.claim?.hospitalName || 'Mapped Network Hospital',
          memberId: detail?.claim?.memberId,
          caseType: 'discharge_final',
          finalBillAmount: detail?.claim?.claimedAmount || 0,
        });
      } else if (action === 'interop') {
        await api.post('/tpa/interop/events', {
          claimNumber,
          eventType: 'claim_status_update',
          targetSystem: 'nhcx_gateway',
          idempotencyKey: `ui-${claimNumber}-${Date.now()}`,
        });
      } else if (action === 'shortfall') {
        await api.post(`/tpa/claims/${encodedClaim}/shortfalls`, {
          reason: 'Original discharge summary or signed bill copy required.',
          requiredDocuments: ['discharge_summary', 'signed_final_bill']
        });
      } else if (action === 'approve') {
        await api.post(`/tpa/claims/${encodedClaim}/decision`, {
          decision: 'approved',
          approvedAmount: detail?.claim?.claimedAmount || detail?.claim?.claimAmount || 0,
          notes: 'Approved from TPA claim detail workbench.'
        });
      } else if (action === 'fwa') {
        await api.post(`/tpa/claims/${encodedClaim}/fwa-score`);
      }
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const claim = detail?.claim;
  const latestPolicyEstimate = useMemo(() => {
    return asArray(detail?.timeline).slice().reverse().find((event: any) => event.event_type === 'policy_payable_estimated')?.payload;
  }, [detail?.timeline]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Button variant="ghost" className="mb-3 -ml-3" onClick={() => navigate('/tpa/claims')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Claims
              </Button>
              <h1 className="text-3xl font-bold text-slate-900">Claim Workbench</h1>
              <p className="text-slate-600 mt-1">Lifecycle, documents, policy rules, maker-checker, notifications, provider handoff, and interoperability controls.</p>
            </div>
            <Button onClick={load} disabled={loading} variant="outline" className="bg-white">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <Card><CardContent className="py-16 text-center text-slate-500">Loading claim...</CardContent></Card>
          ) : claim ? (
            <>
              <Card className="bg-white/95 border-slate-200">
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-2xl">{claim.claimNumber}</CardTitle>
                      <CardDescription>{claim.employeeName} · {claim.corporate || 'Corporate not mapped'} · {claim.policyNumber}</CardDescription>
                    </div>
                    <Badge className={badgeClass(claim.status)}>{claim.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-xl border p-4"><p className="text-xs text-slate-400 uppercase">Claimed</p><p className="text-xl font-bold">{currency.format(claim.claimedAmount || claim.claimAmount || 0)}</p></div>
                    <div className="rounded-xl border p-4"><p className="text-xs text-slate-400 uppercase">Approved</p><p className="text-xl font-bold">{currency.format(claim.approvedAmount || 0)}</p></div>
                    <div className="rounded-xl border p-4"><p className="text-xs text-slate-400 uppercase">Deducted</p><p className="text-xl font-bold">{currency.format(claim.deductedAmount || 0)}</p></div>
                    <div className="rounded-xl border p-4"><p className="text-xs text-slate-400 uppercase">Settled</p><p className="text-xl font-bold">{currency.format(claim.settledAmount || 0)}</p></div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div><span className="text-slate-500">Hospital:</span> <span className="font-medium">{claim.hospitalName || '—'}</span></div>
                    <div><span className="text-slate-500">Type:</span> <span className="font-medium">{claim.claimType || '—'}</span></div>
                    <div><span className="text-slate-500">Documents:</span> <Badge className={badgeClass(claim.documentsStatus)}>{claim.documentsStatus}</Badge></div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button onClick={() => runAction('document')} disabled={!!busy}><Upload className="h-4 w-4 mr-2" /> Add AI Document</Button>
                    <Button variant="outline" onClick={() => runAction('file')} disabled={!!busy}><FileArchive className="h-4 w-4 mr-2" /> Vault File</Button>
                    <Button variant="outline" onClick={() => runAction('intelligence')} disabled={!!busy}><WandSparkles className="h-4 w-4 mr-2" /> Run OCR Checklist</Button>
                    <Button variant="outline" onClick={() => runAction('payable')} disabled={!!busy}><Calculator className="h-4 w-4 mr-2" /> Policy Estimate</Button>
                    <Button variant="outline" onClick={() => runAction('shortfall')} disabled={!!busy}><ClipboardList className="h-4 w-4 mr-2" /> Raise Shortfall</Button>
                    <Button variant="outline" onClick={() => runAction('fwa')} disabled={!!busy}><ShieldAlert className="h-4 w-4 mr-2" /> FWA Score</Button>
                    <Button variant="outline" onClick={() => runAction('approval')} disabled={!!busy}><ClipboardCheck className="h-4 w-4 mr-2" /> Maker-Checker</Button>
                    <Button variant="outline" onClick={() => runAction('notify')} disabled={!!busy}><Bell className="h-4 w-4 mr-2" /> Notify</Button>
                    <Button variant="outline" onClick={() => runAction('provider')} disabled={!!busy}><Hospital className="h-4 w-4 mr-2" /> Provider Handoff</Button>
                    <Button variant="outline" onClick={() => runAction('interop')} disabled={!!busy}><GitBranch className="h-4 w-4 mr-2" /> Queue NHCX/API</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => runAction('approve')} disabled={!!busy}><CheckCircle className="h-4 w-4 mr-2" /> Approve</Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Timeline</CardTitle><CardDescription>Immutable claim lifecycle events.</CardDescription></CardHeader>
                  <CardContent className="space-y-4 max-h-[520px] overflow-auto">
                    {asArray(detail.timeline).map((event: any) => (
                      <div key={event.id} className="border-l-2 border-violet-200 pl-4 pb-4">
                        <p className="font-semibold text-slate-900">{event.title}</p>
                        <p className="text-sm text-slate-500">{event.description || event.event_type}</p>
                        <p className="text-xs text-slate-400 mt-1">{new Date(event.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Document Intelligence</CardTitle><CardDescription>OCR, completeness, and missing-document status.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {asArray(detail.documents).length === 0 ? <p className="text-sm text-slate-500">No documents yet.</p> : asArray(detail.documents).map((doc: any) => (
                      <div key={doc.id} className="rounded-lg border p-3">
                        <div className="flex justify-between gap-3"><p className="font-medium">{doc.document_type}</p><Badge className={badgeClass(doc.risk_signal)}>{doc.risk_signal}</Badge></div>
                        <p className="text-sm text-slate-500">{doc.file_name} · OCR {doc.ocr_status} · {doc.completeness_score}% complete</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Policy Rule Engine</CardTitle><CardDescription>Latest payable/non-payable estimate.</CardDescription></CardHeader>
                  <CardContent>
                    {latestPolicyEstimate ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-emerald-700">Payable</p><p className="text-xl font-bold text-emerald-900">{currency.format(latestPolicyEstimate.payableAmount || 0)}</p></div>
                        <div className="rounded-xl bg-red-50 p-3"><p className="text-red-700">Deduction</p><p className="text-xl font-bold text-red-900">{currency.format(latestPolicyEstimate.deductionAmount || 0)}</p></div>
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Co-pay</p><p className="font-bold">{latestPolicyEstimate.coPayPercent || 0}%</p></div>
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Recommendation</p><p className="font-bold">{latestPolicyEstimate.recommendation}</p></div>
                      </div>
                    ) : <p className="text-sm text-slate-500">Run Policy Estimate to calculate payable amount.</p>}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Fraud Guard</CardTitle><CardDescription>Fraud, waste, and abuse decision support.</CardDescription></CardHeader>
                  <CardContent>
                    {detail.fraudRisk ? (
                      <div className="rounded-xl border p-4">
                        <div className="flex items-center justify-between"><p className="text-3xl font-bold">{detail.fraudRisk.risk_score}</p><Badge className={badgeClass(detail.fraudRisk.risk_level)}>{detail.fraudRisk.risk_level}</Badge></div>
                        <p className="text-sm text-slate-500 mt-2">{detail.fraudRisk.recommendation}</p>
                      </div>
                    ) : <p className="text-sm text-slate-500">Run FWA score to generate risk signals.</p>}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>File Vault</CardTitle><CardDescription>Stored files, checksums, consent scope, retention.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {asArray(detail.files).length === 0 ? <p className="text-sm text-slate-500">No vaulted files yet.</p> : asArray(detail.files).map((file: any) => (
                      <div key={file.id} className="rounded-lg border p-3">
                        <p className="font-medium">{file.original_file_name}</p>
                        <p className="text-xs text-slate-500 break-all">{file.storage_key}</p>
                        <p className="text-xs text-slate-400">{file.storage_provider} · {file.file_size} bytes · retention {file.retention_until || 'default'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Maker-Checker</CardTitle><CardDescription>High-value approval/rejection/payment control.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {asArray(detail.approvalRequests).length === 0 ? <p className="text-sm text-slate-500">No approval requests yet.</p> : asArray(detail.approvalRequests).map((item: any) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex justify-between"><p className="font-medium">{item.approval_number}</p><Badge className={badgeClass(item.status)}>{item.status}</Badge></div>
                        <p className="text-sm text-slate-500">{item.action_type} · {item.risk_level}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>Email/SMS/WhatsApp templates and receipts.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {asArray(detail.notifications).length === 0 ? <p className="text-sm text-slate-500">No notifications queued.</p> : asArray(detail.notifications).map((item: any) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex justify-between"><p className="font-medium">{item.channel} · {item.template_code}</p><Badge className={badgeClass(item.status)}>{item.status}</Badge></div>
                        <p className="text-sm text-slate-500">{item.recipient} · {item.provider_message_id || 'pending provider id'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200">
                  <CardHeader><CardTitle>Provider + Interop</CardTitle><CardDescription>Hospital handoff cases and NHCX/API/webhook queue.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 mb-2">Provider cases</p>
                      {asArray(detail.providerCases).length === 0 ? <p className="text-sm text-slate-500">No provider handoffs yet.</p> : asArray(detail.providerCases).map((item: any) => (
                        <div key={item.id} className="rounded-lg border p-3 mb-2">
                          <div className="flex justify-between"><p className="font-medium">{item.case_number}</p><Badge className={badgeClass(item.status)}>{item.status}</Badge></div>
                          <p className="text-sm text-slate-500">{item.hospital_name} · {item.case_type}</p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 mb-2">Interop queue</p>
                      {asArray(detail.interopEvents).length === 0 ? <p className="text-sm text-slate-500">No interop events queued.</p> : asArray(detail.interopEvents).map((item: any) => (
                        <div key={item.id} className="rounded-lg border p-3 mb-2">
                          <div className="flex justify-between"><p className="font-medium">{item.event_number}</p><Badge className={badgeClass(item.status)}>{item.status}</Badge></div>
                          <p className="text-sm text-slate-500">{item.target_system} · {item.event_type}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/95 border-slate-200 xl:col-span-2">
                  <CardHeader><CardTitle>Shortfalls / Queries</CardTitle><CardDescription>Missing information requests and due dates.</CardDescription></CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {asArray(detail.shortfalls).length === 0 ? <p className="text-sm text-slate-500">No shortfalls raised.</p> : asArray(detail.shortfalls).map((sf: any) => (
                      <div key={sf.id} className="rounded-lg border p-3">
                        <div className="flex justify-between gap-3"><p className="font-medium">{sf.shortfall_number}</p><Badge className={badgeClass(sf.status)}>{sf.status}</Badge></div>
                        <p className="text-sm text-slate-500">{sf.reason}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card><CardContent className="py-16 text-center text-slate-500">Claim not found.</CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TPAClaimDetail;

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  FileText, Send, PenLine, Shield
} from 'lucide-react';
import api from '@/utils/api';

interface ReadinessCheck {
  key: string;
  label: string;
  met: boolean;
  details?: string;
}

interface DischargeDraft {
  id: number;
  admission_id: number;
  status: 'draft' | 'signed' | 'sent' | 'delivered';
  content: string;
  created_at: string;
  updated_at: string;
}

export default function DischargeWorkflow() {
  const { admissionId } = useParams<{ admissionId: string }>();
  const navigate = useNavigate();

  const [readiness, setReadiness] = useState<ReadinessCheck[]>([]);
  const [draft, setDraft]         = useState<DischargeDraft | null>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [editing, setEditing]     = useState(false);
  const [content, setContent]     = useState('');

  const loadAll = useCallback(async () => {
    if (!admissionId) return;
    setLoading(true);
    try {
      const [readRes, draftRes] = await Promise.allSettled([
        api.get(`/api/v1/adt/discharge/readiness/${admissionId}`),
        api.get(`/api/v1/discharge/draft/${admissionId}`)
      ]);

      if (readRes.status === 'fulfilled') {
        setReadiness(readRes.value.data?.data?.checks ?? []);
      }
      if (draftRes.status === 'fulfilled') {
        const d = draftRes.value.data?.data;
        setDraft(d ?? null);
        setContent(d?.content ?? '');
      }
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load discharge data');
    } finally {
      setLoading(false);
    }
  }, [admissionId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const createDraft = async () => {
    if (!admissionId) return;
    setActionLoading('create');
    try {
      const res = await api.post('/api/v1/discharge/draft', { admissionId: parseInt(admissionId) });
      const d = res.data?.data;
      setDraft(d);
      setContent(d?.content ?? '');
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to create draft');
    } finally {
      setActionLoading(null);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    setActionLoading('save');
    try {
      const res = await api.put(`/api/v1/discharge/draft/${draft.id}`, { content });
      setDraft(res.data?.data ?? draft);
      setEditing(false);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save draft');
    } finally {
      setActionLoading(null);
    }
  };

  const signPacket = async () => {
    if (!draft) return;
    setActionLoading('sign');
    try {
      const res = await api.post(`/api/v1/discharge/sign/${draft.id}`);
      setDraft(res.data?.data ?? draft);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to sign discharge packet');
    } finally {
      setActionLoading(null);
    }
  };

  const sendPacket = async () => {
    if (!draft) return;
    setActionLoading('send');
    try {
      const res = await api.post(`/api/v1/discharge/packet/send/${draft.id}`);
      setDraft(res.data?.data ?? draft);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to send packet');
    } finally {
      setActionLoading(null);
    }
  };

  const allMet   = readiness.length > 0 && readiness.every(r => r.met);
  const metCount = readiness.filter(r => r.met).length;

  const STATUS_COLOR: Record<string, string> = {
    draft:     'bg-amber-100 text-amber-700',
    signed:    'bg-teal-100 text-teal-700',
    sent:      'bg-blue-100 text-blue-700',
    delivered: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" /> Discharge Workflow
            </h1>
            <p className="text-sm text-muted-foreground">Admission ID: {admissionId}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading discharge data…</div>
        ) : (
          <div className="space-y-4">
            {/* Readiness Checklist */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Discharge Readiness</span>
                  <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${allMet ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {metCount}/{readiness.length} criteria met
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {readiness.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No readiness data available</p>
                ) : (
                  <div className="space-y-2">
                    {readiness.map(r => (
                      <div key={r.key} className="flex items-start gap-3 p-2 rounded-lg bg-slate-50">
                        {r.met
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                          : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />}
                        <div>
                          <p className="text-sm font-medium text-slate-700">{r.label}</p>
                          {r.details && <p className="text-xs text-muted-foreground">{r.details}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!allMet && readiness.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    Not all criteria met. Consult senior clinician before proceeding.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Discharge Summary Packet */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Discharge Summary</span>
                  {draft && <Badge className={`text-xs ${STATUS_COLOR[draft.status]}`}>{draft.status}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!draft ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-4">No discharge summary drafted yet.</p>
                    <Button onClick={createDraft} disabled={actionLoading === 'create'} className="bg-teal-600 hover:bg-teal-700 text-white">
                      {actionLoading === 'create' ? 'Creating…' : 'Auto-Generate Draft'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editing ? (
                      <textarea
                        className="w-full border rounded-md px-3 py-2 text-sm font-mono min-h-[300px] resize-y"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                      />
                    ) : (
                      <pre className="bg-slate-50 border rounded-lg p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-80 overflow-y-auto">
                        {content || '(empty)'}
                      </pre>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {draft.status === 'draft' && (
                        <>
                          {editing ? (
                            <>
                              <Button size="sm" onClick={saveDraft} disabled={actionLoading === 'save'} className="bg-teal-600 hover:bg-teal-700 text-white">
                                {actionLoading === 'save' ? 'Saving…' : 'Save Changes'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setContent(draft.content); }}>Cancel</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                              <PenLine className="h-4 w-4 mr-1" /> Edit
                            </Button>
                          )}
                          <Button size="sm" onClick={signPacket} disabled={actionLoading === 'sign' || !allMet} className="bg-slate-800 hover:bg-slate-900 text-white">
                            <PenLine className="h-4 w-4 mr-1" />
                            {actionLoading === 'sign' ? 'Signing…' : 'Sign & Finalise'}
                          </Button>
                        </>
                      )}
                      {draft.status === 'signed' && (
                        <Button size="sm" onClick={sendPacket} disabled={actionLoading === 'send'} className="bg-teal-600 hover:bg-teal-700 text-white">
                          <Send className="h-4 w-4 mr-1" />
                          {actionLoading === 'send' ? 'Sending…' : 'Send to Patient'}
                        </Button>
                      )}
                      {(draft.status === 'sent' || draft.status === 'delivered') && (
                        <div className="flex items-center gap-2 text-emerald-700 text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          Discharge packet {draft.status}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

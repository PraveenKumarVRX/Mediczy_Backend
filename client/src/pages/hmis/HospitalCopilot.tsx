import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Bot, CheckCircle, FlaskConical, GitBranch, Loader2, Send } from 'lucide-react';
import {
  hospitalCopilotChat,
  listApprovals,
  reviewApproval,
  getCommandCenterAI,
  listSimulationScenarios,
  runHospitalSimulation,
  generateNurseHandover,
  type HospitalCopilotMessage,
} from '@/services/hospitalOs.service';

export default function HospitalCopilot() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');

  const [messages, setMessages] = useState<HospitalCopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [aiRecs, setAiRecs] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [simResult, setSimResult] = useState<any>(null);
  const [handover, setHandover] = useState<any>(null);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const history = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(history);
    setLoading(true);
    try {
      const res = await hospitalCopilotChat({
        message: userMsg,
        context: {
          patientId: patientId ? Number(patientId) : undefined,
          includeCommandCenter: /occupancy|command|capacity/i.test(userMsg),
        },
        conversationHistory: messages,
      });
      const reply = res?.data?.response || res?.response || 'No response';
      setMessages([...history, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages([...history, { role: 'assistant', content: e?.message || 'Error contacting Hospital Copilot' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, patientId]);

  const loadApprovals = async () => {
    const res = await listApprovals('pending');
    setApprovals(res?.data || []);
  };

  const loadCommandAI = async () => {
    const res = await getCommandCenterAI();
    setAiRecs(res?.data?.recommendations || []);
  };

  const loadScenarios = async () => {
    const res = await listSimulationScenarios();
    setScenarios(res?.data || []);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <Bot className="h-6 w-6 text-teal-600" /> Hospital Copilot
            </h1>
            <p className="text-sm text-slate-500">AI-first hospital assistant — human-final for all clinical actions</p>
          </div>
        </div>

        <Tabs defaultValue="chat" onValueChange={(v) => {
          if (v === 'approvals') loadApprovals();
          if (v === 'ops') { loadCommandAI(); loadScenarios(); }
          if (v === 'nursing') generateNurseHandover().then((r) => setHandover(r?.data)).catch(() => {});
        }}>
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="chat">Copilot</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="ops">Ops & Twins</TabsTrigger>
            <TabsTrigger value="nursing">Nursing</TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            <Card>
              <CardHeader><CardTitle className="text-base">Unified clinical & operations assistant</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="h-80 overflow-y-auto space-y-3 rounded-lg border bg-white p-4">
                  {messages.length === 0 && (
                    <p className="text-sm text-slate-500">Try: &quot;Summarize bed occupancy&quot;, &quot;Draft discharge for patient&quot;, &quot;What are pending approvals?&quot;</p>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
                      <span className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        {m.content}
                      </span>
                    </div>
                  ))}
                  {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
                </div>
                <div className="flex gap-2">
                  <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask Hospital Copilot..." />
                  <Button onClick={send} disabled={loading}><Send className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Approval Inbox (T1 drafts)</CardTitle>
                <Button size="sm" variant="outline" onClick={loadApprovals}>Refresh</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {approvals.length === 0 && <p className="text-sm text-slate-500">No pending approvals</p>}
                {approvals.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-white">
                    <div>
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-slate-500">{a.approval_type} · {a.risk_tier}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewApproval(a.id, 'approve').then(loadApprovals)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => reviewApproval(a.id, 'reject').then(loadApprovals)}>Reject</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ops">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" /> AI Recommendations</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Button size="sm" variant="outline" onClick={loadCommandAI}>Load</Button>
                  {aiRecs.map((r, i) => (
                    <div key={i} className={`text-sm rounded-lg p-3 border ${r.severity === 'critical' ? 'border-red-200 bg-red-50' : 'bg-white'}`}>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-slate-600">{r.message}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Hospital What-If</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Button size="sm" variant="outline" onClick={loadScenarios}>Load scenarios</Button>
                  {scenarios.map((s) => (
                    <Button key={s.key} variant="secondary" className="w-full justify-start" size="sm"
                      onClick={() => runHospitalSimulation(s.key).then((r) => setSimResult(r?.data))}>
                      {s.label}
                    </Button>
                  ))}
                  {simResult && (
                    <pre className="text-xs bg-slate-100 p-2 rounded overflow-auto max-h-40">{JSON.stringify(simResult.recommendations, null, 2)}</pre>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="nursing">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Shift Handover (SBAR)</CardTitle></CardHeader>
              <CardContent>
                <Button size="sm" className="mb-3" onClick={() => generateNurseHandover().then((r) => setHandover(r?.data))}>Generate</Button>
                {handover?.handover?.sbar && (
                  <div className="text-sm space-y-2 bg-white border rounded-lg p-4">
                    {Object.entries(handover.handover.sbar).map(([k, v]) => (
                      <div key={k}><span className="font-semibold uppercase">{k}: </span>{String(v)}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

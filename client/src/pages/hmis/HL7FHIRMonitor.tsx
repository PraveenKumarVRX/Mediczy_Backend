import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Zap, Server } from 'lucide-react';
import api from '@/services/api';

interface HL7Status { mllpStatus: string; port: number; uptime: number; messagesProcessed: number; lastActivity: string; }
interface HL7MessageType { type: string; event: string; description: string; supported: boolean; }
interface FHIRResource { type: string; interactions: string[]; searchParams: string[]; }
interface CapabilityStatement { fhirVersion: string; status: string; implementation: { description: string }; rest: Array<{ resource: FHIRResource[] }>; }

export default function HL7FHIRMonitor() {
  const navigate = useNavigate();
  const [hl7Status, setHL7Status]       = useState<HL7Status | null>(null);
  const [msgTypes, setMsgTypes]         = useState<HL7MessageType[]>([]);
  const [capability, setCapability]     = useState<CapabilityStatement | null>(null);
  const [validateInput, setValidateInput] = useState('');
  const [validateResult, setValidateResult] = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [validateLoading, setValidateLoading] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const [activeTab, setActiveTab]       = useState<'hl7' | 'fhir'>('hl7');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s1, s2, s3] = await Promise.allSettled([
        api.get('/api/v1/hl7/status'),
        api.get('/api/v1/hl7/message-types'),
        api.get('/api/fhir/r4/metadata'),
      ]);
      if (s1.status === 'fulfilled') setHL7Status(s1.value.data?.data ?? null);
      if (s2.status === 'fulfilled') setMsgTypes(s2.value.data?.data ?? []);
      if (s3.status === 'fulfilled') setCapability(s3.value.data ?? null);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const validateHL7 = async () => {
    if (!validateInput.trim()) return;
    setValidateLoading(true);
    setValidateResult(null);
    try {
      const res = await api.post('/api/v1/hl7/validate', { raw: validateInput });
      setValidateResult(res.data);
    } catch (e: any) {
      setValidateResult({ valid: false, error: e?.response?.data?.message ?? e.message });
    } finally {
      setValidateLoading(false);
    }
  };

  const fhirResources = capability?.rest?.[0]?.resource ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">HL7 & FHIR Monitor</h1>
            <p className="text-sm text-slate-500">Interoperability gateway status</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-xs text-slate-400">{lastUpdated.toLocaleTimeString()}</span>}
          <Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        <Button variant={activeTab === 'hl7' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('hl7')}>HL7 v2 Gateway</Button>
        <Button variant={activeTab === 'fhir' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('fhir')}>FHIR R4 API</Button>
      </div>

      {activeTab === 'hl7' && (
        <>
          {/* HL7 Status */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" />MLLP Gateway Status</CardTitle></CardHeader>
            <CardContent>
              {hl7Status ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Status</span>
                    <p className="font-medium flex items-center gap-1">
                      {hl7Status.mllpStatus === 'running' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                      {hl7Status.mllpStatus}
                    </p>
                  </div>
                  <div><span className="text-slate-500">Port</span><p className="font-medium">{hl7Status.port}</p></div>
                  <div><span className="text-slate-500">Messages Processed</span><p className="font-medium">{hl7Status.messagesProcessed}</p></div>
                  <div><span className="text-slate-500">Last Activity</span><p className="font-medium">{hl7Status.lastActivity ? new Date(hl7Status.lastActivity).toLocaleString() : '—'}</p></div>
                </div>
              ) : <p className="text-sm text-slate-400">Loading gateway status…</p>}
            </CardContent>
          </Card>

          {/* Supported Message Types */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-blue-500" />Supported Message Types</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {msgTypes.map((mt, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                    <div>
                      <span className="font-mono font-medium">{mt.type}</span>
                      <span className="text-slate-400 ml-2 text-xs">{mt.description}</span>
                    </div>
                    {mt.supported ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* HL7 Validator */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Message Validator</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full h-32 text-xs font-mono border rounded p-2 bg-slate-50"
                placeholder={'Paste HL7 v2 message here...\nMSH|^~\\&|SENDER|FAC|RECV|FAC|20240101||ADT^A01|MSG001|P|2.5.1'}
                value={validateInput}
                onChange={e => setValidateInput(e.target.value)}
              />
              <Button size="sm" onClick={validateHL7} disabled={validateLoading || !validateInput.trim()}>
                {validateLoading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                Validate Message
              </Button>
              {validateResult && (
                <div className={`p-3 rounded text-sm ${validateResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className="font-medium flex items-center gap-1">
                    {validateResult.valid ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    {validateResult.valid ? 'Valid HL7 message' : 'Invalid message'}
                  </p>
                  {validateResult.messageType && <p className="text-xs mt-1">Type: {validateResult.messageType}</p>}
                  {validateResult.errors?.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {validateResult.errors.map((e: string, i: number) => <li key={i} className="text-xs text-red-600">• {e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'fhir' && (
        <>
          {/* FHIR Status */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">FHIR R4 Capability</CardTitle></CardHeader>
            <CardContent>
              {capability ? (
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">FHIR Version</span><span className="font-medium">{capability.fhirVersion}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="font-medium capitalize">{capability.status}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Implementation</span><span className="font-medium text-right max-w-xs truncate">{capability.implementation?.description}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Resources</span><span className="font-medium">{fhirResources.length} supported</span></div>
                </div>
              ) : <p className="text-sm text-slate-400">Loading capability statement…</p>}
            </CardContent>
          </Card>

          {/* Resource List */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Supported Resources</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fhirResources.map((r, i) => (
                  <div key={i} className="p-2 border rounded-lg">
                    <p className="text-sm font-medium">{r.type}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.interactions?.map((ia: string, j: number) => (
                        <span key={j} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{ia}</span>
                      ))}
                    </div>
                    {r.searchParams?.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">Search: {r.searchParams.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

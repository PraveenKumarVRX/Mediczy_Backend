import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, LogOut, Clock, AlertCircle, CheckCircle2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  getOverview, setPresence, dial, getCall, setDisposition,
  claimCallback, resolveCallback, getMyLeads, TERMINAL_CALL_STATES,
  type CCOverview, type CRMLead,
} from './dialerClient';

const PRESENCE_HEARTBEAT_MS = 25_000; // under the server's 2-minute freshness window
const CALL_POLL_MS = 5_000;

const DISPOSITIONS: Array<{ value: Parameters<typeof setDisposition>[1]; label: string }> = [
  { value: 'appointment_followup', label: 'Appointment follow-up' },
  { value: 'information_provided', label: 'Information provided' },
  { value: 'callback_required', label: 'Callback required' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'no_action', label: 'No action' },
];

function currentUser(): { id?: number | string; crmRole?: string; firstName?: string } {
  try { return JSON.parse(localStorage.getItem('crmUserData') || '{}'); } catch { return {}; }
}

export default function CRMTelecallerDialer() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = currentUser();

  const [overview, setOverview] = useState<CCOverview | null>(null);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'leads' | 'callbacks'>('leads');

  // Active call being placed/tracked, and the pending callback it's linked to (if any).
  const [activeCall, setActiveCall] = useState<Record<string, any> | null>(null);
  const [activeCallbackId, setActiveCallbackId] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('crmToken')) { navigate('/crm/login'); return; }
  }, [navigate]);

  const load = useCallback(async () => {
    try {
      const ov = await getOverview();
      setOverview(ov);
      if (user.id) {
        const myLeads = await getMyLeads(user.id).catch(() => []);
        setLeads(myLeads);
      }
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const ownAgent = overview?.agents.find(a => String(a.user_id) === String(user.id));
  const hasPhone = !!ownAgent?.phone;
  const isAvailable = ownAgent?.presence === 'available';
  const hasActiveCallOnServer = !!ownAgent?.active_call_id;

  const openCallbacks = (overview?.callbacks || []).filter(b => b.status === 'open');
  const myCallbacks = (overview?.callbacks || []).filter(
    b => b.status === 'in_progress' && String(b.owner_id) === String(user.id)
  );

  // Presence heartbeat — keeps this agent eligible to receive a dial while the tab is open and visible.
  useEffect(() => {
    if (!isAvailable || hasActiveCallOnServer) return;
    const timer = setInterval(() => {
      setPresence('available').catch(() => {});
    }, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [isAvailable, hasActiveCallOnServer]);

  // A backgrounded mobile browser tab stops running timers reliably — drop presence immediately
  // rather than silently staying "available" while the telecaller isn't looking at their phone.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && isAvailable && !hasActiveCallOnServer) {
        setPresence('offline').catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isAvailable, hasActiveCallOnServer]);

  // Poll the active call's status until it reaches a terminal state, then show disposition options.
  useEffect(() => {
    if (!activeCall || TERMINAL_CALL_STATES.has(activeCall.state)) return;
    const timer = setInterval(async () => {
      try {
        const { call } = await getCall(activeCall.id);
        setActiveCall(call);
      } catch { /* keep polling — a transient fetch failure shouldn't drop the call view */ }
    }, CALL_POLL_MS);
    return () => clearInterval(timer);
  }, [activeCall]);

  const togglePresence = async () => {
    setBusy(true);
    try {
      await setPresence(isAvailable ? 'offline' : 'available');
      await load();
    } catch (e: any) {
      toast({ title: 'Could not update status', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const startCall = async (to: string, callbackId?: string) => {
    setBusy(true);
    setError('');
    try {
      idempotencyKeyRef.current = crypto.randomUUID();
      const call = await dial({ to, ...(callbackId ? { callback_id: callbackId } : {}) }, idempotencyKeyRef.current);
      setActiveCall(call);
      setActiveCallbackId(callbackId || null);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e.message;
      setError(msg);
      toast({ title: 'Call could not be placed', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const takeCallback = async (callbackId: string, destination: string) => {
    setBusy(true);
    try {
      await claimCallback(callbackId);
      await load();
      await startCall(destination, callbackId);
    } catch (e: any) {
      toast({ title: 'Could not claim callback', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const finishDisposition = async (value: Parameters<typeof setDisposition>[1]) => {
    if (!activeCall) return;
    setBusy(true);
    try {
      await setDisposition(activeCall.id, value);
      if (activeCallbackId) {
        await resolveCallback(activeCallbackId, `Disposition: ${value}`).catch(() => {});
      }
      setActiveCall(null);
      setActiveCallbackId(null);
      idempotencyKeyRef.current = null;
      await load();
      toast({ title: 'Call logged ✓' });
    } catch (e: any) {
      toast({ title: 'Could not save disposition', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const callIsTerminal = activeCall && TERMINAL_CALL_STATES.has(activeCall.state);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-1">CRM Dialer</p>
            <h1 className="text-xl font-bold">{user.firstName || 'Telecaller'}</h1>
            <p className="text-blue-200 text-sm mt-0.5">
              {overview?.providerConfigured === false ? 'Exotel not configured' : isAvailable ? 'Available' : 'Offline'}
            </p>
          </div>
          <button
            onClick={() => { localStorage.removeItem('crmToken'); localStorage.removeItem('crmUserData'); navigate('/crm/login'); }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Sign out">
            <LogOut size={18} className="text-blue-200" />
          </button>
        </div>

        <div className="flex gap-3 mt-4">
          <div className="bg-white/10 rounded-xl px-3 py-2 flex-1 text-center">
            <div className="text-lg font-bold font-mono">{leads.length}</div>
            <div className="text-blue-200 text-xs">My leads</div>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 flex-1 text-center">
            <div className="text-lg font-bold font-mono">{myCallbacks.length}</div>
            <div className="text-blue-200 text-xs">My callbacks</div>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 flex-1 text-center">
            <div className="text-lg font-bold font-mono">{openCallbacks.length}</div>
            <div className="text-blue-200 text-xs">Open callbacks</div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-800 p-3 text-sm flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="h-20 bg-slate-100 animate-pulse rounded-xl" />
        ) : !hasPhone ? (
          <Card className="shadow-md border-0">
            <CardContent className="py-6 text-center">
              <AlertCircle size={28} className="mx-auto mb-2 text-amber-500" />
              <p className="text-sm font-medium text-slate-700">Your dialer number isn't set up yet</p>
              <p className="text-xs text-slate-500 mt-1">Ask your Business Head to assign your callback phone number in Contact Center → Settings before you can start calling.</p>
            </CardContent>
          </Card>
        ) : activeCall ? (
          /* Active call panel — replaces the queues while a call is in progress */
          <Card className="shadow-md border-0">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Phone size={15} className="text-[#0D9488]" /> {activeCall.destination}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="outline" className="capitalize">{String(activeCall.state).replace('-', ' ')}</Badge>
              {!callIsTerminal ? (
                <p className="text-sm text-slate-500">Your phone is ringing — answer it to connect to {activeCall.destination}.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">How did this call go?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {DISPOSITIONS.map(d => (
                      <Button key={d.value} variant="outline" disabled={busy}
                        onClick={() => finishDisposition(d.value)}
                        className="w-full justify-start border-slate-200">
                        {d.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Presence toggle */}
            <Button
              onClick={togglePresence}
              disabled={busy || overview?.providerConfigured === false}
              className={`w-full ${isAvailable ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#0D9488] hover:bg-[#0B7A70]'} text-white`}>
              {isAvailable ? <><PhoneOff size={15} className="mr-2" /> Go offline</> : <><Phone size={15} className="mr-2" /> Go available</>}
            </Button>

            {/* Queue tabs */}
            <div className="flex gap-2">
              <Button size="sm" variant={tab === 'leads' ? 'default' : 'outline'} onClick={() => setTab('leads')} className="flex-1">My Leads</Button>
              <Button size="sm" variant={tab === 'callbacks' ? 'default' : 'outline'} onClick={() => setTab('callbacks')} className="flex-1">Callbacks</Button>
            </div>

            {tab === 'leads' && (
              <Card className="shadow-sm border-0">
                <CardHeader className="pb-2 pt-4 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users size={15} className="text-[#0D9488]" /> My Leads
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={load} className="h-7"><RefreshCw size={13} /></Button>
                </CardHeader>
                <CardContent>
                  {leads.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No new leads assigned to you.</p>
                  ) : (
                    <div className="space-y-2">
                      {leads.map(l => (
                        <div key={l.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{l.name || l.phone}</p>
                            <p className="text-xs text-slate-400">{l.phone}{l.company ? ` · ${l.company}` : ''}</p>
                          </div>
                          <Button size="sm" disabled={busy || !isAvailable} onClick={() => startCall(l.phone)}
                            className="bg-[#0D9488] hover:bg-[#0B7A70] text-white flex-shrink-0">
                            <Phone size={13} className="mr-1" /> Call
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isAvailable && leads.length > 0 && (
                    <p className="text-xs text-amber-600 mt-3 text-center">Go available to start calling.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {tab === 'callbacks' && (
              <Card className="shadow-sm border-0">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock size={15} className="text-[#0D9488]" /> Callbacks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {myCallbacks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mine</p>
                      <div className="space-y-2">
                        {myCallbacks.map(b => (
                          <div key={b.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{b.destination}</p>
                              <p className="text-xs text-slate-400">{b.attempts} attempt(s) · due {new Date(b.due_at).toLocaleString('en-IN')}</p>
                            </div>
                            <Button size="sm" disabled={busy || !isAvailable} onClick={() => startCall(b.destination, b.id)}
                              className="bg-[#0D9488] hover:bg-[#0B7A70] text-white flex-shrink-0">
                              <Phone size={13} className="mr-1" /> Call
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Open</p>
                    {openCallbacks.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">No open callbacks.</p>
                    ) : (
                      <div className="space-y-2">
                        {openCallbacks.map(b => (
                          <div key={b.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{b.destination}</p>
                              <p className="text-xs text-slate-400">{b.attempts} attempt(s) · due {new Date(b.due_at).toLocaleString('en-IN')}</p>
                            </div>
                            <Button size="sm" variant="outline" disabled={busy || !isAvailable} onClick={() => takeCallback(b.id, b.destination)}
                              className="flex-shrink-0">
                              <CheckCircle2 size={13} className="mr-1" /> Take
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

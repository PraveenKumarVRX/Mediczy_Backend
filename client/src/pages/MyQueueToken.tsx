/**
 * Patient mobile OPD token screen (P3).
 * Shows today's token status and activates deferred tokens on arrival day.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import api from '@/utils/api';
import { printQmsTokenSlip } from '@/utils/qmsPrintSlip';

type QueueToken = {
  id: number;
  tokenNumber: string;
  status: string;
  patientName?: string;
  doctorName?: string;
  queueZone?: string;
  counterId?: string;
  estimatedWaitMinutes?: number;
  calledAt?: string;
  appointmentId?: number;
};

export default function MyQueueToken() {
  const [params] = useSearchParams();
  const appointmentId = params.get('appointmentId');
  const [token, setToken] = useState<QueueToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = appointmentId ? `?appointmentId=${encodeURIComponent(appointmentId)}` : '';
      const res = await api.get(`/api/v1/queue/my-token${qs}`);
      setToken(res.data?.current || res.data?.tokens?.[0] || null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (e as Error)?.message
        || 'Could not load token';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const activate = async () => {
    if (!appointmentId) {
      setError('Open this page from your appointment (needs appointmentId).');
      return;
    }
    setActivating(true);
    setError(null);
    try {
      const res = await api.post('/api/v1/queue/activate-appointment', {
        appointmentId: Number(appointmentId),
        notifyOptIn: false,
      });
      setToken(res.data?.token || null);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (e as Error)?.message
        || 'Activation failed';
      setError(msg);
    } finally {
      setActivating(false);
    }
  };

  const statusLabel =
    token?.status === 'called' ? 'Please proceed — you are being called'
      : token?.status === 'serving' ? 'In consultation'
        : token?.status === 'waiting' ? 'Waiting in queue'
          : 'No active token today';

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="text-sm text-muted-foreground mb-1">Mediqzy OPD</p>
        <h1 className="text-3xl font-semibold tracking-tight mb-6">My queue token</h1>

        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {!loading && token && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-slate-900 px-6 py-10 text-center text-white">
              <p className="text-sm uppercase tracking-widest opacity-80">Token</p>
              <p className="mt-2 text-5xl font-bold tracking-wide">{token.tokenNumber}</p>
              <p className="mt-4 text-lg">{statusLabel}</p>
            </div>
            <div className="space-y-1 text-sm">
              {token.doctorName && <p><span className="text-muted-foreground">Doctor:</span> {token.doctorName}</p>}
              {token.counterId && <p><span className="text-muted-foreground">Counter:</span> {token.counterId}</p>}
              {typeof token.estimatedWaitMinutes === 'number' && (
                <p><span className="text-muted-foreground">Est. wait:</span> ~{token.estimatedWaitMinutes} min</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => printQmsTokenSlip({
                  token_number: token.tokenNumber,
                  patient_name: token.patientName || 'Patient',
                  doctor_name: token.doctorName || '',
                  counter_id: token.counterId,
                  queue_zone: token.queueZone,
                  estimated_wait_minutes: token.estimatedWaitMinutes,
                })}
              >
                Print slip
              </Button>
              <Button variant="ghost" onClick={load}>Refresh</Button>
            </div>
          </div>
        )}

        {!loading && !token && (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              No active OPD token for today. If you booked for today, activate your token when you arrive.
            </p>
            {appointmentId && (
              <Button onClick={activate} disabled={activating}>
                {activating ? 'Activating…' : 'Activate token on arrival'}
              </Button>
            )}
            <p className="text-sm">
              <Link className="underline" to="/appointments">Back to appointments</Link>
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';
import DisplayVideoOverlay from '@/components/display/DisplayVideoOverlay';

interface ICUBed {
  bed_number: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  diagnosis: string | null;
  spo2: number | null;
  hr: number | null;
  bp: string | null;
  temp: number | null;
  rr: number | null;
  news2: number | null;
  alert_level: 'green' | 'yellow' | 'orange' | 'red';
  status?: string;
}

const ALERT_STYLES: Record<string, string> = {
  green: 'border-green-600 bg-green-950/40',
  yellow: 'border-yellow-500 bg-yellow-950/40',
  orange: 'border-orange-500 bg-orange-950/40',
  red: 'border-red-500 bg-red-950/40 animate-pulse',
};

const NEWS2_COLOR = (n: number | null) => {
  if (n === null) return 'text-gray-500';
  if (n >= 7) return 'text-red-400 font-black';
  if (n >= 5) return 'text-orange-400 font-bold';
  if (n >= 3) return 'text-yellow-400 font-semibold';
  return 'text-green-400';
};

function Vital({ label, value, unit = '' }: { label: string; value: string | number | null; unit?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="text-center">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-white font-semibold text-sm">{value}<span className="text-gray-400 text-xs ml-0.5">{unit}</span></p>
    </div>
  );
}

export default function ICUBoardDisplay() {
  const [beds, setBeds] = useState<ICUBed[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [teleOpen, setTeleOpen] = useState(false);
  const [teleSession, setTeleSession] = useState<{ serverUrl: string; token: string } | null>(null);

  const startTeleIcu = async () => {
    setError(null);
    try {
      const res = await fetch('/api/display/kiosk/video-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'tele-icu', roomName: `tele-icu-${Date.now()}` }),
      });
      if (!res.ok) throw new Error(`Video session request failed (${res.status})`);
      const json = await res.json();
      if (!json.serverUrl || !json.token) throw new Error('Video session response was incomplete');
      setTeleSession({ serverUrl: json.serverUrl, token: json.token });
      setTeleOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start tele-consultation');
    }
  };

  const fetchICU = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/icu-board');
      if (!res.ok) throw new Error(`ICU board request failed (${res.status})`);
      const json = await res.json();
      if (!json.success || !Array.isArray(json.beds)) throw new Error('ICU board response was invalid');
      setBeds(json.beds);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ICU board');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/display/events?zone=icu');
    es.onerror = () => setLiveError('Live vitals connection lost. Retrying automatically.');
    es.addEventListener('open', () => setLiveError(null));
    es.addEventListener('vitals_update', (e) => {
      try {
        const { bedId, vitals } = JSON.parse((e as MessageEvent).data);
        if (!bedId || !vitals) return;
        setBeds((prev) => prev.map((bed) => {
          if (bed.bed_number !== bedId && !String(bed.bed_number).endsWith(String(bedId))) return bed;
          const news2 = vitals.news2 ?? bed.news2;
          let alert_level = bed.alert_level;
          if (news2 != null) {
            if (news2 >= 7) alert_level = 'red';
            else if (news2 >= 5) alert_level = 'orange';
            else if (news2 >= 3) alert_level = 'yellow';
            else alert_level = 'green';
          }
          return {
            ...bed,
            spo2: vitals.spo2 ?? bed.spo2,
            hr: vitals.hr ?? bed.hr,
            bp: vitals.bp ?? bed.bp,
            temp: vitals.temp ?? bed.temp,
            rr: vitals.rr ?? bed.rr,
            news2: news2 ?? bed.news2,
            alert_level,
          };
        }));
        setLastUpdated(new Date());
      } catch (err) {
        setLiveError('Received an invalid live vitals update.');
      }
    });
    es.addEventListener('ambient_deterioration', (e) => {
      try {
        const alert = JSON.parse((e as MessageEvent).data);
        const bedId = alert.bedId;
        setBeds((prev) => prev.map((bed) => {
          if (bed.bed_number !== bedId) return bed;
          return { ...bed, alert_level: alert.severity === 'critical' ? 'red' : 'orange' };
        }));
      } catch (err) {
        setLiveError('Received an invalid deterioration alert.');
      }
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    fetchICU();
    const t = setInterval(fetchICU, 15000);
    return () => clearInterval(t);
  }, [fetchICU]);

  const criticalCount = beds.filter(b => b.alert_level === 'red').length;
  const alertCount = beds.filter(b => b.alert_level === 'orange').length;
  const occupiedCount = beds.filter(b => b.status !== 'available').length;

  return (
    <DisplayShell zone="icu" zoneName="ICU Nursing Station" fullscreen>
      <div className="h-full flex flex-col p-4 gap-4">

        {isLoading && beds.length === 0 && (
          <div className="rounded-lg border border-gray-600 bg-gray-800/60 px-3 py-2 text-sm text-gray-300">Loading ICU board…</div>
        )}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            <span>{error}</span>
            <button type="button" onClick={fetchICU} className="shrink-0 rounded border border-red-400 px-2 py-1 text-xs">Retry</button>
          </div>
        )}
        {liveError && (
          <div className="rounded-lg border border-amber-500 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">{liveError}</div>
        )}

        {/* Summary strip */}
        <div className="flex justify-end shrink-0">
          <button type="button" onClick={startTeleIcu} className="text-sm bg-teal-700 hover:bg-teal-600 text-white px-4 py-2 rounded-lg">
            Tele-intensivist (GAP-VIDEO-004)
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {[
            { label: 'Total Beds', value: beds.length, color: 'text-white' },
            { label: 'Occupied', value: occupiedCount, color: 'text-blue-400' },
            { label: 'Alert', value: alertCount, color: 'text-orange-400' },
            { label: 'Critical', value: criticalCount, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl border border-gray-700 p-3 text-center">
              <p className="text-gray-500 text-xs uppercase tracking-widest">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bed grid */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 overflow-auto">
          {!isLoading && !error && beds.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-16 text-gray-400">
              No ICU beds returned by the live board.
            </div>
          )}
          {beds.map(bed => (
            <div
              key={bed.bed_number}
              className={`rounded-xl border-2 p-4 transition-all ${ALERT_STYLES[bed.alert_level] ?? 'border-gray-700 bg-gray-800/40'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-teal-400 font-bold text-sm">{bed.bed_number}</span>
                {bed.news2 !== null && (
                  <span className={`text-xs font-semibold ${NEWS2_COLOR(bed.news2)}`}>NEWS2: {bed.news2}</span>
                )}
              </div>

              {bed.status === 'available' ? (
                <div className="flex items-center justify-center h-16 text-green-500 font-semibold text-sm">
                  Available
                </div>
              ) : (
                <>
                  <p className="text-white font-semibold text-sm truncate">{bed.patient_name}</p>
                  <p className="text-gray-400 text-xs mb-3">
                    {bed.age ? `${bed.age}y` : ''}{bed.gender ? ` · ${bed.gender}` : ''}{bed.diagnosis ? ` · ${bed.diagnosis}` : ''}
                  </p>
                  <div className="grid grid-cols-3 gap-2 bg-gray-900/50 rounded-lg p-2">
                    <Vital label="SpO₂" value={bed.spo2} unit="%" />
                    <Vital label="HR" value={bed.hr} unit="/min" />
                    <Vital label="RR" value={bed.rr} unit="/min" />
                    <Vital label="Temp" value={bed.temp} unit="°C" />
                    <div className="col-span-2 text-center">
                      <p className="text-gray-500 text-xs">BP</p>
                      <p className="text-white font-semibold text-sm">{bed.bp ?? '—'}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs text-right shrink-0">
          Last updated: {lastUpdated.toLocaleTimeString('en-IN')} · MQTT/SSE vitals + 15s poll
        </p>
      </div>
      {teleOpen && teleSession && (
        <DisplayVideoOverlay open={teleOpen} onClose={() => setTeleOpen(false)} serverUrl={teleSession.serverUrl} token={teleSession.token} />
      )}
    </DisplayShell>
  );
}

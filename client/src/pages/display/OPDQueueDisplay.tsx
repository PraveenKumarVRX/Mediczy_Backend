import React, { useEffect, useState, useRef, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface QueueData {
  current: { token: string; counter: string; doctor: string };
  next: Array<{ token: string; counter: string }>;
  waiting: number;
  avgWaitMins: number;
  healthTips?: string[];
  live: boolean;
}

const HEALTH_TIPS = [
  'Stay hydrated — drink at least 8 glasses of water daily.',
  'Regular hand washing prevents 80% of common infections.',
  'A 30-minute walk daily reduces heart disease risk by 35%.',
];

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export default function OPDQueueDisplay() {
  const zone = new URLSearchParams(window.location.search).get('zone') || 'opd-waiting';
  const [data, setData] = useState<QueueData | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const prevToken = useRef<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`/api/display/queue?zone=${encodeURIComponent(zone)}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (prevToken.current !== json.current?.token && json.current?.token && json.current.token !== '—') {
          prevToken.current = json.current.token;
          speak(`Token ${json.current.token} — please proceed to ${json.current.counter}.`);
        }
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, [zone]);

  useEffect(() => {
    fetchQueue();
    const poll = setInterval(fetchQueue, 60000);
    return () => clearInterval(poll);
  }, [fetchQueue]);

  useEffect(() => {
    const params = new URLSearchParams({ zone });
    const es = new EventSource(`/api/display/events?${params}`);
    const refresh = () => { fetchQueue(); };
    es.addEventListener('queue_token_called', refresh);
    es.addEventListener('queue_token_issued', refresh);
    es.addEventListener('queue_updated', refresh);
    es.addEventListener('new-token', refresh);
    return () => es.close();
  }, [zone, fetchQueue]);

  useEffect(() => {
    const tips = data?.healthTips ?? HEALTH_TIPS;
    const t = setInterval(() => setTipIndex(i => (i + 1) % tips.length), 8000);
    return () => clearInterval(t);
  }, [data?.healthTips]);

  const tips = data?.healthTips ?? HEALTH_TIPS;

  return (
    <DisplayShell zone={zone} zoneName="OPD Queue" fullscreen>
      <div className="h-full flex flex-col p-6 gap-4">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col items-center justify-center bg-teal-900/60 rounded-2xl border border-teal-700 p-8">
            <p className="text-gray-400 text-lg mb-2 tracking-widest uppercase">Now Serving</p>
            <div className="text-9xl font-black text-teal-300 tracking-tight drop-shadow-2xl mb-4">
              {loading ? '—' : data?.current?.token ?? '—'}
            </div>
            <p className="text-2xl text-white font-semibold">{data?.current?.counter}</p>
            <p className="text-gray-300 text-lg mt-1">{data?.current?.doctor}</p>
            {data?.avgWaitMins != null && (
              <p className="text-teal-200 text-sm mt-4">Est. wait for new arrivals: ~{data.avgWaitMins} min</p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-5 flex-1">
              <p className="text-gray-400 uppercase tracking-widest text-xs mb-3">Up Next</p>
              {data?.next?.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <span className="text-2xl font-bold text-white">{t.token}</span>
                  <span className="text-gray-400 text-sm">{t.counter}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 text-center">
                <p className="text-3xl font-bold text-white">{data?.waiting ?? 0}</p>
                <p className="text-gray-400 text-xs uppercase mt-1">Waiting</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 text-center">
                <p className="text-3xl font-bold text-teal-300">{data?.avgWaitMins ?? '—'}</p>
                <p className="text-gray-400 text-xs uppercase mt-1">Avg min</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 px-6 py-3 text-center text-gray-300 text-sm shrink-0">
          💡 {tips[tipIndex]}
        </div>
      </div>
    </DisplayShell>
  );
}

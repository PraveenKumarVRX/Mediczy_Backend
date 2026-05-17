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
  'Adequate sleep (7-8 hrs) boosts immune function significantly.',
  'Eating 5 servings of fruits and vegetables daily lowers cancer risk.',
  'Deep breathing exercises can reduce blood pressure by 5-10 mmHg.',
  'Avoid smoking — it is the leading preventable cause of disease.',
  'Annual health check-ups can detect problems before they become serious.',
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
  const [data, setData] = useState<QueueData | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const prevToken = useRef<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/display/queue');
      const json = await res.json();
      if (json.success) {
        setData(json);
        // TTS announcement on token change
        if (prevToken.current !== json.current.token) {
          prevToken.current = json.current.token;
          speak(`Token ${json.current.token} — please proceed to ${json.current.counter}.`);
        }
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchQueue();
    const poll = setInterval(fetchQueue, 15000); // refresh every 15 s
    return () => clearInterval(poll);
  }, [fetchQueue]);

  // Rotate health tips every 8 s
  useEffect(() => {
    const tips = data?.healthTips ?? HEALTH_TIPS;
    const t = setInterval(() => setTipIndex(i => (i + 1) % tips.length), 8000);
    return () => clearInterval(t);
  }, [data?.healthTips]);

  const tips = data?.healthTips ?? HEALTH_TIPS;

  return (
    <DisplayShell zone="opd-waiting" zoneName="OPD Queue" fullscreen>
      <div className="h-full flex flex-col p-6 gap-4">

        {/* Now serving — hero */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Current token — left 2/3 */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center bg-teal-900/60 rounded-2xl border border-teal-700 p-8">
            <p className="text-gray-400 text-lg mb-2 tracking-widest uppercase">Now Serving</p>
            <div className="text-9xl font-black text-teal-300 tracking-tight drop-shadow-2xl mb-4">
              {loading ? '—' : data?.current.token ?? '—'}
            </div>
            <p className="text-2xl text-white font-semibold">{data?.current.counter}</p>
            <p className="text-gray-300 text-lg mt-1">{data?.current.doctor}</p>
          </div>

          {/* Next 3 tokens + stats */}
          <div className="flex flex-col gap-4">
            {/* Next tokens */}
            <div className="bg-gray-800/60 rounded-2xl border border-gray-700 p-5 flex-1">
              <p className="text-gray-400 uppercase tracking-widest text-xs mb-3">Up Next</p>
              {data?.next.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <span className="text-2xl font-bold text-white">{t.token}</span>
                  <span className="text-gray-400 text-sm">{t.counter}</span>
                </div>
              ))}
            </div>
            {/* Wait stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 text-center">
                <p className="text-gray-400 text-xs uppercase tracking-widest">Waiting</p>
                <p className="text-4xl font-black text-amber-400 mt-1">{data?.waiting ?? '—'}</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 text-center">
                <p className="text-gray-400 text-xs uppercase tracking-widest">Avg Wait</p>
                <p className="text-4xl font-black text-blue-400 mt-1">{data?.avgWaitMins ?? '—'}<span className="text-lg font-normal text-gray-400"> min</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* Health tips ticker */}
        <div className="bg-blue-900/40 border border-blue-800 rounded-xl px-6 py-3 flex items-center gap-3 shrink-0">
          <span className="text-blue-400 text-lg">💡</span>
          <p className="text-blue-100 text-base font-medium transition-all duration-500">
            {tips[tipIndex]}
          </p>
        </div>
      </div>
    </DisplayShell>
  );
}

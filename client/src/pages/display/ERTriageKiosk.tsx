import React, { useState, useCallback, useEffect, useRef } from 'react';
import DisplayShell from './DisplayShell';

type Step = 'idle' | 'intake' | 'processing' | 'result' | 'video';

interface TriageResult {
  esiLevel: number;
  esiDescription: string;
  estimatedWaitMinutes: number;
  ambulanceNeeded: boolean;
  immediateActions: string[];
  qualityGate?: { passed?: boolean; blockers?: Array<{ code: string }> };
}

interface ErToken {
  tokenNumber: string;
  estimatedWaitMinutes: number;
}

const IDLE_TIMEOUT_MS = 120000;

export default function ERTriageKiosk() {
  const [step, setStep] = useState<Step>('idle');
  const [symptoms, setSymptoms] = useState('');
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [painScale, setPainScale] = useState(5);
  const [consent, setConsent] = useState(false);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [token, setToken] = useState<ErToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setSymptoms('');
    setPatientName('');
    setPhone('');
    setPainScale(5);
    setConsent(false);
    setTriage(null);
    setToken(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (step !== 'idle') idleTimer.current = setTimeout(reset, IDLE_TIMEOUT_MS);
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [step, reset]);

  const submitTriage = async () => {
    if (!symptoms.trim() || symptoms.length < 10) {
      setError('Please describe your symptoms (at least 10 characters).');
      return;
    }
    if (!consent) {
      setError('Please accept the triage consent to continue.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/kiosk/er-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms,
          patientName,
          phone,
          painScale,
          consentVersion: 'er-triage-v1',
          startVideo: true,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Triage could not be completed.');
        if (json.triage) {
          setTriage(json.triage);
          setStep('result');
        }
        return;
      }
      setTriage(json.triage);
      setToken({
        tokenNumber: json.entry?.tokenNumber,
        estimatedWaitMinutes: json.entry?.estimatedWaitMinutes ?? json.triage?.estimatedWaitMinutes,
      });
      setStep(json.video ? 'video' : 'result');
    } catch (_) {
      setError('Connection error. Alert staff at the triage desk.');
    } finally {
      setLoading(false);
    }
  };

  const esiColor = (level: number) => {
    if (level <= 1) return 'text-red-400';
    if (level === 2) return 'text-orange-400';
    if (level === 3) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <DisplayShell zone="er-triage" zoneName="ER Tele-Triage" fullscreen>
      <div className="h-full flex flex-col items-center justify-center p-8 select-none">

        {step === 'idle' && (
          <button type="button" onClick={() => setStep('intake')} className="text-center">
            <div className="text-8xl mb-6">🚨</div>
            <h1 className="text-5xl font-black text-red-400 mb-3">ER Triage</h1>
            <p className="text-gray-400 text-xl">Touch for symptom intake & video triage</p>
          </button>
        )}

        {step === 'intake' && (
          <div className="w-full max-w-lg space-y-4">
            <h2 className="text-3xl font-bold text-center text-red-300">Emergency Intake</h2>
            <input
              className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700"
              placeholder="Your name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />
            <input
              className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700"
              placeholder="Mobile (10 digits, optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
            <textarea
              className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700 min-h-[120px]"
              placeholder="Describe your symptoms *"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
            <div>
              <label className="text-sm text-gray-400">Pain level: {painScale}/10</label>
              <input
                type="range"
                min={0}
                max={10}
                value={painScale}
                onChange={(e) => setPainScale(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
              I consent to AI-assisted triage and video connection with ER staff (DPDP er-triage-v1).
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="button"
              onClick={submitTriage}
              disabled={loading}
              className="w-full py-5 bg-red-700 hover:bg-red-600 rounded-2xl text-xl font-bold disabled:opacity-50"
            >
              {loading ? 'Assessing…' : 'Start Triage'}
            </button>
            <button type="button" onClick={reset} className="w-full py-3 text-gray-500 text-sm">Cancel</button>
          </div>
        )}

        {(step === 'result' || step === 'video') && triage && (
          <div className="w-full max-w-lg text-center space-y-4">
            <h2 className="text-3xl font-bold">Triage Complete</h2>
            <p className={`text-6xl font-black ${esiColor(triage.esiLevel)}`}>ESI-{triage.esiLevel}</p>
            <p className="text-gray-300">{triage.esiDescription}</p>
            {token && (
              <p className="text-2xl font-mono text-teal-300">Token: {token.tokenNumber}</p>
            )}
            <p className="text-gray-400">Est. wait: ~{token?.estimatedWaitMinutes ?? triage.estimatedWaitMinutes} min</p>
            {triage.ambulanceNeeded && (
              <p className="text-red-400 font-bold animate-pulse">⚠️ Ambulance may be required — staff alerted</p>
            )}
            {step === 'video' && (
              <p className="text-teal-300">Connecting video to ER physician…</p>
            )}
            {triage.immediateActions?.length > 0 && (
              <ul className="text-left text-sm text-gray-400 bg-gray-900 rounded-xl p-4">
                {triage.immediateActions.map((a) => <li key={a}>• {a}</li>)}
              </ul>
            )}
            <button type="button" onClick={reset} className="px-8 py-4 bg-gray-700 rounded-xl font-bold">Done</button>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}

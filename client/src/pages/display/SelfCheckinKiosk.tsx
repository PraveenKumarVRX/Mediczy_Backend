import React, { useState, useEffect, useRef, useCallback } from 'react';
import DisplayShell from './DisplayShell';

type Step = 'idle' | 'enter-phone' | 'select-appointment' | 'confirm' | 'token-issued';

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  doctor_name: string;
  specialty: string;
  patient_name: string;
  status: string;
}

interface IssuedToken {
  token_number: string;
  patient_name: string;
  doctor_name: string;
  issued_at: string;
}

const IDLE_TIMEOUT_MS = 30000;

function printToken(token: IssuedToken) {
  const w = window.open('', '_blank', 'width=400,height=300');
  if (!w) return;
  w.document.write(`
    <html><body style="font-family:sans-serif;text-align:center;padding:20px;">
      <h2>MediQzy Hospital</h2>
      <p style="font-size:14px;">Check-in Token</p>
      <div style="font-size:64px;font-weight:bold;color:#0d9488;">${token.token_number}</div>
      <p>${token.patient_name}</p>
      <p>${token.doctor_name}</p>
      <p style="font-size:12px;color:#666;">Issued: ${new Date(token.issued_at).toLocaleTimeString('en-IN')}</p>
      <p style="font-size:12px;color:#666;">Please wait for your number to be called</p>
    </body></html>
  `);
  w.document.close();
  w.print();
  w.close();
}

export default function SelfCheckinKiosk() {
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [token, setToken] = useState<IssuedToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToIdle = useCallback(() => {
    setStep('idle');
    setPhone('');
    setAppointments([]);
    setSelected(null);
    setToken(null);
    setError(null);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (step !== 'idle') {
      idleTimer.current = setTimeout(resetToIdle, IDLE_TIMEOUT_MS);
    }
  }, [step, resetToIdle]);

  useEffect(() => {
    resetIdleTimer();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [step, resetIdleTimer]);

  const handlePhoneDigit = (d: string) => {
    resetIdleTimer();
    if (d === 'DEL') { setPhone(p => p.slice(0, -1)); return; }
    if (phone.length >= 10) return;
    setPhone(p => p + d);
  };

  const lookupAppointments = async () => {
    if (phone.length < 10) { setError('Please enter your 10-digit mobile number.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/checkin/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (json.success && json.appointments.length > 0) {
        setAppointments(json.appointments);
        setStep('select-appointment');
      } else {
        setError('No appointments found for this number. Please visit the registration counter.');
      }
    } catch (_) {
      setError('Connection error. Please try again or visit the counter.');
    } finally {
      setLoading(false);
    }
  };

  const confirmCheckin = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/checkin/issue-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: selected.id,
          patient_name: selected.patient_name,
          doctor_name: selected.doctor_name,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setToken(json.token);
        setStep('token-issued');
        setTimeout(resetToIdle, 30000); // Auto-reset after 30 s
      } else {
        setError('Could not issue token. Please visit the counter.');
      }
    } catch (_) {
      setError('Connection error. Please visit the counter.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DisplayShell zone="opd-counter" zoneName="Self Check-in" fullscreen>
      <div
        className="h-full flex flex-col items-center justify-center p-8 select-none"
        onClick={step === 'idle' ? () => setStep('enter-phone') : undefined}
      >

        {/* ── IDLE ── */}
        {step === 'idle' && (
          <div className="text-center animate-pulse">
            <div className="text-8xl mb-6">👆</div>
            <h1 className="text-5xl font-black text-teal-300 mb-3">Touch to Check In</h1>
            <p className="text-gray-400 text-xl">Have your appointment ready</p>
          </div>
        )}

        {/* ── ENTER PHONE ── */}
        {step === 'enter-phone' && (
          <div className="w-full max-w-md">
            <h2 className="text-3xl font-bold text-center mb-2">Enter Mobile Number</h2>
            <p className="text-gray-400 text-center mb-6">The number used when booking your appointment</p>

            <div className="bg-gray-800 rounded-2xl p-4 text-center text-5xl font-mono tracking-widest mb-6 min-h-[72px] border border-gray-700">
              {phone || <span className="text-gray-600">__________</span>}
            </div>

            {error && <p className="text-red-400 text-center mb-4 text-sm">{error}</p>}

            {/* Numeric keypad */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['1','2','3','4','5','6','7','8','9','DEL','0','OK'].map(k => (
                <button
                  key={k}
                  onClick={() => k === 'OK' ? lookupAppointments() : handlePhoneDigit(k)}
                  disabled={loading}
                  className={`py-5 rounded-2xl text-2xl font-bold transition-all active:scale-95
                    ${k === 'OK' ? 'bg-teal-600 hover:bg-teal-500 col-span-1' : ''}
                    ${k === 'DEL' ? 'bg-red-800 hover:bg-red-700' : ''}
                    ${k !== 'OK' && k !== 'DEL' ? 'bg-gray-700 hover:bg-gray-600' : ''}
                  `}
                >
                  {loading && k === 'OK' ? '…' : k}
                </button>
              ))}
            </div>

            <button onClick={resetToIdle} className="w-full py-3 text-gray-500 hover:text-gray-300 text-sm">
              ← Cancel
            </button>
          </div>
        )}

        {/* ── SELECT APPOINTMENT ── */}
        {step === 'select-appointment' && (
          <div className="w-full max-w-lg">
            <h2 className="text-3xl font-bold text-center mb-2">Select Your Appointment</h2>
            <p className="text-gray-400 text-center mb-6">Tap the appointment you are here for</p>

            <div className="space-y-3">
              {appointments.map(apt => (
                <button
                  key={apt.id}
                  onClick={() => { setSelected(apt); setStep('confirm'); resetIdleTimer(); }}
                  className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl p-5 text-left transition-all active:scale-99"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xl font-bold text-white">{apt.doctor_name}</span>
                    <span className="text-teal-400 font-mono">{apt.appointment_time}</span>
                  </div>
                  <p className="text-gray-400 text-sm">{apt.specialty}</p>
                  <p className="text-gray-500 text-xs mt-1">{apt.patient_name}</p>
                </button>
              ))}
            </div>

            <button onClick={resetToIdle} className="w-full mt-6 py-3 text-gray-500 hover:text-gray-300 text-sm">
              ← Back
            </button>
          </div>
        )}

        {/* ── CONFIRM ── */}
        {step === 'confirm' && selected && (
          <div className="w-full max-w-md text-center">
            <h2 className="text-3xl font-bold mb-6">Confirm Check-in</h2>

            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-6 text-left space-y-3">
              <div className="flex justify-between"><span className="text-gray-400">Patient</span><span className="font-semibold">{selected.patient_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Doctor</span><span className="font-semibold">{selected.doctor_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Time</span><span className="font-semibold">{selected.appointment_time}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Specialty</span><span className="font-semibold">{selected.specialty}</span></div>
            </div>

            {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

            <button
              onClick={confirmCheckin}
              disabled={loading}
              className="w-full py-5 bg-teal-600 hover:bg-teal-500 rounded-2xl text-2xl font-bold transition-all active:scale-95 mb-3 disabled:opacity-60"
            >
              {loading ? 'Checking in…' : '✓ Check In & Get Token'}
            </button>
            <button onClick={() => { setStep('select-appointment'); resetIdleTimer(); }} className="w-full py-3 text-gray-500 hover:text-gray-300 text-sm">
              ← Back
            </button>
          </div>
        )}

        {/* ── TOKEN ISSUED ── */}
        {step === 'token-issued' && token && (
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-3xl font-bold mb-2">Check-in Successful!</h2>
            <p className="text-gray-400 mb-6">Your token number is</p>
            <div className="text-9xl font-black text-teal-300 tracking-tight mb-4">{token.token_number}</div>
            <p className="text-xl text-gray-300 mb-2">{token.doctor_name}</p>
            <p className="text-gray-400 text-sm mb-8">Please wait in the OPD waiting area. Listen for your token announcement.</p>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => printToken(token)}
                className="px-8 py-4 bg-blue-700 hover:bg-blue-600 rounded-2xl text-lg font-semibold transition-all"
              >
                🖨️ Print Token
              </button>
              <button
                onClick={resetToIdle}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl text-lg font-semibold transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}

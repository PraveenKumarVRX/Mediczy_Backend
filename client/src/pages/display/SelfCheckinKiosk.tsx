import React, { useState, useEffect, useRef, useCallback } from 'react';
import DisplayShell from './DisplayShell';

type Step = 'idle' | 'choose' | 'enter-phone' | 'walk-in' | 'select-appointment' | 'confirm' | 'token-issued';

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
  estimated_wait_minutes?: number;
  uhid?: string;
}

const IDLE_TIMEOUT_MS = 45000;

function printToken(token: IssuedToken) {
  const w = window.open('', '_blank', 'width=400,height=300');
  if (!w) return;
  w.document.write(`
    <html><body style="font-family:sans-serif;text-align:center;padding:20px;">
      <h2>MediQzy Hospital</h2>
      <p>Token: <strong style="font-size:48px;color:#0d9488">${token.token_number}</strong></p>
      <p>${token.patient_name}</p>
      <p>Est. wait: ${token.estimated_wait_minutes ?? '—'} min</p>
    </body></html>
  `);
  w.document.close();
  w.print();
  w.close();
}

export default function SelfCheckinKiosk() {
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [reg, setReg] = useState({ firstName: '', lastName: '', gender: 'other', chiefComplaint: '' });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [token, setToken] = useState<IssuedToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToIdle = useCallback(() => {
    setStep('idle');
    setPhone('');
    setReg({ firstName: '', lastName: '', gender: 'other', chiefComplaint: '' });
    setAppointments([]);
    setSelected(null);
    setToken(null);
    setError(null);
    setConsent(false);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (step !== 'idle') idleTimer.current = setTimeout(resetToIdle, IDLE_TIMEOUT_MS);
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
      if (json.success && json.appointments?.length > 0) {
        setAppointments(json.appointments);
        setStep('select-appointment');
      } else {
        setError('No appointments today. Try Walk-in Registration or visit the counter.');
      }
    } catch (_) {
      setError('Connection error. Please try again.');
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
      if (json.success && json.token) {
        setToken({
          token_number: json.token.token_number,
          patient_name: json.token.patient_name,
          doctor_name: json.token.doctor_name,
          issued_at: json.token.issued_at || new Date().toISOString(),
          estimated_wait_minutes: json.token.estimated_wait_minutes,
        });
        setStep('token-issued');
        setTimeout(resetToIdle, 30000);
      } else {
        setError('Could not issue token.');
      }
    } catch (_) {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const submitWalkIn = async () => {
    if (!reg.firstName || phone.length < 10) {
      setError('First name and 10-digit phone required.');
      return;
    }
    if (!consent) {
      setError('Please accept consent to continue.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/kiosk/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          firstName: reg.firstName,
          lastName: reg.lastName,
          gender: reg.gender,
          chiefComplaint: reg.chiefComplaint,
          consentVersion: 'kiosk-v1',
        }),
      });
      const json = await res.json();
      if (json.success && json.token) {
        setToken({
          token_number: json.token.tokenNumber || json.entry?.tokenNumber,
          patient_name: `${reg.firstName} ${reg.lastName}`.trim(),
          doctor_name: 'General OPD',
          issued_at: new Date().toISOString(),
          estimated_wait_minutes: json.entry?.estimatedWaitMinutes,
          uhid: json.uhid,
        });
        setStep('token-issued');
        setTimeout(resetToIdle, 45000);
      } else {
        setError(json.message || 'Registration failed.');
      }
    } catch (_) {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DisplayShell zone="opd-counter" zoneName="Self Check-in" fullscreen>
      <div className="h-full flex flex-col items-center justify-center p-8 select-none" onClick={step === 'idle' ? () => setStep('choose') : undefined}>

        {step === 'idle' && (
          <div className="text-center">
            <div className="text-8xl mb-6">👆</div>
            <h1 className="text-5xl font-black text-teal-300 mb-3">Touch to Start</h1>
            <p className="text-gray-400 text-xl">Paperless check-in & registration</p>
          </div>
        )}

        {step === 'choose' && (
          <div className="w-full max-w-lg space-y-4">
            <h2 className="text-3xl font-bold text-center mb-8">How would you like to proceed?</h2>
            <button onClick={() => { setStep('enter-phone'); resetIdleTimer(); }} className="w-full py-6 bg-teal-700 hover:bg-teal-600 rounded-2xl text-2xl font-bold">📅 I have an appointment</button>
            <button onClick={() => { setStep('walk-in'); resetIdleTimer(); }} className="w-full py-6 bg-blue-800 hover:bg-blue-700 rounded-2xl text-2xl font-bold">🆕 Walk-in (new visit)</button>
            <button onClick={resetToIdle} className="w-full py-3 text-gray-500 text-sm">Cancel</button>
          </div>
        )}

        {step === 'enter-phone' && (
          <div className="w-full max-w-md">
            <h2 className="text-3xl font-bold text-center mb-6">Enter Mobile Number</h2>
            <div className="bg-gray-800 rounded-2xl p-4 text-center text-5xl font-mono tracking-widest mb-6 border border-gray-700">
              {phone || <span className="text-gray-600">__________</span>}
            </div>
            {error && <p className="text-red-400 text-center mb-4 text-sm">{error}</p>}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['1','2','3','4','5','6','7','8','9','DEL','0','OK'].map(k => (
                <button key={k} onClick={() => k === 'OK' ? lookupAppointments() : handlePhoneDigit(k)} disabled={loading}
                  className={`py-5 rounded-2xl text-2xl font-bold ${k === 'OK' ? 'bg-teal-600' : k === 'DEL' ? 'bg-red-800' : 'bg-gray-700'}`}>
                  {loading && k === 'OK' ? '…' : k}
                </button>
              ))}
            </div>
            <button onClick={() => setStep('choose')} className="w-full py-3 text-gray-500 text-sm">← Back</button>
          </div>
        )}

        {step === 'walk-in' && (
          <div className="w-full max-w-md space-y-4">
            <h2 className="text-2xl font-bold text-center">Walk-in Registration</h2>
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Mobile (10 digits)" value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="First name *" value={reg.firstName}
              onChange={e => setReg(r => ({ ...r, firstName: e.target.value }))} />
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Last name" value={reg.lastName}
              onChange={e => setReg(r => ({ ...r, lastName: e.target.value }))} />
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Chief complaint" value={reg.chiefComplaint}
              onChange={e => setReg(r => ({ ...r, chiefComplaint: e.target.value }))} />
            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />
              I consent to processing my data for registration and queue management (DPDP kiosk-v1).
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={submitWalkIn} disabled={loading} className="w-full py-4 bg-teal-600 rounded-2xl text-xl font-bold disabled:opacity-50">
              {loading ? 'Registering…' : 'Register & Get Token'}
            </button>
            <button onClick={() => setStep('choose')} className="w-full py-3 text-gray-500 text-sm">← Back</button>
          </div>
        )}

        {step === 'select-appointment' && (
          <div className="w-full max-w-lg">
            <h2 className="text-3xl font-bold text-center mb-6">Select Appointment</h2>
            <div className="space-y-3">
              {appointments.map(apt => (
                <button key={apt.id} onClick={() => { setSelected(apt); setStep('confirm'); }}
                  className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl p-5 text-left">
                  <div className="flex justify-between"><span className="text-xl font-bold">{apt.doctor_name}</span><span className="text-teal-400">{apt.appointment_time}</span></div>
                  <p className="text-gray-400 text-sm">{apt.specialty}</p>
                </button>
              ))}
            </div>
            <button onClick={() => setStep('enter-phone')} className="w-full mt-6 py-3 text-gray-500 text-sm">← Back</button>
          </div>
        )}

        {step === 'confirm' && selected && (
          <div className="w-full max-w-md text-center">
            <h2 className="text-3xl font-bold mb-6">Confirm Check-in</h2>
            <div className="bg-gray-800 rounded-2xl p-6 mb-6 text-left space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Patient</span><span>{selected.patient_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Doctor</span><span>{selected.doctor_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Time</span><span>{selected.appointment_time}</span></div>
            </div>
            {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
            <button onClick={confirmCheckin} disabled={loading} className="w-full py-5 bg-teal-600 rounded-2xl text-2xl font-bold mb-3">
              {loading ? '…' : '✓ Check In & Get Token'}
            </button>
          </div>
        )}

        {step === 'token-issued' && token && (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">You're checked in!</h2>
            <div className="text-9xl font-black text-teal-300 my-4">{token.token_number}</div>
            {token.uhid && <p className="text-gray-400 mb-2">UHID: {token.uhid}</p>}
            {token.estimated_wait_minutes != null && <p className="text-teal-200 mb-4">Estimated wait: ~{token.estimated_wait_minutes} min</p>}
            <p className="text-gray-400 mb-6">Please wait in the OPD lounge. Your token will be announced.</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => printToken(token)} className="px-6 py-3 bg-blue-700 rounded-xl">Print</button>
              <button onClick={resetToIdle} className="px-6 py-3 bg-gray-700 rounded-xl">Done</button>
            </div>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}

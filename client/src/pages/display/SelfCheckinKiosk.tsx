import React, { useState, useEffect, useRef, useCallback } from 'react';
import DisplayShell from './DisplayShell';
import KioskQrScanner from '@/components/display/KioskQrScanner';
import KioskPhotoCapture from '@/components/display/KioskPhotoCapture';
import KioskAadhaarScanner from '@/components/display/KioskAadhaarScanner';
import { printQmsTokenSlip } from '@/utils/qmsPrintSlip';
import { displayDeviceHeaders, getDisplayDeviceToken } from '@/utils/displayDeviceAuth';

type Step =
  | 'idle'
  | 'choose'
  | 'scan-qr'
  | 'scan-aadhaar'
  | 'enter-phone'
  | 'walk-in'
  | 'walk-in-photo'
  | 'abha-flow'
  | 'select-appointment'
  | 'confirm'
  | 'token-issued';

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
  counter_id?: string;
  queue_zone?: string;
  specialization?: string | null;
  whatsapp?: boolean;
}

const IDLE_TIMEOUT_MS = 45000;

function printToken(token: IssuedToken) {
  printQmsTokenSlip(token);
}

export default function SelfCheckinKiosk() {
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [reg, setReg] = useState({ firstName: '', lastName: '', gender: 'Male', dateOfBirth: '', chiefComplaint: '' });
  const [aadhaarLast4, setAadhaarLast4] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [token, setToken] = useState<IssuedToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [notifyOptIn, setNotifyOptIn] = useState(false);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [abhaId, setAbhaId] = useState<string | null>(null);
  const [abhaOtp, setAbhaOtp] = useState('');
  const [abhaTxnId, setAbhaTxnId] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToIdle = useCallback(() => {
    setStep('idle');
    setPhone('');
    setReg({ firstName: '', lastName: '', gender: 'Male', dateOfBirth: '', chiefComplaint: '' });
    setAadhaarLast4(null);
    setAppointments([]);
    setSelected(null);
    setToken(null);
    setError(null);
    setConsent(false);
    setNotifyOptIn(false);
    setPhotoKey(null);
    setAbhaId(null);
    setAbhaOtp('');
    setAbhaTxnId(null);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (step !== 'idle') idleTimer.current = setTimeout(resetToIdle, IDLE_TIMEOUT_MS);
  }, [step, resetToIdle]);

  useEffect(() => {
    resetIdleTimer();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [step, resetIdleTimer]);

  useEffect(() => {
    // Persist ?deviceToken= for subsequent kiosk API calls (required in prod)
    getDisplayDeviceToken();
  }, []);

  const handlePhoneDigit = (d: string) => {
    resetIdleTimer();
    if (d === 'DEL') { setPhone(p => p.slice(0, -1)); return; }
    if (phone.length >= 10) return;
    setPhone(p => p + d);
  };

  const handleQrScan = async (payload: string) => {
    setStep('choose');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/kiosk/parse-qr', {
        method: 'POST',
        headers: displayDeviceHeaders(),
        body: JSON.stringify({ payload }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Could not read QR code.');
        return;
      }
      if (json.nextStep === 'confirm-appointment' && json.appointment) {
        setSelected({
          id: String(json.appointment.id),
          appointment_date: json.appointment.appointment_date,
          appointment_time: json.appointment.appointment_time,
          doctor_name: json.appointment.doctor_name,
          specialty: json.appointment.specialty,
          patient_name: json.appointment.patient_name,
          status: json.appointment.status,
        });
        setStep('confirm');
      } else if (json.nextStep === 'walk-in-register') {
        setStep('walk-in');
      } else if (json.nextStep === 'abha-lookup') {
        setStep('abha-flow');
      } else if (json.nextStep === 'token-lookup') {
        setError(`Token ${json.token || ''} — please see the counter.`);
      } else {
        setError('QR recognized. Use appointment or walk-in flow.');
      }
    } catch (_) {
      setError('Connection error while reading QR.');
    } finally {
      setLoading(false);
    }
  };

  const handleAadhaarScan = async (payload: { qrBytesBase64?: string; qrText?: string }) => {
    // Stay on scanner until parse succeeds (seamless reading state)
    setError(null);
    const res = await fetch('/api/display/kiosk/parse-aadhaar-qr', {
      method: 'POST',
      headers: displayDeviceHeaders(),
      body: JSON.stringify({
        qrText: payload?.qrText,
        qrBytesBase64: payload?.qrBytesBase64,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.success) {
      throw new Error(json.message || 'Could not read the Aadhaar QR. Hold the card steady and try again.');
    }
    const f = json.fields || {};
    const genderMap: Record<string, string> = { male: 'Male', female: 'Female', m: 'Male', f: 'Female' };
    const g = String(f.gender || '').toLowerCase();
    setReg((r) => ({
      ...r,
      firstName: f.firstName || r.firstName,
      lastName: f.lastName || r.lastName,
      gender: genderMap[g] || (f.gender === 'Male' || f.gender === 'Female' ? f.gender : r.gender),
      dateOfBirth: f.dateOfBirth || r.dateOfBirth,
    }));
    if (f.aadhaarLast4) setAadhaarLast4(f.aadhaarLast4);
    setStep('walk-in');
  };

  const uploadPhoto = async (blob: Blob) => {
    const form = new FormData();
    form.append('photo', blob, 'kiosk-photo.jpg');
    const token = getDisplayDeviceToken();
    const res = await fetch('/api/display/kiosk/photo', {
      method: 'POST',
      body: form,
      headers: token ? { 'x-device-token': token } : {},
    });
    const json = await res.json();
    if (json.success) setPhotoKey(json.photoKey);
    setStep('walk-in');
  };

  const startAbha = async () => {
    if (phone.length < 10) {
      setError('Enter 10-digit mobile for ABHA OTP.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/abdm/kiosk/abha/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: phone, name: reg.firstName || 'Patient' }),
      });
      const json = await res.json();
      if (json.success && json.txnId) {
        setAbhaTxnId(json.txnId);
      } else {
        setError(json.message || 'ABHA initiation failed.');
      }
    } catch (_) {
      setError('ABHA service unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const verifyAbha = async () => {
    if (!abhaTxnId || !abhaOtp) return;
    setLoading(true);
    try {
      const res = await fetch('/api/abdm/kiosk/abha/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txnId: abhaTxnId, otp: abhaOtp, mobile: phone }),
      });
      const json = await res.json();
      if (json.success && json.abhaNumber) {
        setAbhaId(json.abhaNumber);
        setStep('walk-in');
      } else {
        setError(json.message || 'OTP verification failed.');
      }
    } catch (_) {
      setError('ABHA verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const lookupAppointments = async () => {
    if (phone.length < 10) { setError('Please enter your 10-digit mobile number.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/checkin/appointments', {
        method: 'POST',
        headers: displayDeviceHeaders(),
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
        headers: displayDeviceHeaders(),
        body: JSON.stringify({
          appointment_id: selected.id,
          patient_name: selected.patient_name,
          doctor_name: selected.doctor_name,
          patient_phone: phone || undefined,
          notify_phone: phone || undefined,
          notify_opt_in: notifyOptIn,
          specialization: selected.specialty,
        }),
      });
      const json = await res.json();
      if (json.success && json.token) {
        const issued = {
          token_number: json.token.token_number,
          patient_name: json.token.patient_name,
          doctor_name: json.token.doctor_name,
          issued_at: json.token.issued_at || new Date().toISOString(),
          estimated_wait_minutes: json.token.estimated_wait_minutes,
          counter_id: json.token.counter_id,
          queue_zone: json.token.queue_zone,
          specialization: json.token.specialization || selected.specialty,
          whatsapp: Boolean(json.whatsapp),
        };
        setToken(issued);
        setStep('token-issued');
        // Auto-print slip for kiosk
        setTimeout(() => printToken(issued), 400);
        setTimeout(resetToIdle, 45000);
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
        headers: displayDeviceHeaders(),
        body: JSON.stringify({
          phone,
          firstName: reg.firstName,
          lastName: reg.lastName,
          gender: reg.gender,
          dateOfBirth: reg.dateOfBirth || null,
          chiefComplaint: reg.chiefComplaint,
          consentVersion: 'kiosk-v1',
          photoKey,
          abhaId,
          notifyOptIn,
          notifyPhone: phone,
        }),
      });
      const json = await res.json();
      if (json.success && json.token) {
        const issued = {
          token_number: json.token.tokenNumber || json.entry?.tokenNumber,
          patient_name: `${reg.firstName} ${reg.lastName}`.trim(),
          doctor_name: json.entry?.doctorName || 'General OPD',
          issued_at: new Date().toISOString(),
          estimated_wait_minutes: json.entry?.estimatedWaitMinutes,
          uhid: json.uhid,
          counter_id: json.entry?.counterId,
          queue_zone: json.entry?.queueZone,
          whatsapp: notifyOptIn,
        };
        setToken(issued);
        setStep('token-issued');
        setTimeout(() => printToken(issued), 400);
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
      {step === 'scan-qr' && (
        <KioskQrScanner onScan={handleQrScan} onClose={() => setStep('choose')} />
      )}

      {step === 'scan-aadhaar' && (
        <KioskAadhaarScanner onScan={handleAadhaarScan} onClose={() => setStep('choose')} />
      )}

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
            <button onClick={() => { setStep('scan-qr'); resetIdleTimer(); }} className="w-full py-6 bg-purple-800 hover:bg-purple-700 rounded-2xl text-2xl font-bold">📷 Scan QR Code</button>
            <button onClick={() => { setStep('enter-phone'); resetIdleTimer(); }} className="w-full py-6 bg-teal-700 hover:bg-teal-600 rounded-2xl text-2xl font-bold">📅 I have an appointment</button>
            <button onClick={() => { setStep('walk-in'); resetIdleTimer(); }} className="w-full py-6 bg-blue-800 hover:bg-blue-700 rounded-2xl text-2xl font-bold">🆕 Walk-in (new visit)</button>
            <button onClick={() => { setStep('scan-aadhaar'); resetIdleTimer(); }} className="w-full py-5 bg-orange-800 hover:bg-orange-700 rounded-2xl text-xl font-bold">🪪 Register with Aadhaar</button>
            <button onClick={() => { setStep('abha-flow'); resetIdleTimer(); }} className="w-full py-5 bg-indigo-900 hover:bg-indigo-800 rounded-2xl text-xl font-bold">🪪 Link ABHA</button>
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

        {step === 'walk-in-photo' && (
          <KioskPhotoCapture
            onCapture={uploadPhoto}
            onSkip={() => setStep('walk-in')}
          />
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
            <div className="flex gap-3">
              <input type="date" className="flex-1 p-4 rounded-xl bg-gray-800 border border-gray-700" value={reg.dateOfBirth}
                onChange={e => setReg(r => ({ ...r, dateOfBirth: e.target.value }))} />
              <select className="flex-1 p-4 rounded-xl bg-gray-800 border border-gray-700" value={reg.gender}
                onChange={e => setReg(r => ({ ...r, gender: e.target.value }))}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Chief complaint" value={reg.chiefComplaint}
              onChange={e => setReg(r => ({ ...r, chiefComplaint: e.target.value }))} />
            {aadhaarLast4 && <p className="text-orange-300 text-sm">Aadhaar scanned ✓ (···· ···· {aadhaarLast4}) — please review details above</p>}
            {abhaId && <p className="text-teal-300 text-sm">ABHA linked: {abhaId}</p>}
            {photoKey && <p className="text-gray-400 text-sm">Photo captured ✓</p>}
            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />
              I consent to processing my data for registration and queue management (DPDP kiosk-v1).
            </label>
            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input type="checkbox" checked={notifyOptIn} onChange={e => setNotifyOptIn(e.target.checked)} className="mt-1" />
              Send WhatsApp and SMS queue updates to my mobile.
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="button" onClick={() => setStep('walk-in-photo')} className="w-full py-3 bg-gray-700 rounded-xl text-sm">📷 Add photo (optional)</button>
            <button onClick={submitWalkIn} disabled={loading} className="w-full py-4 bg-teal-600 rounded-2xl text-xl font-bold disabled:opacity-50">
              {loading ? 'Registering…' : 'Register & Get Token'}
            </button>
            <button onClick={() => setStep('choose')} className="w-full py-3 text-gray-500 text-sm">← Back</button>
          </div>
        )}

        {step === 'abha-flow' && (
          <div className="w-full max-w-md space-y-4">
            <h2 className="text-2xl font-bold text-center">ABHA Registration</h2>
            <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Mobile (10 digits)" value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            {!abhaTxnId ? (
              <button onClick={startAbha} disabled={loading} className="w-full py-4 bg-indigo-700 rounded-2xl font-bold">
                {loading ? 'Sending OTP…' : 'Send ABHA OTP'}
              </button>
            ) : (
              <>
                <input className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700" placeholder="Enter OTP" value={abhaOtp}
                  onChange={e => setAbhaOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button onClick={verifyAbha} disabled={loading} className="w-full py-4 bg-teal-600 rounded-2xl font-bold">
                  {loading ? 'Verifying…' : 'Verify & Continue'}
                </button>
              </>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
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
            <div className="text-8xl md:text-9xl font-black text-teal-300 my-4">{token.token_number}</div>
            {token.doctor_name && <p className="text-xl text-teal-100 mb-1">{token.doctor_name}</p>}
            {token.specialization && <p className="text-gray-400 mb-2">OPD · {token.specialization}</p>}
            {token.counter_id && <p className="text-gray-300 mb-2">Counter / Room: {token.counter_id}</p>}
            {token.uhid && <p className="text-gray-400 mb-2">UHID: {token.uhid}</p>}
            {token.estimated_wait_minutes != null && <p className="text-teal-200 mb-2">Estimated wait: ~{token.estimated_wait_minutes} min</p>}
            {phone && (
              <p className="text-sm text-emerald-300 mb-2">WhatsApp + SMS token slip sent when notify is enabled</p>
            )}
            <p className="text-gray-400 mb-6">Please wait in the OPD lounge. Your token will be announced.</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => printToken(token)} className="px-6 py-3 bg-blue-700 rounded-xl">Print slip</button>
              <button onClick={resetToIdle} className="px-6 py-3 bg-gray-700 rounded-xl">Done</button>
            </div>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}

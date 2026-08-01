import React, { useState, useEffect, useRef, useCallback } from 'react';
import DisplayShell from './DisplayShell';
import KioskAadhaarScanner from '@/components/display/KioskAadhaarScanner';
import { printQmsTokenSlip } from '@/utils/qmsPrintSlip';
import { displayDeviceHeaders, getDisplayDeviceToken } from '@/utils/displayDeviceAuth';

type Step =
  | 'idle'
  | 'choose'
  | 'phone'
  | 'phone-sent'
  | 'scan-aadhaar'
  | 'aadhaar-confirm'
  | 'appointment-phone'
  | 'select-appointment'
  | 'confirm-appointment'
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

interface AadhaarFields {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  address: string;
  aadhaarLast4: string | null;
}

const IDLE_TIMEOUT_MS = 90000;
const POLL_MS = 4000;

function printToken(token: IssuedToken) {
  printQmsTokenSlip(token);
}

function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function mapGender(g: string): string {
  const x = String(g || '').toLowerCase();
  if (x === 'male' || x === 'm') return 'Male';
  if (x === 'female' || x === 'f') return 'Female';
  if (g === 'Male' || g === 'Female') return g;
  return g || '';
}

export default function SelfCheckinKiosk() {
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [aadhaar, setAadhaar] = useState<AadhaarFields>({
    firstName: '',
    lastName: '',
    gender: 'Male',
    dateOfBirth: '',
    address: '',
    aadhaarLast4: null,
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [token, setToken] = useState<IssuedToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [notifyOptIn, setNotifyOptIn] = useState(true);
  const [inviteChannels, setInviteChannels] = useState<string[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const resetToIdle = useCallback(() => {
    clearPoll();
    setStep('idle');
    setPhone('');
    setAadhaar({
      firstName: '',
      lastName: '',
      gender: 'Male',
      dateOfBirth: '',
      address: '',
      aadhaarLast4: null,
    });
    setAppointments([]);
    setSelected(null);
    setToken(null);
    setError(null);
    setConsent(false);
    setNotifyOptIn(true);
    setInviteChannels([]);
    setLoading(false);
  }, [clearPoll]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (step !== 'idle' && step !== 'token-issued' && step !== 'phone-sent') {
      idleTimer.current = setTimeout(resetToIdle, IDLE_TIMEOUT_MS);
    }
  }, [step, resetToIdle]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [step, resetIdleTimer]);

  useEffect(() => {
    getDisplayDeviceToken();
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const handlePhoneDigit = (d: string) => {
    resetIdleTimer();
    if (d === 'DEL') {
      setPhone((p) => p.slice(0, -1));
      return;
    }
    if (phone.length >= 10) return;
    setPhone((p) => p + d);
  };

  const sendRegistrationInvite = async () => {
    if (phone.length < 10) {
      setError('Enter your 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/kiosk/registration-invite', {
        method: 'POST',
        headers: displayDeviceHeaders(),
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Could not send registration link.');
        return;
      }
      setInviteChannels(Array.isArray(json.channels) ? json.channels : []);
      setStep('phone-sent');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Poll invite status while waiting for phone registration
  useEffect(() => {
    if (step !== 'phone-sent' || phone.length < 10) {
      clearPoll();
      return;
    }
    clearPoll();
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/display/kiosk/registration-invite/status?phone=${encodeURIComponent(phone)}`,
          { headers: displayDeviceHeaders() }
        );
        const json = await res.json();
        if (json.success && json.status === 'completed' && json.tokenNumber) {
          clearPoll();
          const issued: IssuedToken = {
            token_number: json.tokenNumber,
            patient_name: 'Patient',
            doctor_name: 'General OPD',
            issued_at: new Date().toISOString(),
            whatsapp: true,
          };
          setToken(issued);
          setStep('token-issued');
          setTimeout(() => printToken(issued), 400);
          setTimeout(resetToIdle, 45000);
        } else if (json.status === 'expired' || json.status === 'revoked') {
          clearPoll();
          setError('Link expired. Please enter your number again.');
          setStep('phone');
        }
      } catch {
        /* keep polling */
      }
    };
    void tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return clearPoll;
  }, [step, phone, clearPoll, resetToIdle]);

  const handleAadhaarScan = async (payload: { qrBytesBase64?: string; qrText?: string }) => {
    setError(null);
    const { parseAadhaarPayloadClient } = await import('@/lib/aadhaarQrParse');
    const apply = (f: Record<string, unknown>) => {
      setAadhaar({
        firstName: String(f.firstName || ''),
        lastName: String(f.lastName || ''),
        gender: mapGender(String(f.gender || 'Male')),
        dateOfBirth: String(f.dateOfBirth || ''),
        address: String(f.address || ''),
        aadhaarLast4: f.aadhaarLast4 ? String(f.aadhaarLast4) : null,
      });
      setStep('aadhaar-confirm');
    };

    const local = parseAadhaarPayloadClient(payload || {});
    if (local.success) {
      apply(local.fields);
      return;
    }

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
      throw new Error(
        json.message || local.message || 'Could not read the Aadhaar QR. Photograph the QR on the back.'
      );
    }
    apply(json.fields || {});
  };

  const submitAadhaarRegistration = async () => {
    if (!aadhaar.firstName.trim()) {
      setError('Name is required.');
      return;
    }
    if (phone.length < 10) {
      setError('Enter a 10-digit mobile for your token updates.');
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
          firstName: aadhaar.firstName.trim(),
          lastName: aadhaar.lastName.trim(),
          gender: aadhaar.gender,
          dateOfBirth: aadhaar.dateOfBirth || null,
          address: aadhaar.address || null,
          aadhaarLast4: aadhaar.aadhaarLast4,
          consentVersion: 'kiosk-aadhaar-v1',
          notifyOptIn,
          notifyPhone: phone,
        }),
      });
      const json = await res.json();
      if (json.success && json.token) {
        const issued: IssuedToken = {
          token_number: json.token.tokenNumber || json.entry?.tokenNumber,
          patient_name: `${aadhaar.firstName} ${aadhaar.lastName}`.trim(),
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
    } catch {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const lookupAppointments = async () => {
    if (phone.length < 10) {
      setError('Please enter your 10-digit mobile number.');
      return;
    }
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
        setError('No appointments today. Register with phone or Aadhaar instead.');
      }
    } catch {
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
        const issued: IssuedToken = {
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
        setTimeout(() => printToken(issued), 400);
        setTimeout(resetToIdle, 45000);
      } else {
        setError('Could not issue token.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const age = ageFromDob(aadhaar.dateOfBirth);
  const channelHint =
    inviteChannels.length > 0
      ? inviteChannels.map((c) => (c === 'whatsapp' ? 'WhatsApp' : c === 'sms' ? 'SMS' : c)).join(' + ')
      : 'WhatsApp / SMS';

  return (
    <DisplayShell zone="opd-counter" zoneName="Self Check-in" fullscreen>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      />

      {step === 'scan-aadhaar' && (
        <KioskAadhaarScanner onScan={handleAadhaarScan} onClose={() => setStep('choose')} />
      )}

      <div
        className="h-full flex flex-col items-center justify-center p-6 md:p-10 select-none"
        style={{
          fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
          background:
            step === 'idle' || step === 'choose'
              ? 'radial-gradient(900px 500px at 15% 0%, rgba(45,212,191,0.18) 0%, transparent 55%), radial-gradient(700px 420px at 90% 20%, rgba(56,189,248,0.12) 0%, transparent 50%), #030712'
              : undefined,
        }}
        onClick={step === 'idle' ? () => setStep('choose') : undefined}
      >
        {step === 'idle' && (
          <div className="text-center max-w-2xl px-4 animate-in fade-in duration-700">
            <p
              className="text-6xl md:text-7xl font-bold tracking-tight text-teal-300 mb-6"
              style={{ fontFamily: 'Fraunces, Georgia, serif' }}
            >
              Mediqzy
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">Touch to start</h1>
            <p className="text-lg text-slate-400">Register in under a minute · Phone or Aadhaar</p>
            <div className="mt-12 inline-flex h-16 w-16 items-center justify-center rounded-full border border-teal-400/40 text-teal-300 animate-pulse">
              <span className="text-2xl" aria-hidden>
                ◎
              </span>
            </div>
          </div>
        )}

        {step === 'choose' && (
          <div className="w-full max-w-xl space-y-5">
            <div className="text-center mb-2">
              <p
                className="text-3xl font-bold text-teal-300"
                style={{ fontFamily: 'Fraunces, Georgia, serif' }}
              >
                Mediqzy
              </p>
              <h2 className="mt-3 text-2xl md:text-3xl font-semibold text-white">
                How would you like to register?
              </h2>
              <p className="mt-2 text-slate-400">Choose one · we’ll guide you through the rest</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setPhone('');
                setStep('phone');
                resetIdleTimer();
              }}
              className="group w-full rounded-3xl border border-teal-500/30 bg-gradient-to-br from-teal-900/80 to-slate-900 px-6 py-8 text-left transition hover:border-teal-400/60 hover:from-teal-800/90"
            >
              <p className="text-2xl font-bold text-white">Mobile number</p>
              <p className="mt-2 text-base text-teal-100/70">
                We’ll send a secure link on WhatsApp — finish on your phone
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('scan-aadhaar');
                resetIdleTimer();
              }}
              className="w-full rounded-3xl border border-sky-500/25 bg-gradient-to-br from-sky-950/80 to-slate-900 px-6 py-8 text-left transition hover:border-sky-400/50"
            >
              <p className="text-2xl font-bold text-white">Aadhaar QR</p>
              <p className="mt-2 text-base text-sky-100/70">
                Scan the QR on the back — name, gender, age & address fill in
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setPhone('');
                setStep('appointment-phone');
                resetIdleTimer();
              }}
              className="w-full py-3 text-center text-sm text-slate-500 hover:text-slate-300"
            >
              I already have an appointment →
            </button>

            <button type="button" onClick={resetToIdle} className="w-full py-2 text-center text-sm text-slate-600">
              Cancel
            </button>
          </div>
        )}

        {step === 'phone' && (
          <PhonePad
            title="Your mobile number"
            subtitle="We’ll send a secure registration link"
            phone={phone}
            error={error}
            loading={loading}
            okLabel="Send link"
            onDigit={handlePhoneDigit}
            onOk={() => void sendRegistrationInvite()}
            onBack={() => setStep('choose')}
          />
        )}

        {step === 'phone-sent' && (
          <div className="w-full max-w-md text-center px-2">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-teal-500/20 ring-1 ring-teal-400/40">
              <span className="text-3xl text-teal-300" aria-hidden>
                ✉
              </span>
            </div>
            <h2
              className="text-3xl font-semibold text-white"
              style={{ fontFamily: 'Fraunces, Georgia, serif' }}
            >
              Check your phone
            </h2>
            <p className="mt-3 text-lg text-slate-300">
              Secure link sent to{' '}
              <span className="font-mono font-semibold text-teal-300">******{phone.slice(-4)}</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">via {channelHint}</p>
            <div className="mt-8 rounded-3xl border border-slate-700/80 bg-slate-900/60 px-5 py-6">
              <div className="mx-auto mb-3 h-2 w-2 animate-pulse rounded-full bg-teal-400" />
              <p className="text-base text-slate-300">Waiting for you to finish on your phone…</p>
              <p className="mt-2 text-sm text-slate-500">
                Open WhatsApp, tap the link, submit details. Your token appears here.
              </p>
            </div>
            {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void sendRegistrationInvite()}
                className="w-full py-3 text-sm text-teal-400/90 hover:text-teal-300"
              >
                Resend link
              </button>
              <button type="button" onClick={() => setStep('phone')} className="w-full py-2 text-sm text-slate-500">
                ← Change number
              </button>
            </div>
          </div>
        )}

        {step === 'aadhaar-confirm' && (
          <div className="w-full max-w-lg space-y-4">
            <div className="text-center">
              <h2
                className="text-3xl font-semibold text-white"
                style={{ fontFamily: 'Fraunces, Georgia, serif' }}
              >
                Confirm your details
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                From Aadhaar
                {aadhaar.aadhaarLast4 ? ` · ****${aadhaar.aadhaarLast4}` : ''} — edit if needed
              </p>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-700/80 bg-slate-900/70 p-5">
              <div className="grid grid-cols-2 gap-3">
                <KioskField
                  label="First name"
                  value={aadhaar.firstName}
                  onChange={(v) => setAadhaar((a) => ({ ...a, firstName: v }))}
                />
                <KioskField
                  label="Last name"
                  value={aadhaar.lastName}
                  onChange={(v) => setAadhaar((a) => ({ ...a, lastName: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <KioskField
                  label="Date of birth"
                  type="date"
                  value={aadhaar.dateOfBirth}
                  onChange={(v) => setAadhaar((a) => ({ ...a, dateOfBirth: v }))}
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Gender
                  </span>
                  <select
                    className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-3 py-3 text-base"
                    value={aadhaar.gender}
                    onChange={(e) => setAadhaar((a) => ({ ...a, gender: e.target.value }))}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>
              </div>
              {age != null && (
                <p className="text-sm text-slate-400">
                  Age <span className="font-semibold text-white">{age}</span>
                </p>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Address
                </span>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-3 py-3 text-base"
                  value={aadhaar.address}
                  onChange={(e) => setAadhaar((a) => ({ ...a, address: e.target.value }))}
                />
              </label>
              <KioskField
                label="Mobile (for token)"
                value={phone}
                onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                placeholder="10-digit number"
              />
              <label className="flex items-start gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I consent to registration and queue management at this facility.
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={notifyOptIn}
                  onChange={(e) => setNotifyOptIn(e.target.checked)}
                />
                Send WhatsApp / SMS queue updates.
              </label>
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="button"
              disabled={loading}
              onClick={() => void submitAadhaarRegistration()}
              className="w-full rounded-2xl bg-teal-600 py-4 text-xl font-bold hover:bg-teal-500 disabled:opacity-50"
            >
              {loading ? 'Registering…' : 'Confirm & get token'}
            </button>
            <button
              type="button"
              onClick={() => setStep('scan-aadhaar')}
              className="w-full py-2 text-sm text-slate-500"
            >
              ← Rescan Aadhaar
            </button>
          </div>
        )}

        {step === 'appointment-phone' && (
          <PhonePad
            title="Appointment mobile"
            subtitle="Number used when booking"
            phone={phone}
            error={error}
            loading={loading}
            okLabel="Find"
            onDigit={handlePhoneDigit}
            onOk={() => void lookupAppointments()}
            onBack={() => setStep('choose')}
          />
        )}

        {step === 'select-appointment' && (
          <div className="w-full max-w-lg">
            <h2 className="mb-6 text-center text-3xl font-semibold">Select appointment</h2>
            <div className="space-y-3">
              {appointments.map((apt) => (
                <button
                  key={apt.id}
                  type="button"
                  onClick={() => {
                    setSelected(apt);
                    setStep('confirm-appointment');
                  }}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-5 text-left hover:bg-slate-700"
                >
                  <div className="flex justify-between">
                    <span className="text-xl font-bold">{apt.doctor_name}</span>
                    <span className="text-teal-400">{apt.appointment_time}</span>
                  </div>
                  <p className="text-sm text-slate-400">{apt.specialty}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep('appointment-phone')}
              className="mt-6 w-full py-3 text-sm text-slate-500"
            >
              ← Back
            </button>
          </div>
        )}

        {step === 'confirm-appointment' && selected && (
          <div className="w-full max-w-md text-center">
            <h2 className="mb-6 text-3xl font-semibold">Confirm check-in</h2>
            <div className="mb-6 space-y-2 rounded-2xl bg-slate-800 p-6 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Patient</span>
                <span>{selected.patient_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Doctor</span>
                <span>{selected.doctor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Time</span>
                <span>{selected.appointment_time}</span>
              </div>
            </div>
            {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}
            <button
              type="button"
              onClick={() => void confirmCheckin()}
              disabled={loading}
              className="mb-3 w-full rounded-2xl bg-teal-600 py-5 text-2xl font-bold"
            >
              {loading ? '…' : 'Check in & get token'}
            </button>
          </div>
        )}

        {step === 'token-issued' && token && (
          <div className="text-center px-4">
            <p
              className="text-2xl font-bold text-teal-300"
              style={{ fontFamily: 'Fraunces, Georgia, serif' }}
            >
              Mediqzy
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white">You’re checked in</h2>
            <div className="my-5 font-mono text-7xl font-black tracking-wider text-teal-300 md:text-8xl">
              {token.token_number}
            </div>
            {token.doctor_name && <p className="mb-1 text-xl text-teal-100">{token.doctor_name}</p>}
            {token.specialization && <p className="mb-2 text-slate-400">OPD · {token.specialization}</p>}
            {token.counter_id && <p className="mb-2 text-slate-300">Counter / Room: {token.counter_id}</p>}
            {token.uhid && <p className="mb-2 text-slate-400">UHID: {token.uhid}</p>}
            {token.estimated_wait_minutes != null && (
              <p className="mb-2 text-teal-200">Estimated wait: ~{token.estimated_wait_minutes} min</p>
            )}
            <p className="mb-6 text-slate-400">Please wait in the lounge. Your token will be announced.</p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => printToken(token)}
                className="rounded-xl bg-sky-800 px-6 py-3"
              >
                Print slip
              </button>
              <button type="button" onClick={resetToIdle} className="rounded-xl bg-slate-700 px-6 py-3">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}

function PhonePad({
  title,
  subtitle,
  phone,
  error,
  loading,
  okLabel,
  onDigit,
  onOk,
  onBack,
}: {
  title: string;
  subtitle: string;
  phone: string;
  error: string | null;
  loading: boolean;
  okLabel: string;
  onDigit: (d: string) => void;
  onOk: () => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-md">
      <h2 className="mb-2 text-center text-3xl font-semibold text-white">{title}</h2>
      <p className="mb-6 text-center text-sm text-slate-400">{subtitle}</p>
      <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-center font-mono text-5xl tracking-widest">
        {phone || <span className="text-slate-600">__________</span>}
      </div>
      {error && <p className="mb-4 text-center text-sm text-rose-400">{error}</p>}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'OK'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === 'OK' ? onOk() : onDigit(k))}
            disabled={loading}
            className={`rounded-2xl py-5 text-2xl font-bold ${
              k === 'OK' ? 'bg-teal-600' : k === 'DEL' ? 'bg-rose-900/80' : 'bg-slate-700'
            }`}
          >
            {loading && k === 'OK' ? '…' : k === 'OK' ? okLabel : k}
          </button>
        ))}
      </div>
      <button type="button" onClick={onBack} className="w-full py-3 text-sm text-slate-500">
        ← Back
      </button>
    </div>
  );
}

function KioskField({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-3 py-3 text-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

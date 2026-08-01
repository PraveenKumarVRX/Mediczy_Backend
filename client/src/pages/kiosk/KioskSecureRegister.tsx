import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { parseAadhaarPayloadClient } from "@/lib/aadhaarQrParse";
import { decodeAadhaarFromFileWithServerFallback } from "@/lib/aadhaarQrDecode";

type InviteState = {
  status: string;
  phone: string;
  expiresAt?: string;
  tokenNumber?: string | null;
};

type FormState = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  chiefComplaint: string;
  aadhaarNumber: string;
  abhaId: string;
  aadhaarLast4: string;
  consentAccepted: boolean;
  notifyOptIn: boolean;
};

const emptyForm = (): FormState => ({
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  chiefComplaint: "",
  aadhaarNumber: "",
  abhaId: "",
  aadhaarLast4: "",
  consentAccepted: false,
  notifyOptIn: true,
});

function digitsOnly(v: string) {
  return String(v || "").replace(/\D/g, "");
}

/** Format ABHA as XX-XXXX-XXXX-XXXX while typing digits. */
function formatAbhaInput(v: string) {
  const d = digitsOnly(v).slice(0, 14);
  if (v.includes("@")) return v.trim();
  if (d.length <= 2) return d;
  if (d.length <= 6) return `${d.slice(0, 2)}-${d.slice(2)}`;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10)}`;
}

function ageFromDob(dob: string): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? String(age) : null;
}

function genderLabel(g: string) {
  const x = g.toLowerCase();
  if (x === "male" || x === "m") return "Male";
  if (x === "female" || x === "f") return "Female";
  return g || "";
}

/**
 * Secure mobile registration page opened from WhatsApp/SMS link.
 * World-class, calm, one-job-per-screen.
 */
export default function KioskSecureRegister() {
  const { token } = useParams<{ token: string }>();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [done, setDone] = useState<{ tokenNumber?: string; phone?: string } | null>(null);
  const [aadhaarHint, setAadhaarHint] = useState<string | null>(null);

  const age = useMemo(() => ageFromDob(form.dateOfBirth), [form.dateOfBirth]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/kiosk-register/${token}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.message || "This link is no longer valid.");
        setInvite(null);
        return;
      }
      setInvite({
        status: json.status,
        phone: json.phone,
        expiresAt: json.expiresAt,
        tokenNumber: json.tokenNumber,
      });
      if (json.status === "completed") {
        setDone({ tokenNumber: json.tokenNumber, phone: json.phone });
      }
    } catch {
      setError("Could not open this registration link. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAadhaarPhoto = async (file: File) => {
    setError(null);
    setAadhaarHint("Reading Aadhaar…");
    try {
      const endpoint = token
        ? `/api/public/kiosk-register/${encodeURIComponent(token)}/decode-aadhaar-image`
        : "/api/display/kiosk/decode-aadhaar-image";
      const payload = await decodeAadhaarFromFileWithServerFallback(file, {}, endpoint);
      if (!payload) {
        setAadhaarHint(null);
        setError("No Aadhaar QR found. Photograph the large QR on the back of the card — fill the frame, avoid glare.");
        return;
      }
      if (payload.fields && (payload.fields.firstName || payload.fields.aadhaarLast4)) {
        const f = payload.fields as Record<string, string | null | undefined>;
        const last4 = String(f.aadhaarLast4 || "").replace(/\D/g, "").slice(-4);
        setForm((prev) => ({
          ...prev,
          firstName: String(f.firstName || prev.firstName),
          lastName: String(f.lastName || prev.lastName),
          dateOfBirth: String(f.dateOfBirth || prev.dateOfBirth),
          gender: genderLabel(String(f.gender || prev.gender)),
          address: String(f.address || prev.address),
          aadhaarLast4: last4 || prev.aadhaarLast4,
          aadhaarNumber: last4 ? `********${last4}` : prev.aadhaarNumber,
        }));
        setAadhaarHint(
          `Aadhaar details added${last4 ? ` · ****${last4}` : ""}`
        );
        return;
      }
      const parsed = parseAadhaarPayloadClient(payload);
      if (!parsed.success) {
        setAadhaarHint(null);
        setError(parsed.message);
        return;
      }
      const f = parsed.fields;
      const last4 = String(f.aadhaarLast4 || "").replace(/\D/g, "").slice(-4);
      setForm((prev) => ({
        ...prev,
        firstName: f.firstName || prev.firstName,
        lastName: f.lastName || prev.lastName,
        dateOfBirth: f.dateOfBirth || prev.dateOfBirth,
        gender: genderLabel(f.gender || prev.gender),
        address: f.address || prev.address,
        aadhaarLast4: last4 || prev.aadhaarLast4,
        aadhaarNumber: last4 ? `********${last4}` : prev.aadhaarNumber,
      }));
      setAadhaarHint(
        `Aadhaar details added${last4 ? ` · ****${last4}` : ""}`
      );
    } catch (e: unknown) {
      setAadhaarHint(null);
      setError(e instanceof Error ? e.message : "Could not read Aadhaar photo");
    }
  };

  const submit = async () => {
    if (!token || !invite) return;
    if (!form.firstName.trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (!form.consentAccepted) {
      setError("Please accept consent to continue.");
      return;
    }
    const aadhaarDigits = digitsOnly(form.aadhaarNumber);
    if (aadhaarDigits && aadhaarDigits.length !== 4 && aadhaarDigits.length !== 12) {
      setError("Aadhaar should be 12 digits (or last 4). Leave blank to skip.");
      return;
    }
    const abhaRaw = form.abhaId.trim();
    if (abhaRaw) {
      const abhaDigits = digitsOnly(abhaRaw);
      const abhaAddr = /^[a-zA-Z0-9._-]{3,}@abdm$/i.test(abhaRaw);
      if (!abhaAddr && abhaDigits.length !== 14) {
        setError("ABHA should be 14 digits (XX-XXXX-XXXX-XXXX) or name@abdm. Leave blank to skip.");
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/kiosk-register/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          address: form.address || undefined,
          chiefComplaint: form.chiefComplaint || undefined,
          aadhaarNumber: aadhaarDigits || undefined,
          aadhaarLast4: form.aadhaarLast4 || (aadhaarDigits ? aadhaarDigits.slice(-4) : undefined),
          abhaId: abhaRaw || undefined,
          consentAccepted: true,
          notifyOptIn: form.notifyOptIn,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || "Registration failed");
      }
      setDone({
        tokenNumber: json.tokenNumber || json.entry?.tokenNumber,
        phone: json.phone || invite.phone,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
        background:
          "radial-gradient(1200px 600px at 10% -10%, #9fddd0 0%, transparent 55%), radial-gradient(900px 500px at 100% 0%, #c7e0f4 0%, transparent 50%), linear-gradient(180deg, #f3f7f6 0%, #eef2f0 40%, #f8faf9 100%)",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      />

      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 pb-10 pt-8 sm:px-8">
        <header className="mb-8">
          <h1
            className="text-5xl leading-none tracking-tight text-teal-900"
            style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700 }}
          >
            Mediqzy
          </h1>
          <p className="mt-4 text-xl font-semibold text-slate-800">Finish your registration</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            Secure link from the hospital kiosk. Your details stay private on this phone.
          </p>
        </header>

        {loading && (
          <div className="rounded-3xl bg-white/70 px-5 py-10 text-center text-sm text-slate-500 shadow-sm backdrop-blur">
            Opening your secure form…
          </div>
        )}

        {!loading && error && !invite && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-8 text-center">
            <p className="text-base font-semibold text-rose-800">Link unavailable</p>
            <p className="mt-2 text-sm text-rose-700/90">{error}</p>
            <p className="mt-4 text-xs text-rose-600/80">Return to the kiosk to get a new link.</p>
          </div>
        )}

        {!loading && done && (
          <div className="rounded-3xl bg-white px-6 py-10 text-center shadow-[0_20px_60px_-30px_rgba(15,118,110,0.45)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-500 text-2xl text-white">
              ✓
            </div>
            <h2
              className="mt-5 text-3xl text-slate-900"
              style={{ fontFamily: "Fraunces, Georgia, serif" }}
            >
              You’re registered
            </h2>
            {done.tokenNumber && (
              <p className="mt-4 font-mono text-4xl font-bold tracking-wider text-teal-700">
                {done.tokenNumber}
              </p>
            )}
            <p className="mt-3 text-sm text-slate-600">
              Show this token at the counter
              {done.phone ? ` · sent to ******${done.phone.slice(-4)}` : ""}.
            </p>
          </div>
        )}

        {!loading && invite && invite.status === "pending" && !done && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm backdrop-blur">
              Registering mobile{" "}
              <span className="font-semibold text-slate-900">
                ******{invite.phone.slice(-4)}
              </span>
            </div>

            <label className="block w-full cursor-pointer rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-50 to-white px-5 py-5 text-left shadow-sm">
              <p className="text-base font-bold text-teal-900">Optional · Photograph Aadhaar QR</p>
              <p className="mt-1 text-sm text-teal-800/70">
                Large QR on the back — we’ll fill name, gender, age and address
              </p>
              {aadhaarHint && (
                <p className="mt-2 text-sm font-medium text-teal-700">{aadhaarHint}</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onAadhaarPhoto(f);
                }}
              />
            </label>

            <div className="space-y-3 rounded-3xl bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)]">
              <Field
                label="First name"
                value={form.firstName}
                onChange={(v) => setForm((p) => ({ ...p, firstName: v }))}
                autoComplete="given-name"
              />
              <Field
                label="Last name"
                value={form.lastName}
                onChange={(v) => setForm((p) => ({ ...p, lastName: v }))}
                autoComplete="family-name"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Date of birth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(v) => setForm((p) => ({ ...p, dateOfBirth: v }))}
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Gender
                  </span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                    value={form.gender}
                    onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>
              </div>
              {age && (
                <p className="text-sm text-slate-500">
                  Age <span className="font-semibold text-slate-800">{age}</span>
                </p>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Address
                </span>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <Field
                label="Reason for visit (optional)"
                value={form.chiefComplaint}
                onChange={(v) => setForm((p) => ({ ...p, chiefComplaint: v }))}
              />

              <div className="border-t border-slate-100 pt-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Optional IDs
                </p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aadhaar number
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="12 digits · optional"
                      maxLength={14}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                      value={form.aadhaarNumber}
                      onChange={(e) => {
                        const d = digitsOnly(e.target.value).slice(0, 12);
                        const pretty =
                          d.length > 8
                            ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`
                            : d.length > 4
                              ? `${d.slice(0, 4)} ${d.slice(4)}`
                              : d;
                        setForm((p) => ({
                          ...p,
                          aadhaarNumber: pretty,
                          aadhaarLast4: d.length >= 4 ? d.slice(-4) : "",
                        }));
                      }}
                    />
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Only last 4 digits are stored
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ABHA ID
                    </span>
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="XX-XXXX-XXXX-XXXX or name@abdm"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                      value={form.abhaId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((p) => ({
                          ...p,
                          abhaId: v.includes("@") ? v.trim() : formatAbhaInput(v),
                        }));
                      }}
                    />
                  </label>
                </div>
              </div>

              <label className="flex items-start gap-3 pt-1 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={form.consentAccepted}
                  onChange={(e) => setForm((p) => ({ ...p, consentAccepted: e.target.checked }))}
                />
                <span>I consent to registration and treatment at this facility.</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={form.notifyOptIn}
                  onChange={(e) => setForm((p) => ({ ...p, notifyOptIn: e.target.checked }))}
                />
                <span>Send my queue token updates on WhatsApp / SMS.</span>
              </label>
            </div>

            {error && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="w-full rounded-2xl bg-teal-700 px-5 py-4 text-base font-bold text-white shadow-lg shadow-teal-900/20 hover:bg-teal-600 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit registration"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

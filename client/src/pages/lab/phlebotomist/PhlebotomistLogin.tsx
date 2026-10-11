import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Syringe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, PhleboError } from "./phleboClient";

/** /lab/phlebotomist/login — sign-in for lab collectors (web counterpart of the native app). */
export default function PhlebotomistLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await login(email.trim(), password);
      navigate("/lab/phlebotomist", { replace: true, state: r.mustChangePassword ? { mustChangePassword: true } : undefined });
    } catch (err) {
      const p = err as PhleboError;
      setError(
        p.code === "account_unavailable" ? "This account cannot sign in right now. Ask the lab to check your qualification status and assignment."
        : p.code === "password_change_required" ? "Your temporary password must be changed before you can sign in here. Use the mobile app, or contact the lab."
        : p.status === 429 ? "Too many attempts. Wait a few minutes and try again."
        : p.status === 401 ? "That email and password do not match."
        : "Could not sign in. Check your connection and try again."
      );
    } finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f8] px-4 text-[#15252d]">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-[24px] border border-[#dce9e7] bg-white p-6 shadow-[0_8px_24px_rgba(30,75,77,0.06)]" aria-labelledby="phlebo-h">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#0e6f69] text-white shadow-sm"><Syringe className="size-5" aria-hidden /></span>
          <div><h1 id="phlebo-h" className="text-lg font-semibold leading-tight text-[#17333a]">Collection Worklist</h1><p className="text-xs text-[#6a8288]">Phlebotomist sign-in</p></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="phlebo-email">Email</Label><Input id="phlebo-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="phlebo-pw">Password</Label><Input id="phlebo-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-[#c75e43]">{error}</p>}
        <button type="submit" disabled={busy || !email || !password} className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0e6f69] text-sm font-semibold text-white shadow-[0_5px_12px_rgba(14,111,105,0.2)] transition hover:bg-[#0b5e59] disabled:cursor-not-allowed disabled:bg-[#b4c8c9]">{busy ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-xs text-[#84969b]">New collectors are created by the lab under Collection Operations → Collectors.</p>
      </form>
    </main>
  );
}

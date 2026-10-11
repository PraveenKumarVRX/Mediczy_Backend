import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, OhcError } from "./ohcClient";

/** /ohc/login — sign-in for tenant OHC doctors/staff. The corporate CMO now signs in at the corporate portal (/corporate/login). */
export default function OhcLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(email.trim(), password); navigate("/ohc", { replace: true }); }
    catch (err) {
      const o = err as OhcError;
      setError(o.status === 403 ? "This account cannot sign in right now. Ask your administrator to check your OHC assignment and the contract." : o.status === 429 ? "Too many attempts. Wait a few minutes and try again." : o.status === 401 ? "That email and password do not match." : "Could not sign in. Check your connection and try again.");
    } finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="ohc-h">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Stethoscope className="size-5" aria-hidden /></span>
          <div><h1 id="ohc-h" className="text-lg font-semibold leading-tight">Occupational Health Clinic</h1><p className="text-xs text-muted-foreground">Doctor and staff sign-in</p></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ohc-email">Email</Label><Input id="ohc-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="ohc-pw">Password</Label><Input id="ohc-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="text-center text-xs text-muted-foreground">Chief Medical Officer? Sign in at the <a href="/corporate/login" className="underline">corporate portal</a>.</p>
      </form>
    </main>
  );
}

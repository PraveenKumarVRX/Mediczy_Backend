import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Syringe } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="phlebo-h">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Syringe className="size-5" aria-hidden /></span>
          <div><h1 id="phlebo-h" className="text-lg font-semibold leading-tight">Collection Worklist</h1><p className="text-xs text-muted-foreground">Phlebotomist sign-in</p></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="phlebo-email">Email</Label><Input id="phlebo-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="phlebo-pw">Password</Label><Input id="phlebo-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="text-center text-xs text-muted-foreground">New collectors are created by the lab under Collection Operations → Collectors.</p>
      </form>
    </main>
  );
}

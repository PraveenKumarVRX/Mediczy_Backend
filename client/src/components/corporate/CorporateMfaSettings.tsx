import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
export default function CorporateMfaSettings() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    enabled: boolean;
    pending: boolean;
  } | null>(null);
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const response = await api.get("/corporate/security/mfa");
      setStatus(response.data.data);
      setError("");
    } catch {
      setError("Authenticator status could not be loaded.");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const act = async (action: "enroll" | "confirm" | "disable") => {
    setBusy(true);
    try {
      const response = await api.post(`/corporate/security/mfa/${action}`, {
        password,
        code,
      });
      if (action === "enroll") {
        setEnrollment(response.data.data);
        setCode("");
      } else {
        if (response.data.data.refreshToken)
          localStorage.setItem("refreshToken", response.data.data.refreshToken);
        if (response.data.data.token) {
          localStorage.setItem("corporateToken", response.data.data.token);
          localStorage.setItem("token", response.data.data.token);
          window.dispatchEvent(new CustomEvent("authChange"));
        }
        setEnrollment(null);
        setPassword("");
        setCode("");
        await load();
        toast({
          title:
            action === "confirm"
              ? "Authenticator protection enabled"
              : "Authenticator protection disabled",
        });
      }
    } catch (error: any) {
      toast({
        title: "Security update failed",
        description: error?.response?.data?.message || "Please retry.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 border rounded-lg p-4"
      aria-label="Authenticator protection"
    >
      <h3 className="font-medium">Two-factor authentication</h3>
      <p className="text-sm text-muted-foreground">
        Protect your corporate account with a password and a code from an
        authenticator app. Each team member enrolls their own account.
      </p>
      {error ? (
        <p role="alert">
          {error}
          <Button onClick={load}>Retry</Button>
        </p>
      ) : !status ? (
        <p>Loading account security…</p>
      ) : (
        <>
          <p role="status">
            {status.enabled
              ? "Enabled — authenticator code required at login"
              : "Not enabled on this account"}
          </p>
          {!enrollment && (
            <label className="block text-sm">
              Current password
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
          )}
          {enrollment && (
            <div className="space-y-2">
              <p>
                Add a new account in your authenticator app using this setup
                key, then enter its current 6-digit code. Keep the key private.
              </p>
              <code className="block break-all select-all">
                {enrollment.secret}
              </code>
              <a className="underline" href={enrollment.otpauthUrl}>
                Open authenticator app
              </a>
            </div>
          )}
          {(enrollment || status.enabled) && (
            <label className="block text-sm">
              Authenticator code
              <Input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
          )}
          {enrollment ? (
            <Button
              onClick={() => act("confirm")}
              disabled={busy || code.length !== 6}
            >
              Confirm authenticator
            </Button>
          ) : status.enabled ? (
            <Button
              variant="destructive"
              onClick={() => act("disable")}
              disabled={busy || code.length !== 6 || !password}
            >
              Disable authenticator
            </Button>
          ) : (
            <Button onClick={() => act("enroll")} disabled={busy || !password}>
              Set up authenticator
            </Button>
          )}
        </>
      )}
    </section>
  );
}

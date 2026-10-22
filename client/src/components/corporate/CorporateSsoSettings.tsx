import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
export default function CorporateSsoSettings() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    enabled: false,
    issuer: "",
    clientId: "",
    clientSecret: "",
    password: "",
  });
  const [callback, setCallback] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const response = await api.get("/corporate/security/sso");
      const data = response.data.data;
      setForm((current) => ({
        ...current,
        enabled: data.enabled,
        issuer: data.issuer,
        clientId: data.clientId,
        clientSecret: "",
        password: "",
      }));
      setHasSecret(data.hasClientSecret);
      setCallback(data.callbackUrl);
      setError("");
    } catch (error: any) {
      setError(
        error?.response?.data?.message ||
          "SSO configuration could not be loaded.",
      );
    }
  };
  useEffect(() => {
    load();
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/corporate/security/sso", form);
      await load();
      toast({ title: "SSO provider configuration saved" });
    } catch (error: any) {
      toast({
        title: "SSO configuration could not be saved",
        description: error?.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 border rounded-lg p-4"
      aria-label="Corporate single sign-on"
    >
      <h3 className="font-medium">SSO (OpenID Connect)</h3>
      <p className="text-sm text-muted-foreground">
        Connect your company identity provider using authorization code login.
        Only existing active HR team members can sign in. Local authenticator
        protection remains required when enabled.
      </p>
      {error ? (
        <p role="alert">
          {error}
          <Button onClick={load}>Retry</Button>
        </p>
      ) : (
        <>
          <p role="status">
            {form.enabled
              ? "Configured — provider login available"
              : "Not enabled — enter your identity-provider details"}
          </p>
          <label className="block">
            Issuer URL
            <Input
              type="url"
              value={form.issuer}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  issuer: event.target.value,
                }))
              }
              placeholder="https://your-provider.example.com"
            />
          </label>
          <label className="block">
            Client ID
            <Input
              value={form.clientId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  clientId: event.target.value,
                }))
              }
            />
          </label>
          <label className="block">
            Client secret{hasSecret ? " (leave blank to retain)" : ""}
            <Input
              type="password"
              autoComplete="new-password"
              value={form.clientSecret}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  clientSecret: event.target.value,
                }))
              }
            />
          </label>
          <p className="text-sm">
            Register this redirect URI in your identity provider:
          </p>
          <code className="block break-all select-all text-xs">{callback}</code>
          <p className="text-sm text-muted-foreground">
            The provider must return a verified email address matching an
            existing corporate HR account.
          </p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            Enable provider sign-in
          </label>
          <label className="block">
            Confirm current password
            <Input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
          </label>
          <Button
            disabled={busy || !form.password || !form.issuer || !form.clientId}
            onClick={save}
          >
            Save identity provider
          </Button>
        </>
      )}
    </section>
  );
}

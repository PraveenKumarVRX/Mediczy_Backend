/**
 * Enterprise SSO login — SAML + OIDC providers
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Shield, Loader2 } from 'lucide-react';

interface Provider {
  id: string;
  label: string;
  type: 'saml' | 'oidc';
}

export default function EnterpriseLoginPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [samlEnabled, setSamlEnabled] = useState(false);

  useEffect(() => {
    api.get('/enterprise/auth/providers')
      .then((res) => {
        setProviders(res.data?.providers || []);
        setSamlEnabled(Boolean(res.data?.samlEnabled));
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const startSaml = () => {
    window.location.href = '/api/enterprise/auth/saml/login?relayState=/hospital/dashboard';
  };

  const startOidc = (provider: string) => {
    navigate(`/oauth-callback?enterprise=${provider}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center mb-2">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <CardTitle>Enterprise Sign-In</CardTitle>
          <CardDescription>Sign in with your hospital identity provider (SAML / OIDC)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && samlEnabled && (
            <Button className="w-full gap-2" onClick={startSaml}>
              <Shield className="h-4 w-4" /> Sign in with SAML SSO
            </Button>
          )}
          {!loading && providers.filter((p) => p.type === 'oidc').map((p) => (
            <Button key={p.id} variant="outline" className="w-full" onClick={() => startOidc(p.id)}>
              {p.label}
            </Button>
          ))}
          {!loading && providers.length === 0 && !samlEnabled && (
            <p className="text-sm text-center text-muted-foreground py-4">
              Enterprise SSO is not configured. Set SAML_ENTRY_POINT / AZURE_AD_TENANT_ID / OKTA_ISSUER env vars.
            </p>
          )}
          <div className="pt-2 text-center">
            <Button variant="link" size="sm" onClick={() => navigate('/hospital/login')}>
              Use hospital portal login instead
            </Button>
          </div>
          <Badge variant="outline" className="w-full justify-center">HIPAA · SOC2 ready</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

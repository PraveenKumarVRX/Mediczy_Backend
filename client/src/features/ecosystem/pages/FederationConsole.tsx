import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Loader2 } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { getFederationStatus, getFederationGatewayStatus, listNetworkOrgs } from '@/services/careos.service';

export default function FederationConsole() {
  const [status, setStatus] = useState<any>(null);
  const [gateway, setGateway] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getFederationStatus().then((r) => setStatus(r?.data)).catch(() => {}),
      getFederationGatewayStatus().then((r) => setGateway(r?.data)).catch(() => {}),
      listNetworkOrgs().then((r) => setOrgs(r?.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-bold">Federation Console</h1>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Trust status</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>{status?.message || status?.status || 'Federation layer active'}</p>
                {status?.partners != null && <Badge>{status.partners} partner hospitals</Badge>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Gateway</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <p>{gateway?.status || gateway?.message || 'FHIR gateway ready'}</p>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Network organizations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {orgs.length ? orgs.map((o: any) => (
                  <div key={o.id} className="flex justify-between border rounded p-3 text-sm">
                    <span className="font-medium">{o.name || o.org_name}</span>
                    <Badge variant="outline">{o.type || o.country || 'partner'}</Badge>
                  </div>
                )) : <p className="text-muted-foreground">No network orgs listed</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </HospitalLayout>
  );
}

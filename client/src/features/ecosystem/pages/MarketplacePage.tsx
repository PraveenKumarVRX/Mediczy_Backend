import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, Loader2 } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { listMarketplaceApps, installMarketplaceApp, listInstalledApps } from '@/services/careos.service';

export default function MarketplacePage() {
  const [apps, setApps] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      listMarketplaceApps().then((r) => setApps(r?.data || [])),
      listInstalledApps().then((r) => setInstalled(r?.data || [])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const install = async (appId: number) => {
    await installMarketplaceApp(appId);
    load();
  };

  const installedIds = new Set(installed.map((a: any) => a.app_id || a.id));

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-amber-600" />
          <h1 className="text-2xl font-bold">CareOS Marketplace</h1>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {apps.map((app: any) => (
              <Card key={app.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{app.name}</CardTitle>
                  <Badge variant="outline">{app.category || 'integration'}</Badge>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="text-muted-foreground">{app.description}</p>
                  {installedIds.has(app.id) ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Installed</Badge>
                  ) : (
                    <Button size="sm" onClick={() => install(app.id)}>Install</Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {!apps.length && <p className="text-muted-foreground">No marketplace apps available</p>}
          </div>
        )}
      </div>
    </HospitalLayout>
  );
}

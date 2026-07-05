import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileAudio, Loader2 } from 'lucide-react';
import { getAmbientPipelineStatus } from '@/services/hospitalOs.service';

export default function AmbientDocumentationPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAmbientPipelineStatus()
      .then((r) => setStatus(r?.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileAudio className="h-5 w-5 text-amber-600" />
        Ambient Clinical Documentation
      </h2>
      <p className="text-sm text-muted-foreground">Listen → structure → clinician sign-off via approval inbox.</p>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Pipeline status
              <Badge variant={status?.ready ? 'default' : 'secondary'}>{status?.ready ? 'Ready' : 'Configuring'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {status?.stages?.map((s: any) => (
              <div key={s.name} className="flex justify-between border-b py-2">
                <span>{s.name}</span>
                <Badge variant="outline">{s.status}</Badge>
              </div>
            ))}
            {!status?.stages?.length && (
              <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">{JSON.stringify(status, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

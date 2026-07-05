import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Code2, Loader2, Trash2 } from 'lucide-react';
import { createApiKey, listApiKeys, revokeApiKey, listWebhooks } from '@/services/careos.service';

export default function DeveloperPortal() {
  const [keys, setKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      listApiKeys().then((r) => setKeys(r?.data || [])),
      listWebhooks().then((r) => setWebhooks(r?.data || [])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!name.trim()) return;
    await createApiKey(name.trim(), ['healthos:read']);
    setName('');
    load();
  };

  const revoke = async (id: number) => {
    await revokeApiKey(id);
    load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Code2 className="h-6 w-6 text-slate-700" />
        <h1 className="text-2xl font-bold">Developer Portal</h1>
      </div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">API keys</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={createKey}>Create</Button>
              </div>
              {keys.map((k: any) => (
                <div key={k.id} className="flex items-center gap-2 border rounded p-3 text-sm">
                  <span className="flex-1 font-mono">{k.name} · {k.key_prefix || 'sk_…'}</span>
                  <Button variant="ghost" size="icon" onClick={() => revoke(k.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Webhooks</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {webhooks.map((w: any) => (
                <p key={w.id} className="font-mono text-xs">{w.url}</p>
              ))}
              {!webhooks.length && <p className="text-muted-foreground">No webhooks registered</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

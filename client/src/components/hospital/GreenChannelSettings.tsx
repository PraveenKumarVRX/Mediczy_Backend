import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

type Mode = 'quiet' | 'staff_badge' | 'separate_lane';

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: 'quiet', label: 'Quiet (default)', help: 'Corporate patients get a small queue-order nudge. Nothing is shown to anyone.' },
  { value: 'staff_badge', label: 'Staff badge', help: 'Front-desk / queue staff see a "Corporate" badge. Never shown on waiting-room screens.' },
  { value: 'separate_lane', label: 'Separate lane', help: 'Staff see "Direct to corporate lane" so patients can be walked to a physically separate space. Never shown on waiting-room screens.' },
];

interface CorporateRow { id: number; companyName: string; enabled: boolean }

export default function GreenChannelSettings() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('quiet');
  const [corporates, setCorporates] = useState<CorporateRow[]>([]);
  const [applications, setApplications] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/corporate-account/green-channel/config');
      const d = res.data?.data;
      setMode(d?.displayMode ?? 'quiet');
      setCorporates(d?.corporates ?? []);
      setApplications(d?.impactLast30Days?.applications ?? 0);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const saveMode = async (next: Mode) => {
    try {
      await api.put('/corporate-account/green-channel/config', { displayMode: next });
      setMode(next);
      toast({ title: 'Green channel display mode saved' });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const toggleCorporate = async (row: CorporateRow) => {
    try {
      await api.put(`/corporate-account/corporates/${row.id}/green-channel`, { enabled: !row.enabled });
      setCorporates((prev) => prev.map((c) => (c.id === row.id ? { ...c, enabled: !c.enabled } : c)));
    } catch (e: any) {
      toast({ title: 'Could not update account', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Green channel (corporate fast-track)</CardTitle>
        <p className="text-xs text-muted-foreground">
          A capped priority nudge for enabled corporate accounts. It only applies to routine/scheduled visits;
          a clinical triage level always outranks it. Waiting-room screens never show it in any mode.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid gap-2 md:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => saveMode(m.value)}
              className={`text-left rounded-lg border p-3 transition ${mode === m.value ? 'border-teal-500 bg-teal-50 dark:bg-teal-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="font-medium text-sm">{m.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{m.help}</div>
            </button>
          ))}
        </div>
        <div>
          <div className="text-sm font-medium mb-2">Accounts with green channel</div>
          {corporates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No corporate accounts found.</p>
          ) : (
            <div className="space-y-1">
              {corporates.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{c.companyName}</span>
                  <Button size="sm" variant={c.enabled ? 'default' : 'outline'} onClick={() => toggleCorporate(c)}>
                    {c.enabled ? 'Enabled' : 'Off'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        {applications !== null && (
          <Badge variant="outline">Applied {applications} time{applications === 1 ? '' : 's'} in the last 30 days</Badge>
        )}
      </CardContent>
    </Card>
  );
}

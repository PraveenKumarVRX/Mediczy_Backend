import { useEffect, useState } from 'react';
import MainLayoutdoctor from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { QrCode, Copy, ExternalLink, Loader2, Users, RefreshCw, Download } from 'lucide-react';
import api from '@/utils/api';

interface QueueEntry {
  id: number;
  tokenNumber?: string;
  patientName?: string;
  status?: string;
}

const DoctorSelfCheckin = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [kioskUrl, setKioskUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [clinicLabel, setClinicLabel] = useState<string>('');
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);

  const loadKiosk = async () => {
    setLoading(true);
    try {
      const [{ data: kiosk }, { data: ctx }] = await Promise.all([
        api.get('/qms/walk-in-kiosk'),
        api.get('/qms/context'),
      ]);
      if (kiosk?.success) {
        const url = `${window.location.origin}${kiosk.kioskPath}`;
        setKioskUrl(url);
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2, errorCorrectionLevel: 'M' });
        setQrDataUrl(dataUrl);
      }
      if (ctx?.success) setClinicLabel(ctx.context?.label || '');
    } catch (err) {
      console.error('Failed to load self check-in kiosk', err);
      toast({ title: 'Failed to load self check-in link', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadQueue = async () => {
    setConsoleLoading(true);
    try {
      const { data } = await api.get('/qms/console');
      if (data?.success) setEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to load queue', err);
    } finally {
      setConsoleLoading(false);
    }
  };

  useEffect(() => { loadKiosk(); loadQueue(); }, []);

  const copyLink = () => {
    if (!kioskUrl) return;
    navigator.clipboard.writeText(kioskUrl);
    toast({ title: 'Link copied' });
  };

  return (
    <MainLayoutdoctor>
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="h-6 w-6 text-emerald-500" />
            Patient Self Check-in
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Share this link or QR code with walk-in patients{clinicLabel ? ` at ${clinicLabel}` : ''} — they register themselves (phone or Aadhaar), no reception staff needed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Self check-in kiosk</CardTitle>
            <CardDescription>Print this QR at reception, put it on a camp banner, or share it on WhatsApp — patients scan it and register themselves in seconds, no queueing at a desk.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !kioskUrl ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Could not load a check-in link. Try refreshing.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {qrDataUrl && (
                  <img src={qrDataUrl} alt="Self check-in QR code" className="w-48 h-48 rounded-lg border" />
                )}
                <div className="flex-1 space-y-3 w-full">
                  <div className="text-xs break-all p-2.5 rounded-lg bg-muted font-mono">{kioskUrl}</div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={copyLink}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy link</Button>
                    {qrDataUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={qrDataUrl} download="self-checkin-qr.png"><Download className="h-3.5 w-3.5 mr-1.5" /> Download QR</a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <a href={kioskUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open kiosk</a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Today's waiting list</span>
              <Button size="icon" variant="ghost" onClick={loadQueue} disabled={consoleLoading}>
                <RefreshCw className={`h-4 w-4 ${consoleLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No one checked in yet today.</p>
            ) : (
              <div className="divide-y">
                {entries.map((e) => (
                  <div key={e.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{e.patientName || 'Patient'}</p>
                      <p className="text-xs text-muted-foreground">Token {e.tokenNumber || e.id}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{e.status || 'waiting'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayoutdoctor>
  );
};

export default DoctorSelfCheckin;

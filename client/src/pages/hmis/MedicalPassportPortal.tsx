import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, QrCode, Share2, Loader2 } from 'lucide-react';
import { getMedicalPassport, shareMedicalPassport, getPassportByToken } from '@/services/careos.service';
import { HEALTH_OS } from '@/config/brand';

export default function MedicalPassportPortal() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [passport, setPassport] = useState<any>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [sharedView, setSharedView] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const pid = Number(patientId);

  useEffect(() => {
    if (!pid) return;
    getMedicalPassport(pid).then((r) => setPassport(r?.data)).catch(() => {}).finally(() => setLoading(false));
  }, [pid]);

  const share = async () => {
    const res = await shareMedicalPassport(pid, { purpose: 'cross_border_care', expiresInHours: 72 });
    setShareToken(res?.data?.shareToken || null);
  };

  const loadByToken = async () => {
    if (!accessToken.trim()) return;
    const res = await getPassportByToken(accessToken.trim());
    setSharedView(res?.data);
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold">{HEALTH_OS.brandLine} — Medical Passport</h1>
            <p className="text-sm text-muted-foreground">Patient-owned portable health profile</p>
          </div>
        </div>

        {passport && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{passport.careos_patient_id}</span>
                <Badge>Your Passport</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {passport.summary_text && <p><strong>Summary:</strong> {passport.summary_text}</p>}
              <div>
                <strong>Medications</strong>
                <ul className="list-disc ml-4 mt-1">
                  {(passport.medications || []).slice(0, 8).map((m: any, i: number) => (
                    <li key={i}>{m.name || m.drug_name || JSON.stringify(m)}</li>
                  ))}
                </ul>
              </div>
              <Button onClick={share} className="w-full"><Share2 className="h-4 w-4 mr-2" /> Share with care team (72h token)</Button>
              {shareToken && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 break-all">
                  <p className="text-xs text-teal-800 font-medium flex items-center gap-1"><QrCode className="h-3 w-3" /> Share token</p>
                  <code className="text-xs">{shareToken}</code>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Access shared passport</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Paste share token…" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
            <Button onClick={loadByToken}>View</Button>
          </CardContent>
          {sharedView && (
            <CardContent className="border-t text-sm space-y-1">
              <p><strong>Purpose:</strong> {sharedView.purpose}</p>
              <p><strong>Patient ID:</strong> {sharedView.careos_patient_id}</p>
              <p>{sharedView.summary_text}</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

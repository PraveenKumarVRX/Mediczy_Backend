import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HeartPulse, Loader2 } from 'lucide-react';
import { generateNurseHandover } from '@/services/hospitalOs.service';

export default function NurseHandoverPage() {
  const [wardId, setWardId] = useState('');
  const [shift, setShift] = useState('day');
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await generateNurseHandover(wardId ? Number(wardId) : undefined, shift);
      setBrief(r?.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <HeartPulse className="h-5 w-5 text-rose-600" />
        AI Nurse Handover (Pillar 7)
      </h2>
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Ward ID (optional)" value={wardId} onChange={(e) => setWardId(e.target.value)} className="max-w-[140px]" />
        <select className="border rounded-md px-3 text-sm" value={shift} onChange={(e) => setShift(e.target.value)}>
          <option value="day">Day</option>
          <option value="evening">Evening</option>
          <option value="night">Night</option>
        </select>
        <Button onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate SBAR brief'}
        </Button>
      </div>
      {brief && (
        <Card>
          <CardHeader><CardTitle className="text-base">Shift handover</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{brief.summary || brief.sbar || JSON.stringify(brief, null, 2)}</CardContent>
        </Card>
      )}
    </div>
  );
}

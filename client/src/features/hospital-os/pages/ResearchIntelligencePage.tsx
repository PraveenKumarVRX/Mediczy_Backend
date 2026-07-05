import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Microscope } from 'lucide-react';
import { matchHospitalOsTrials, detectResearchPatterns } from '@/services/hospitalOs.service';

export default function ResearchIntelligencePage() {
  const [patientId, setPatientId] = useState('');
  const [trials, setTrials] = useState<any>(null);
  const [patterns, setPatterns] = useState<any>(null);

  const match = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    const r = await matchHospitalOsTrials(pid);
    setTrials(r?.data);
  };

  const detect = async () => {
    const r = await detectResearchPatterns(30);
    setPatterns(r?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Microscope className="h-5 w-5 text-indigo-600" />
        Research Intelligence (Pillar 18)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Trial matching</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <Button onClick={match}>Match trials</Button>
        </CardContent>
      </Card>
      {trials && <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">{JSON.stringify(trials, null, 2)}</pre>}
      <Button variant="outline" onClick={detect}>Detect emerging patterns (30d)</Button>
      {patterns && <pre className="text-xs bg-violet-50 p-3 rounded">{JSON.stringify(patterns, null, 2)}</pre>}
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Network } from 'lucide-react';
import { buildKnowledgeGraph, queryKnowledgeGraph } from '@/services/hospitalOs.service';

export default function KnowledgeGraphExplorerPage() {
  const [patientId, setPatientId] = useState('');
  const [graph, setGraph] = useState<any>(null);
  const [query, setQuery] = useState<any>(null);

  const build = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    const r = await buildKnowledgeGraph(pid);
    setGraph(r?.data);
  };

  const search = async () => {
    const r = await queryKnowledgeGraph({ nodeType: 'patient', externalId: patientId });
    setQuery(r?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Network className="h-5 w-5 text-indigo-600" />
        Knowledge Graph (Pillar 19)
      </h2>
      <div className="flex gap-2">
        <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="max-w-xs" />
        <Button onClick={build}>Build subgraph</Button>
        <Button variant="outline" onClick={search}>Query</Button>
      </div>
      {graph && (
        <Card>
          <CardHeader><CardTitle className="text-base">Patient subgraph</CardTitle></CardHeader>
          <CardContent><pre className="text-xs overflow-auto max-h-96">{JSON.stringify(graph, null, 2)}</pre></CardContent>
        </Card>
      )}
      {query && (
        <Card>
          <CardHeader><CardTitle className="text-base">Query results</CardTitle></CardHeader>
          <CardContent><pre className="text-xs overflow-auto">{JSON.stringify(query, null, 2)}</pre></CardContent>
        </Card>
      )}
    </div>
  );
}

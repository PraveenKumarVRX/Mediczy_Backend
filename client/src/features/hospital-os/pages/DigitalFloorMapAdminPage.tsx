import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Map } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FloorNode {
  id: string;
  name: string;
  floor: string;
  utilizationPct: number;
  status: string;
}

export default function DigitalFloorMapAdminPage() {
  const [nodes, setNodes] = useState<FloorNode[]>([]);
  const [floor, setFloor] = useState('all');

  const load = useCallback(async () => {
    const res = await fetch(`/api/display/floor-map?floor=${encodeURIComponent(floor)}`);
    const json = await res.json();
    if (json.success) setNodes(json.nodes || []);
  }, [floor]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Map className="h-5 w-5 text-teal-600" />
        Digital Twin Floor Map (HOS-002)
      </h2>
      <p className="text-sm text-muted-foreground">
        <Link to="/display/floor-map" className="text-teal-600 underline">Open fullscreen display →</Link>
      </p>
      <div className="flex gap-2">
        {['all', 'G', '2', '3'].map((f) => (
          <Button key={f} size="sm" variant={floor === f ? 'default' : 'outline'} onClick={() => setFloor(f)}>
            {f === 'all' ? 'All' : `Floor ${f}`}
          </Button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {nodes.map((n) => (
          <Card key={n.id}>
            <CardHeader className="pb-1"><CardTitle className="text-sm">{n.name}</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Floor {n.floor} · {n.utilizationPct}% · {n.status}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

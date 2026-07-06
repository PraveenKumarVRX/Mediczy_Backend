import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot } from 'lucide-react';

export default function RoboticsGatewayPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Bot className="h-5 w-5 text-slate-600" />
        Robotics & AGV Gateway (Pillar 17)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Wave 4 — Partner integration</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Robot OS abstraction layer is scaffolded on the backend. AGV pilots require hardware partner contracts.</p>
          <p>Capabilities: specimen transport, linen delivery, pharmacy robot dispense (when connected).</p>
        </CardContent>
      </Card>
    </div>
  );
}

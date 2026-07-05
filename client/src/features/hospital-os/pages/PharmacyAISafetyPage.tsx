import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pill } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PharmacyAISafetyPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Pill className="h-5 w-5 text-green-600" />
        Pharmacy AI Safety (Pillar 9)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">CDSS at dispense</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>Drug interaction checks run at pharmacy dispense via existing CDSS pipeline.</p>
          <Link to="/hospital/pharmacy-dispense" className="text-teal-600 underline">Open pharmacy dispense →</Link>
          <Link to="/hospital/emar" className="text-teal-600 underline block">Open eMAR →</Link>
        </CardContent>
      </Card>
    </div>
  );
}

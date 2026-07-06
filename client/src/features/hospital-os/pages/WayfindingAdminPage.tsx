import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WayfindingAdminPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Navigation className="h-5 w-5 text-blue-600" />
        AI Wayfinding (HOS-003)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Lobby kiosk wayfinding</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>Voice and touch wayfinding for patients and visitors.</p>
          <Link to="/kiosk/wayfinding" className="text-teal-600 underline">Open wayfinding kiosk →</Link>
        </CardContent>
      </Card>
    </div>
  );
}

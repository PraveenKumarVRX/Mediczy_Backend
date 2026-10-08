import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import OtExpertConsole from './OtExpertConsole';

const LINKS = [
  { label: 'Bedside display + nurse video', href: '/display/bedside' },
  { label: 'Family video kiosk', href: '/kiosk/family-video' },
  { label: 'ER tele-triage booth', href: '/kiosk/er-triage' },
  { label: 'OT proctor wall', href: '/display/ot-proctor' },
  { label: 'Doctor video consult', href: '/doctor/video' },
];

export default function TelepresenceHubPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Video className="h-5 w-5 text-red-600" />
        Telepresence Hub (Pillar 11)
      </h2>
      <p className="text-sm text-muted-foreground">LiveKit-powered clinical video surfaces across the hospital.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {LINKS.map((l) => (
          <Card key={l.href}>
            <CardContent className="pt-4">
              <Link to={l.href} className="text-sm font-medium text-teal-700 hover:underline">{l.label}</Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <OtExpertConsole />
    </div>
  );
}

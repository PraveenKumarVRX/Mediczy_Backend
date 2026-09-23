import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Video } from 'lucide-react';

/**
 * WP-0.3b: this screen used to show one hardcoded "scheduled follow-up" card for a patient who
 * doesn't exist (Priya Singh, a fabricated admission number). No backend lists real post-discharge
 * teleconsult follow-ups yet, so per the plan this is now an honest empty state rather than inventing
 * one.
 */
export default function HospitalTeleconsult() {
  return (
    <HospitalLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Video className="h-6 w-6 text-sky-600" /> Post-Discharge Teleconsultation
        </h1>
        <p className="text-slate-500 text-sm">Follow-up video visits for discharged patients — integrated with doctor portal.</p>

        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Video}
              title="No scheduled follow-ups"
              description="Post-discharge teleconsultation follow-ups will appear here once this screen is connected to a real scheduling endpoint — it isn't yet."
            />
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}

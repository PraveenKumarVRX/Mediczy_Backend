import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

const CHECKLIST = [
  'Medications explained and prescriptions ready',
  'Follow-up appointment scheduled',
  'Discharge summary shared with primary doctor',
  'Transport and home care arranged if needed',
];

export default function FamilyDischarge() {
  const authed = !!sessionStorage.getItem('family_patient_id');
  if (!authed) return <Navigate to="/family/login" replace />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Discharge planning</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting ready to go home</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHECKLIST.map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">
            Status updates appear here when your care team marks discharge milestones complete.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

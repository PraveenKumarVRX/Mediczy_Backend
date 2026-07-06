import { Navigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

export default function FamilyMessages() {
  const { id } = useParams<{ id: string }>();
  const authed = sessionStorage.getItem('family_patient_id') === id;
  if (!authed) return <Navigate to="/family/login" replace />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Messages</h2>
      <Card>
        <CardContent className="pt-8 pb-8 text-center">
          <MessageCircle className="h-10 w-10 text-rose-300 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Secure messaging with your care team is coming soon. For urgent questions, please contact the nursing station.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

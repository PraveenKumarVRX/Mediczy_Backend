import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TOPICS = [
  { title: 'Understanding your hospital stay', body: 'Your loved one is receiving coordinated care from doctors, nurses, and specialists working together.' },
  { title: 'Visiting hours & support', body: 'Please check with the nursing station for current visiting guidelines and how you can support recovery.' },
  { title: 'When to ask questions', body: 'Your nurse can explain daily plans in plain language. For clinical decisions, the attending doctor is the final authority.' },
];

export default function FamilyEducation() {
  const authed = !!sessionStorage.getItem('family_patient_id');
  if (!authed) return <Navigate to="/family/login" replace />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Education & support</h2>
      {TOPICS.map((t) => (
        <Card key={t.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 leading-relaxed">{t.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Camera, Shield, AlertTriangle } from 'lucide-react';

export default function HospitalSecurity() {
  const navigate = useNavigate();

  return (
    <HospitalLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lock className="h-6 w-6 text-slate-700" /> Security & Surveillance</h1>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: 'CCTV Command', desc: 'Live camera feeds & incident log', path: '/security/cctv', icon: Camera },
            { title: 'Access Control', desc: 'Staff badges & zone permissions', path: '/security/access', icon: Shield },
            { title: 'Incident Reports', desc: 'Security events & escalation', path: '/security/incidents', icon: AlertTriangle },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.path} className="cursor-pointer hover:shadow-md" onClick={() => navigate(item.path)}>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4" />{item.title}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-slate-500">{item.desc}</p></CardContent>
              </Card>
            );
          })}
        </div>
        <Button variant="outline" onClick={() => navigate('/security/dashboard')}>Open Full Security Portal</Button>
      </div>
    </HospitalLayout>
  );
}

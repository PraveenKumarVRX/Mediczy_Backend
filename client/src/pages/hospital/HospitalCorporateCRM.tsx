import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Users, Heart, BarChart3 } from 'lucide-react';

export default function HospitalCorporateCRM() {
  const navigate = useNavigate();

  return (
    <HospitalLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-orange-600" /> Corporate Lounge & CRM</h1>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: 'Corporate Contracts', desc: 'Employer health plans & TPA', path: '/hospital/corporate-management', icon: Building2 },
            { title: 'Health Checkup Camps', desc: 'Executive screening packages', path: '/corporate/health-checkups', icon: Heart },
            { title: 'Corporate CRM', desc: 'Leads, campaigns & lounge bookings', path: '/crm/dashboard', icon: Users },
            { title: 'Analytics', desc: 'Corporate utilization reports', path: '/hospital/corporate-management', icon: BarChart3 },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="cursor-pointer hover:shadow-md" onClick={() => navigate(item.path)}>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4" />{item.title}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-slate-500">{item.desc}</p></CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </HospitalLayout>
  );
}

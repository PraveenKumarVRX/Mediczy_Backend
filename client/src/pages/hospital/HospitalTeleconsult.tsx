import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Calendar, User } from 'lucide-react';

export default function HospitalTeleconsult() {
  const navigate = useNavigate();

  return (
    <HospitalLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Video className="h-6 w-6 text-sky-600" /> Post-Discharge Teleconsultation
        </h1>
        <p className="text-slate-500 text-sm">Follow-up video visits for discharged patients — integrated with doctor portal.</p>

        <Card className="border-sky-200 bg-sky-50">
          <CardHeader><CardTitle className="text-base">Scheduled follow-up — Priya Singh</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600 flex items-center gap-2"><Calendar className="h-4 w-4" /> Tomorrow 10:00 AM · Surgical OPD follow-up</p>
            <p className="text-sm text-slate-600 flex items-center gap-2"><User className="h-4 w-4" /> Dr. Patel · Admission IP2026000001</p>
            <div className="flex gap-2 pt-2">
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={() => navigate('/doctor/video')}>Start Video Consult</Button>
              <Button variant="outline" onClick={() => navigate('/hmis/patient/1/follow-up')}>Follow-up Plan</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}

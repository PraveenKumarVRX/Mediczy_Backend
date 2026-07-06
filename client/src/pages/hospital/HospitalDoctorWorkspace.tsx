import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Stethoscope, Mic, Brain, Sparkles, Video, FileText, Activity,
  ClipboardList, ArrowRight, User
} from 'lucide-react';

const TOOLS = [
  { title: 'Doctor Dashboard', desc: 'Appointments, patients, rounds', path: '/doctor/dashboard', icon: Stethoscope, color: 'bg-blue-600' },
  { title: 'SOAP Clinical Notes', desc: 'Progress notes, sign & ICD-10', path: '/doctor/clinical-workspace', icon: ClipboardList, color: 'bg-purple-600' },
  { title: 'IP Progress Notes', desc: 'Bedside ward round documentation', path: '/hospital/patient/1/doctor-notes', icon: FileText, color: 'bg-teal-700' },
  { title: 'AI Voice Scribe', desc: 'Ambient IPD/OPD documentation', path: '/doctor/voice-scribe?docType=ipd_notes', icon: Mic, color: 'bg-violet-600', badge: 'AI' },
  { title: 'Clinical CDSS', desc: 'AI triage & decision support', path: '/doctor/triage', icon: Brain, color: 'bg-fuchsia-600', badge: 'AI' },
  { title: 'Voice Assistant', desc: 'Hands-free orders & queries', path: '/doctor/assistant', icon: Sparkles, color: 'bg-cyan-600', badge: 'AI' },
  { title: 'Video Consult', desc: 'Teleconsultation with patients', path: '/doctor/video', icon: Video, color: 'bg-sky-600' },
  { title: 'Prescriptions', desc: 'e-Prescribing & drug checks', path: '/doctor/prescriptions', icon: FileText, color: 'bg-emerald-600' },
  { title: 'Patient Imaging', desc: 'RIS/PACS viewer', path: '/doctor/imaging', icon: Activity, color: 'bg-slate-700' },
  { title: 'IP Workspace', desc: 'Inpatient clinical view', path: '/hospital/patient/1/healthos', icon: User, color: 'bg-teal-600' },
];

export default function HospitalDoctorWorkspace() {
  const navigate = useNavigate();

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-teal-600" /> Doctor Workspace
          </h1>
          <p className="text-slate-500 text-sm mt-1">Clinical cockpit with AI scribe, CDSS, and teleconsultation</p>
        </div>

        <Card className="border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800">Demo patient: Priya Singh</p>
              <p className="text-sm text-slate-600">Bed GEN-11 · Acute appendicitis · Post-op Day 2</p>
            </div>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/hospital/patient/1/healthos')}>
              Open IP Workspace <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4">
          {TOOLS.map(t => {
            const Icon = t.icon;
            return (
              <Card key={t.path} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(t.path)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${t.color} text-white`}><Icon className="h-4 w-4" /></div>
                    <span className="flex-1">{t.title}</span>
                    {t.badge && <Badge className="bg-violet-100 text-violet-700">{t.badge}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-slate-500">{t.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </HospitalLayout>
  );
}

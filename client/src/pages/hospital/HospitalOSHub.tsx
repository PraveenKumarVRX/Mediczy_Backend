/**
 * Hospital OS Hub — unified launcher for all HMIS modules (sales demo + production nav).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '@/utils/api';
import {
  LayoutGrid, Bed, UserPlus, Activity, Stethoscope, HeartPulse, Syringe,
  FlaskConical, Pill, Receipt, Shield, Ambulance, Video, Scan, Lock,
  Building2, Users, Brain, Mic, Sparkles, BarChart3, Siren, Monitor,
  ClipboardList, FileText, ArrowRight, RefreshCw, Briefcase, FolderOpen,
  FileHeart, MessageSquare, QrCode, Wallet, UserCog, Package
} from 'lucide-react';

type Module = {
  title: string;
  description: string;
  path: string;
  icon: React.ElementType;
  gradient: string;
  badge?: string;
  external?: boolean;
};

type Section = { label: string; modules: Module[] };

const SECTIONS: Section[] = [
  {
    label: 'Executive Dashboards',
    modules: [
      { title: 'CEO Dashboard', description: 'Revenue, strategy & board KPIs', path: '/hospital/ceo', icon: Briefcase, gradient: 'from-indigo-500 to-purple-600' },
      { title: 'CFO Dashboard', description: 'Cash, AR/AP & payer settlements', path: '/hospital/cfo', icon: Wallet, gradient: 'from-emerald-500 to-teal-600' },
      { title: 'COO Dashboard', description: 'Beds, throughput & operations', path: '/hospital/coo', icon: Activity, gradient: 'from-blue-500 to-cyan-600' },
      { title: 'MS Dashboard', description: 'Clinical governance & NABH', path: '/hospital/ms', icon: UserCog, gradient: 'from-violet-500 to-fuchsia-600' },
    ],
  },
  {
    label: 'Records & Communication',
    modules: [
      { title: 'EMR / EHR', description: 'Electronic health records', path: '/hospital/ehr', icon: FileHeart, gradient: 'from-emerald-500 to-green-600' },
      { title: 'Medical Records (MRD)', description: 'File retrieval & digitization', path: '/hospital/mrd', icon: FolderOpen, gradient: 'from-purple-500 to-violet-600' },
      { title: 'Communication Hub', description: 'SMS, email, WhatsApp, voice', path: '/hospital/communication', icon: MessageSquare, gradient: 'from-sky-500 to-blue-600' },
    ],
  },
  {
    label: 'Patient Journey',
    modules: [
      { title: 'Walk-in Kiosk', description: 'Register · one journey token (T-###) for all depts', path: '/hospital/qms', icon: UserPlus, gradient: 'from-teal-500 to-cyan-600' },
      { title: 'Queue Console', description: 'Call · send token to Lab / Radiology / Pharmacy', path: '/hospital/queue-console', icon: ClipboardList, gradient: 'from-cyan-500 to-teal-600' },
      { title: 'OPD Queue Board', description: 'Live waiting room', path: '/display/queue?zone=opd-waiting', icon: Monitor, gradient: 'from-sky-500 to-blue-600', external: true },
      { title: 'Practice Management', description: 'OPD roster & convert to IPD', path: '/hospital/practice-management', icon: ClipboardList, gradient: 'from-indigo-500 to-violet-600' },
      { title: 'Admit Patient', description: 'ADT with bed reservation', path: '/hospital/adt/admit', icon: Bed, gradient: 'from-blue-500 to-indigo-600' },
      { title: 'QR Wristband Print', description: 'Patient ID band after admission', path: '/hospital/adt/wristband?patientId=1&name=Priya%20Singh&admissionNumber=IP2026000001&bed=GEN-11&ward=General%20Ward%20A', icon: QrCode, gradient: 'from-slate-600 to-zinc-800' },
      { title: 'Ward Dashboard', description: 'Bed map & nurse tasks', path: '/hospital/ward', icon: Activity, gradient: 'from-emerald-500 to-teal-600' },
      { title: 'Live Bed Map', description: 'Reserve & allocate beds', path: '/hospital/beds/map', icon: Bed, gradient: 'from-green-500 to-emerald-600' },
      { title: 'Inpatient Workspace', description: 'Vitals, meds, notes', path: '/hospital/patient/1/healthos', icon: Stethoscope, gradient: 'from-teal-600 to-green-600' },
      { title: 'Discharge Workflow', description: 'Readiness + summary', path: '/hospital/admission/1/discharge', icon: FileText, gradient: 'from-amber-500 to-orange-600' },
    ],
  },
  {
    label: 'Clinical Departments',
    modules: [
      { title: 'ER Triage Queue', description: 'ESI triage & fast-track', path: '/hospital/er/queue', icon: Siren, gradient: 'from-red-500 to-rose-600' },
      { title: 'ICU Command', description: 'Critical care census', path: '/hospital/icu-board', icon: HeartPulse, gradient: 'from-purple-500 to-fuchsia-600' },
      { title: 'OT Command Center', description: 'Surgery schedule & anesthesia', path: '/hospital/ot/command-center', icon: Syringe, gradient: 'from-violet-500 to-purple-600' },
      { title: 'Nurse Station', description: 'Vitals, meds, tasks', path: '/hospital/nurse-station', icon: HeartPulse, gradient: 'from-pink-500 to-rose-600' },
      { title: 'Doctor Workspace', description: 'Rounds, orders, AI tools', path: '/hospital/doctor-workspace', icon: Stethoscope, gradient: 'from-cyan-500 to-blue-600' },
      { title: 'eMAR', description: 'Medication administration', path: '/hospital/emar', icon: Pill, gradient: 'from-blue-600 to-indigo-700' },
      { title: 'e-Charting', description: 'Nursing documentation', path: '/hospital/echart', icon: FileText, gradient: 'from-slate-600 to-slate-800' },
      { title: 'Doctor Progress Notes', description: 'IPD SOAP & ward rounds', path: '/hospital/patient/1/doctor-notes', icon: Stethoscope, gradient: 'from-cyan-600 to-teal-700' },
      { title: 'Lab Orders', description: 'IP lab requisitions', path: '/hospital/lab-order', icon: FlaskConical, gradient: 'from-amber-500 to-yellow-600' },
      { title: 'RIS / PACS', description: 'DICOM imaging worklist', path: '/hospital/radiology', icon: Scan, gradient: 'from-slate-500 to-zinc-700' },
    ],
  },
  {
    label: 'Revenue & Insurance',
    modules: [
      { title: 'IP Billing', description: 'Billing suite · stations · PGI · audit', path: '/hospital/billing', icon: Receipt, gradient: 'from-emerald-600 to-green-700' },
      { title: 'Insurance Claims', description: 'Pre-auth & NHCX', path: '/hospital/insurance-claims', icon: Shield, gradient: 'from-blue-500 to-sky-600' },
      { title: 'Pharmacy Dispense', description: 'IP pharmacy queue', path: '/hospital/pharmacy-dispense', icon: Pill, gradient: 'from-green-500 to-lime-600' },
      { title: 'Corporate Health', description: 'Employer contracts & checkups', path: '/hospital/corporate-management', icon: Building2, gradient: 'from-orange-500 to-amber-600' },
      { title: 'CRM & Lounge', description: 'Corporate lounge & leads', path: '/hospital/corporate-crm', icon: Users, gradient: 'from-rose-500 to-pink-600' },
    ],
  },
  {
    label: 'HealthOS',
    modules: [
      { title: 'Hospital OS 2035', description: 'Voice, twins, smart rooms & spatial ops', path: '/hospital/os/voice', icon: Sparkles, gradient: 'from-violet-600 to-indigo-700', badge: '2035' },
      { title: 'HealthOS Platform', description: 'Living patient workspace & care network', path: '/hospital/healthos', icon: HeartPulse, gradient: 'from-teal-500 to-emerald-600', badge: 'NEW' },
      { title: 'Living Patient Workspace', description: 'Unified patient timeline & care team', path: '/hospital/patient/1/healthos', icon: Stethoscope, gradient: 'from-cyan-500 to-teal-600' },
      { title: 'Hospital Copilot', description: 'AI assistant for hospital workflows', path: '/hospital/copilot', icon: Sparkles, gradient: 'from-violet-500 to-purple-600', badge: 'AI' },
      { title: 'Care Command Center', description: 'Real-time ops & clinical KPIs', path: '/hospital/command-center', icon: LayoutGrid, gradient: 'from-teal-600 to-cyan-700' },
    ],
  },
  {
    label: 'AI & Telehealth',
    modules: [
      { title: 'AI Scribe', description: 'Ambient voice-to-note', path: '/hospital/ai-scribe', icon: Mic, gradient: 'from-violet-500 to-indigo-600', badge: 'AI' },
      { title: 'Clinical Intelligence', description: 'Live vitals · ECG · NEWS2 · SmartPharma CDSS', path: '/hospital/clinical-intelligence', icon: Activity, gradient: 'from-teal-500 to-cyan-600', badge: 'AI' },
      { title: 'Clinical CDSS', description: 'Triage & decision support', path: '/hospital/clinical-cdss', icon: Brain, gradient: 'from-fuchsia-500 to-purple-600', badge: 'AI' },
      { title: 'Voice Assistant', description: 'Hands-free doctor commands', path: '/hospital/voice-assistant', icon: Sparkles, gradient: 'from-cyan-400 to-teal-500', badge: 'AI' },
      { title: 'Post-Discharge Tele', description: 'Follow-up video consult', path: '/hospital/teleconsult', icon: Video, gradient: 'from-sky-400 to-blue-500' },
      { title: 'AI Operations', description: 'Predictive ops hub', path: '/hospital/ai-ops', icon: BarChart3, gradient: 'from-teal-500 to-emerald-600', badge: 'AI' },
    ],
  },
  {
    label: 'Operations & Security',
    modules: [
      { title: 'Ambulance Dispatch', description: 'Fleet & ETA tracking', path: '/hospital/ambulance', icon: Ambulance, gradient: 'from-red-400 to-orange-500' },
      { title: 'Asset Tracking', description: 'RFID/RTLS · BLE · GPS live map', path: '/hospital/asset-tracking', icon: Package, gradient: 'from-amber-500 to-orange-600', badge: 'IoT' },
      { title: 'Security & CCTV', description: 'Surveillance command', path: '/hospital/security', icon: Lock, gradient: 'from-gray-600 to-slate-800' },
      { title: 'Command Center', description: 'Hospital-wide KPIs', path: '/hospital/command-center', icon: LayoutGrid, gradient: 'from-teal-600 to-cyan-700' },
      { title: 'Discharge Board', description: 'Pending discharges', path: '/hospital/discharge-board', icon: FileText, gradient: 'from-amber-400 to-orange-500' },
    ],
  },
];

export default function HospitalOSHub() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ beds: 0, occupied: 0, queue: 0, admissions: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [census, queue, adm] = await Promise.allSettled([
          api.get('/v1/beds/census'),
          fetch('/api/display/queue?zone=opd-waiting').then(r => r.json()),
          api.get('/v1/adt/admissions'),
        ]);
        const c = census.status === 'fulfilled' ? census.value.data?.data : null;
        const q = queue.status === 'fulfilled' ? queue.value : null;
        const a = adm.status === 'fulfilled' ? adm.value.data?.data : null;
        setStats({
          beds: c?.total ?? c?.total_beds ?? 0,
          occupied: c?.occupied ?? 0,
          queue: q?.waiting ?? 0,
          admissions: Array.isArray(a) ? a.length : 0,
        });
      } catch { /* demo stats optional */ }
      finally { setLoading(false); }
    })();
  }, []);

  const open = (m: Module) => {
    if (m.external) window.open(m.path, '_blank');
    else navigate(m.path);
  };

  return (
    <HospitalLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 text-white p-6 md:p-8">
          <div className="relative z-10">
            <p className="text-teal-200 text-sm font-medium tracking-widest uppercase mb-1">Mediqzy Hospital OS</p>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">World-Class HMIS Command Hub</h1>
            <p className="text-teal-100/90 max-w-2xl text-sm md:text-base">
              Every module — admission to discharge, ER to OT, AI scribe to insurance — in one integrated platform.
            </p>
            <div className="flex flex-wrap gap-4 mt-6">
              {[
                { label: 'Beds', value: stats.beds, sub: `${stats.occupied} occupied` },
                { label: 'OPD Waiting', value: stats.queue, sub: 'live queue' },
                { label: 'Active IPD', value: stats.admissions, sub: 'admissions' },
              ].map(s => (
                <div key={s.label} className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 min-w-[100px]">
                  <p className="text-2xl font-bold">{loading ? '—' : s.value}</p>
                  <p className="text-xs text-teal-200">{s.label}</p>
                  <p className="text-[10px] text-teal-300/80">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-teal-500/20 blur-3xl" />
        </div>

        {SECTIONS.map(section => (
          <div key={section.label}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{section.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {section.modules.map(m => {
                const Icon = m.icon;
                return (
                  <Card
                    key={m.path}
                    className="group cursor-pointer border-slate-200 hover:border-teal-300 hover:shadow-lg transition-all duration-200 overflow-hidden"
                    onClick={() => open(m)}
                  >
                    <CardContent className="p-0">
                      <div className={`h-1.5 bg-gradient-to-r ${m.gradient}`} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${m.gradient} text-white shadow-sm`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          {m.badge && <Badge className="bg-violet-100 text-violet-700 text-[10px]">{m.badge}</Badge>}
                        </div>
                        <h3 className="font-semibold text-slate-800 mt-3 group-hover:text-teal-700 transition-colors">{m.title}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.description}</p>
                        <div className="flex items-center gap-1 mt-3 text-xs text-teal-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          Open <ArrowRight className="h-3 w-3" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex justify-center pt-4">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh live stats
          </Button>
        </div>
      </div>
    </HospitalLayout>
  );
}

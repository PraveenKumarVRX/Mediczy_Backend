import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { BrainCircuit, Sparkles, Mic, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const AI_TOOLS = [
  {
    title: 'Clinical Knowledge (CDSS)',
    description: 'Guidelines, drug interactions, differential diagnosis, ICD lookup, and knowledge upload.',
    icon: BrainCircuit,
    path: '/doctor/assist',
    gradient: 'from-cyan-600 to-blue-700',
    badge: 'Ask',
  },
  {
    title: 'iSHA Voice Assistant',
    description: 'Hands-free copilot with morning briefing, patient lookup, and voice navigation.',
    icon: Sparkles,
    path: '/doctor/assistant',
    gradient: 'from-violet-600 to-purple-700',
    badge: 'Talk',
  },
  {
    title: 'Voice Scribe',
    description: 'Ambient documentation — turn consult audio into structured SOAP notes and prescriptions.',
    icon: Mic,
    path: '/doctor/voice-scribe',
    gradient: 'from-teal-600 to-emerald-700',
    badge: 'Document',
  },
];

export default function DoctorAIHub() {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-[#0f2847] to-slate-900 border border-cyan-500/20 p-8 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(45,212,191,0.12),_transparent_55%)]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300 font-bold flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5" />
              AI Hub
            </p>
            <h1 className="text-2xl font-extrabold">Clinical AI Toolkit</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">
              Three focused AI surfaces — ask clinical questions, talk to iSHA, or document encounters.
              Hospital operations AI lives under Hospital Copilot for affiliated doctors.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-1">
          {AI_TOOLS.map((tool) => (
            <Link key={tool.path} to={tool.path} className="group block">
              <div className="flex items-center gap-5 p-5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 hover:border-teal-300 dark:hover:border-teal-600/50 hover:shadow-lg hover:shadow-teal-500/10 transition-all">
                <div className={cn('p-4 rounded-2xl bg-gradient-to-br text-white shadow-lg shrink-0', tool.gradient)}>
                  <tool.icon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {tool.title}
                    </h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                      {tool.badge}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{tool.description}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-teal-500 group-hover:translate-x-1 transition-all shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

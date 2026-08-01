import { ReactNode } from 'react';
import PortalQmsPage from '@/components/qms/PortalQmsPage';

/** Minimal shell so hospital QMS reuses the shared portal page. */
function HospitalQmsLayout({ children }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-teal-400/80 text-xs uppercase tracking-[0.2em] mb-4">Hospital OS · QMS</p>
        <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-xl p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function HospitalQmsPage() {
  return (
    <PortalQmsPage
      portal="hospital"
      title="Hospital QMS"
      subtitle="OPD tokens · Aadhaar QR check-in · call next"
      Layout={HospitalQmsLayout}
    />
  );
}

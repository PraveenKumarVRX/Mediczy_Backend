import { Link, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ArrowLeft, Sparkles } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { HOSPITAL_OS_NAV, hospitalOsPath } from '@/config/hospitalOsNav.config';

function isActive(pathname: string, segment: string) {
  const target = hospitalOsPath(segment);
  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function HospitalOSShell() {
  const location = useLocation();

  return (
    <HospitalLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="border-b bg-white sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/hospital/os" className="text-muted-foreground hover:text-slate-800">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Sparkles className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-800">Hospital OS 2035</h1>
              <p className="text-xs text-muted-foreground">Phases 4–10 — advanced intelligence & spatial ops</p>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-4">
          <nav className="lg:w-56 shrink-0 space-y-4">
            {HOSPITAL_OS_NAV.map((section) => (
              <div key={section.phase}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1">
                  {section.title}
                </p>
                <div className="bg-white rounded-lg border p-1 space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const href = hospitalOsPath(item.segment);
                    const active = isActive(location.pathname, item.segment);
                    return (
                      <Link
                        key={item.key}
                        to={href}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors',
                          active ? 'bg-violet-50 text-violet-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </HospitalLayout>
  );
}

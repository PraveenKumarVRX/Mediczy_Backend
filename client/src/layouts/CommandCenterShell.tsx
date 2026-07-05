import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarChart2, RefreshCw } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { COMMAND_CENTER_NAV } from '@/config/commandNav.config';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';
import { LiveIndicator } from '@/components/clinical/LiveIndicator';

const BASE = '/hospital/command-center';

function sectionPath(segment: string) {
  if (!segment) return BASE;
  return `${BASE}/${segment}`;
}

function isActive(pathname: string, segment: string) {
  const target = sectionPath(segment);
  if (!segment) return pathname === BASE || pathname === `${BASE}/`;
  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function CommandCenterShell() {
  const location = useLocation();
  const { loading, lastUpdated, refresh } = useCommandCenterData();

  return (
    <HospitalLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="border-b bg-white sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <BarChart2 className="h-5 w-5 text-teal-600 shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <h1 className="text-lg font-bold text-slate-800">Leadership Command Center</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LiveIndicator live={!loading} />
                {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString('en-IN')}</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-4">
          <nav className="lg:w-52 shrink-0">
            <div className="bg-white rounded-lg border p-2 space-y-0.5 sticky top-28">
              {COMMAND_CENTER_NAV.map((item) => {
                const Icon = item.icon;
                const href = sectionPath(item.segment);
                const active = isActive(location.pathname, item.segment);
                return (
                  <Link
                    key={item.key}
                    to={href}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                      active ? 'bg-teal-50 text-teal-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </HospitalLayout>
  );
}

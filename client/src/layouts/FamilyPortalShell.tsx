import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { HeartPulse, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FAMILY_NAV = [
  { label: 'Home', segment: '' },
  { label: 'Progress', segment: 'progress' },
  { label: 'Education', segment: 'education' },
  { label: 'Discharge', segment: 'discharge' },
  { label: 'Messages', segment: 'messages' },
];

function basePath(patientId: string) {
  return `/family/patient/${patientId}`;
}

export default function FamilyPortalShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const match = location.pathname.match(/\/family\/patient\/(\d+)/);
  const patientId = match?.[1];

  const logout = () => {
    sessionStorage.removeItem('family_patient_id');
    sessionStorage.removeItem('family_access');
    navigate('/family/login');
  };

  if (!patientId) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <HeartPulse className="h-6 w-6 text-rose-500" />
          <div className="flex-1">
            <h1 className="font-semibold text-slate-800">Family Care Portal</h1>
            <p className="text-xs text-muted-foreground">Plain-language updates from your care team</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" />
            Sign out
          </Button>
        </div>
        <nav className="max-w-3xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          {FAMILY_NAV.map((item) => {
            const href = item.segment ? `${basePath(patientId)}/${item.segment}` : basePath(patientId);
            const active = location.pathname === href || location.pathname.startsWith(`${href}/`);
            return (
              <Link
                key={item.segment}
                to={href}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm whitespace-nowrap',
                  active ? 'bg-rose-100 text-rose-800 font-medium' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-3xl mx-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

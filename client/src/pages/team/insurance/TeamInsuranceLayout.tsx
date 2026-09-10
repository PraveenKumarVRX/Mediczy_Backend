// Shared dark-sidebar layout for the Insurance RFQ pages under the Team
// module. Same visual design as CRM's CRMLayout (client/src/pages/crm/
// CRMModulePages.tsx) — these pages moved here from CRM login on
// 2026-09-10 (insurance/RFQ/distribution isn't a hospital-CRM function;
// the CRM role model — business_head/marketing_head/telecaller/etc. — has
// no underwriting concept at all). TeamGuard already gates the route
// itself (permission="Insurance RFQ Management"); this component's own
// teamToken check is a defense-in-depth fallback, matching how CRMLayout
// did the same for crmToken.
import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  ClipboardList, Handshake, Building2, IndianRupee, Landmark,
  LayoutGrid, Bell, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useLogout } from '@/hooks/auth';

const sidebarNav = [
  { section: 'INSURANCE', items: [
    { icon: ClipboardList, label: 'RFQs', path: '/team/rfqs' },
  ]},
  { section: 'DISTRIBUTION', items: [
    { icon: Handshake, label: 'Agents', path: '/team/agents' },
    { icon: Building2, label: 'Agencies', path: '/team/agencies' },
    { icon: IndianRupee, label: 'Commissions', path: '/team/commissions' },
    { icon: Landmark, label: 'Corp Plans', path: '/team/corporate-plans' },
  ]},
];

export function TeamInsuranceLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const logoutMutation = useLogout();
  const [teamUser, setTeamUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('teamToken');
    if (!token) { navigate('/team/login'); return; }
    try { const d = localStorage.getItem('teamUserData'); if (d) setTeamUser(JSON.parse(d)); } catch {}
  }, [navigate]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => navigate('/team/login') });
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20 flex-shrink-0">
            <Landmark className="h-4.5 w-4.5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <span className="text-sm font-bold text-white block">Mediqzy Insurance</span>
              <span className="text-[9px] text-violet-400/60 uppercase tracking-[0.15em]">RFQ Desk</span>
            </div>
          )}
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-5 overflow-y-auto">
        {sidebarNav.map(({ section, items }) => (
          <div key={section}>
            {!sidebarCollapsed && (
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.18em] px-3 mb-2">{section}</p>
            )}
            <div className="space-y-0.5">
              {items.map(({ icon: Icon, label, path }) => {
                const active = location.pathname === path;
                return (
                  <Link key={path} to={path} onClick={() => setMobileSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200
                      ${active
                        ? 'bg-violet-500/15 text-violet-300 shadow-sm shadow-violet-500/10'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}
                    title={sidebarCollapsed ? label : undefined}
                  >
                    <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-violet-400' : ''}`} />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {teamUser && (
        <div className="p-3 mt-auto">
          <div className={`flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">
              {(teamUser.firstName?.[0] || 'T').toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">{teamUser.firstName} {teamUser.lastName}</p>
                <p className="text-[10px] text-slate-600 truncate">{teamUser.email}</p>
              </div>
            )}
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-600 hover:text-red-400 transition-colors flex-shrink-0" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex">
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-[#0d1120] border-r border-white/[0.06] animate-in slide-in-from-left duration-200">
            <SidebarContent />
          </div>
        </div>
      )}
      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-[#0d1120]/80 backdrop-blur-xl border-r border-white/[0.06] z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        <SidebarContent />
      </aside>
      <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'}`}>
        <header className="sticky top-0 z-30 h-16 bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { if (window.innerWidth < 1024) setMobileSidebarOpen(true); else setSidebarCollapsed(!sidebarCollapsed); }}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-white">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <Bell className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>
        <main className="p-6 pb-24 lg:pb-6">{children}</main>
      </div>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0d1120]/95 backdrop-blur-xl border-t border-white/[0.06] px-2 py-1.5 z-40">
        <div className="flex justify-around">
          {[
            { icon: LayoutGrid, label: 'RFQs', path: '/team/rfqs' },
            { icon: Handshake, label: 'Agents', path: '/team/agents' },
            { icon: Building2, label: 'Agencies', path: '/team/agencies' },
            { icon: IndianRupee, label: 'Commissions', path: '/team/commissions' },
          ].map(({ icon: Icon, label, path }) => {
            const active = location.pathname === path;
            return (
              <Link key={path} to={path} className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-colors ${active ? 'text-violet-400' : 'text-slate-600 hover:text-slate-400'}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[9px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function teamAuthHeaders() {
  const t = localStorage.getItem('teamToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm text-slate-500">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

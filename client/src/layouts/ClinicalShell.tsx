import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, RefreshCw, Video, Brain, Loader2, Sparkles } from 'lucide-react';
import { WORKSPACE_NAV } from '@/config/clinicalNav.config';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';
import { PatientBanner } from '@/components/clinical/PatientBanner';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { useWorkspaceRealtime } from '@/features/workspace/hooks/useWorkspaceRealtime';
import { getClinicalCallToken } from '@/services/workspace.service';
import { PatientCopilotPanel } from '@/features/copilot/PatientCopilotPanel';

function workspaceSectionPath(base: string, segment: string) {
  if (!segment) return base;
  return `${base.replace(/\/$/, '')}/${segment}`;
}

function isSectionActive(pathname: string, base: string, segment: string) {
  const target = workspaceSectionPath(base, segment);
  if (!segment) {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function ClinicalShell() {
  const { patientId } = useParams<{ patientId: string }>();
  const pid = Number(patientId);
  const navigate = useNavigate();
  const paths = useClinicalPaths();
  const location = useLocation();
  const { workspace, loading, error, refresh, actionLoading, setActionLoading } = useWorkspace();
  const [callInfo, setCallInfo] = useState<{ configured?: boolean; room?: string; message?: string } | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useWorkspaceRealtime(pid);

  const basePath = paths.patientHealthos(patientId!);

  const joinCall = async () => {
    setActionLoading('call');
    try {
      const res = await getClinicalCallToken(pid);
      setCallInfo(res?.data || null);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="border-b bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PatientBanner workspace={workspace} patientId={pid} loading={loading && !workspace} />
          <div className="flex gap-2 flex-wrap ml-auto">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button size="sm" onClick={joinCall} disabled={actionLoading === 'call'}>
              <Video className="h-4 w-4 mr-1" />
              One-touch Call
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCopilotOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1" />
              Copilot
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={paths.healthosHub}>
                <Brain className="h-4 w-4 mr-1" />
                Platform
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        </div>
      )}

      {callInfo && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm">
            {callInfo.configured
              ? <>LiveKit room <strong>{callInfo.room}</strong> ready — connect with your video client.</>
              : callInfo.message}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-4">
        <nav className="lg:w-52 shrink-0">
          <div className="bg-white rounded-lg border p-2 space-y-0.5 sticky top-28">
            {WORKSPACE_NAV.map((item) => {
              const Icon = item.icon;
              const href = workspaceSectionPath(basePath, item.segment);
              const active = isSectionActive(location.pathname, basePath, item.segment);
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
          {loading && !workspace ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading workspace…
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <PatientCopilotPanel
        patientId={pid}
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        patientName={workspace?.patient?.name}
      />
    </div>
  );
}

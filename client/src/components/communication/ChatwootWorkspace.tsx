import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import api from '@/utils/api';

type Workspace = {
  state: string;
  configured: boolean;
  agentUrl?: string | null;
  inboxes?: { inbox_id: number; channel: string; channel_address: string; enabled: boolean }[];
  jobs?: { status: string; count: number }[];
};

const labels: Record<string, string> = {
  not_configured: 'Not connected', migration_required: 'Setup pending', disabled: 'Paused',
  credentials_missing: 'Credentials pending', inbox_missing: 'Inbox pending', configured: 'Connected',
  healthy: 'Healthy', inbox_mismatch: 'Inbox needs attention', unreachable: 'Connection unavailable',
};

export default function ChatwootWorkspace({ endpoint, token }: { endpoint: string; token: string | null }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    let active = true;
    setWorkspace(null);
    setLoading(true);
    setError('');
    api.get(endpoint, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => { if (active) setWorkspace(response.data?.data || null); })
      .catch(() => { if (active) setError('Agent workspace unavailable'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, token]);

  const checkConnection = async () => {
    setChecking(true);
    setError('');
    try {
      const response = await api.get(`${endpoint}/health`, { headers });
      setWorkspace(response.data?.data || null);
    } catch { setError('Connection check failed'); }
    finally { setChecking(false); }
  };

  const attention = workspace?.jobs?.filter((job) => ['failed', 'uncertain'].includes(job.status))
    .reduce((sum, job) => sum + Number(job.count), 0) || 0;
  const pending = workspace?.jobs?.filter((job) => ['pending', 'processing'].includes(job.status))
    .reduce((sum, job) => sum + Number(job.count), 0) || 0;

  return <section aria-label="Chatwoot agent workspace" className="flex flex-wrap items-center gap-3 border-y border-slate-400/20 py-3 text-sm">
    <MessageCircle className="h-5 w-5 shrink-0 text-emerald-500" />
    <div className="min-w-0 flex-1 basis-48">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Chatwoot</span>
        <span role="status" className="text-xs text-slate-500">{loading ? 'Loading...' : error || labels[workspace?.state || ''] || 'Unavailable'}</span>
      </div>
      {!!workspace?.inboxes?.length && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        {workspace.inboxes.filter((inbox) => inbox.enabled).map((inbox) =>
          <span key={inbox.inbox_id} className="break-all"><span className="capitalize">{inbox.channel}</span> {inbox.channel_address}</span>)}
      </div>}
    </div>
    {pending > 0 && <span className="text-xs text-slate-500">{pending} queued</span>}
    {attention > 0 && <span className="flex items-center gap-1 text-xs text-amber-500"><AlertTriangle className="h-3.5 w-3.5" />{attention} need attention</span>}
    <button type="button" aria-label="Check Chatwoot connection" title="Check Chatwoot connection"
      disabled={loading || checking} onClick={checkConnection}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-400/20 hover:bg-slate-400/10 disabled:opacity-40">
      {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
    </button>
    {workspace?.agentUrl && <a href={workspace.agentUrl} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
      <ExternalLink className="h-4 w-4 shrink-0" /> Open Chatwoot
    </a>}
  </section>;
}

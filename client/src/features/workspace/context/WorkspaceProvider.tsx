import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getLivingWorkspace } from '@/services/workspace.service';
import type { LivingWorkspace } from '@/features/workspace/types/workspace.types';

interface WorkspaceContextValue {
  patientId: number;
  workspace: LivingWorkspace | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  actionLoading: string | null;
  setActionLoading: (key: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  patientId,
  children,
}: {
  patientId: number;
  children: ReactNode;
}) {
  const [workspace, setWorkspace] = useState<LivingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await getLivingWorkspace(patientId);
      setWorkspace(res?.data || null);
      setError(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      patientId,
      workspace,
      loading,
      error,
      refresh,
      actionLoading,
      setActionLoading,
    }),
    [patientId, workspace, loading, error, refresh, actionLoading]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return ctx;
}

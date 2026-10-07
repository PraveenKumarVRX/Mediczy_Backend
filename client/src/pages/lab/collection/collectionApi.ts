/**
 * Typed API layer for the collection portal. Domain state lives on the server and is read through React Query;
 * nothing here is persisted locally (lab_portal_state / localStorage hold view preferences only).
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import { newOperationKey } from "./format";
import type {
  BoardPage, Collector, CollectionException, CollectionMode, Kpis, Partners, TaskDetail, TimelineItem,
} from "./types";

const BASE = "/lab/collection";

export const keys = {
  all: ["lab-collection"] as const,
  board: (mode: CollectionMode, filters: Record<string, unknown>) => ["lab-collection", "board", mode, filters] as const,
  kpis: ["lab-collection", "kpis"] as const,
  task: (id: string) => ["lab-collection", "task", id] as const,
  timeline: (id: string) => ["lab-collection", "timeline", id] as const,
  exceptions: (status: string) => ["lab-collection", "exceptions", status] as const,
  collectors: ["lab-collection", "collectors"] as const,
  partners: ["lab-collection", "partners"] as const,
};

export interface BoardFilters { status?: string; assignedTo?: string; overdue?: boolean }

export function useBoard(mode: CollectionMode, filters: BoardFilters) {
  return useInfiniteQuery({
    queryKey: keys.board(mode, { ...filters }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`${BASE}/ops`, {
        params: { mode, limit: 50, cursor: pageParam ?? undefined, status: filters.status || undefined, assignedTo: filters.assignedTo || undefined, overdue: filters.overdue || undefined },
      });
      return data as BoardPage;
    },
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 30_000,
  });
}

export const useKpis = () =>
  useQuery({ queryKey: keys.kpis, queryFn: async () => (await api.get(`${BASE}/kpis`)).data as Kpis, refetchInterval: 60_000 });

export const useTaskDetail = (id: string | null) =>
  useQuery({ queryKey: keys.task(id ?? ""), enabled: Boolean(id), queryFn: async () => (await api.get(`${BASE}/tasks/${id}`)).data as TaskDetail });

export const useTimeline = (id: string | null) =>
  useQuery({
    queryKey: keys.timeline(id ?? ""), enabled: Boolean(id),
    queryFn: async () => (await api.get(`${BASE}/tasks/${id}/timeline`)).data as { taskId: string; items: TimelineItem[] },
  });

export const useExceptions = (status: "open" | "resolved") =>
  useQuery({
    queryKey: keys.exceptions(status),
    queryFn: async () => (await api.get(`${BASE}/exceptions`, { params: { status } })).data as { exceptions: CollectionException[] },
    refetchInterval: 30_000,
  });

export const useCollectors = () =>
  useQuery({ queryKey: keys.collectors, queryFn: async () => (await api.get(`${BASE}/phlebotomists`)).data as { phlebotomists: Collector[] } });

export const usePartners = (enabled = true) =>
  useQuery({ queryKey: keys.partners, enabled, queryFn: async () => (await api.get(`${BASE}/partners`)).data as Partners });

/** Every write carries an Idempotency-Key, so a double-click or a retried request cannot repeat a side effect. */
function post<T = unknown>(path: string, body: unknown, key = newOperationKey()) {
  return api.post(`${BASE}${path}`, body, { headers: { "Idempotency-Key": key } }).then((r) => r.data as T);
}

export function useCollectionMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.all });
  const useOp = <V, R = unknown>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSettled: refresh });
  return {
    createTask: useOp((input: Record<string, unknown>) => post<{ task: { id: string } }>("/tasks", input)),
    assign: useOp((v: { id: string; version: number; phlebotomistId: string }) =>
      post(`/tasks/${v.id}/assign`, { expectedVersion: v.version, phlebotomistId: v.phlebotomistId })),
    reassign: useOp((v: { id: string; version: number; phlebotomistId: string; reason: string }) =>
      post(`/tasks/${v.id}/reassign`, { expectedVersion: v.version, phlebotomistId: v.phlebotomistId, reason: v.reason })),
    cancel: useOp((v: { id: string; version: number; reason: string }) =>
      post(`/tasks/${v.id}/cancel`, { expectedVersion: v.version, reason: v.reason })),
    receive: useOp((v: { specimenId: string; outcome: "accepted" | "rejected"; condition?: string; reason?: string }) =>
      post(`/specimens/${v.specimenId}/receive`, { outcome: v.outcome, condition: v.condition || undefined, reason: v.reason || undefined })),
    redraw: useOp((v: { id: string; note?: string }) => post(`/tasks/${v.id}/redraw`, { note: v.note || undefined })),
    resolveException: useOp((v: { id: string; resolution: string }) => post(`/exceptions/${v.id}/resolve`, { resolution: v.resolution })),
    createCollector: useOp((v: Record<string, unknown>) => api.post(`${BASE}/phlebotomists`, v).then((r) => r.data)),
    setMembership: useOp((v: { id: string; status: "active" | "suspended" | "ended" }) =>
      api.patch(`${BASE}/phlebotomists/${v.id}/membership`, { status: v.status }).then((r) => r.data)),
    resetPassword: useOp((v: { id: string; password: string }) =>
      api.post(`${BASE}/phlebotomists/${v.id}/reset-password`, { password: v.password }).then((r) => r.data)),
  };
}

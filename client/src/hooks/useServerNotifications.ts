import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";

export interface ServerNotification {
  id: number;
  userId: number;
  userType: "patient" | "doctor" | "admin";
  type: string;
  title: string;
  message: string;
  data?: any;
  channels?: any;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  isRead?: boolean;
  readAt?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  expiresAt?: string | null;
  actionUrl?: string | null;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export type NotificationUiType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "video-call"
  | "message"
  | "appointment"
  | "system";

export interface NotificationUiModel {
  id: number;
  title: string;
  message: string;
  type: NotificationUiType;
  timestamp: Date;
  read: boolean;
  actionUrl?: string | null;
  data?: any;
}

const mapType = (type: string): NotificationUiType => {
  const t = String(type || "").toLowerCase();
  if (t.includes("video")) return "video-call";
  if (t.includes("message")) return "message";
  if (t.includes("appointment") || t.includes("consultation") || t.includes("reminder")) return "appointment";
  if (t.includes("payment")) return "info";
  if (t.includes("failed") || t.includes("error")) return "error";
  if (t.includes("accepted") || t.includes("confirmed") || t.includes("success") || t.includes("received"))
    return "success";
  if (t.includes("rejected") || t.includes("cancel") || t.includes("warning") || t.includes("alert"))
    return "warning";
  if (t.includes("system")) return "system";
  return "info";
};

export interface UseServerNotificationsOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
}

export const useServerNotifications = (options: UseServerNotificationsOptions = {}) => {
  const queryClient = useQueryClient();
  const { page = 1, limit = 50, unreadOnly = false, type } = options;

  const queryKey = useMemo(
    () => ["notifications", { page, limit, unreadOnly, type }],
    [page, limit, unreadOnly, type]
  );

  const notificationsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (unreadOnly) params.set("unreadOnly", "true");
      if (type) params.set("type", type);
      const { data } = await api.get(`/notifications?${params.toString()}`);
      const list = (data as any)?.notifications || [];
      return list as ServerNotification[];
    },
    retry: false,
  });

  const unreadCountQuery = useQuery({
    queryKey: ["notificationsUnreadCount"],
    queryFn: async () => {
      const { data } = await api.get("/notifications/unread-count");
      return Number((data as any)?.unreadCount || 0);
    },
    retry: false,
  });

  const markAsRead = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/notifications/${id}/read`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      await api.post("/notifications/read-all");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/notifications/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
    },
  });

  const uiNotifications = useMemo<NotificationUiModel[]>(() => {
    const list = notificationsQuery.data || [];
    return list.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: mapType(n.type),
      timestamp: new Date(n.createdAt || n.updatedAt || Date.now()),
      read: n.status === "read" || n.isRead === true,
      actionUrl: n.actionUrl || null,
      data: n.data,
    }));
  }, [notificationsQuery.data]);

  return {
    notifications: uiNotifications,
    unreadCount: unreadCountQuery.data ?? 0,
    isLoading: notificationsQuery.isLoading || unreadCountQuery.isLoading,
    error: notificationsQuery.error || unreadCountQuery.error,
    refetch: async () => {
      await notificationsQuery.refetch();
      await unreadCountQuery.refetch();
    },
    markAsRead: (id: number) => markAsRead.mutateAsync(id),
    markAllAsRead: () => markAllAsRead.mutateAsync(),
    deleteNotification: (id: number) => deleteNotification.mutateAsync(id),
  };
};


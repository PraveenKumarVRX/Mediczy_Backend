import api from '@/utils/api';

export const fetchPortalMessages = async (params?: { search?: string; priority?: string }) => {
  const response = await api.get('/hospital/insurance/portal/messages', { params });
  return response.data;
};

export const markPortalMessageRead = async (threadId: string) => {
  const response = await api.post(`/hospital/insurance/portal/messages/${threadId}/read`);
  return response.data;
};

export const replyToPortalMessage = async (threadId: string, payload: { text: string; attachments?: string[] }) => {
  const response = await api.post(`/hospital/insurance/portal/messages/${threadId}/reply`, payload);
  return response.data;
};

export const escalatePortalMessage = async (threadId: string) => {
  const response = await api.post(`/hospital/insurance/portal/messages/${threadId}/escalate`);
  return response.data;
};

export const fetchPortalNotifications = async () => {
  const response = await api.get('/hospital/insurance/portal/notifications');
  return response.data;
};

export const markPortalNotificationRead = async (notificationId: string) => {
  const response = await api.post(`/hospital/insurance/portal/notifications/${notificationId}/read`);
  return response.data;
};

export const markAllPortalNotificationsRead = async () => {
  const response = await api.post('/hospital/insurance/portal/notifications/mark-all-read');
  return response.data;
};

export const fetchPortalSection = async (sectionPath: string) => {
  const response = await api.get(`/hospital/insurance/portal/${sectionPath}`);
  return response.data;
};

export const savePortalSection = async (sectionPath: string, data: unknown) => {
  const response = await api.put(`/hospital/insurance/portal/${sectionPath}`, { data });
  return response.data;
};

export const formatRelativePortalTime = (value?: string | Date | null) => {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString('en-IN');
};
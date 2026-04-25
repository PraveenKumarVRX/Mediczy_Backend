import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertCircle, CheckCircle, Calendar, FileText, Users, TrendingUp, Filter, Search, BellRing } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import CorporateStatusBadge from '@/components/corporate/CorporateStatusBadge';

interface Notification {
  id: string;
  type: 'announcement' | 'health_alert' | 'policy_update' | 'appointment_reminder' | 'claim_status' | 'wellness';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  priority: 'high' | 'medium' | 'low';
  actionUrl?: string;
}

type ApiNotification = {
  id: string;
  type: Notification['type'];
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  priority: Notification['priority'];
  actionUrl?: string;
};

const CorporateNotifications: React.FC = () => {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/notifications');
      const items = ((data as any)?.data?.notifications || []) as ApiNotification[];

      const mapped: Notification[] = items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        timestamp: new Date(n.createdAt),
        isRead: !!n.read,
        priority: n.priority,
        actionUrl: n.actionUrl,
      }));

      setNotifications(mapped);
    } catch (error: any) {
      toast({
        title: 'Failed to load notifications',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      announcement: 'bg-blue-500/20 text-blue-400 border-0',
      health_alert: 'bg-red-500/20 text-red-400 border-0',
      policy_update: 'bg-purple-500/20 text-purple-400 border-0',
      appointment_reminder: 'bg-emerald-500/20 text-emerald-400 border-0',
      claim_status: 'bg-orange-500/20 text-orange-400 border-0',
      wellness: 'bg-teal-500/20 text-teal-400 border-0'
    };
    return colors[type] || 'bg-slate-700 text-slate-300 border-0';
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-500/20 text-red-400 border-0',
      medium: 'bg-amber-500/20 text-amber-400 border-0',
      low: 'bg-blue-500/20 text-blue-400 border-0'
    };
    return <Badge className={colors[priority] || 'bg-slate-700 text-slate-300 border-0'}>{priority.toUpperCase()}</Badge>;
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.post(`/corporate/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (error: any) {
      toast({
        title: 'Failed to update notification',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.post('/corporate/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast({ title: 'All notifications marked as read' });
    } catch (error: any) {
      toast({
        title: 'Failed to mark all as read',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const formatRelativeTime = (date: Date): string => {
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((n) => filter === 'all' || n.type === filter)
      .filter((n) => priorityFilter === 'all' || n.priority === priorityFilter)
      .filter((n) => (showUnreadOnly ? !n.isRead : true))
      .filter(
        (n) =>
          n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          n.message.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [filter, notifications, priorityFilter, searchTerm, showUnreadOnly]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);
  const highPriorityCount = useMemo(() => notifications.filter(n => n.priority === 'high').length, [notifications]);
  const thisWeekCount = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return notifications.filter(n => n.timestamp >= weekAgo).length;
  }, [notifications]);

  return (
    <CorporateLayout title="Notifications">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={BellRing}
          title="Corporate Notifications"
          description="Stay updated with company health initiatives, alerts, and announcements"
          gradient="from-pink-500 to-pink-700"
          badge={unreadCount > 0 ? `${unreadCount} Unread` : undefined}
          showSearch={true}
          searchPlaceholder="Search notifications..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          showRefresh={true}
          onRefresh={loadNotifications}
          isRefreshing={isLoading}
          stats={[
            { label: 'Total', value: notifications.length },
            { label: 'Unread', value: unreadCount },
            { label: 'High Priority', value: highPriorityCount },
            { label: 'This Week', value: thisWeekCount },
          ]}
          actions={
              <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} disabled={isLoading || unreadCount === 0} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              Mark All Read
            </Button>
          }
        />

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800 border-white/10 text-white placeholder:text-slate-500 focus:border-violet-500"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((v) => !v)}
            className="border-white/10 text-slate-300 hover:bg-white/10 hover:text-white">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mb-6 p-4 border border-white/10 rounded-xl bg-slate-800/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-400">Priority:</span>
              {(['all','high','medium','low'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    priorityFilter === p
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700/50 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {p === 'all' ? 'All' : p.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUnreadOnly((v) => !v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  showUnreadOnly
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                Unread only
              </button>
              <button
                onClick={() => { setPriorityFilter('all'); setShowUnreadOnly(false); }}
                className="px-3 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-300 transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Type Filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {([
            { key: 'all', label: 'All' },
            { key: 'announcement', label: 'Announcements' },
            { key: 'health_alert', label: 'Health Alerts' },
            { key: 'policy_update', label: 'Policy Updates' },
            { key: 'wellness', label: 'Wellness' },
            { key: 'claim_status', label: 'Claims' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                filter === key
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Bell className="h-12 w-12 mb-3 text-slate-700" />
              <p className="text-sm font-medium text-slate-400">No notifications found</p>
              <p className="text-xs text-slate-600 mt-1">Adjust filters or check back later</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`!p-0 border border-white/[0.06] transition-all hover:border-white/[0.12] ${
                  !notification.isRead
                    ? 'bg-blue-500/5 border-l-4 !border-l-blue-500'
                    : 'bg-slate-900/50'
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-sm font-semibold text-white">{notification.title}</CardTitle>
                        {!notification.isRead && (
                          <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px]">NEW</Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs text-slate-400 leading-relaxed">
                        {notification.message}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                      <Badge className={getTypeColor(notification.type)}>
                        {notification.type.replace('_', ' ')}
                      </Badge>
                      {getPriorityBadge(notification.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500" title={notification.timestamp.toLocaleString()}>
                      <Calendar className="h-3.5 w-3.5" />
                      {formatRelativeTime(notification.timestamp)}
                    </div>
                    <div className="flex gap-2">
                      {notification.actionUrl && (
                        <Button variant="outline" size="sm"
                          className="border-white/10 text-slate-400 hover:text-white hover:bg-white/10 h-7 text-xs"
                          onClick={() => window.open(notification.actionUrl, '_blank', 'noopener,noreferrer')}>
                          View Details
                        </Button>
                      )}
                      {!notification.isRead && (
                        <Button variant="outline" size="sm"
                          className="border-white/10 text-slate-400 hover:text-white hover:bg-white/10 h-7 text-xs"
                          onClick={() => handleMarkAsRead(notification.id)}>
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                          Mark as Read
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </CorporateLayout>
  );
};

export default CorporateNotifications;

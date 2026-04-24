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
      announcement: 'bg-blue-100 text-blue-800',
      health_alert: 'bg-red-100 text-red-800',
      policy_update: 'bg-purple-100 text-purple-800',
      appointment_reminder: 'bg-green-100 text-green-800',
      claim_status: 'bg-orange-100 text-orange-800',
      wellness: 'bg-teal-100 text-teal-800'
    };
    return colors[type] || 'bg-slate-800 text-slate-200';
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800'
    };
    return <Badge className={colors[priority]}>{priority.toUpperCase()}</Badge>;
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
    } catch (error: any) {
      toast({
        title: 'Failed to mark all as read',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
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
      <div className="space-y-6">
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
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} disabled={isLoading || notifications.length === 0} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
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
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mb-6 p-4 border rounded-lg bg-slate-800/40">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Priority:</span>
              {(['all','high','medium','low'] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={priorityFilter === p ? 'default' : 'outline'}
                  onClick={() => setPriorityFilter(p)}
                >
                  {p === 'all' ? 'All' : p.toUpperCase()}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showUnreadOnly ? 'default' : 'outline'}
                onClick={() => setShowUnreadOnly((v) => !v)}
              >
                Unread only
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPriorityFilter('all'); setShowUnreadOnly(false); }}>
                Reset filters
              </Button>
            </div>
          </div>
        )}

        {/* Type Filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
          >
            All
          </Button>
          <Button
            variant={filter === 'announcement' ? 'default' : 'outline'}
            onClick={() => setFilter('announcement')}
            size="sm"
          >
            Announcements
          </Button>
          <Button
            variant={filter === 'health_alert' ? 'default' : 'outline'}
            onClick={() => setFilter('health_alert')}
            size="sm"
          >
            Health Alerts
          </Button>
          <Button
            variant={filter === 'policy_update' ? 'default' : 'outline'}
            onClick={() => setFilter('policy_update')}
            size="sm"
          >
            Policy Updates
          </Button>
          <Button
            variant={filter === 'wellness' ? 'default' : 'outline'}
            onClick={() => setFilter('wellness')}
            size="sm"
          >
            Wellness
          </Button>
          <Button
            variant={filter === 'claim_status' ? 'default' : 'outline'}
            onClick={() => setFilter('claim_status')}
            size="sm"
          >
            Claims
          </Button>
        </div>

        {/* Notifications List */}
        <div className="space-y-4">
          {filteredNotifications.map((notification) => (
            <Card
              key={notification.id}
              className={`${!notification.isRead ? 'border-l-4 border-blue-500 bg-blue-50' : ''}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-lg">{notification.title}</CardTitle>
                      {!notification.isRead && (
                        <Badge className="bg-blue-600 text-white">NEW</Badge>
                      )}
                    </div>
                    <CardDescription className="text-base">
                      {notification.message}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Badge className={getTypeColor(notification.type)}>
                      {notification.type.replace('_', ' ')}
                    </Badge>
                    {getPriorityBadge(notification.priority)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-sm text-slate-400">
                    <Calendar className="h-4 w-4" />
                    {notification.timestamp.toLocaleString()}
                  </div>
                  <div className="flex gap-2">
                    {notification.actionUrl && (
                      <Button variant="outline" size="sm" onClick={() => window.open(notification.actionUrl, '_blank', 'noopener,noreferrer')}>
                        View Details
                      </Button>
                    )}
                    {!notification.isRead && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMarkAsRead(notification.id)}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark as Read
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </CorporateLayout>
  );
};

export default CorporateNotifications;

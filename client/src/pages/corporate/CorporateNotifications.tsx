import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertCircle, CheckCircle, Calendar, FileText, Users, TrendingUp, Filter, Search } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return colors[type] || 'bg-gray-100 text-gray-800';
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
      .filter(
        (n) =>
          n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          n.message.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [filter, notifications, searchTerm]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8 text-blue-600" />
            Corporate Notifications
          </h1>
          <p className="text-gray-600 mt-1">Stay updated with company health initiatives and announcements</p>
        </div>
        <Button variant="outline" onClick={handleMarkAllAsRead} disabled={isLoading || notifications.length === 0}>
          Mark All as Read
        </Button>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{notifications.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unread</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{unreadCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">
              {notifications.filter(n => n.priority === 'high').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {notifications.filter(n => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return n.timestamp >= weekAgo;
              }).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search notifications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

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
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  {notification.timestamp.toLocaleString()}
                </div>
                <div className="flex gap-2">
                  {notification.actionUrl && (
                    <Button variant="outline" size="sm">
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
  );
};

export default CorporateNotifications;

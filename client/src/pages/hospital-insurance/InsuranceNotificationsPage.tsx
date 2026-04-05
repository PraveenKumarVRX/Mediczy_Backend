import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  fetchPortalNotifications,
  formatRelativePortalTime,
  markAllPortalNotificationsRead,
  markPortalNotificationRead,
} from '@/utils/hospitalInsurancePortalApi';
import { Bell, CheckCircle2, AlertTriangle, Clock, CreditCard, FileText, ArrowUpRight, Check, MessageSquare, ExternalLink } from 'lucide-react';

type PortalNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  priority: string;
};

type PortalThreadSummary = {
  id: string;
  insurer: string;
  subject: string;
  timestamp: string;
  unread: number;
  priority: string;
};

const InsuranceNotificationsPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const base = `/hospital/${slug || localStorage.getItem('hospitalInsuranceSlug') || 'hospital'}/insurance`;
  const [activeTab, setActiveTab] = useState('all');
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [tpaSummary, setTpaSummary] = useState({ unreadThreads: 0, urgentThreads: 0, pendingReply: 0 });
  const [tpaThreads, setTpaThreads] = useState<PortalThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setLoading(true);
        const response = await fetchPortalNotifications();
        setNotifications(response.notifications || []);
        setTpaSummary(response.tpaSummary || { unreadThreads: 0, urgentThreads: 0, pendingReply: 0 });
        setTpaThreads(response.tpaThreads || []);
      } catch (error: any) {
        toast({ title: 'Unable to load notifications', description: error?.response?.data?.message || 'Try again shortly.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [toast]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    const previous = notifications;
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, read: true } : notification));
    try {
      await markPortalNotificationRead(id);
    } catch {
      setNotifications(previous);
    }
  };

  const markAllRead = async () => {
    const previous = notifications;
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    try {
      await markAllPortalNotificationsRead();
      toast({ title: 'All Marked Read' });
    } catch (error: any) {
      setNotifications(previous);
      toast({ title: 'Update failed', description: error?.response?.data?.message || 'Unable to update notifications.', variant: 'destructive' });
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'claim': return <CreditCard className="h-4 w-4 text-indigo-600" />;
      case 'query': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'document': return <FileText className="h-4 w-4 text-blue-600" />;
      case 'settlement': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'escalation': return <ArrowUpRight className="h-4 w-4 text-red-600" />;
      case 'deadline': return <Clock className="h-4 w-4 text-orange-600" />;
      default: return <Bell className="h-4 w-4 text-slate-500" />;
    }
  };

  const filtered = useMemo(() => notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'urgent') return n.priority === 'high';
    if (activeTab === 'tpa') return false; // handled separately
    return n.type === activeTab;
  }), [activeTab, notifications]);

  return (
    <InsurancePortalLayout title="Notifications" subtitle={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
              <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
              <TabsTrigger value="urgent">Urgent</TabsTrigger>
              <TabsTrigger value="claim">Claims</TabsTrigger>
              <TabsTrigger value="query">Queries</TabsTrigger>
              <TabsTrigger value="settlement">Settlements</TabsTrigger>
              <TabsTrigger value="tpa"><MessageSquare className="h-3 w-3 mr-1" />TPA Messages</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <Check className="h-3 w-3 mr-1" /> Mark All Read
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Loading notifications...</p>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No notifications in this category.</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map(notif => (
              <Card
                key={notif.id}
                className={`cursor-pointer transition-all hover:shadow-md ${!notif.read ? 'border-l-4 border-l-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                onClick={() => { void markAsRead(notif.id); }}
              >
                <CardContent className="p-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{typeIcon(notif.type)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${!notif.read ? 'font-semibold' : 'font-medium'}`}>{notif.title}</p>
                        {!notif.read && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 min-w-[100px]">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelativePortalTime(notif.time)}</span>
                    <Badge className={notif.priority === 'high' ? 'bg-red-100 text-red-700' : notif.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'} variant="outline">
                      {notif.priority}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {activeTab === 'tpa' && (
          <div className="space-y-3">
            <Card className="border-indigo-200 bg-indigo-50/30 dark:bg-indigo-900/10">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-6 w-6 text-indigo-600" />
                    <div>
                      <p className="font-semibold text-base">TPA Message Center</p>
                      <p className="text-sm text-muted-foreground">Threaded conversations with TPAs and insurers on claims, queries, and settlements</p>
                    </div>
                  </div>
                  <Button onClick={() => navigate(`${base}/messages`)} className="bg-indigo-600 hover:bg-indigo-700">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open Full TPA Inbox
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Unread Threads', count: tpaSummary.unreadThreads, icon: MessageSquare, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Urgent / High Priority', count: tpaSummary.urgentThreads, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'Pending Reply', count: tpaSummary.pendingReply, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                  ].map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${s.bg} dark:bg-opacity-20`}>
                        <Icon className={`h-5 w-5 ${s.color}`} />
                        <div>
                          <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            {tpaThreads.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer hover:shadow-md transition-all ${t.unread ? 'border-l-4 border-l-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                onClick={() => navigate(`${base}/messages`)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-4 w-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${t.unread ? 'font-semibold' : 'font-medium'}`}>{t.insurer}</p>
                        {t.unread && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                      </div>
                      <p className="text-sm text-muted-foreground">{t.subject}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{formatRelativePortalTime(t.timestamp)}</span>
                    <Badge className={t.priority === 'high' ? 'bg-red-100 text-red-700' : t.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'} variant="outline">
                      {t.priority}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceNotificationsPage;

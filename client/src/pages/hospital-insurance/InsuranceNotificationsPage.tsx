import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Bell, CheckCircle2, AlertTriangle, Clock, CreditCard, FileText, ArrowUpRight, Check } from 'lucide-react';

const InsuranceNotificationsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');

  const [notifications, setNotifications] = useState([
    { id: 1, type: 'claim', title: 'Pre-Auth Approved', message: 'PA-2025-0089 for Amit Verma has been approved by HDFC Ergo. Amount: ₹1,50,000', time: '10 min ago', read: false, priority: 'high' },
    { id: 2, type: 'query', title: 'Query on CLM-2025-0042', message: 'Star Health has raised a query regarding room rent charges. Respond within 24 hours.', time: '1 hour ago', read: false, priority: 'high' },
    { id: 3, type: 'document', title: 'Missing Document Alert', message: 'Discharge summary pending for CLM-2025-0041 (Priya Singh). Upload before 6 PM today.', time: '2 hours ago', read: false, priority: 'medium' },
    { id: 4, type: 'settlement', title: 'Settlement Received', message: 'Settlement of ₹1,20,000 received for CLM-2025-0035 via UTR: UTIB202506180012345', time: '4 hours ago', read: true, priority: 'low' },
    { id: 5, type: 'escalation', title: 'Claim Escalated', message: 'CLM-2025-0028 (Meera Devi) has been auto-escalated due to 35-day settlement delay.', time: '6 hours ago', read: true, priority: 'high' },
    { id: 6, type: 'deadline', title: 'Submission Deadline Tomorrow', message: '3 claim submissions due tomorrow. Review and submit before EOD.', time: '8 hours ago', read: true, priority: 'medium' },
    { id: 7, type: 'system', title: 'NHCX Maintenance Window', message: 'NHCX sandbox will be under maintenance on June 22, 2025 from 2 AM to 6 AM IST.', time: '1 day ago', read: true, priority: 'low' },
    { id: 8, type: 'claim', title: 'New Pre-Auth Request', message: 'Pre-auth submitted for Suresh Patel - Total Knee Replacement - ₹2,50,000', time: '1 day ago', read: true, priority: 'low' },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: number) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    toast({ title: 'All Marked Read' });
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

  const filtered = notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'urgent') return n.priority === 'high';
    return n.type === activeTab;
  });

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
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <Check className="h-3 w-3 mr-1" /> Mark All Read
          </Button>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
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
                onClick={() => markAsRead(notif.id)}
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
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{notif.time}</span>
                    <Badge className={notif.priority === 'high' ? 'bg-red-100 text-red-700' : notif.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'} variant="outline">
                      {notif.priority}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceNotificationsPage;

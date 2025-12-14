import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertTriangle, Info, CheckCircle, XCircle, Clock, User, Activity, Calendar, Filter, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import MainLayout from '@/components/layout/MainLayoutdoctor';

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  category: 'patient' | 'appointment' | 'system' | 'medication' | 'lab';
  isRead: boolean;
  actionRequired: boolean;
  relatedPatient?: string;
}

const DoctorAlerts: React.FC = () => {
  const [filter, setFilter] = useState<string>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Fetch alerts from API
  const { data: alerts = [], isLoading, error, refetch } = useQuery({
    queryKey: ['doctor-alerts'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/alerts');
        return response.data.alerts || [];
      } catch (err: any) {
        console.warn('Failed to fetch alerts:', err.message);
        // Return empty array as fallback
        return [];
      }
    },
    staleTime: 30 * 1000, // 30 seconds - alerts should be relatively fresh
  });

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await api.patch(`/doctors/alerts/${alertId}/read`);
      refetch(); // Refresh alerts
    } catch (err: any) {
      console.warn('Failed to mark alert as read:', err.message);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/doctors/alerts/mark-all-read');
      refetch(); // Refresh alerts
    } catch (err: any) {
      console.warn('Failed to mark all alerts as read:', err.message);
    }
  };

  const handleDismiss = async (alertId: string) => {
    try {
      await api.delete(`/doctors/alerts/${alertId}`);
      refetch(); // Refresh alerts
    } catch (err: any) {
      console.warn('Failed to dismiss alert:', err.message);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical':
        return 'border-red-500 bg-red-50';
      case 'warning':
        return 'border-yellow-500 bg-yellow-50';
      case 'success':
        return 'border-green-500 bg-green-50';
      default:
        return 'border-blue-500 bg-blue-50';
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      patient: 'bg-blue-100 text-blue-800',
      appointment: 'bg-purple-100 text-purple-800',
      system: 'bg-gray-100 text-gray-800',
      medication: 'bg-orange-100 text-orange-800',
      lab: 'bg-red-100 text-red-800'
    };
    return <Badge className={colors[category]}>{category}</Badge>;
  };

  const filteredAlerts = alerts
    .filter(alert => filter === 'all' || alert.category === filter)
    .filter(alert => !showUnreadOnly || !alert.isRead);

  const unreadCount = alerts.filter(a => !a.isRead).length;
  const criticalCount = alerts.filter(a => a.type === 'critical' && !a.isRead).length;
  const actionRequiredCount = alerts.filter(a => a.actionRequired && !a.isRead).length;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading alerts...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-500 mb-4">Failed to load alerts</p>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Alerts & Notifications</h1>
            <p className="text-muted-foreground">
              Monitor important updates and patient alerts
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowUnreadOnly(!showUnreadOnly)}>
              <Filter className="mr-2 h-4 w-4" />
              {showUnreadOnly ? 'Show All' : 'Unread Only'}
            </Button>
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              Mark All as Read
            </Button>
          </div>
        </div>

        {/* Alert Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{alerts.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Active notifications</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unread</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{unreadCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Require attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Critical</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">{criticalCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Urgent alerts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Action Required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-600">{actionRequiredCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Needs response</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
          >
            All Alerts ({alerts.length})
          </Button>
          <Button
            variant={filter === 'patient' ? 'default' : 'outline'}
            onClick={() => setFilter('patient')}
            size="sm"
          >
            Patient ({alerts.filter(a => a.category === 'patient').length})
          </Button>
          <Button
            variant={filter === 'appointment' ? 'default' : 'outline'}
            onClick={() => setFilter('appointment')}
            size="sm"
          >
            Appointments ({alerts.filter(a => a.category === 'appointment').length})
          </Button>
          <Button
            variant={filter === 'medication' ? 'default' : 'outline'}
            onClick={() => setFilter('medication')}
            size="sm"
          >
            Medication ({alerts.filter(a => a.category === 'medication').length})
          </Button>
          <Button
            variant={filter === 'lab' ? 'default' : 'outline'}
            onClick={() => setFilter('lab')}
            size="sm"
          >
            Lab Results ({alerts.filter(a => a.category === 'lab').length})
          </Button>
          <Button
            variant={filter === 'system' ? 'default' : 'outline'}
            onClick={() => setFilter('system')}
            size="sm"
          >
            System ({alerts.filter(a => a.category === 'system').length})
          </Button>
        </div>

        {/* Alerts List */}
        <div className="space-y-4">
          {filteredAlerts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No alerts to display</p>
                  <p className="text-sm text-muted-foreground mt-2">You're all caught up!</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredAlerts.map((alert) => (
              <Card
                key={alert.id}
                className={`border-l-4 ${getAlertColor(alert.type)} ${
                  !alert.isRead ? 'shadow-md' : 'opacity-75'
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getAlertIcon(alert.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{alert.title}</CardTitle>
                          {!alert.isRead && (
                            <Badge className="bg-blue-600 text-white">NEW</Badge>
                          )}
                          {alert.actionRequired && (
                            <Badge className="bg-orange-600 text-white">ACTION REQUIRED</Badge>
                          )}
                        </div>
                        <CardDescription className="text-base">
                          {alert.message}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {getCategoryBadge(alert.category)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                      {alert.relatedPatient && (
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {alert.relatedPatient}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {alert.relatedPatient && (
                        <Button variant="outline" size="sm">
                          View Patient
                        </Button>
                      )}
                      {!alert.isRead && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsRead(alert.id)}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Mark as Read
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDismiss(alert.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorAlerts;

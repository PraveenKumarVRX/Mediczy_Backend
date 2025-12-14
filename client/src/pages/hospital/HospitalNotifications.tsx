import React, { useState } from 'react';
import { Bell, Search, Filter, Calendar, AlertCircle, CheckCircle, Info, Clock, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import HospitalLayout from '@/components/hospital/HospitalLayout';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  category: string;
  timestamp: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
}

const HospitalNotifications: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterRead, setFilterRead] = useState('all');

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 'N001',
      title: 'Emergency Admission - ICU Full',
      message: 'Emergency patient needs ICU bed. All 12 ICU beds currently occupied.',
      type: 'alert',
      category: 'Emergency',
      timestamp: '2024-12-09 14:30',
      read: false,
      priority: 'high'
    },
    {
      id: 'N002',
      title: 'Lab Results Ready',
      message: 'Blood work results for Patient UHID-12345 are now available.',
      type: 'success',
      category: 'Lab',
      timestamp: '2024-12-09 14:15',
      read: false,
      priority: 'medium'
    },
    {
      id: 'N003',
      title: 'Equipment Maintenance Due',
      message: 'MRI Machine #2 scheduled for maintenance on Dec 12, 2024.',
      type: 'warning',
      category: 'Equipment',
      timestamp: '2024-12-09 13:45',
      read: true,
      priority: 'medium'
    },
    {
      id: 'N004',
      title: 'New Doctor Onboarding',
      message: 'Dr. Priya Sharma joined Cardiology department today.',
      type: 'info',
      category: 'Staff',
      timestamp: '2024-12-09 10:00',
      read: true,
      priority: 'low'
    },
    {
      id: 'N005',
      title: 'Bed Availability Updated',
      message: '5 beds now available in General Ward - Floor 3.',
      type: 'success',
      category: 'Beds',
      timestamp: '2024-12-09 09:30',
      read: false,
      priority: 'medium'
    },
    {
      id: 'N006',
      title: 'Critical Lab Values',
      message: 'Patient UHID-67890 has critically low hemoglobin (6.2 g/dL).',
      type: 'alert',
      category: 'Lab',
      timestamp: '2024-12-09 08:15',
      read: false,
      priority: 'high'
    }
  ]);

  const stats = {
    total: notifications.length,
    unread: notifications.filter(n => !n.read).length,
    high: notifications.filter(n => n.priority === 'high').length,
    today: notifications.filter(n => new Date(n.timestamp).toDateString() === new Date().toDateString()).length
  };

  const filteredNotifications = notifications.filter(notif => {
    const matchesSearch = 
      notif.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notif.message.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || notif.type === filterType;
    const matchesRead = 
      filterRead === 'all' || 
      (filterRead === 'read' && notif.read) || 
      (filterRead === 'unread' && !notif.read);
    
    return matchesSearch && matchesType && matchesRead;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'alert':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'success':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <HospitalLayout title="Notifications" subtitle="Stay updated with hospital alerts and updates">
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Bell className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">All notifications</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unread</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.unread}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Priority</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.high}</div>
              <p className="text-xs text-muted-foreground">Critical alerts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <Calendar className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-xs text-muted-foreground">Today's notifications</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Hospital Notifications</CardTitle>
                <CardDescription>Manage alerts, updates, and system notifications</CardDescription>
              </div>
              <Button variant="outline" onClick={markAllAsRead}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark All Read
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="alert">Alerts</SelectItem>
                  <SelectItem value="warning">Warnings</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRead} onValueChange={setFilterRead}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notifications List */}
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <Card 
                  key={notification.id} 
                  className={`transition-all ${!notification.read ? 'border-l-4 border-l-blue-500 bg-blue-50' : ''}`}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="mt-1">
                          {getTypeIcon(notification.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{notification.title}</h3>
                            {!notification.read && (
                              <Badge className="bg-blue-600">New</Badge>
                            )}
                            <Badge className={getTypeColor(notification.type)}>
                              {notification.type.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">{notification.category}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {notification.timestamp}
                            </span>
                            <span className="capitalize">Priority: {notification.priority}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {!notification.read && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredNotifications.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notifications found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export default HospitalNotifications;

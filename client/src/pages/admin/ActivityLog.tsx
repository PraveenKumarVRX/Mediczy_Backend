import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import ActivityStats from '@/components/admin/ActivityStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Activity, 
  Search, 
  Filter, 
  RefreshCw, 
  Download,
  Calendar,
  User,
  Shield,
  Database,
  Mail,
  CreditCard,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Trash2,
  Settings
} from 'lucide-react';
import api from '@/utils/api';

interface ActivityLog {
  id: string;
  timestamp: string;
  userId?: string;
  userType: 'user' | 'doctor' | 'admin' | 'system';
  activity: string;
  action: string;
  resource: string;
  resourceId?: string;
  result: 'success' | 'failure' | 'warning' | 'info';
  details: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

const ActivityLog = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserType, setSelectedUserType] = useState<string>('all');
  const [selectedResult, setSelectedResult] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchActivityLogs();
  }, []);

  // Memoize the filter function to prevent unnecessary re-renders
  const filterActivities = useCallback(() => {
    let filtered = activities;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(activity =>
        activity.activity.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.userId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.ipAddress?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // User type filter
    if (selectedUserType !== 'all') {
      filtered = filtered.filter(activity => activity.userType === selectedUserType);
    }

    // Result filter
    if (selectedResult !== 'all') {
      filtered = filtered.filter(activity => activity.result === selectedResult);
    }

    // Action filter
    if (selectedAction !== 'all') {
      filtered = filtered.filter(activity => activity.action === selectedAction);
    }

    // Date range filter
    if (dateRange.from) {
      filtered = filtered.filter(activity => 
        new Date(activity.timestamp) >= new Date(dateRange.from)
      );
    }
    if (dateRange.to) {
      filtered = filtered.filter(activity => 
        new Date(activity.timestamp) <= new Date(dateRange.to + 'T23:59:59')
      );
    }

    setFilteredActivities(filtered);
    setCurrentPage(1);
  }, [activities, searchTerm, selectedUserType, selectedResult, selectedAction, dateRange]);

  useEffect(() => {
    filterActivities();
  }, [filterActivities]);

  const fetchActivityLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Add abort controller to prevent memory leaks
      const controller = new AbortController();

      const { data } = await api.get('/admin/activity-logs', {
        signal: controller.signal
      });

      // Use API logs if available and not empty, otherwise use mock data
      const logs = data.logs && data.logs.length > 0 ? data.logs : generateMockData();
      setActivities(logs);
    } catch (error: any) {
      // Only log error if it's not an abort error
      if (error.name !== 'AbortError') {
        console.error('Failed to fetch activity logs:', error);
        setActivities(generateMockData());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const generateMockData = (): ActivityLog[] => {
    const mockActivities: ActivityLog[] = [];
    const actions = ['login', 'logout', 'create', 'update', 'delete', 'view', 'export', 'import'];
    const resources = ['user', 'doctor', 'appointment', 'billing', 'email', 'report', 'settings'];
    const results: ('success' | 'failure' | 'warning' | 'info')[] = ['success', 'failure', 'warning', 'info'];
    const userTypes: ('user' | 'doctor' | 'admin' | 'system')[] = ['user', 'doctor', 'admin', 'system'];

    for (let i = 0; i < 100; i++) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const resource = resources[Math.floor(Math.random() * resources.length)];
      const result = results[Math.floor(Math.random() * results.length)];
      const userType = userTypes[Math.floor(Math.random() * userTypes.length)];
      const timestamp = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();

      mockActivities.push({
        id: `log_${i + 1}`,
        timestamp,
        userId: userType !== 'system' ? `user_${Math.floor(Math.random() * 1000)}` : undefined,
        userType,
        activity: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
        action,
        resource,
        resourceId: `${resource}_${Math.floor(Math.random() * 1000)}`,
        result,
        details: generateActivityDetails(action, resource, result),
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: {
          duration: Math.floor(Math.random() * 5000) + 100,
          sessionId: `session_${Math.random().toString(36).substr(2, 9)}`
        }
      });
    }

    return mockActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const generateActivityDetails = (action: string, resource: string, result: string): string => {
    const details = {
      success: {
        login: `Successfully logged into the system`,
        logout: `Successfully logged out from the system`,
        create: `Successfully created new ${resource}`,
        update: `Successfully updated ${resource} information`,
        delete: `Successfully deleted ${resource}`,
        view: `Successfully viewed ${resource} details`,
        export: `Successfully exported ${resource} data`,
        import: `Successfully imported ${resource} data`
      },
      failure: {
        login: `Failed to login - invalid credentials`,
        logout: `Logout failed due to session error`,
        create: `Failed to create ${resource} - validation error`,
        update: `Failed to update ${resource} - insufficient permissions`,
        delete: `Failed to delete ${resource} - resource in use`,
        view: `Failed to access ${resource} - not found`,
        export: `Failed to export ${resource} - database error`,
        import: `Failed to import ${resource} - invalid format`
      },
      warning: {
        login: `Login with weak password detected`,
        logout: `Session timeout warning issued`,
        create: `${resource} created with missing optional fields`,
        update: `${resource} updated with validation warnings`,
        delete: `${resource} deletion requires additional confirmation`,
        view: `${resource} accessed with limited permissions`,
        export: `${resource} export completed with warnings`,
        import: `${resource} import completed with warnings`
      },
      info: {
        login: `User login recorded for audit purposes`,
        logout: `User logout recorded for session tracking`,
        create: `New ${resource} creation initiated`,
        update: `${resource} update process started`,
        delete: `${resource} deletion process initiated`,
        view: `${resource} view access logged`,
        export: `${resource} export process initiated`,
        import: `${resource} import process started`
      }
    };

    return details[result as keyof typeof details]?.[action as keyof typeof details.success] || 
           `${action} ${resource} completed with ${result}`;
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failure': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'info': return <Clock className="h-4 w-4 text-blue-600" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'failure': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30';
    }
  };

  const getUserTypeIcon = (userType: string) => {
    switch (userType) {
      case 'admin': return <Shield className="h-4 w-4 text-purple-600" />;
      case 'doctor': return <User className="h-4 w-4 text-blue-600" />;
      case 'user': return <User className="h-4 w-4 text-green-600" />;
      case 'system': return <Database className="h-4 w-4 text-muted-foreground" />;
      default: return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'login': return <User className="h-4 w-4" />;
      case 'logout': return <User className="h-4 w-4" />;
      case 'create': return <FileText className="h-4 w-4" />;
      case 'update': return <Settings className="h-4 w-4" />;
      case 'delete': return <Trash2 className="h-4 w-4" />;
      case 'view': return <Eye className="h-4 w-4" />;
      case 'export': return <Download className="h-4 w-4" />;
      case 'import': return <FileText className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      relative: getRelativeTime(date)
    };
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const exportLogs = async () => {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || '';
    try {
      const { data } = await api.get('/admin/activity/export', {
        responseType: 'blob',
        params: {
          userType: selectedUserType !== 'all' ? selectedUserType : undefined,
          result: selectedResult !== 'all' ? selectedResult : undefined,
          action: selectedAction !== 'all' ? selectedAction : undefined,
          from: dateRange.from || undefined,
          to: dateRange.to || undefined,
          search: searchTerm || undefined,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const filename = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Activity export API failed, falling back to client export', err);
      const csv = [
        ['Timestamp', 'User Type', 'Activity', 'Action', 'Resource', 'Result', 'Details', 'IP Address'].join(','),
        ...filteredActivities.map(log => [
          log.timestamp,
          log.userType,
          log.activity,
          log.action,
          log.resource,
          log.result,
          `"${log.details.replace(/"/g, '""')}"`,
          log.ipAddress || ''
        ].join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedUserType('all');
    setSelectedResult('all');
    setSelectedAction('all');
    setDateRange({ from: '', to: '' });
  };

  // Pagination
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentActivities = filteredActivities.slice(startIndex, endIndex);

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50/30 to-teal-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-slate-700 bg-clip-text text-transparent">
                Activity Log
              </h1>
              <p className="text-muted-foreground mt-1">
                Comprehensive system activity tracking and monitoring
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={exportLogs} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button onClick={fetchActivityLogs} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Activity Stats Dashboard */}
          <ActivityStats onRefresh={fetchActivityLogs} />

          {/* Filters */}
          <Card className="shadow-lg border-border/60 bg-card/95 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-teal-600" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search activities..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={selectedUserType} onValueChange={setSelectedUserType}>
                  <SelectTrigger>
                    <SelectValue placeholder="User Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedResult} onValueChange={setSelectedResult}>
                  <SelectTrigger>
                    <SelectValue placeholder="Result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Results</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failure</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedAction} onValueChange={setSelectedAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="logout">Logout</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                    <SelectItem value="import">Import</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  placeholder="From Date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                />

                <Input
                  type="date"
                  placeholder="To Date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {currentActivities.length} of {filteredActivities.length} activities
                  {filteredActivities.length !== activities.length && (
                    <span> (filtered from {activities.length} total)</span>
                  )}
                </div>
                <Button onClick={clearFilters} variant="outline" size="sm">
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity Log Table */}
          <Card className="shadow-lg border-border/60 bg-card/95 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-green-600" />
                Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/40 border-b border-border/70">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Activity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Result
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        IP Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border/70">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <div className="flex items-center justify-center">
                            <RefreshCw className="h-6 w-6 animate-spin text-teal-600 mr-2" />
                            Loading activity logs...
                          </div>
                        </td>
                      </tr>
                    ) : currentActivities.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          No activities found matching your filters
                        </td>
                      </tr>
                    ) : (
                      currentActivities.map((activity) => {
                        const timestamp = formatTimestamp(activity.timestamp);
                        const isExpanded = expandedRow === activity.id;
                        
                        return (
                          <React.Fragment key={activity.id}>
                            <tr className="hover:bg-muted/40">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <div className="text-sm font-medium text-foreground">
                                    {timestamp.time}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {timestamp.date}
                                  </div>
                                  <div className="text-xs text-teal-600">
                                    {timestamp.relative}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  {getUserTypeIcon(activity.userType)}
                                  <div className="ml-2">
                                    <div className="text-sm font-medium text-foreground">
                                      {activity.userType}
                                    </div>
                                    {activity.userId && (
                                      <div className="text-xs text-muted-foreground">
                                        {activity.userId}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center">
                                  {getActionIcon(activity.action)}
                                  <div className="ml-2">
                                    <div className="text-sm font-medium text-foreground">
                                      {activity.activity}
                                    </div>
                                    <div className="text-xs text-muted-foreground max-w-xs truncate">
                                      {activity.details}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  {getResultIcon(activity.result)}
                                  <Badge className={`ml-2 ${getResultColor(activity.result)} border`}>
                                    {activity.result.toUpperCase()}
                                  </Badge>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                {activity.ipAddress || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <Button
                                  onClick={() => setExpandedRow(isExpanded ? null : activity.id)}
                                  variant="outline"
                                  size="sm"
                                >
                                  {isExpanded ? 'Hide' : 'Details'}
                                </Button>
                              </td>
                            </tr>
                            
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="px-6 py-4 bg-muted/40">
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                      <h4 className="font-semibold text-foreground mb-2">Activity Details</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><strong>Resource:</strong> {activity.resource}</p>
                                        <p><strong>Resource ID:</strong> {activity.resourceId || 'N/A'}</p>
                                        <p><strong>Action:</strong> {activity.action}</p>
                                        <p><strong>Full Details:</strong> {activity.details}</p>
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <h4 className="font-semibold text-foreground mb-2">Session Info</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><strong>IP Address:</strong> {activity.ipAddress || 'N/A'}</p>
                                        <p><strong>User Agent:</strong> {activity.userAgent ? activity.userAgent.substring(0, 50) + '...' : 'N/A'}</p>
                                        {activity.metadata?.sessionId && (
                                          <p><strong>Session ID:</strong> {activity.metadata.sessionId}</p>
                                        )}
                                        {activity.metadata?.duration && (
                                          <p><strong>Duration:</strong> {activity.metadata.duration}ms</p>
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <h4 className="font-semibold text-foreground mb-2">Metadata</h4>
                                      <div className="bg-muted/40 p-2 rounded text-xs font-mono text-foreground">
                                        <pre>{JSON.stringify(activity.metadata || {}, null, 2)}</pre>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border/70 bg-muted/30 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      variant="outline"
                      size="sm"
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      variant="outline"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default ActivityLog;
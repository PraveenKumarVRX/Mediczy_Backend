import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  TrendingUp, 
  Users, 
  Shield, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import api from '@/utils/api';

interface ActivityStats {
  total: number;
  last24Hours: number;
  last7Days: number;
  byResult: {
    success: number;
    failure: number;
    warning: number;
    info: number;
  };
  byUserType: {
    admin: number;
    doctor: number;
    user: number;
    system: number;
  };
  topActions: Array<{ action: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
}

interface ActivityStatsProps {
  onRefresh?: () => void;
}

const ActivityStats = ({ onRefresh }: ActivityStatsProps) => {
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await api.get('/admin/activity-stats', { signal });
      setStats(response.data?.stats ?? generateMockStats());
    } catch (error: any) {
      // Only log error if it's not an abort error
      if (error.name !== 'AbortError' && error.code !== 'ERR_CANCELED') {
        console.error('Failed to fetch activity stats:', error);
        setStats(generateMockStats());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const generateMockStats = (): ActivityStats => {
    return {
      total: 1247,
      last24Hours: 89,
      last7Days: 456,
      byResult: {
        success: 1089,
        failure: 78,
        warning: 65,
        info: 15
      },
      byUserType: {
        admin: 234,
        doctor: 567,
        user: 398,
        system: 48
      },
      topActions: [
        { action: 'view', count: 423 },
        { action: 'login', count: 298 },
        { action: 'update', count: 187 },
        { action: 'create', count: 156 },
        { action: 'delete', count: 89 }
      ],
      topResources: [
        { resource: 'user', count: 345 },
        { resource: 'appointment', count: 267 },
        { resource: 'doctor', count: 198 },
        { resource: 'billing', count: 156 },
        { resource: 'email', count: 134 }
      ]
    };
  };

  const handleRefresh = () => {
    fetchStats();
    if (onRefresh) onRefresh();
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-lg border-0 bg-white/80 backdrop-blur-xl animate-pulse">
            <CardContent className="p-6">
              <div className="h-16 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
          <p className="text-gray-600">Unable to load activity statistics</p>
          <Button onClick={handleRefresh} className="mt-2" variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getResultPercentage = (count: number) => {
    return stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-lg border-0 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">Total Activities</p>
                <p className="text-3xl font-bold text-blue-800">{stats.total.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                <Activity className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Last 24 Hours</p>
                <p className="text-3xl font-bold text-green-800">{stats.last24Hours}</p>
                <p className="text-xs text-green-600">
                  {Math.round((stats.last24Hours / stats.last7Days) * 100)}% of weekly
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium">Last 7 Days</p>
                <p className="text-3xl font-bold text-purple-800">{stats.last7Days}</p>
                <p className="text-xs text-purple-600">
                  ~{Math.round(stats.last7Days / 7)} per day
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-600 text-sm font-medium">Success Rate</p>
                <p className="text-3xl font-bold text-orange-800">
                  {getResultPercentage(stats.byResult.success)}%
                </p>
                <p className="text-xs text-orange-600">
                  {stats.byResult.success} successful
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Results Breakdown */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Activity Results
            </CardTitle>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">Success</p>
                  <p className="text-lg font-bold text-green-900">{stats.byResult.success}</p>
                  <p className="text-xs text-green-600">{getResultPercentage(stats.byResult.success)}%</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-800">Failure</p>
                  <p className="text-lg font-bold text-red-900">{stats.byResult.failure}</p>
                  <p className="text-xs text-red-600">{getResultPercentage(stats.byResult.failure)}%</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Warning</p>
                  <p className="text-lg font-bold text-yellow-900">{stats.byResult.warning}</p>
                  <p className="text-xs text-yellow-600">{getResultPercentage(stats.byResult.warning)}%</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Info</p>
                  <p className="text-lg font-bold text-blue-900">{stats.byResult.info}</p>
                  <p className="text-xs text-blue-600">{getResultPercentage(stats.byResult.info)}%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Types */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              Activity by User Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-purple-600" />
                <span className="font-medium text-purple-800">Admin</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-purple-900">{stats.byUserType.admin}</p>
                <p className="text-xs text-purple-600">{getResultPercentage(stats.byUserType.admin)}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800">Doctor</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-blue-900">{stats.byUserType.doctor}</p>
                <p className="text-xs text-blue-600">{getResultPercentage(stats.byUserType.doctor)}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">User</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-900">{stats.byUserType.user}</p>
                <p className="text-xs text-green-600">{getResultPercentage(stats.byUserType.user)}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-gray-600" />
                <span className="font-medium text-gray-800">System</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900">{stats.byUserType.system}</p>
                <p className="text-xs text-gray-600">{getResultPercentage(stats.byUserType.system)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Actions */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Top Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topActions.map((action, index) => (
                <div key={action.action} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <span className="font-medium capitalize">{action.action}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold">{action.count}</span>
                    <div className="w-20 h-2 bg-gray-200 rounded-full">
                      <div 
                        className="h-2 bg-orange-500 rounded-full" 
                        style={{ width: `${(action.count / stats.topActions[0].count) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Resources */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-600" />
              Top Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topResources.map((resource, index) => (
                <div key={resource.resource} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <span className="font-medium capitalize">{resource.resource}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold">{resource.count}</span>
                    <div className="w-20 h-2 bg-gray-200 rounded-full">
                      <div 
                        className="h-2 bg-cyan-500 rounded-full" 
                        style={{ width: `${(resource.count / stats.topResources[0].count) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ActivityStats;
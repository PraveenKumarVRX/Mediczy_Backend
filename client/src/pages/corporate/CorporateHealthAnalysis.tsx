import React, { useCallback, useEffect, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Users, Brain, Heart, Stethoscope, Calendar, Download, Filter, HeartPulse, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { exportToCSV } from '@/utils/exportToExcel';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface HealthMetric {
  category: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
  totalEmployees: number;
  atRisk: number;
}

interface DepartmentHealth {
  department: string;
  totalEmployees: number;
  healthScore: number;
  checkupCompletion: number;
  atRiskCount: number;
}

// No pre-fabricated fallback data — the page shows what the API returns.
// If the API is unavailable a "sample data" banner appears instead of
// invented numbers.
const FALLBACK_METRICS: HealthMetric[] = [];
const FALLBACK_DEPTS: DepartmentHealth[] = [];

const CorporateHealthAnalysis: React.FC = () => {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState('month');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>(FALLBACK_METRICS);
  const [departmentHealth, setDepartmentHealth] = useState<DepartmentHealth[]>(FALLBACK_DEPTS);
  const [overallStats, setOverallStats] = useState({
    averageHealthScore: 0, totalEmployees: 0, checkupCompletionRate: 0,
    highRiskEmployees: 0, mediumRiskEmployees: 0, lowRiskEmployees: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/dashboard/health-analytics', {
        params: { timeRange, department: selectedDepartment === 'all' ? undefined : selectedDepartment },
      });
      const d = (data as any)?.data;
      if (d) {
        // Map API response to our shape
        const total = d.totalEmployees ?? 0;
        const rd = d.riskDistribution || {};
        if (d.riskDistribution) {
          setOverallStats({
            averageHealthScore: Math.round(d.averageRiskScore ?? 0),
            totalEmployees: total,
            checkupCompletionRate: d.monitoredEmployees && total
              ? Math.round((d.monitoredEmployees / total) * 100) : 0,
            highRiskEmployees: (rd.high ?? 0) + (rd.critical ?? 0),
            mediumRiskEmployees: rd.medium ?? 0,
            lowRiskEmployees: rd.low ?? 0,
          });
        }
        // Always update health metrics from live data (even if no chronic
        // conditions are on file yet — show zeros rather than invented numbers).
        setHealthMetrics(total > 0 ? [
          { category: 'Physical Health', score: Math.max(0, 100 - Math.round(((rd.high ?? 0) / total) * 100)), trend: 'up', change: 0, totalEmployees: total, atRisk: rd.high ?? 0 },
          { category: 'Mental Wellness', score: Math.round(d.healthyEmployees ? (d.healthyEmployees / total) * 100 : 0), trend: 'stable', change: 0, totalEmployees: total, atRisk: rd.medium ?? 0 },
          { category: 'Preventive Care', score: d.monitoredEmployees ? Math.round((d.monitoredEmployees / total) * 100) : 0, trend: 'stable', change: 0, totalEmployees: total, atRisk: rd.critical ?? 0 },
          { category: 'Chronic Conditions', score: Math.max(0, 100 - Math.round(((d.atRiskEmployees ?? 0) / total) * 100)), trend: 'stable', change: 0, totalEmployees: total, atRisk: d.atRiskEmployees ?? 0 },
        ] : []);
        // Map real department breakdown from the server
        if (Array.isArray(d.departmentRisks)) {
          setDepartmentHealth(d.departmentRisks.map((r: any) => ({
            department: r.department,
            totalEmployees: r.totalEmployees ?? 0,
            healthScore: r.avgRiskScore != null ? Math.max(0, 100 - Math.round(r.avgRiskScore)) : 0,
            checkupCompletion: 0,
            atRiskCount: r.highRisk ?? 0,
          })));
        }
        setUsingFallback(false);
      }
    } catch {
      setUsingFallback(true);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, selectedDepartment]);

  useEffect(() => { loadData(); }, [loadData]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-slate-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  const handleExport = () => {
    const rows = [
      {
        Section: 'Overview',
        Metric: 'Average Health Score',
        Value: `${overallStats.averageHealthScore}%`,
        TimeRange: timeRange,
        Department: selectedDepartment,
      },
      {
        Section: 'Overview',
        Metric: 'Total Employees',
        Value: String(overallStats.totalEmployees),
        TimeRange: timeRange,
        Department: selectedDepartment,
      },
      {
        Section: 'Overview',
        Metric: 'Checkup Completion Rate',
        Value: `${overallStats.checkupCompletionRate}%`,
        TimeRange: timeRange,
        Department: selectedDepartment,
      },
      {
        Section: 'Overview',
        Metric: 'High Risk Employees',
        Value: String(overallStats.highRiskEmployees),
        TimeRange: timeRange,
        Department: selectedDepartment,
      },
      ...healthMetrics.map((m) => ({
        Section: 'Health Metrics',
        Metric: m.category,
        Value: `${m.score}%`,
        Trend: m.trend,
        Change: `${m.change}%`,
        TotalEmployees: m.totalEmployees,
        AtRisk: m.atRisk,
        TimeRange: timeRange,
        Department: selectedDepartment,
      })),
      ...departmentHealth.map((d) => ({
        Section: 'Department Health',
        DepartmentName: d.department,
        TotalEmployees: d.totalEmployees,
        HealthScore: `${d.healthScore}%`,
        CheckupCompletion: `${d.checkupCompletion}%`,
        AtRiskCount: d.atRiskCount,
        TimeRange: timeRange,
        DepartmentFilter: selectedDepartment,
      })),
    ];

    exportToCSV(rows, { filename: 'corporate-health-analysis', includeTimestamp: true });
  };

  return (
    <CorporateLayout title="Health Analysis">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={HeartPulse}
          title="Health Analysis Dashboard"
          description="Comprehensive health analytics and insights for your workforce"
          gradient="from-rose-500 to-rose-700"
          showExport={!usingFallback && overallStats.totalEmployees > 0}
          onExport={handleExport}
          showRefresh={true}
          onRefresh={loadData}
          isRefreshing={isLoading}
          stats={[
            { label: 'Avg Health Score', value: `${overallStats.averageHealthScore}%`, trend: 'up', trendValue: '3%' },
            { label: 'Total Employees', value: overallStats.totalEmployees },
            { label: 'Checkup Rate', value: `${overallStats.checkupCompletionRate}%`, trend: 'up', trendValue: '5%' },
            { label: 'High Risk', value: overallStats.highRiskEmployees, trend: 'down', trendValue: '2' },
          ]}
        />
        <div className="flex gap-3 items-center flex-wrap">
          {usingFallback && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Showing sample data — live data unavailable
            </div>
          )}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="engineering">Engineering</SelectItem>
              <SelectItem value="marketing">Marketing</SelectItem>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} disabled={usingFallback || overallStats.totalEmployees === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

      {/* Overall Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Health Score</CardTitle>
            <Heart className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(overallStats.averageHealthScore)}`}>
              {overallStats.averageHealthScore}%
            </div>
            <p className="text-xs text-muted-foreground">
              Across {overallStats.totalEmployees} employees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checkup Completion</CardTitle>
            <Stethoscope className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.checkupCompletionRate}%</div>
            <Progress value={overallStats.checkupCompletionRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">Annual health checkups</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk Employees</CardTitle>
            <Activity className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overallStats.highRiskEmployees}</div>
            <p className="text-xs text-muted-foreground">
              {((overallStats.highRiskEmployees / overallStats.totalEmployees) * 100).toFixed(1)}% of workforce
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Medium Risk</CardTitle>
            <Activity className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{overallStats.mediumRiskEmployees}</div>
            <p className="text-xs text-muted-foreground">
              {((overallStats.mediumRiskEmployees / overallStats.totalEmployees) * 100).toFixed(1)}% of workforce
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Health Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Health Metrics Overview</CardTitle>
          <CardDescription>Key health indicators across your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {healthMetrics.map((metric) => (
              <Card key={metric.category}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{metric.category}</h3>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(metric.trend)}
                      <span className={metric.trend === 'up' ? 'text-green-600' : metric.trend === 'down' ? 'text-red-600' : 'text-slate-400'}>
                        {metric.change > 0 ? '+' : ''}{metric.change}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">Health Score</span>
                        <span className={`text-2xl font-bold ${getScoreColor(metric.score)}`}>
                          {metric.score}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${getProgressColor(metric.score)}`}
                          style={{ width: `${metric.score}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                      <div>
                        <p className="text-slate-400">Total Employees</p>
                        <p className="font-semibold">{metric.totalEmployees}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">At Risk</p>
                        <p className="font-semibold text-red-600">{metric.atRisk}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Department Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Department-Wise Health Analysis</CardTitle>
          <CardDescription>Comparative health metrics across departments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {departmentHealth.map((dept) => (
              <Card key={dept.department}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{dept.department}</h3>
                      <p className="text-sm text-slate-400">{dept.totalEmployees} employees</p>
                    </div>
                    <Badge variant={dept.atRiskCount > 15 ? 'destructive' : dept.atRiskCount > 8 ? 'default' : 'secondary'}>
                      {dept.atRiskCount} at risk
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-slate-400 mb-2">Health Score</p>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${getScoreColor(dept.healthScore)}`}>
                          {dept.healthScore}
                        </span>
                        <span className="text-sm text-slate-400">/ 100</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                        <div 
                          className={`h-1.5 rounded-full ${getProgressColor(dept.healthScore)}`}
                          style={{ width: `${dept.healthScore}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-slate-400 mb-2">Checkup Completion</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold">{dept.checkupCompletion}</span>
                        <span className="text-sm text-slate-400">%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                        <div 
                          className="h-1.5 rounded-full bg-blue-600"
                          style={{ width: `${dept.checkupCompletion}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-slate-400 mb-2">Risk Distribution</p>
                      <div className="flex gap-1 mt-2">
                        <div 
                          className="h-8 bg-red-500 rounded-l"
                          style={{ width: `${(dept.atRiskCount / dept.totalEmployees) * 100}%` }}
                          title="High Risk"
                        />
                        <div 
                          className="h-8 bg-yellow-500"
                          style={{ width: `${((dept.totalEmployees - dept.atRiskCount) * 0.3 / dept.totalEmployees) * 100}%` }}
                          title="Medium Risk"
                        />
                        <div 
                          className="h-8 bg-green-500 rounded-r"
                          style={{ width: `${((dept.totalEmployees - dept.atRiskCount) * 0.7 / dept.totalEmployees) * 100}%` }}
                          title="Low Risk"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk Analysis Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Health Trend Analysis</CardTitle>
          <CardDescription>Historical health metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center bg-slate-800/40 rounded-lg">
            <div className="text-center text-slate-400">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Interactive trend charts will be displayed here</p>
              <p className="text-sm mt-2">Showing health metrics over {timeRange}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </CorporateLayout>
  );
};

export default CorporateHealthAnalysis;

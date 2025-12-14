import React, { useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Users, Heart, Brain, Stethoscope, Calendar, Download, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

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

const CorporateHealthAnalysis: React.FC = () => {
  const [timeRange, setTimeRange] = useState('month');
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  // Health metrics data
  const healthMetrics: HealthMetric[] = [
    {
      category: 'Physical Health',
      score: 78,
      trend: 'up',
      change: 5,
      totalEmployees: 250,
      atRisk: 23
    },
    {
      category: 'Mental Wellness',
      score: 72,
      trend: 'down',
      change: -3,
      totalEmployees: 250,
      atRisk: 35
    },
    {
      category: 'Preventive Care',
      score: 85,
      trend: 'up',
      change: 8,
      totalEmployees: 250,
      atRisk: 12
    },
    {
      category: 'Chronic Conditions',
      score: 68,
      trend: 'stable',
      change: 0,
      totalEmployees: 250,
      atRisk: 45
    }
  ];

  // Department health data
  const departmentHealth: DepartmentHealth[] = [
    {
      department: 'Engineering',
      totalEmployees: 85,
      healthScore: 76,
      checkupCompletion: 82,
      atRiskCount: 12
    },
    {
      department: 'Marketing',
      totalEmployees: 42,
      healthScore: 81,
      checkupCompletion: 90,
      atRiskCount: 5
    },
    {
      department: 'Sales',
      totalEmployees: 58,
      healthScore: 73,
      checkupCompletion: 75,
      atRiskCount: 18
    },
    {
      department: 'Finance',
      totalEmployees: 35,
      healthScore: 79,
      checkupCompletion: 88,
      atRiskCount: 7
    },
    {
      department: 'Operations',
      totalEmployees: 30,
      healthScore: 74,
      checkupCompletion: 80,
      atRiskCount: 9
    }
  ];

  const overallStats = {
    averageHealthScore: 76,
    totalEmployees: 250,
    checkupCompletionRate: 82,
    highRiskEmployees: 35,
    mediumRiskEmployees: 58,
    lowRiskEmployees: 157
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Health Analysis Dashboard</h1>
          <p className="text-gray-500 mt-1">Comprehensive health analytics for your workforce</p>
        </div>
        <div className="flex gap-3">
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
          <Button>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
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
                      <span className={metric.trend === 'up' ? 'text-green-600' : metric.trend === 'down' ? 'text-red-600' : 'text-gray-600'}>
                        {metric.change > 0 ? '+' : ''}{metric.change}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Health Score</span>
                        <span className={`text-2xl font-bold ${getScoreColor(metric.score)}`}>
                          {metric.score}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${getProgressColor(metric.score)}`}
                          style={{ width: `${metric.score}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                      <div>
                        <p className="text-gray-600">Total Employees</p>
                        <p className="font-semibold">{metric.totalEmployees}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">At Risk</p>
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
                      <p className="text-sm text-gray-600">{dept.totalEmployees} employees</p>
                    </div>
                    <Badge variant={dept.atRiskCount > 15 ? 'destructive' : dept.atRiskCount > 8 ? 'default' : 'secondary'}>
                      {dept.atRiskCount} at risk
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Health Score</p>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${getScoreColor(dept.healthScore)}`}>
                          {dept.healthScore}
                        </span>
                        <span className="text-sm text-gray-500">/ 100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div 
                          className={`h-1.5 rounded-full ${getProgressColor(dept.healthScore)}`}
                          style={{ width: `${dept.healthScore}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-2">Checkup Completion</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold">{dept.checkupCompletion}</span>
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div 
                          className="h-1.5 rounded-full bg-blue-600"
                          style={{ width: `${dept.checkupCompletion}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-2">Risk Distribution</p>
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
          <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center text-gray-500">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Interactive trend charts will be displayed here</p>
              <p className="text-sm mt-2">Showing health metrics over {timeRange}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorporateHealthAnalysis;

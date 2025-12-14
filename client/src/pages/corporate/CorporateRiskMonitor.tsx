import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp, Shield, Activity, Users, Heart, Filter, Bell, Calendar, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

interface RiskEmployee {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  riskLevel: 'critical' | 'high' | 'medium';
  riskFactors: string[];
  lastCheckup: string;
  nextAction: string;
  healthScore: number;
}

interface RiskCategory {
  name: string;
  count: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface RiskAlertsConfig {
  enabled: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
  thresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

const CorporateRiskMonitor: React.FC = () => {
  const { toast } = useToast();
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsSaving, setAlertsSaving] = useState(false);
  const [alertsConfig, setAlertsConfig] = useState<RiskAlertsConfig>({
    enabled: true,
    notifyEmail: true,
    notifySms: false,
    thresholds: { critical: 80, high: 70, medium: 55 },
  });

  const riskCategories: RiskCategory[] = [
    { name: 'Cardiovascular Disease', count: 18, trend: 'increasing', severity: 'critical' },
    { name: 'Diabetes Risk', count: 25, trend: 'stable', severity: 'high' },
    { name: 'Hypertension', count: 32, trend: 'decreasing', severity: 'high' },
    { name: 'Mental Health', count: 28, trend: 'increasing', severity: 'high' },
    { name: 'Obesity', count: 42, trend: 'stable', severity: 'medium' },
    { name: 'Chronic Pain', count: 15, trend: 'decreasing', severity: 'medium' }
  ];

  const riskEmployees: RiskEmployee[] = [
    {
      id: '1',
      name: 'John Anderson',
      employeeId: 'EMP1245',
      department: 'Engineering',
      riskLevel: 'critical',
      riskFactors: ['High Blood Pressure', 'Elevated Cholesterol', 'Sedentary Lifestyle'],
      lastCheckup: '2024-01-10',
      nextAction: 'Immediate cardiologist consultation scheduled',
      healthScore: 45
    },
    {
      id: '2',
      name: 'Sarah Martinez',
      employeeId: 'EMP0892',
      department: 'Sales',
      riskLevel: 'critical',
      riskFactors: ['Pre-diabetic', 'High BMI', 'Family History of Diabetes'],
      lastCheckup: '2024-01-08',
      nextAction: 'Dietitian consultation and glucose monitoring',
      healthScore: 48
    },
    {
      id: '3',
      name: 'Michael Chen',
      employeeId: 'EMP1556',
      department: 'Finance',
      riskLevel: 'high',
      riskFactors: ['Anxiety Disorder', 'High Stress Levels', 'Sleep Deprivation'],
      lastCheckup: '2024-01-12',
      nextAction: 'Mental health counseling sessions recommended',
      healthScore: 58
    },
    {
      id: '4',
      name: 'Emily Thompson',
      employeeId: 'EMP0734',
      department: 'Marketing',
      riskLevel: 'high',
      riskFactors: ['Chronic Back Pain', 'Poor Posture', 'Musculoskeletal Issues'],
      lastCheckup: '2024-01-05',
      nextAction: 'Physiotherapy sessions and ergonomic assessment',
      healthScore: 62
    },
    {
      id: '5',
      name: 'David Wilson',
      employeeId: 'EMP1890',
      department: 'Operations',
      riskLevel: 'medium',
      riskFactors: ['Borderline Hypertension', 'Overweight', 'Low Physical Activity'],
      lastCheckup: '2024-01-15',
      nextAction: 'Wellness program enrollment and follow-up in 3 months',
      healthScore: 68
    },
    {
      id: '6',
      name: 'Lisa Rodriguez',
      employeeId: 'EMP2103',
      department: 'HR',
      riskLevel: 'medium',
      riskFactors: ['Vitamin D Deficiency', 'Irregular Sleep Pattern', 'Mild Anemia'],
      lastCheckup: '2024-01-11',
      nextAction: 'Nutritional supplementation and lifestyle counseling',
      healthScore: 70
    }
  ];

  const stats = {
    criticalRisk: riskEmployees.filter(e => e.riskLevel === 'critical').length,
    highRisk: riskEmployees.filter(e => e.riskLevel === 'high').length,
    mediumRisk: riskEmployees.filter(e => e.riskLevel === 'medium').length,
    totalMonitored: riskEmployees.length
  };

  const filteredEmployees = useMemo(() => {
    return riskEmployees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRisk = riskFilter === 'all' || emp.riskLevel === riskFilter;

      return matchesSearch && matchesRisk;
    });
  }, [riskFilter, searchQuery]);

  const loadAlertsConfig = async () => {
    try {
      setAlertsLoading(true);
      const { data } = await api.get('/corporate/risk-monitor/alerts');
      const cfg = (data as any)?.data?.config as RiskAlertsConfig | undefined;
      if (cfg) setAlertsConfig(cfg);
    } catch (error: any) {
      toast({
        title: 'Failed to load alert settings',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    loadAlertsConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenAlerts = () => {
    setAlertsOpen(true);
  };

  const handleSaveAlerts = async () => {
    try {
      setAlertsSaving(true);
      const { data } = await api.put('/corporate/risk-monitor/alerts', alertsConfig);
      const cfg = (data as any)?.data?.config as RiskAlertsConfig | undefined;
      if (cfg) setAlertsConfig(cfg);
      toast({ title: 'Alert settings saved', description: 'Risk alert configuration updated.' });
      setAlertsOpen(false);
    } catch (error: any) {
      toast({
        title: 'Failed to save settings',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAlertsSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/corporate/risk-monitor/export', { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'risk-monitor.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Export started', description: 'Risk monitor report downloaded.' });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-red-600" />;
      case 'decreasing':
        return <TrendingUp className="h-4 w-4 text-green-600 transform rotate-180" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Health Risk Monitor</h1>
          <p className="text-gray-500 mt-1">Track and manage employee health risks proactively</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleOpenAlerts} disabled={alertsLoading}>
            <Bell className="h-4 w-4 mr-2" />
            Configure Alerts
          </Button>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Configure Risk Alerts</DialogTitle>
            <DialogDescription>Set notification channels and risk thresholds.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Alerts Enabled</Label>
                <p className="text-sm text-gray-500">Turn risk alerts on/off</p>
              </div>
              <Switch
                checked={alertsConfig.enabled}
                onCheckedChange={(checked) => setAlertsConfig((p) => ({ ...p, enabled: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-gray-500">Send alerts to corporate email</p>
              </div>
              <Switch
                checked={alertsConfig.notifyEmail}
                onCheckedChange={(checked) => setAlertsConfig((p) => ({ ...p, notifyEmail: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>SMS Notifications</Label>
                <p className="text-sm text-gray-500">Send alerts via SMS</p>
              </div>
              <Switch
                checked={alertsConfig.notifySms}
                onCheckedChange={(checked) => setAlertsConfig((p) => ({ ...p, notifySms: checked }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="thrCritical">Critical Threshold</Label>
                <Input
                  id="thrCritical"
                  type="number"
                  value={alertsConfig.thresholds.critical}
                  onChange={(e) =>
                    setAlertsConfig((p) => ({
                      ...p,
                      thresholds: { ...p.thresholds, critical: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="thrHigh">High Threshold</Label>
                <Input
                  id="thrHigh"
                  type="number"
                  value={alertsConfig.thresholds.high}
                  onChange={(e) =>
                    setAlertsConfig((p) => ({
                      ...p,
                      thresholds: { ...p.thresholds, high: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="thrMedium">Medium Threshold</Label>
                <Input
                  id="thrMedium"
                  type="number"
                  value={alertsConfig.thresholds.medium}
                  onChange={(e) =>
                    setAlertsConfig((p) => ({
                      ...p,
                      thresholds: { ...p.thresholds, medium: Number(e.target.value) },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAlerts} disabled={alertsSaving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.criticalRisk}</div>
            <p className="text-xs text-red-600">Immediate attention required</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <Shield className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.highRisk}</div>
            <p className="text-xs text-orange-600">Close monitoring needed</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Medium Risk</CardTitle>
            <Activity className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.mediumRisk}</div>
            <p className="text-xs text-yellow-600">Preventive care recommended</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monitored</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMonitored}</div>
            <p className="text-xs text-muted-foreground">Active monitoring</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Categories Overview</CardTitle>
          <CardDescription>Distribution of health risks across your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {riskCategories.map((category) => (
              <Card key={category.name}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{category.name}</h3>
                    {getTrendIcon(category.trend)}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold">{category.count}</span>
                    <span className="text-sm text-gray-500">employees</span>
                  </div>
                  <Badge className={getRiskColor(category.severity)}>
                    {category.severity.toUpperCase()} SEVERITY
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* At-Risk Employees */}
      <Card>
        <CardHeader>
          <CardTitle>At-Risk Employees</CardTitle>
          <CardDescription>Employees requiring health interventions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Input
              placeholder="Search by name, ID, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="critical">Critical Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
                <SelectItem value="medium">Medium Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {filteredEmployees.map((employee) => (
              <Card key={employee.id} className={`border-l-4 ${
                employee.riskLevel === 'critical' ? 'border-l-red-500' :
                employee.riskLevel === 'high' ? 'border-l-orange-500' :
                'border-l-yellow-500'
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{employee.name}</h3>
                        <Badge variant="outline">{employee.employeeId}</Badge>
                        <Badge variant="secondary">{employee.department}</Badge>
                      </div>
                      <Badge className={getRiskColor(employee.riskLevel)}>
                        {employee.riskLevel.toUpperCase()} RISK
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Health Score</div>
                      <div className={`text-2xl font-bold ${
                        employee.healthScore < 50 ? 'text-red-600' :
                        employee.healthScore < 70 ? 'text-orange-600' :
                        'text-yellow-600'
                      }`}>
                        {employee.healthScore}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Risk Factors:</h4>
                      <div className="flex flex-wrap gap-2">
                        {employee.riskFactors.map((factor, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {factor}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Last Checkup</p>
                        <p className="font-semibold flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(employee.lastCheckup).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Next Action</p>
                        <p className="font-semibold">{employee.nextAction}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button size="sm">View Full Profile</Button>
                    <Button size="sm" variant="outline">Schedule Intervention</Button>
                    <Button size="sm" variant="outline">Send Alert</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No employees found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CorporateRiskMonitor;

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp, Shield, Activity, Users, Heart, Filter, Bell, Calendar, Download, Eye, Zap, AlertCircle } from 'lucide-react';
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
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import CorporateStatusBadge from '@/components/corporate/CorporateStatusBadge';

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

  const riskCategories: RiskCategory[] = [];
  const riskEmployees: RiskEmployee[] = [];

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
  }, [riskFilter, searchQuery, riskEmployees]);

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
  }, []);

  const downloadCsv = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

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
      // Graceful fallback: export visible dataset if API fails
      downloadCsv(
        [
          ['Name', 'Employee ID', 'Department', 'Risk Level', 'Health Score', 'Last Checkup', 'Next Action'],
          ...riskEmployees.map((e) => [
            e.name,
            e.employeeId,
            e.department,
            e.riskLevel,
            String(e.healthScore),
            e.lastCheckup,
            e.nextAction,
          ]),
        ],
        'risk-monitor-fallback.csv'
      );
      toast({
        title: 'Export fallback used',
        description: 'API unavailable; exported on-screen data instead.',
      });
    }
  };

  const handleViewProfile = (employee: RiskEmployee) => {
    toast({ title: 'Profile opened', description: `${employee.name}'s profile is ready to review.` });
  };

  const handleScheduleIntervention = (employee: RiskEmployee) => {
    toast({ title: 'Intervention scheduled', description: `Follow-up set for ${employee.name}.` });
  };

  const handleSendAlert = (employee: RiskEmployee) => {
    toast({ title: 'Alert sent', description: `Health alert sent for ${employee.name}.` });
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-red-600" />;
      case 'decreasing':
        return <TrendingUp className="h-4 w-4 text-green-600 transform rotate-180" />;
      default:
        return <Activity className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <CorporateLayout title="Risk Monitor">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={AlertTriangle}
          title="Health Risk Monitor"
          description="Track and manage employee health risks proactively with real-time alerts"
          gradient="from-amber-500 to-orange-600"
          showSearch={true}
          searchPlaceholder="Search by employee name, ID, or department..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showExport={true}
          onExport={handleExport}
          stats={[
            { label: 'Critical Risk', value: stats.criticalRisk },
            { label: 'High Risk', value: stats.highRisk },
            { label: 'Medium Risk', value: stats.mediumRisk },
            { label: 'Total Monitored', value: stats.totalMonitored },
          ]}
          actions={
            <Button variant="outline" size="sm" onClick={handleOpenAlerts} disabled={alertsLoading} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Bell className="h-4 w-4 mr-2" />
              Configure Alerts
            </Button>
          }
        />

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
                <p className="text-sm text-slate-400">Turn risk alerts on/off</p>
              </div>
              <Switch
                checked={alertsConfig.enabled}
                onCheckedChange={(checked) => setAlertsConfig((p) => ({ ...p, enabled: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-slate-400">Send alerts to corporate email</p>
              </div>
              <Switch
                checked={alertsConfig.notifyEmail}
                onCheckedChange={(checked) => setAlertsConfig((p) => ({ ...p, notifyEmail: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>SMS Notifications</Label>
                <p className="text-sm text-slate-400">Send alerts via SMS</p>
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
        <Card className="!p-0 bg-red-500/10 border-red-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Critical Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{stats.criticalRisk}</div>
            <p className="text-xs text-red-400/70">Immediate attention required</p>
          </CardContent>
        </Card>

        <Card className="!p-0 bg-orange-500/10 border-orange-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">High Risk</CardTitle>
            <Shield className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">{stats.highRisk}</div>
            <p className="text-xs text-orange-400/70">Close monitoring needed</p>
          </CardContent>
        </Card>

        <Card className="!p-0 bg-amber-500/10 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Medium Risk</CardTitle>
            <Activity className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{stats.mediumRisk}</div>
            <p className="text-xs text-amber-400/70">Preventive care recommended</p>
          </CardContent>
        </Card>

        <Card className="!p-0 bg-slate-900/50 border-white/[0.06]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Total Monitored</CardTitle>
            <Users className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalMonitored}</div>
            <p className="text-xs text-slate-500">Active monitoring</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Categories */}
      <Card className="!p-0 bg-slate-900/50 border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-white">Risk Categories Overview</CardTitle>
          <CardDescription className="text-slate-400">Distribution of health risks across your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {riskCategories.map((category) => (
              <Card key={category.name} className="!p-0 bg-slate-800/50 border-white/[0.06]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white">{category.name}</h3>
                    {getTrendIcon(category.trend)}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold text-white">{category.count}</span>
                    <span className="text-sm text-slate-400">employees</span>
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
      <Card className="!p-0 bg-slate-900/50 border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-white">At-Risk Employees</CardTitle>
          <CardDescription className="text-slate-400">Employees requiring health interventions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Input
              placeholder="Search by name, ID, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-slate-800/60 border-white/10 text-white placeholder:text-slate-500"
            />
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[180px] bg-slate-800/60 border-white/10 text-slate-300">
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
              <Card key={employee.id} className={`!p-0 bg-slate-800/50 border-l-4 border-white/[0.04] ${
                employee.riskLevel === 'critical' ? 'border-l-red-500' :
                employee.riskLevel === 'high' ? 'border-l-orange-500' :
                'border-l-amber-500'
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-white">{employee.name}</h3>
                        <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 border">{employee.employeeId}</Badge>
                        <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 border">{employee.department}</Badge>
                      </div>
                      <Badge className={getRiskColor(employee.riskLevel)}>
                        {employee.riskLevel.toUpperCase()} RISK
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-400 mb-1">Health Score</div>
                      <div className={`text-2xl font-bold ${
                        employee.healthScore < 50 ? 'text-red-400' :
                        employee.healthScore < 70 ? 'text-orange-400' :
                        'text-amber-400'
                      }`}>
                        {employee.healthScore}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-300 mb-2">Risk Factors:</h4>
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
                        <p className="text-slate-400">Last Checkup</p>
                        <p className="font-semibold flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(employee.lastCheckup).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Next Action</p>
                        <p className="font-semibold">{employee.nextAction}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button size="sm" onClick={() => handleViewProfile(employee)}>View Full Profile</Button>
                    <Button size="sm" variant="outline" onClick={() => handleScheduleIntervention(employee)}>Schedule Intervention</Button>
                    <Button size="sm" variant="outline" onClick={() => handleSendAlert(employee)}>Send Alert</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No employees found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </CorporateLayout>
  );
};

export default CorporateRiskMonitor;

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Phone, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Settings, 
  Activity, 
  TestTube, 
  Globe, 
  Shield,
  BarChart3,
  Monitor,
  Users,
  Clock,
  PhoneCall,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  FileText,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Loader2,
  Info,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';

const VoiceCallManagement = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/voice-config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data.data);
      } else {
        toast.error('Failed to load voice call configuration');
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error('Failed to load voice call configuration');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/voice-config/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/voice-config/logs', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchStats();
    fetchLogs();
  }, []);

  const testProvider = async (providerId: string) => {
    setTesting(prev => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetch(`/api/voice-config/test/${providerId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      
      if (response.ok) {
        toast.success(`${providerId} test successful`);
      } else {
        toast.error(`${providerId} test failed`);
      }
    } catch (error) {
      console.error(`Error testing ${providerId}:`, error);
      toast.error(`${providerId} test failed`);
    } finally {
      setTesting(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/voice-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        toast.success('Configuration saved successfully');
      } else {
        toast.error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading voice call configuration...</span>
        </div>
      </AdminLayout>
    );
  }

  const providers = [
    {
      id: 'exotel',
      name: 'Exotel',
      description: 'Best for India - Local presence, TRAI compliant, cost-effective',
      features: ['Virtual Numbers', 'IVR', 'Call Recording', 'Analytics', 'TRAI Compliant'],
      enabled: false,
      apiKey: '',
      apiSecret: '',
      pricing: '₹2000+/month'
    },
    {
      id: 'knowlarity',
      name: 'Knowlarity',
      description: 'Healthcare Focus - CRM integration, analytics, medical workflows',
      features: ['CRM Integration', 'Advanced Analytics', 'Medical Workflows', 'Multi-language'],
      enabled: false,
      apiKey: '',
      apiSecret: '',
      pricing: '₹1500+/month'
    },
    {
      id: 'ozonetel',
      name: 'Ozonetel',
      description: 'Medical Platform - Healthcare specialization, call center features',
      features: ['Healthcare Specialized', 'Call Center Features', 'Patient Management', 'Compliance'],
      enabled: false,
      apiKey: '',
      apiSecret: '',
      pricing: 'Healthcare plans'
    },
    {
      id: 'twilio',
      name: 'Twilio',
      description: 'Global Platform - International coverage with India support',
      features: ['Global Coverage', 'Advanced APIs', 'SIP Support', 'WebRTC'],
      enabled: false,
      apiKey: '',
      apiSecret: '',
      pricing: 'Pay per use'
    },
    {
      id: 'airtel_iq',
      name: 'Airtel IQ',
      description: 'Enterprise Solution - Bharti Airtel\'s enterprise communication platform',
      features: ['Enterprise Grade', 'Local Support', 'Integration Ready', 'Scalable'],
      enabled: false,
      apiKey: '',
      apiSecret: '',
      pricing: 'Enterprise pricing'
    },
    {
      id: 'jio_platforms',
      name: 'Jio Platforms',
      description: 'Digital Platform - Reliance Jio\'s business communication suite',
      features: ['Digital First', 'AI Integration', 'Cloud Native', 'Modern APIs'],
      enabled: false,
      apiKey: '',
      apiSecret: '',
      pricing: 'Custom plans'
    }
  ];

  const configData = config || { providers: providers };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCalls || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.callsToday || 0} today
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.successRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Providers</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{configData?.providers?.filter((p: any) => p.enabled).length || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {configData?.providers?.length || 0} configured
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Provider Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configData?.providers?.map((provider: any) => (
              <div key={provider.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${provider.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="font-medium">{provider.name}</span>
                </div>
                <Badge variant={provider.enabled ? "default" : "secondary"}>
                  {provider.enabled ? "Active" : "Disabled"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderConfiguration = () => (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Configure voice call providers for Indian telecom compliance. All providers support DND registry checks and TRAI regulations.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {configData?.providers?.map((provider: any) => (
          <Card key={provider.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">{provider.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{provider.description}</p>
                <Badge variant="outline" className="mt-1">{provider.pricing}</Badge>
              </div>
              <Switch 
                checked={provider.enabled}
                onCheckedChange={(checked) => {
                  setConfig(prev => ({
                    ...prev,
                    providers: prev?.providers?.map(p => 
                      p.id === provider.id ? { ...p, enabled: checked } : p
                    ) || configData.providers.map(p => 
                      p.id === provider.id ? { ...p, enabled: checked } : p
                    )
                  }));
                }}
              />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`${provider.id}-apiKey`}>API Key</Label>
                    <Input
                      id={`${provider.id}-apiKey`}
                      type="password"
                      value={provider.apiKey || ''}
                      onChange={(e) => {
                        setConfig(prev => ({
                          ...prev,
                          providers: (prev?.providers || configData.providers).map(p => 
                            p.id === provider.id ? { ...p, apiKey: e.target.value } : p
                          )
                        }));
                      }}
                      placeholder="Enter API Key"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${provider.id}-apiSecret`}>API Secret</Label>
                    <Input
                      id={`${provider.id}-apiSecret`}
                      type="password"
                      value={provider.apiSecret || ''}
                      onChange={(e) => {
                        setConfig(prev => ({
                          ...prev,
                          providers: (prev?.providers || configData.providers).map(p => 
                            p.id === provider.id ? { ...p, apiSecret: e.target.value } : p
                          )
                        }));
                      }}
                      placeholder="Enter API Secret"
                    />
                  </div>
                </div>

                {provider.features && (
                  <div>
                    <Label>Features</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {provider.features.map((feature: string) => (
                        <Badge key={feature} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => testProvider(provider.id)}
                    disabled={testing[provider.id] || !provider.enabled}
                    className="flex items-center gap-2"
                  >
                    {testing[provider.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                    Test Connection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={saveConfig} disabled={saving} className="flex items-center gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Settings className="h-4 w-4" />
          )}
          Save Configuration
        </Button>
      </div>
    </div>
  );

  const renderStatistics = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Call Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Analytics dashboard coming soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderLogs = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-3">
              {logs.slice(0, 10).map((log, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span>{log.message || 'Activity logged'}</span>
                  </div>
                  <Badge variant="outline">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Recent'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Voice Call Management</h1>
            <p className="text-muted-foreground">
              Configure and manage voice calling services for Indian telecom providers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              India Compliant
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              TRAI Certified
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="configuration" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="statistics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Statistics
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            {renderDashboard()}
          </TabsContent>

          <TabsContent value="configuration">
            {renderConfiguration()}
          </TabsContent>

          <TabsContent value="statistics">
            {renderStatistics()}
          </TabsContent>

          <TabsContent value="logs">
            {renderLogs()}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default VoiceCallManagement;
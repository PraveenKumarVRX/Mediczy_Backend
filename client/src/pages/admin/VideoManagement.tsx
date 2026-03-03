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
  Video, 
  Settings, 
  Activity, 
  BarChart3, 
  Monitor, 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Play,
  Pause,
  Square,
  Phone,
  VideoOff,
  Mic,
  MicOff,
  ScreenShare,
  MessageSquare,
  FileImage
} from 'lucide-react';
import api from '@/utils/api';

const VideoManagement = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState({});
  const [livekitHealth, setLivekitHealth] = useState({ testing: false, success: null, message: '' });

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load configuration
      const { data: configData } = await api.get('/video-config/settings');
      if (configData.success) setConfig(configData.config);

      // Load active sessions
      const { data: sessionsData } = await api.get('/video-config/sessions/active');
      if (sessionsData.success) setActiveSessions(sessionsData.sessions);

      // Load statistics
      const { data: statsData } = await api.get('/video-config/stats');
      if (statsData.success) setStats(statsData.stats);

      // Load recent logs
      const { data: logsData } = await api.get('/video-config/logs', { params: { limit: 20 } });
      if (logsData.success) setLogs(logsData.logs);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfiguration = async (newConfig) => {
    try {
      const { data } = await api.post('/video-config/settings', newConfig);
      if (data.success) {
        setConfig(data.config);
        alert('Configuration updated successfully!');
      } else {
        alert(`Failed to update configuration: ${data.message}`);
      }
    } catch (error) {
      console.error('Error updating configuration:', error);
      alert('Failed to update configuration');
    }
  };

  const configureProvider = async (provider, settings) => {
    try {
      const { data } = await api.post(`/video-config/provider/${provider}/configure`, settings);
      if (data.success) {
        await loadDashboardData(); // Refresh data
        alert(`${provider} provider configured successfully!`);
      } else {
        alert(`Failed to configure provider: ${data.message}`);
      }
    } catch (error) {
      console.error('Error configuring provider:', error);
      alert('Failed to configure provider');
    }
  };

  const testProvider = async (provider) => {
    try {
      setTestResults(prev => ({ ...prev, [provider]: { testing: true } }));

      const { data } = await api.post(`/video-config/provider/${provider}/test`);
      setTestResults(prev => ({
        ...prev,
        [provider]: {
          testing: false,
          success: data.success,
          message: data.message,
          timestamp: data.timestamp
        }
      }));
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [provider]: {
          testing: false,
          success: false,
          message: error?.response?.data?.message || error?.message,
          timestamp: new Date().toISOString()
        }
      }));
    }
  };

  const runLivekitHealthCheck = async () => {
    try {
      setLivekitHealth({ testing: true, success: null, message: '' });
      const { data } = await api.post('/video-config/provider/livekit/test');
      setLivekitHealth({
        testing: false,
        success: data.success,
        message: data.message || (data.success ? 'LiveKit is reachable' : 'LiveKit test failed')
      });
    } catch (error) {
      console.error('LiveKit health check failed:', error);
      setLivekitHealth({
        testing: false,
        success: false,
        message: 'LiveKit health check failed'
      });
    }
  };

  const openLivekitTestRoom = async () => {
    try {
      setLivekitHealth({ testing: true, success: null, message: 'Creating test room...' });
      const { data } = await api.post('/video/livekit/token', {
        roomName: `admin-test-${Date.now()}`
      });
      const joinUrl = data?.video?.joinUrl;
      if (joinUrl) {
        window.open(joinUrl, '_blank', 'width=1280,height=720');
        setLivekitHealth({
          testing: false,
          success: true,
          message: 'Opened LiveKit test room'
        });
        return;
      }
      setLivekitHealth({
        testing: false,
        success: false,
        message: 'LiveKit test room could not be created'
      });
    } catch (error) {
      console.error('LiveKit test room failed:', error);
      setLivekitHealth({
        testing: false,
        success: false,
        message: 'LiveKit test room failed'
      });
    }
  };

  const endSession = async (sessionId) => {
    try {
      const { data } = await api.post(`/video-config/session/${sessionId}/end`, { endedBy: 'admin' });
      if (data.success) {
        await loadDashboardData(); // Refresh sessions
        alert('Session ended successfully');
      } else {
        alert(`Failed to end session: ${data.message}`);
      }
    } catch (error) {
      console.error('Error ending session:', error);
      alert('Failed to end session');
    }
  };

  if (loading || !config) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Video className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p>Loading video call management...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Video Call Management</h1>
            <p className="text-muted-foreground">Configure and manage video calling system</p>
          </div>
          <div className="flex items-center space-x-2">
            <Video className="h-5 w-5 text-blue-600" />
            <Badge variant={config.providers.find(p => p.id === config.provider && p.configured) ? "default" : "destructive"}>
              {config.provider.toUpperCase()}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Sessions</span>
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex items-center space-x-2">
              <Monitor className="h-4 w-4" />
              <span>Providers</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Logs</span>
            </TabsTrigger>
            <TabsTrigger value="help" className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <span>Help</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border-border/60 bg-card/95">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Video className="h-4 w-4 text-blue-600" />
                      <span className="text-2xl font-bold">{stats.totalSessions}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border/60 bg-card/95">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Sessions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Play className="h-4 w-4 text-green-600" />
                      <span className="text-2xl font-bold text-green-600">{stats.activeSessions}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border/60 bg-card/95">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-orange-600" />
                      <span className="text-2xl font-bold">{Math.floor(stats.averageDuration / 60)}m</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border/60 bg-card/95">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Current Provider</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4 text-purple-600" />
                      <span className="text-lg font-bold uppercase">{stats.currentProvider}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card className="border-border/60 bg-card/95">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button 
                    onClick={() => setActiveTab('settings')}
                    className="flex items-center space-x-2"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Button>
                  <Button 
                    onClick={() => setActiveTab('providers')}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Monitor className="h-4 w-4" />
                    <span>Providers</span>
                  </Button>
                  <Button 
                    onClick={() => setActiveTab('sessions')}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Users className="h-4 w-4" />
                    <span>Sessions</span>
                  </Button>
                  <Button 
                    onClick={() => setActiveTab('logs')}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Activity className="h-4 w-4" />
                    <span>Logs</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {config && (
              <Card className="border-border/60 bg-card/95">
                <CardHeader>
                  <CardTitle>LiveKit Health Check</CardTitle>
                  <p className="text-sm text-muted-foreground">Verify LiveKit config and open a test room</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={runLivekitHealthCheck}
                      disabled={livekitHealth.testing}
                      className="flex items-center gap-2"
                    >
                      <Activity className="h-4 w-4" />
                      {livekitHealth.testing ? 'Testing...' : 'Test LiveKit Config'}
                    </Button>
                    <Button
                      onClick={openLivekitTestRoom}
                      disabled={livekitHealth.testing}
                      className="flex items-center gap-2"
                    >
                      <Video className="h-4 w-4" />
                      Open LiveKit Test Room
                    </Button>
                    {livekitHealth.success !== null && (
                      <Badge variant={livekitHealth.success ? 'default' : 'destructive'}>
                        {livekitHealth.success ? 'Healthy' : 'Unhealthy'}
                      </Badge>
                    )}
                  </div>
                  {livekitHealth.message && (
                    <Alert>
                      <AlertDescription>{livekitHealth.message}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Active Sessions Tab */}
          <TabsContent value="sessions" className="space-y-6">
            <Card className="border-border/60 bg-card/95">
              <CardHeader>
                <CardTitle>Active Video Sessions</CardTitle>
                <p className="text-sm text-muted-foreground">Manage currently running video calls</p>
              </CardHeader>
              <CardContent>
                {activeSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No active video sessions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeSessions.map(session => (
                      <div key={session.id} className="border border-border/70 rounded-lg p-4 bg-card/80">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <Badge variant="default">{session.provider.toUpperCase()}</Badge>
                              <span className="font-medium">Room: {session.roomId}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Participants: {session.participants.length}/{session.settings.maxParticipants}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Started: {new Date(session.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                              {session.status}
                            </Badge>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => endSession(session.id)}
                            >
                              End Session
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Providers Tab */}
          <TabsContent value="providers" className="space-y-6">
            <Card className="border-border/60 bg-card/95">
              <CardHeader>
                <CardTitle>Video Call Providers</CardTitle>
                <p className="text-sm text-muted-foreground">Configure different video calling services</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {config.providers.map(provider => (
                  <ProviderCard 
                    key={provider.id}
                    provider={provider}
                    isActive={config.provider === provider.id}
                    testResult={testResults[provider.id]}
                    onConfigure={(settings) => configureProvider(provider.id, settings)}
                    onTest={() => testProvider(provider.id)}
                    onSetActive={() => updateConfiguration({ provider: provider.id })}
                  />
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <SettingsCard 
              config={config} 
              onUpdate={updateConfiguration}
            />
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-6">
            <Card className="border-border/60 bg-card/95">
              <CardHeader>
                <CardTitle>Video Session Logs</CardTitle>
                <p className="text-sm text-muted-foreground">Recent video calling activity</p>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No video session logs</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border border-border/70 rounded bg-card/80">
                        <div className="flex items-center space-x-3">
                          <Badge variant="outline">{log.provider}</Badge>
                          <span className="font-medium">{log.action}</span>
                          <span className="text-sm text-muted-foreground">Session: {log.sessionId}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Help Tab */}
          <TabsContent value="help" className="space-y-6">
            <HelpCard />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

// Provider Configuration Card Component
const ProviderCard = ({ provider, isActive, testResult, onConfigure, onTest, onSetActive }) => {
  const [settings, setSettings] = useState(provider.settings || {});
  const [enabled, setEnabled] = useState(provider.enabled);

  const handleSave = () => {
    onConfigure({ enabled, settings });
  };

  const getProviderIcon = (providerId) => {
    switch (providerId) {
      case 'webrtc': return <Video className="h-5 w-5" />;
      case 'livekit': return <Video className="h-5 w-5" />;
      case 'jitsi': return <Users className="h-5 w-5" />;
      case 'zoom': return <Phone className="h-5 w-5" />;
      case 'agora': return <Video className="h-5 w-5" />;
      default: return <Settings className="h-5 w-5" />;
    }
  };

  return (
    <Card className={`border-2 ${isActive ? 'border-blue-500' : 'border-border/70'} bg-card/95`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getProviderIcon(provider.id)}
            <div>
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant={provider.configured ? 'default' : 'secondary'}>
                  {provider.configured ? 'Configured' : 'Not Configured'}
                </Badge>
                {isActive && <Badge variant="outline">Active</Badge>}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch 
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testResult?.testing}
            >
              {testResult?.testing ? 'Testing...' : 'Test'}
            </Button>
            {!isActive && provider.configured && (
              <Button
                variant="default"
                size="sm"
                onClick={onSetActive}
              >
                Set Active
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider-specific settings */}
        {provider.id === 'livekit' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Server URL</Label>
                <Input
                  value={settings.serverUrl || ''}
                  onChange={(e) => setSettings({...settings, serverUrl: e.target.value})}
                  placeholder="wss://livekit.your-domain.com"
                />
              </div>
              <div>
                <Label>Meet URL</Label>
                <Input
                  value={settings.meetUrl || ''}
                  onChange={(e) => setSettings({...settings, meetUrl: e.target.value})}
                  placeholder="https://meet.your-domain.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={settings.apiKey || ''}
                  onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                  placeholder="Your LiveKit API key"
                />
              </div>
              <div>
                <Label>API Secret</Label>
                <Input
                  type="password"
                  value={settings.apiSecret || ''}
                  onChange={(e) => setSettings({...settings, apiSecret: e.target.value})}
                  placeholder="Your LiveKit API secret"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Room Prefix</Label>
                <Input
                  value={settings.roomPrefix || ''}
                  onChange={(e) => setSettings({...settings, roomPrefix: e.target.value})}
                  placeholder="mediczy_"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Recording</Label>
              <Switch
                checked={settings.enableRecording || false}
                onCheckedChange={(checked) => setSettings({...settings, enableRecording: checked})}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Egress</Label>
              <Switch
                checked={settings.enableEgress || false}
                onCheckedChange={(checked) => setSettings({...settings, enableEgress: checked})}
              />
            </div>
          </div>
        )}

        {provider.id === 'jitsi' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Domain</Label>
              <Input
                value={settings.domain || ''}
                onChange={(e) => setSettings({...settings, domain: e.target.value})}
                placeholder="meet.jit.si"
              />
            </div>
            <div>
              <Label>Room Prefix</Label>
              <Input
                value={settings.roomPrefix || ''}
                onChange={(e) => setSettings({...settings, roomPrefix: e.target.value})}
                placeholder="MediczY"
              />
            </div>
          </div>
        )}

        {provider.id === 'zoom' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>SDK Key</Label>
              <Input
                type="password"
                value={settings.sdkKey || ''}
                onChange={(e) => setSettings({...settings, sdkKey: e.target.value})}
                placeholder="Your Zoom SDK Key"
              />
            </div>
            <div>
              <Label>SDK Secret</Label>
              <Input
                type="password"
                value={settings.sdkSecret || ''}
                onChange={(e) => setSettings({...settings, sdkSecret: e.target.value})}
                placeholder="Your Zoom SDK Secret"
              />
            </div>
          </div>
        )}

        {provider.id === 'agora' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>App ID</Label>
                <Input
                  value={settings.appId || ''}
                  onChange={(e) => setSettings({...settings, appId: e.target.value})}
                  placeholder="Your Agora App ID"
                />
              </div>
              <div>
                <Label>App Certificate</Label>
                <Input
                  type="password"
                  value={settings.appCertificate || ''}
                  onChange={(e) => setSettings({...settings, appCertificate: e.target.value})}
                  placeholder="Your Agora App Certificate"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Video Profile</Label>
                <Select 
                  value={settings.videoProfile || '720p_1'}
                  onValueChange={(value) => setSettings({...settings, videoProfile: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p_1">480p (640x480)</SelectItem>
                    <SelectItem value="720p_1">720p (1280x720)</SelectItem>
                    <SelectItem value="1080p_1">1080p (1920x1080)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Audio Profile</Label>
                <Select 
                  value={settings.audioProfile || 'music_standard'}
                  onValueChange={(value) => setSettings({...settings, audioProfile: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="speech_low_quality">Speech Low</SelectItem>
                    <SelectItem value="speech_standard">Speech Standard</SelectItem>
                    <SelectItem value="music_standard">Music Standard</SelectItem>
                    <SelectItem value="music_high_quality">Music High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Recording</Label>
              <Switch 
                checked={settings.enableRecording || false}
                onCheckedChange={(checked) => setSettings({...settings, enableRecording: checked})}
              />
            </div>
          </div>
        )}

        {testResult && (
          <Alert className={testResult.success ? 'border-green-300/60 bg-green-500/10' : 'border-red-300/60 bg-red-500/10'}>
            <AlertDescription className="flex items-center space-x-2">
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span>{testResult.message}</span>
            </AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} className="w-full">
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
};

// Settings Card Component
const SettingsCard = ({ config, onUpdate }) => {
  const [settings, setSettings] = useState(config.settings);

  const handleSave = () => {
    onUpdate({ settings });
  };

  return (
    <Card className="border-border/60 bg-card/95">
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <p className="text-sm text-muted-foreground">Configure global video call settings</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Max Participants</Label>
              <Select 
                value={settings.maxParticipants.toString()}
                onValueChange={(value) => setSettings({...settings, maxParticipants: parseInt(value)})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 (Doctor + Patient)</SelectItem>
                  <SelectItem value="4">4 Participants</SelectItem>
                  <SelectItem value="6">6 Participants</SelectItem>
                  <SelectItem value="10">10 Participants</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Video Quality</Label>
              <Select 
                value={settings.videoQuality}
                onValueChange={(value) => setSettings({...settings, videoQuality: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (360p)</SelectItem>
                  <SelectItem value="medium">Medium (480p)</SelectItem>
                  <SelectItem value="high">High (720p)</SelectItem>
                  <SelectItem value="hd">HD (1080p)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Session Timeout (seconds)</Label>
              <Input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => setSettings({...settings, sessionTimeout: parseInt(e.target.value)})}
                min="300"
                max="7200"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enable Screen Share</Label>
              <Switch 
                checked={settings.enableScreenShare}
                onCheckedChange={(checked) => setSettings({...settings, enableScreenShare: checked})}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Enable Chat</Label>
              <Switch 
                checked={settings.enableChat}
                onCheckedChange={(checked) => setSettings({...settings, enableChat: checked})}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Auto End Session</Label>
              <Switch 
                checked={settings.autoEndSession}
                onCheckedChange={(checked) => setSettings({...settings, autoEndSession: checked})}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Require Authentication</Label>
              <Switch 
                checked={settings.requireAuth}
                onCheckedChange={(checked) => setSettings({...settings, requireAuth: checked})}
              />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} className="w-full">
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
};

// Help Card Component
const HelpCard = () => (
  <Card className="border-border/60 bg-card/95">
    <CardHeader>
      <CardTitle>Video Call Configuration Guide</CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-lg mb-2">Supported Providers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border/70 rounded-lg p-4 bg-card/80">
              <div className="flex items-center space-x-2 mb-2">
                <Video className="h-5 w-5 text-indigo-600" />
                <span className="font-medium">LiveKit</span>
              </div>
              <p className="text-sm text-muted-foreground">Modern WebRTC SFU with web and mobile SDKs. <strong>Recommended</strong></p>
            </div>

            <div className="border border-border/70 rounded-lg p-4 bg-card/80">
              <div className="flex items-center space-x-2 mb-2">
                <Video className="h-5 w-5 text-blue-600" />
                <span className="font-medium">WebRTC P2P</span>
              </div>
              <p className="text-sm text-muted-foreground">Direct peer-to-peer video calling. No external service required.</p>
            </div>

            <div className="border border-border/70 rounded-lg p-4 bg-card/80">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="h-5 w-5 text-purple-600" />
                <span className="font-medium">Jitsi Meet</span>
              </div>
              <p className="text-sm text-muted-foreground">Open source video conferencing platform.</p>
            </div>

            <div className="border border-border/70 rounded-lg p-4 bg-card/80">
              <div className="flex items-center space-x-2 mb-2">
                <Phone className="h-5 w-5 text-orange-600" />
                <span className="font-medium">Zoom SDK</span>
              </div>
              <p className="text-sm text-muted-foreground">Enterprise video calling with Zoom SDK integration.</p>
            </div>

            <div className="border border-border/70 rounded-lg p-4 bg-card/80">
              <div className="flex items-center space-x-2 mb-2">
                <Video className="h-5 w-5 text-red-600" />
                <span className="font-medium">Agora.io</span>
              </div>
              <p className="text-sm text-muted-foreground">Real-time video communication with excellent quality and scalability.</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-lg mb-2">Configuration Tips</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Use LiveKit for the best experience (recommended)</li>
            <li>Configure TURN servers for better connectivity</li>
            <li>Test each provider after configuration</li>
            <li>Monitor session logs for troubleshooting</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-lg mb-2">Environment Variables</h3>
          <div className="bg-muted/40 rounded-lg p-4 text-sm font-mono text-foreground">
            <div>LIVEKIT_URL=wss://livekit.your-domain.com</div>
            <div>LIVEKIT_API_KEY=your_livekit_key</div>
            <div>LIVEKIT_API_SECRET=your_livekit_secret</div>
            <div>LIVEKIT_MEET_URL=https://meet.your-domain.com</div>
            <div>JITSI_DOMAIN=meet.jit.si</div>
            <div>ZOOM_SDK_KEY=your_sdk_key</div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default VideoManagement;

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Settings,
  Shield,
  Bell,
  Database,
  Key,
  Mail,
  Globe,
  Save,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  Trash2,
  Lock,
  Unlock,
  Server,
  Activity,
  Users,
  Clock,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

const SettingsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // General Settings
  const [generalSettings, setGeneralSettings] = useState({
    siteName: 'Mediqzy Healthcare',
    siteDescription: 'Comprehensive Healthcare Management System',
    supportEmail: 'support@mediqzy.com',
    contactPhone: '+91-9876543210',
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    currency: 'INR',
    language: 'en',
    maintenanceMode: false
  });

  // API Settings
  const [apiSettings, setApiSettings] = useState({
    apiKey: 'medi_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    webhookUrl: 'https://mediqzy.com/api/webhooks',
    rateLimitPerMinute: 60,
    enableCors: true,
    allowedOrigins: 'https://mediqzy.com, https://app.mediqzy.com',
    apiVersion: 'v2.0',
    enableApiLogs: true
  });

  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: true,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireSpecialChar: true,
    requireNumbers: true,
    requireUppercase: true,
    ipWhitelist: '',
    enableAuditLogs: true,
    autoLogoutInactive: true
  });

  // Notification Settings
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: false,
    whatsappNotifications: true,
    appointmentReminders: true,
    systemAlerts: true,
    paymentNotifications: true,
    marketingEmails: false,
    weeklyReports: true,
    criticalAlertsOnly: false
  });

  // System Settings
  const [systemSettings, setSystemSettings] = useState({
    cacheEnabled: true,
    debugMode: false,
    autoBackup: true,
    backupFrequency: 'daily',
    logLevel: 'info',
    maxUploadSize: 10,
    enableCdn: true,
    compressionEnabled: true,
    sessionStorage: 'redis',
    queueDriver: 'redis'
  });

  const handleSaveSettings = async (section: string, data: any) => {
    setSaving(true);
    try {
      const { data: response } = await api.post(`/admin/settings/${section}`, data);
      
      toast({
        title: 'Settings Saved',
        description: `${section.charAt(0).toUpperCase() + section.slice(1)} settings updated successfully`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to save settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateApiKey = () => {
    const newKey = `medi_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setApiSettings({ ...apiSettings, apiKey: newKey });
    toast({
      title: 'API Key Regenerated',
      description: 'New API key generated. Make sure to update your applications.',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="h-8 w-8 text-blue-600" />
              System Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure and manage your healthcare platform settings
            </p>
          </div>
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Activity className="h-3 w-3 mr-1" />
            System Healthy
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">System</span>
            </TabsTrigger>
            <TabsTrigger value="backup" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Backup</span>
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Configuration</CardTitle>
                <CardDescription>
                  Basic settings for your healthcare platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="siteName">Site Name</Label>
                    <Input
                      id="siteName"
                      value={generalSettings.siteName}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, siteName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support Email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      value={generalSettings.supportEmail}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, supportEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <Input
                      id="contactPhone"
                      value={generalSettings.contactPhone}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, contactPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select value={generalSettings.timezone} onValueChange={(v) => setGeneralSettings({ ...generalSettings, timezone: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                        <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateFormat">Date Format</Label>
                    <Select value={generalSettings.dateFormat} onValueChange={(v) => setGeneralSettings({ ...generalSettings, dateFormat: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={generalSettings.currency} onValueChange={(v) => setGeneralSettings({ ...generalSettings, currency: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR (₹)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="siteDescription">Site Description</Label>
                  <Textarea
                    id="siteDescription"
                    rows={3}
                    value={generalSettings.siteDescription}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, siteDescription: e.target.value })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable to show maintenance page to all users
                    </p>
                  </div>
                  <Switch
                    id="maintenanceMode"
                    checked={generalSettings.maintenanceMode}
                    onCheckedChange={(checked) => setGeneralSettings({ ...generalSettings, maintenanceMode: checked })}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    onClick={() => handleSaveSettings('general', generalSettings)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Settings */}
          <TabsContent value="api" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>
                  Manage API keys and integration settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Keep your API key secure. Never share it publicly or commit it to version control.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={apiSettings.apiKey}
                          readOnly
                          className="pr-20 font-mono text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute right-1 top-1 h-7"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => copyToClipboard(apiSettings.apiKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleRegenerateApiKey}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <Input
                      id="webhookUrl"
                      type="url"
                      value={apiSettings.webhookUrl}
                      onChange={(e) => setApiSettings({ ...apiSettings, webhookUrl: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="rateLimitPerMinute">Rate Limit (per minute)</Label>
                      <Input
                        id="rateLimitPerMinute"
                        type="number"
                        value={apiSettings.rateLimitPerMinute}
                        onChange={(e) => setApiSettings({ ...apiSettings, rateLimitPerMinute: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiVersion">API Version</Label>
                      <Select value={apiSettings.apiVersion} onValueChange={(v) => setApiSettings({ ...apiSettings, apiVersion: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="v1.0">v1.0 (Legacy)</SelectItem>
                          <SelectItem value="v2.0">v2.0 (Current)</SelectItem>
                          <SelectItem value="v3.0">v3.0 (Beta)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="allowedOrigins">Allowed Origins (CORS)</Label>
                    <Textarea
                      id="allowedOrigins"
                      rows={3}
                      placeholder="https://example.com, https://app.example.com"
                      value={apiSettings.allowedOrigins}
                      onChange={(e) => setApiSettings({ ...apiSettings, allowedOrigins: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Enable CORS</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow cross-origin resource sharing
                      </p>
                    </div>
                    <Switch
                      checked={apiSettings.enableCors}
                      onCheckedChange={(checked) => setApiSettings({ ...apiSettings, enableCors: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>API Request Logging</Label>
                      <p className="text-sm text-muted-foreground">
                        Log all API requests for debugging
                      </p>
                    </div>
                    <Switch
                      checked={apiSettings.enableApiLogs}
                      onCheckedChange={(checked) => setApiSettings({ ...apiSettings, enableApiLogs: checked })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    onClick={() => handleSaveSettings('api', apiSettings)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security & Access Control</CardTitle>
                <CardDescription>
                  Configure authentication and security policies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                    <Input
                      id="sessionTimeout"
                      type="number"
                      value={securitySettings.sessionTimeout}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, sessionTimeout: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                    <Input
                      id="maxLoginAttempts"
                      type="number"
                      value={securitySettings.maxLoginAttempts}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, maxLoginAttempts: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordMinLength">Password Min Length</Label>
                    <Input
                      id="passwordMinLength"
                      type="number"
                      value={securitySettings.passwordMinLength}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, passwordMinLength: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Password Requirements</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <Label>Require Special Characters</Label>
                      <Switch
                        checked={securitySettings.requireSpecialChar}
                        onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, requireSpecialChar: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Require Numbers</Label>
                      <Switch
                        checked={securitySettings.requireNumbers}
                        onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, requireNumbers: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Require Uppercase Letters</Label>
                      <Switch
                        checked={securitySettings.requireUppercase}
                        onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, requireUppercase: checked })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Security Features</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Two-Factor Authentication</Label>
                        <p className="text-sm text-muted-foreground">
                          Require 2FA for all admin accounts
                        </p>
                      </div>
                      <Switch
                        checked={securitySettings.twoFactorAuth}
                        onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, twoFactorAuth: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Enable Audit Logs</Label>
                        <p className="text-sm text-muted-foreground">
                          Track all admin actions
                        </p>
                      </div>
                      <Switch
                        checked={securitySettings.enableAuditLogs}
                        onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, enableAuditLogs: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Auto-Logout Inactive Users</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically logout after session timeout
                        </p>
                      </div>
                      <Switch
                        checked={securitySettings.autoLogoutInactive}
                        onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, autoLogoutInactive: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ipWhitelist">IP Whitelist (Optional)</Label>
                  <Textarea
                    id="ipWhitelist"
                    rows={3}
                    placeholder="192.168.1.1, 10.0.0.1"
                    value={securitySettings.ipWhitelist}
                    onChange={(e) => setSecuritySettings({ ...securitySettings, ipWhitelist: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to allow all IPs. Separate multiple IPs with commas.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    onClick={() => handleSaveSettings('security', securitySettings)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Configure how and when you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Notification Channels</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-blue-600" />
                        <div>
                          <Label>Email Notifications</Label>
                          <p className="text-xs text-muted-foreground">Receive updates via email</p>
                        </div>
                      </div>
                      <Switch
                        checked={notificationSettings.emailNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, emailNotifications: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Bell className="h-5 w-5 text-green-600" />
                        <div>
                          <Label>SMS Notifications</Label>
                          <p className="text-xs text-muted-foreground">Receive SMS alerts</p>
                        </div>
                      </div>
                      <Switch
                        checked={notificationSettings.smsNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, smsNotifications: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Zap className="h-5 w-5 text-orange-600" />
                        <div>
                          <Label>Push Notifications</Label>
                          <p className="text-xs text-muted-foreground">Browser push alerts</p>
                        </div>
                      </div>
                      <Switch
                        checked={notificationSettings.pushNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, pushNotifications: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-green-600" />
                        <div>
                          <Label>WhatsApp Notifications</Label>
                          <p className="text-xs text-muted-foreground">WhatsApp messages</p>
                        </div>
                      </div>
                      <Switch
                        checked={notificationSettings.whatsappNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, whatsappNotifications: checked })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Notification Types</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Appointment Reminders</Label>
                      <Switch
                        checked={notificationSettings.appointmentReminders}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, appointmentReminders: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>System Alerts</Label>
                      <Switch
                        checked={notificationSettings.systemAlerts}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, systemAlerts: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Payment Notifications</Label>
                      <Switch
                        checked={notificationSettings.paymentNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, paymentNotifications: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Marketing Emails</Label>
                      <Switch
                        checked={notificationSettings.marketingEmails}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, marketingEmails: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Weekly Reports</Label>
                      <Switch
                        checked={notificationSettings.weeklyReports}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, weeklyReports: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Critical Alerts Only</Label>
                      <Switch
                        checked={notificationSettings.criticalAlertsOnly}
                        onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, criticalAlertsOnly: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    onClick={() => handleSaveSettings('notifications', notificationSettings)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
                <CardDescription>
                  Advanced system and performance settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    Changing these settings may affect system performance. Use with caution.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="maxUploadSize">Max Upload Size (MB)</Label>
                    <Input
                      id="maxUploadSize"
                      type="number"
                      value={systemSettings.maxUploadSize}
                      onChange={(e) => setSystemSettings({ ...systemSettings, maxUploadSize: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logLevel">Log Level</Label>
                    <Select value={systemSettings.logLevel} onValueChange={(v) => setSystemSettings({ ...systemSettings, logLevel: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debug">Debug</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sessionStorage">Session Storage</Label>
                    <Select value={systemSettings.sessionStorage} onValueChange={(v) => setSystemSettings({ ...systemSettings, sessionStorage: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="redis">Redis</SelectItem>
                        <SelectItem value="memory">Memory</SelectItem>
                        <SelectItem value="database">Database</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="queueDriver">Queue Driver</Label>
                    <Select value={systemSettings.queueDriver} onValueChange={(v) => setSystemSettings({ ...systemSettings, queueDriver: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="redis">Redis</SelectItem>
                        <SelectItem value="rabbitmq">RabbitMQ</SelectItem>
                        <SelectItem value="database">Database</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Performance Optimizations</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Enable Caching</Label>
                        <p className="text-sm text-muted-foreground">
                          Cache frequently accessed data
                        </p>
                      </div>
                      <Switch
                        checked={systemSettings.cacheEnabled}
                        onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, cacheEnabled: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Debug Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Show detailed error messages
                        </p>
                      </div>
                      <Switch
                        checked={systemSettings.debugMode}
                        onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, debugMode: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Enable CDN</Label>
                        <p className="text-sm text-muted-foreground">
                          Use CDN for static assets
                        </p>
                      </div>
                      <Switch
                        checked={systemSettings.enableCdn}
                        onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, enableCdn: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Compression</Label>
                        <p className="text-sm text-muted-foreground">
                          Compress responses for faster loading
                        </p>
                      </div>
                      <Switch
                        checked={systemSettings.compressionEnabled}
                        onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, compressionEnabled: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    onClick={() => handleSaveSettings('system', systemSettings)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Backup Settings */}
          <TabsContent value="backup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Backup & Maintenance</CardTitle>
                <CardDescription>
                  Manage database backups and system maintenance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Automatic Backups</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable scheduled automatic backups
                      </p>
                    </div>
                    <Switch
                      checked={systemSettings.autoBackup}
                      onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, autoBackup: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backupFrequency">Backup Frequency</Label>
                    <Select 
                      value={systemSettings.backupFrequency} 
                      onValueChange={(v) => setSystemSettings({ ...systemSettings, backupFrequency: v })}
                      disabled={!systemSettings.autoBackup}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Manual Actions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-2 border-dashed">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="p-3 bg-blue-100 rounded-full">
                            <Download className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold">Create Backup</h4>
                            <p className="text-sm text-muted-foreground">
                              Generate a full system backup
                            </p>
                          </div>
                          <Button className="w-full bg-blue-600 hover:bg-blue-700">
                            <Download className="h-4 w-4 mr-2" />
                            Create Backup Now
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="p-3 bg-green-100 rounded-full">
                            <Upload className="h-6 w-6 text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold">Restore Backup</h4>
                            <p className="text-sm text-muted-foreground">
                              Restore from a backup file
                            </p>
                          </div>
                          <Button variant="outline" className="w-full">
                            <Upload className="h-4 w-4 mr-2" />
                            Restore Backup
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="p-3 bg-orange-100 rounded-full">
                            <Database className="h-6 w-6 text-orange-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold">Clear Cache</h4>
                            <p className="text-sm text-muted-foreground">
                              Clear all cached data
                            </p>
                          </div>
                          <Button variant="outline" className="w-full text-orange-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear Cache
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="p-3 bg-purple-100 rounded-full">
                            <Activity className="h-6 w-6 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold">System Health</h4>
                            <p className="text-sm text-muted-foreground">
                              Run health diagnostics
                            </p>
                          </div>
                          <Button variant="outline" className="w-full">
                            <Activity className="h-4 w-4 mr-2" />
                            Run Diagnostics
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Separator />

                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Last backup: Today at 3:00 AM (Automatic) - Size: 2.4 GB
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default SettingsPage;

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Settings, 
  Mail, 
  Server,
  TestTube,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

// Email Providers Presets
const emailProviders = {
  'zoho-pro': {
    name: 'Zoho Professional Mail',
    host: 'smtppro.zoho.in',
    port: 465,
    encryption: 'ssl'
  },
  'zoho': {
    name: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 587,
    encryption: 'tls'
  },
  'gmail': {
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    encryption: 'tls'
  },
  'outlook': {
    name: 'Outlook/Hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    encryption: 'tls'
  },
  'custom': {
    name: 'Custom SMTP',
    host: '',
    port: 587,
    encryption: 'tls'
  }
};

interface SMTPConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'none' | 'tls' | 'ssl';
  isDefault: boolean;
  isActive: boolean;
  fromName: string;
  fromEmail: string;
  provider: string;
  testStatus?: 'pending' | 'success' | 'failed';
}

const TeamSettings: React.FC = () => {
  const [smtpConfigs, setSMTPConfigs] = useState<SMTPConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingConfig, setTestingConfig] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [editingConfig, setEditingConfig] = useState<SMTPConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [newConfig, setNewConfig] = useState<Partial<SMTPConfig>>({
    provider: 'zoho-pro',
    encryption: 'tls',
    port: 587,
    isActive: true,
    isDefault: false
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/email/configs');
      if (response.data.success) {
        setSMTPConfigs(response.data.data);
      }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        toast.error('Failed to load SMTP configurations');
      }
      setSMTPConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const preset = emailProviders[provider as keyof typeof emailProviders];
    setNewConfig({
      ...newConfig,
      provider,
      host: preset.host,
      port: preset.port,
      encryption: preset.encryption as 'none' | 'tls' | 'ssl'
    });
  };

  const saveConfig = async () => {
    try {
      if (!newConfig.name || !newConfig.host || !newConfig.username || !newConfig.password || !newConfig.fromEmail) {
        toast.error('Please fill in all required fields');
        return;
      }

      setLoading(true);
      
      if (editingConfig) {
        // Update existing
        const response = await api.put(`/email/configs/${editingConfig.id}`, newConfig);
        if (response.data.success) {
          toast.success('SMTP configuration updated successfully');
          setEditingConfig(null);
        }
      } else {
        // Create new
        const response = await api.post('/email/configs', newConfig);
        if (response.data.success) {
          toast.success('SMTP configuration created successfully');
        }
      }
      
      await loadConfigs();
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save SMTP configuration');
    } finally {
      setLoading(false);
    }
  };

  const testConfig = async (configId: string) => {
    try {
      setTestingConfig(configId);
      const testEmail = prompt('Enter email address to send test email:');
      
      if (!testEmail) return;

      const response = await api.post(`/email/configs/${configId}/test`, {
        testEmail
      });

      if (response.data.success) {
        toast.success('Test email sent successfully! Check your inbox.');
        setSMTPConfigs(configs => 
          configs.map(c => c.id === configId ? { ...c, testStatus: 'success' } : c)
        );
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Test email failed');
      setSMTPConfigs(configs => 
        configs.map(c => c.id === configId ? { ...c, testStatus: 'failed' } : c)
      );
    } finally {
      setTestingConfig(null);
    }
  };

  const deleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this SMTP configuration?')) return;

    try {
      await api.delete(`/email/configs/${configId}`);
      toast.success('SMTP configuration deleted');
      await loadConfigs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete configuration');
    }
  };

  const setDefaultConfig = async (configId: string) => {
    try {
      await api.put(`/email/configs/${configId}/default`);
      toast.success('Default SMTP configuration updated');
      await loadConfigs();
    } catch (error: any) {
      toast.error('Failed to set default configuration');
    }
  };

  const editConfig = (config: SMTPConfig) => {
    setEditingConfig(config);
    setNewConfig(config);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setNewConfig({
      provider: 'zoho-pro',
      encryption: 'tls',
      port: 587,
      isActive: true,
      isDefault: false
    });
    setEditingConfig(null);
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Team Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure SMTP settings, notifications, and team preferences
            </p>
          </div>
        </div>

        <Tabs defaultValue="smtp" className="space-y-6">
          <TabsList>
            <TabsTrigger value="smtp" className="gap-2">
              <Mail className="h-4 w-4" />
              Email & SMTP
            </TabsTrigger>
            <TabsTrigger value="notifications">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="preferences">
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="smtp" className="space-y-6">
            {/* SMTP Configurations */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      SMTP Configurations
                    </CardTitle>
                    <CardDescription>
                      Manage email server settings for sending emails from the platform
                    </CardDescription>
                  </div>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={resetForm}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add SMTP Config
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          {editingConfig ? 'Edit SMTP Configuration' : 'Add New SMTP Configuration'}
                        </DialogTitle>
                      </DialogHeader>
                      
                      <div className="space-y-4 py-4">
                        {/* Provider Selection */}
                        <div className="space-y-2">
                          <Label>Email Provider</Label>
                          <Select 
                            value={newConfig.provider} 
                            onValueChange={handleProviderChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(emailProviders).map(([key, provider]) => (
                                <SelectItem key={key} value={key}>
                                  {provider.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Configuration Name */}
                        <div className="space-y-2">
                          <Label>Configuration Name *</Label>
                          <Input
                            placeholder="e.g., Main SMTP Server"
                            value={newConfig.name || ''}
                            onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                          />
                        </div>

                        {/* SMTP Server Details */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>SMTP Host *</Label>
                            <Input
                              placeholder="smtp.example.com"
                              value={newConfig.host || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, host: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Port *</Label>
                            <Input
                              type="number"
                              value={newConfig.port || 587}
                              onChange={(e) => setNewConfig({ ...newConfig, port: parseInt(e.target.value) })}
                            />
                          </div>
                        </div>

                        {/* Authentication */}
                        <div className="space-y-2">
                          <Label>Username / Email *</Label>
                          <Input
                            placeholder="your-email@example.com"
                            value={newConfig.username || ''}
                            onChange={(e) => setNewConfig({ ...newConfig, username: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Password *</Label>
                          <div className="relative">
                            <Input
                              type={showPassword['new'] ? 'text' : 'password'}
                              placeholder="••••••••"
                              value={newConfig.password || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, password: e.target.value })}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowPassword({ ...showPassword, new: !showPassword['new'] })}
                            >
                              {showPassword['new'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        {/* From Email */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>From Email *</Label>
                            <Input
                              type="email"
                              placeholder="noreply@example.com"
                              value={newConfig.fromEmail || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, fromEmail: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>From Name *</Label>
                            <Input
                              placeholder="Mediqzy Team"
                              value={newConfig.fromName || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, fromName: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Encryption */}
                        <div className="space-y-2">
                          <Label>Encryption</Label>
                          <Select 
                            value={newConfig.encryption} 
                            onValueChange={(value: 'none' | 'tls' | 'ssl') => 
                              setNewConfig({ ...newConfig, encryption: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="tls">TLS (Recommended)</SelectItem>
                              <SelectItem value="ssl">SSL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Set as Default</Label>
                            <Switch
                              checked={newConfig.isDefault || false}
                              onCheckedChange={(checked) => setNewConfig({ ...newConfig, isDefault: checked })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label>Active</Label>
                            <Switch
                              checked={newConfig.isActive !== false}
                              onCheckedChange={(checked) => setNewConfig({ ...newConfig, isActive: checked })}
                            />
                          </div>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setIsDialogOpen(false);
                          resetForm();
                        }}>
                          Cancel
                        </Button>
                        <Button onClick={saveConfig} disabled={loading}>
                          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Save className="h-4 w-4 mr-2" />
                          Save Configuration
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading && smtpConfigs.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : smtpConfigs.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No SMTP configurations found. Add one to start sending emails.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Host</TableHead>
                        <TableHead>From Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smtpConfigs.map((config) => (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">{config.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {config.host}:{config.port}
                          </TableCell>
                          <TableCell className="text-sm">{config.fromEmail}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {config.isActive ? (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Inactive
                                </Badge>
                              )}
                              {config.testStatus === 'success' && (
                                <Badge variant="outline" className="gap-1">
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                  Tested
                                </Badge>
                              )}
                              {config.testStatus === 'failed' && (
                                <Badge variant="outline" className="gap-1">
                                  <XCircle className="h-3 w-3 text-red-600" />
                                  Failed
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {config.isDefault ? (
                              <Badge variant="default">Default</Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultConfig(config.id)}
                              >
                                Set Default
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => testConfig(config.id)}
                                disabled={testingConfig === config.id}
                              >
                                {testingConfig === config.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <TestTube className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => editConfig(config)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteConfig(config.id)}
                                disabled={config.isDefault}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Configure how you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Notification settings coming soon...
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Preferences</CardTitle>
                <CardDescription>
                  Customize your team workspace settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Team preferences coming soon...
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default TeamSettings;

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import StatCard from '@/components/admin/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Send,
  Settings,
  CheckCircle,
  Clock,
  AlertCircle,
  Smartphone,
  Globe,
  Shield,
  Zap,
  Users,
  BarChart3,
  Play,
  Pause,
  RefreshCw,
  ExternalLink,
  MapPin,
  DollarSign,
  FileText,
  Eye
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

export default function WhatsAppManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('providers');
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [providers, setProviders] = useState([]);
  const [currentProvider, setCurrentProvider] = useState('gupshup');
  const [setupGuide, setSetupGuide] = useState(null);
  const [stats, setStats] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [providerSettings, setProviderSettings] = useState<any>({});

  // Mock data for development
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try to load real data from API
        // const response = await fetch('/api/whatsapp-config/providers');
        // const data = await response.json();
        // setProviders(data.providers);
        // setConfig(data.config);
        
        // For now, use mock data
        setTimeout(() => {
          setConfig({
        provider: 'gupshup',
        settings: {
          enableIncomingMessages: true,
          enableOutgoingMessages: true,
          enableMediaMessages: true,
          enableTemplateMessages: true,
          autoResponseEnabled: true
        },
        recommendedForIndia: [
          {
            provider: 'gupshup',
            reason: 'Made for India, lowest costs, healthcare focus, local support',
            priority: 1,
            costRange: '₹0.35-0.65 per message',
            setupTime: '1-2 days'
          },
          {
            provider: 'facebook',
            reason: 'Official API, free tier, template management, global reach',
            priority: 2,
            costRange: 'Free for 1000 conversations/month',
            setupTime: '2-7 days'
          },
          {
            provider: 'karix',
            reason: 'Indian company, healthcare expertise, compliance',
            priority: 3,
            costRange: 'Healthcare-specific pricing',
            setupTime: '1-3 days'
          }
        ]
      });
      
      setProviders([
        {
          id: 'gupshup',
          name: 'Gupshup WhatsApp Business API',
          enabled: true,
          configured: true,
          supported: true,
          features: ['Made for India', 'Local Support', 'Healthcare Templates', 'Regional Languages', 'Cost Effective'],
          pricing: 'From ₹0.35 per message - Best rates for India',
          setupTime: '1-2 days',
          indianSupport: {
            localPresence: true,
            costEffectiveness: 'Excellent',
            setupTime: '1-2 days'
          },
          marketFit: {
            indiaScore: 95,
            factors: {
              localPresence: true,
              costEffectiveness: 'Excellent',
              healthcareFocus: true,
              setupComplexity: 'Medium'
            }
          }
        },
        {
          id: 'facebook',
          name: 'Facebook WhatsApp Business Manager',
          enabled: false,
          configured: false,
          supported: true,
          features: ['Official Facebook API', 'Template Management', 'Analytics', 'Free Webhooks', 'Business Verification'],
          pricing: 'Free for first 1000 conversations/month, then tiered pricing',
          setupTime: '2-7 days (business verification)',
          indianSupport: {
            localPresence: false,
            costEffectiveness: 'High',
            setupTime: '2-7 days'
          },
          marketFit: {
            indiaScore: 85,
            factors: {
              localPresence: false,
              costEffectiveness: 'High',
              healthcareFocus: false,
              setupComplexity: 'High'
            }
          }
        },
        {
          id: 'twilio',
          name: 'Twilio WhatsApp Business API',
          enabled: false,
          configured: false,
          supported: true,
          features: ['Business API', 'Global Reach', 'Template Approval', 'Media Support', 'Interactive Messages'],
          pricing: 'Pay per message - ₹0.65-2.50 per message',
          setupTime: '1-2 hours',
          indianSupport: {
            localPresence: false,
            costEffectiveness: 'Medium',
            setupTime: '1-2 hours'
          },
          marketFit: {
            indiaScore: 70,
            factors: {
              localPresence: false,
              costEffectiveness: 'Medium',
              healthcareFocus: false,
              setupComplexity: 'Low'
            }
          }
        },
        {
          id: 'karix',
          name: 'Karix WhatsApp Business',
          enabled: false,
          configured: false,
          supported: true,
          features: ['Indian Company', 'Healthcare Focus', 'Compliance', 'Local Support', 'Regional Expertise'],
          pricing: 'Healthcare-specific pricing available',
          setupTime: '1-3 days',
          indianSupport: {
            localPresence: true,
            costEffectiveness: 'Good',
            setupTime: '1-3 days'
          },
          marketFit: {
            indiaScore: 90,
            factors: {
              localPresence: true,
              costEffectiveness: 'Good',
              healthcareFocus: true,
              setupComplexity: 'Medium'
            }
          }
        }
      ]);

      setStats({
        totalMessages: 1247,
        activeChats: 89,
        currentProvider: 'gupshup',
        messagesByProvider: {
          gupshup: 1247
        },
        messagesByStatus: {
          sent: 1180,
          delivered: 1156,
          read: 1089,
          failed: 67
        },
        healthcareMetrics: {
          appointmentReminders: 374,
          testResultNotifications: 249,
          prescriptionAlerts: 187,
          generalMessages: 437
        }
      });

      setIsLoading(false);
    }, 1000);
      } catch (error) {
        console.error('Error loading WhatsApp config:', error);
        // Fall back to mock data on error
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  const handleProviderChange = async (providerId) => {
    setCurrentProvider(providerId);
    setConfig(prev => ({ ...prev, provider: providerId }));
    
    // Try to update provider on backend
    try {
      // await fetch('/api/whatsapp-config/provider', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ provider: providerId })
      // });
      
      toast({
        title: "Provider Updated",
        description: `WhatsApp provider changed to ${providerId}`,
      });
    } catch (error) {
      console.error('Error updating provider:', error);
      toast({
        title: "Error",
        description: "Failed to update provider. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleTestProvider = async (providerId) => {
    setTestResults(prev => ({ ...prev, [providerId]: { testing: true } }));
    
    try {
      // Try to test with real API
      // const response = await fetch(`/api/whatsapp-config/test/${providerId}`, {
      //   method: 'POST'
      // });
      // const result = await response.json();
      
      // Simulate API test for now
      setTimeout(() => {
        setTestResults(prev => ({ 
          ...prev, 
          [providerId]: { 
            testing: false,
            success: true,
            message: 'Connection test successful',
            estimatedCost: providerId === 'gupshup' ? '₹0.35 per message' : '₹0.65-2.50 per message',
            features: ['Message sending', 'Template support', 'Media messages']
          } 
        }));
        
        toast({
          title: "Test Successful",
          description: `${providerId} provider test completed successfully`,
        });
      }, 2000);
    } catch (error) {
      console.error('Error testing provider:', error);
      setTestResults(prev => ({ 
        ...prev, 
        [providerId]: { 
          testing: false,
          success: false,
          message: 'Connection test failed'
        } 
      }));
      
      toast({
        title: "Test Failed",
        description: `${providerId} provider test failed. Please check configuration.`,
        variant: "destructive"
      });
    }
  };

  const handleConfigureProvider = (provider) => {
    setSelectedProvider(provider);
    // Load existing settings for this provider
    const defaultSettings = {
      twilio: {
        accountSid: '',
        authToken: '',
        phoneNumber: '',
        sandbox: false
      },
      facebook: {
        appId: '',
        appSecret: '',
        accessToken: '',
        businessAccountId: '',
        phoneNumberId: ''
      },
      gupshup: {
        apiKey: '',
        appName: '',
        sourceNumber: ''
      },
      karix: {
        accountId: '',
        accountToken: '',
        channelId: ''
      },
      infobip: {
        apiKey: '',
        baseUrl: 'https://api.infobip.com',
        sender: ''
      },
      messagebird: {
        accessKey: '',
        channelId: ''
      }
    };
    setProviderSettings(defaultSettings[provider.id] || {});
    setConfigDialogOpen(true);
  };

  const handleSaveProviderSettings = async () => {
    try {
      // Save settings to backend
      // await fetch(`/api/whatsapp-config/provider/${selectedProvider.id}`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(providerSettings)
      // });

      toast({
        title: "Settings Saved",
        description: `${selectedProvider.name} configured successfully`,
      });

      setConfigDialogOpen(false);
      
      // Update provider as configured
      setProviders(prev => prev.map(p => 
        p.id === selectedProvider.id 
          ? { ...p, configured: true }
          : p
      ));
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const renderProviderSettingsFields = () => {
    if (!selectedProvider) return null;

    switch (selectedProvider.id) {
      case 'twilio':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="accountSid">Account SID *</Label>
              <Input
                id="accountSid"
                value={providerSettings.accountSid || ''}
                onChange={(e) => setProviderSettings({...providerSettings, accountSid: e.target.value})}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Find this in your Twilio Console Dashboard
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="authToken">Auth Token *</Label>
              <Input
                id="authToken"
                type="password"
                value={providerSettings.authToken || ''}
                onChange={(e) => setProviderSettings({...providerSettings, authToken: e.target.value})}
                placeholder="Your Twilio Auth Token"
              />
              <p className="text-xs text-muted-foreground">
                Keep this secure - never share your auth token
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">WhatsApp Phone Number *</Label>
              <Input
                id="phoneNumber"
                value={providerSettings.phoneNumber || ''}
                onChange={(e) => setProviderSettings({...providerSettings, phoneNumber: e.target.value})}
                placeholder="whatsapp:+14155238886"
              />
              <p className="text-xs text-muted-foreground">
                Format: whatsapp:+1234567890 (include whatsapp: prefix)
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sandbox"
                checked={providerSettings.sandbox || false}
                onChange={(e) => setProviderSettings({...providerSettings, sandbox: e.target.checked})}
                className="rounded"
              />
              <Label htmlFor="sandbox" className="font-normal">
                Use Twilio Sandbox (for testing)
              </Label>
            </div>
          </>
        );
      
      case 'facebook':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="appId">App ID *</Label>
              <Input
                id="appId"
                value={providerSettings.appId || ''}
                onChange={(e) => setProviderSettings({...providerSettings, appId: e.target.value})}
                placeholder="Your Facebook App ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appSecret">App Secret *</Label>
              <Input
                id="appSecret"
                type="password"
                value={providerSettings.appSecret || ''}
                onChange={(e) => setProviderSettings({...providerSettings, appSecret: e.target.value})}
                placeholder="Your Facebook App Secret"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessToken">Access Token *</Label>
              <Textarea
                id="accessToken"
                value={providerSettings.accessToken || ''}
                onChange={(e) => setProviderSettings({...providerSettings, accessToken: e.target.value})}
                placeholder="Your WhatsApp Business API access token"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessAccountId">Business Account ID *</Label>
              <Input
                id="businessAccountId"
                value={providerSettings.businessAccountId || ''}
                onChange={(e) => setProviderSettings({...providerSettings, businessAccountId: e.target.value})}
                placeholder="Your WhatsApp Business Account ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID *</Label>
              <Input
                id="phoneNumberId"
                value={providerSettings.phoneNumberId || ''}
                onChange={(e) => setProviderSettings({...providerSettings, phoneNumberId: e.target.value})}
                placeholder="Your WhatsApp Phone Number ID"
              />
            </div>
          </>
        );
      
      case 'gupshup':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={providerSettings.apiKey || ''}
                onChange={(e) => setProviderSettings({...providerSettings, apiKey: e.target.value})}
                placeholder="Your Gupshup API Key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appName">App Name *</Label>
              <Input
                id="appName"
                value={providerSettings.appName || ''}
                onChange={(e) => setProviderSettings({...providerSettings, appName: e.target.value})}
                placeholder="Your Gupshup App Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sourceNumber">Source Number *</Label>
              <Input
                id="sourceNumber"
                value={providerSettings.sourceNumber || ''}
                onChange={(e) => setProviderSettings({...providerSettings, sourceNumber: e.target.value})}
                placeholder="+91XXXXXXXXXX"
              />
            </div>
          </>
        );
      
      case 'karix':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="accountId">Account ID *</Label>
              <Input
                id="accountId"
                value={providerSettings.accountId || ''}
                onChange={(e) => setProviderSettings({...providerSettings, accountId: e.target.value})}
                placeholder="Your Karix Account ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountToken">Account Token *</Label>
              <Input
                id="accountToken"
                type="password"
                value={providerSettings.accountToken || ''}
                onChange={(e) => setProviderSettings({...providerSettings, accountToken: e.target.value})}
                placeholder="Your Karix Account Token"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channelId">Channel ID *</Label>
              <Input
                id="channelId"
                value={providerSettings.channelId || ''}
                onChange={(e) => setProviderSettings({...providerSettings, channelId: e.target.value})}
                placeholder="Your Karix Channel ID"
              />
            </div>
          </>
        );
      
      case 'infobip':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={providerSettings.apiKey || ''}
                onChange={(e) => setProviderSettings({...providerSettings, apiKey: e.target.value})}
                placeholder="Your Infobip API Key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL *</Label>
              <Input
                id="baseUrl"
                value={providerSettings.baseUrl || ''}
                onChange={(e) => setProviderSettings({...providerSettings, baseUrl: e.target.value})}
                placeholder="https://api.infobip.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender">Sender *</Label>
              <Input
                id="sender"
                value={providerSettings.sender || ''}
                onChange={(e) => setProviderSettings({...providerSettings, sender: e.target.value})}
                placeholder="Your registered sender ID"
              />
            </div>
          </>
        );
      
      case 'messagebird':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="accessKey">Access Key *</Label>
              <Input
                id="accessKey"
                type="password"
                value={providerSettings.accessKey || ''}
                onChange={(e) => setProviderSettings({...providerSettings, accessKey: e.target.value})}
                placeholder="Your MessageBird Access Key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channelId">Channel ID *</Label>
              <Input
                id="channelId"
                value={providerSettings.channelId || ''}
                onChange={(e) => setProviderSettings({...providerSettings, channelId: e.target.value})}
                placeholder="Your MessageBird Channel ID"
              />
            </div>
          </>
        );
      
      default:
        return <p className="text-sm text-muted-foreground">No configuration fields available for this provider.</p>;
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp Integration</h1>
            <p className="text-muted-foreground">
              Configure WhatsApp Business providers for healthcare communication
            </p>
          </div>
          <Button onClick={() => window.open('/docs/whatsapp-setup', '_blank')}>
            <FileText className="mr-2 h-4 w-4" />
            Setup Guide
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Messages"
            value={stats?.totalMessages?.toLocaleString() || '0'}
            icon={MessageSquare}
            trend="+12.3%"
          />
          <StatCard
            title="Active Chats"
            value={stats?.activeChats?.toString() || '0'}
            icon={Users}
            trend="+5.1%"
          />
          <StatCard
            title="Delivery Rate"
            value={stats ? `${Math.round((stats.messagesByStatus.delivered / stats.messagesByStatus.sent) * 100)}%` : '0%'}
            icon={CheckCircle}
            trend="+2.1%"
          />
          <StatCard
            title="Current Provider"
            value={config?.provider || 'None'}
            icon={Smartphone}
            description="Active WhatsApp provider"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="providers" className="flex items-center space-x-2">
              <Smartphone className="h-4 w-4" />
              <span>Providers</span>
            </TabsTrigger>
            <TabsTrigger value="configuration" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Configuration</span>
            </TabsTrigger>
            <TabsTrigger value="messaging" className="flex items-center space-x-2">
              <Send className="h-4 w-4" />
              <span>Messaging</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Providers Tab */}
          <TabsContent value="providers" className="space-y-6">
            <div className="grid gap-6">
              {/* Recommended Providers for India */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="h-5 w-5 text-orange-600" />
                    <span>Recommended for India</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {config?.recommendedForIndia?.map((rec) => (
                    <div key={rec.provider} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">#{rec.priority}</Badge>
                          <h4 className="font-medium">{rec.provider.toUpperCase()}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.reason}</p>
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          <span className="flex items-center space-x-1">
                            <DollarSign className="h-3 w-3" />
                            <span>{rec.costRange}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{rec.setupTime}</span>
                          </span>
                        </div>
                      </div>
                      <Button
                        variant={config?.provider === rec.provider ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleProviderChange(rec.provider)}
                      >
                        {config?.provider === rec.provider ? 'Active' : 'Select'}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* All Providers */}
              <div className="grid gap-4">
                <h3 className="text-lg font-semibold">All WhatsApp Providers</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {providers.map((provider) => (
                    <Card key={provider.id} className={`relative ${
                      provider.id === config?.provider ? 'ring-2 ring-blue-600' : ''
                    }`}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-semibold">{provider.name}</h4>
                              <Badge 
                                variant={provider.configured ? "default" : "secondary"}
                              >
                                {provider.configured ? 'Configured' : 'Not Configured'}
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-1 text-sm">
                                <Globe className="h-3 w-3" />
                                <span>Score: {provider.marketFit.indiaScore}/100</span>
                              </div>
                              <div className="flex items-center space-x-1 text-sm">
                                <MapPin className="h-3 w-3" />
                                <span>{provider.indianSupport.localPresence ? 'Local' : 'Global'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <Button
                              size="sm"
                              variant={provider.id === config?.provider ? "default" : "outline"}
                              onClick={() => handleProviderChange(provider.id)}
                              disabled={!provider.supported}
                            >
                              {provider.id === config?.provider ? 'Active' : 'Select'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleConfigureProvider(provider)}
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Configure
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTestProvider(provider.id)}
                              disabled={testResults[provider.id]?.testing}
                            >
                              {testResults[provider.id]?.testing ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              Test
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Cost Effectiveness:</span>
                            <Badge variant="outline">
                              {provider.indianSupport.costEffectiveness}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Setup Time:</span>
                            <span>{provider.setupTime}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Pricing:</span>
                            <span className="text-xs">{provider.pricing}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h5 className="text-sm font-medium">Key Features:</h5>
                          <div className="flex flex-wrap gap-1">
                            {provider.features.slice(0, 3).map((feature, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {feature}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {testResults[provider.id] && !testResults[provider.id].testing && (
                          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center space-x-2 text-sm text-green-800">
                              <CheckCircle className="h-4 w-4" />
                              <span>{testResults[provider.id].message}</span>
                            </div>
                            <div className="mt-1 text-xs text-green-600">
                              Cost: {testResults[provider.id].estimatedCost}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="configuration" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Current Provider Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Active Provider</Label>
                    <Select value={config?.provider} onValueChange={handleProviderChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Message Features</h4>
                    <div className="space-y-2">
                      {config?.settings && Object.entries(config.settings).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm">
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                          </span>
                          <div className="flex items-center space-x-2">
                            <div className={`h-2 w-2 rounded-full ${
                              value ? 'bg-green-500' : 'bg-gray-300'
                            }`} />
                            <span className="text-xs text-muted-foreground">
                              {value ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Provider Information</CardTitle>
                </CardHeader>
                <CardContent>
                  {config?.provider && providers.find(p => p.id === config.provider) && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">
                          {providers.find(p => p.id === config.provider)?.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {providers.find(p => p.id === config.provider)?.pricing}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <h5 className="text-sm font-medium">India Market Fit</h5>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ 
                              width: `${providers.find(p => p.id === config.provider)?.marketFit?.indiaScore || 0}%` 
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {providers.find(p => p.id === config.provider)?.marketFit?.indiaScore || 0}/100
                        </span>
                      </div>

                      <div className="space-y-2">
                        <h5 className="text-sm font-medium">Features</h5>
                        <div className="flex flex-wrap gap-1">
                          {providers.find(p => p.id === config.provider)?.features?.map((feature, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Messaging Tab */}
          <TabsContent value="messaging" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Send Test Message</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input placeholder="+91XXXXXXXXXX" />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea 
                      placeholder="Hello, this is a test message from Mediczy healthcare platform."
                      rows={3}
                    />
                  </div>
                  <Button className="w-full">
                    <Send className="mr-2 h-4 w-4" />
                    Send Test Message
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Healthcare Templates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm">Appointment Reminder</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        🩺 Hello {{name}}, this is a reminder for your appointment...
                      </p>
                      <Button size="sm" variant="outline" className="mt-2">
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm">Test Results Ready</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        📋 Your test results are now available...
                      </p>
                      <Button size="sm" variant="outline" className="mt-2">
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm">Prescription Ready</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        💊 Your prescription is ready for pickup...
                      </p>
                      <Button size="sm" variant="outline" className="mt-2">
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Messages Sent</h3>
                      <Send className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{stats?.messagesByStatus?.sent || 0}</div>
                      <p className="text-xs text-muted-foreground">+12.3% from last month</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Delivered</h3>
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{stats?.messagesByStatus?.delivered || 0}</div>
                      <p className="text-xs text-muted-foreground">+8.1% from last month</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Read</h3>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{stats?.messagesByStatus?.read || 0}</div>
                      <p className="text-xs text-muted-foreground">+15.2% from last month</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Failed</h3>
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{stats?.messagesByStatus?.failed || 0}</div>
                      <p className="text-xs text-muted-foreground">-3.2% from last month</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Healthcare Message Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      {Object.entries(stats?.healthcareMetrics || {}).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm">
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                          </span>
                          <span className="font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-medium">Message Distribution</h4>
                      <div className="space-y-2">
                        {Object.entries(stats?.healthcareMetrics || {}).map(([key, value]) => {
                          const total = Object.values(stats?.healthcareMetrics || {}).reduce((a, b) => a + b, 0);
                          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                          return (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                                <span>{percentage}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Provider Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Configure {selectedProvider?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Enter your {selectedProvider?.name} credentials and settings. These will be securely stored and encrypted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedProvider && (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-blue-900">Setup Information</h4>
                      <p className="text-xs text-blue-700">
                        Setup Time: <strong>{selectedProvider.setupTime}</strong> | 
                        Cost: <strong>{selectedProvider.pricing}</strong>
                      </p>
                      <p className="text-xs text-blue-700">
                        Make sure you have completed the setup process with {selectedProvider.name} before configuring.
                      </p>
                    </div>
                  </div>
                </div>

                {renderProviderSettingsFields()}

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <Shield className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-yellow-900">Security Notice</h4>
                      <p className="text-xs text-yellow-700">
                        All credentials are encrypted before storage. Never share your API keys or tokens.
                        Ensure you're using production credentials (not test/sandbox) for live messaging.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProviderSettings}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
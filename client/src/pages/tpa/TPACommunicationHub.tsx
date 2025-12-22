/**
 * TPA Communication Hub
 * Central dashboard for all communication channels with tab-based navigation
 * Mirrors admin communication features: Email, SMS, WhatsApp, Voice Calls
 */

import React, { useState, useEffect } from 'react';
import TPASidebar from '@/components/tpa/TPASidebar';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Mail,
  MessageSquare,
  Send,
  Phone,
  Settings,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Smartphone,
  FileText,
  RefreshCw,
  Plus,
  Activity,
  Server,
  TestTube,
  AlertTriangle,
  TrendingUp,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const TPACommunicationHub: React.FC = () => {
  const navigate = useNavigate();
  const [tpaData, setTpaData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState(false);

  // Email state
  const [emailConfig, setEmailConfig] = useState({
    provider: 'sendgrid',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    apiKey: '',
    fromEmail: '',
    fromName: ''
  });
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  // SMS state
  const [smsConfig, setSmsConfig] = useState({
    provider: 'twilio',
    accountSid: '',
    authToken: '',
    apiKey: '',
    senderId: 'TPA',
    fromNumber: ''
  });
  const [smsTo, setSmsTo] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);

  // WhatsApp state
  const [whatsappConfig, setWhatsappConfig] = useState({
    provider: 'gupshup',
    apiKey: '',
    appId: '',
    phoneNumberId: '',
    accessToken: ''
  });
  const [whatsappTo, setWhatsappTo] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);

  // Voice call state
  const [voiceConfig, setVoiceConfig] = useState({
    provider: 'exotel',
    apiKey: '',
    apiToken: '',
    accountSid: '',
    fromNumber: '',
    subdomain: ''
  });
  const [callTo, setCallTo] = useState('');
  const [testingVoice, setTestingVoice] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    emailsSent: 1234,
    smsSent: 2567,
    whatsappSent: 892,
    callsMade: 456,
    totalMessages: 5149
  });

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('tpaToken');
    if (!token) {
      navigate('/tpa/login');
      return;
    }

    // Get TPA data from localStorage
    const storedData = localStorage.getItem('tpaData');
    if (storedData) {
      setTpaData(JSON.parse(storedData));
    }

    // Load configurations
    loadConfigurations();
  }, [navigate]);

  const loadConfigurations = async () => {
    try {
      const response = await api.get('/tpa/communication/config');
      if (response.data.success) {
        const { email, sms, whatsapp, voice } = response.data.config;
        setEmailConfig(prev => ({ ...prev, ...email }));
        setSmsConfig(prev => ({ ...prev, ...sms }));
        setWhatsappConfig(prev => ({ ...prev, ...whatsapp }));
        setVoiceConfig(prev => ({ ...prev, ...voice }));
      }
    } catch (error) {
      console.error('Failed to load configurations', error);
    }
  };

  const handleSaveEmailConfig = async () => {
    setLoading(true);
    try {
      await api.post('/tpa/communication/email/config', emailConfig);
      toast.success('Email configuration saved successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save email configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmailConfig = async () => {
    setTestingEmail(true);
    try {
      await api.post('/tpa/communication/email/test', {
        to: 'test@example.com',
        provider: emailConfig.provider
      });
      toast.success('Test email sent successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send test email');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSaveSMSConfig = async () => {
    setLoading(true);
    try {
      await api.post('/tpa/communication/sms/config', smsConfig);
      toast.success('SMS configuration saved successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save SMS configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSMSConfig = async () => {
    setTestingSMS(true);
    try {
      await api.post('/tpa/communication/sms/test', {
        to: '+919999999999',
        provider: smsConfig.provider
      });
      toast.success('Test SMS sent successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send test SMS');
    } finally {
      setTestingSMS(false);
    }
  };

  const handleSaveWhatsAppConfig = async () => {
    setLoading(true);
    try {
      await api.post('/tpa/communication/whatsapp/config', whatsappConfig);
      toast.success('WhatsApp configuration saved successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTestWhatsAppConfig = async () => {
    setTestingWhatsApp(true);
    try {
      await api.post('/tpa/communication/whatsapp/test', {
        to: '+919999999999',
        provider: whatsappConfig.provider
      });
      toast.success('Test WhatsApp message sent successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send test WhatsApp message');
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleSaveVoiceConfig = async () => {
    setLoading(true);
    try {
      await api.post('/tpa/communication/voice/config', voiceConfig);
      toast.success('Voice call configuration saved successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save voice call configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTestVoiceConfig = async () => {
    setTestingVoice(true);
    try {
      await api.post('/tpa/communication/voice/test', {
        to: '+919999999999',
        provider: voiceConfig.provider
      });
      toast.success('Test call initiated successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initiate test call');
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo || !emailSubject || !emailBody) {
      toast.error('Please fill all email fields');
      return;
    }

    setLoading(true);
    try {
      await api.post('/tpa/communication/email/send', {
        to: emailTo,
        subject: emailSubject,
        body: emailBody
      });
      
      toast.success('Email sent successfully');
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
      setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + 1 }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  const handleSendSMS = async () => {
    if (!smsTo || !smsMessage) {
      toast.error('Please fill all SMS fields');
      return;
    }

    setLoading(true);
    try {
      await api.post('/tpa/communication/sms/send', {
        to: smsTo,
        message: smsMessage
      });
      
      toast.success('SMS sent successfully');
      setSmsTo('');
      setSmsMessage('');
      setStats(prev => ({ ...prev, smsSent: prev.smsSent + 1 }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send SMS');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappTo || !whatsappMessage) {
      toast.error('Please fill all WhatsApp fields');
      return;
    }

    setLoading(true);
    try {
      await api.post('/tpa/communication/whatsapp/send', {
        to: whatsappTo,
        message: whatsappMessage
      });
      
      toast.success('WhatsApp message sent successfully');
      setWhatsappTo('');
      setWhatsappMessage('');
      setStats(prev => ({ ...prev, whatsappSent: prev.whatsappSent + 1 }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send WhatsApp message');
    } finally {
      setLoading(false);
    }
  };

  const handleMakeCall = async () => {
    if (!callTo) {
      toast.error('Please enter phone number');
      return;
    }

    setLoading(true);
    try {
      await api.post('/tpa/communication/voice/call', {
        to: callTo
      });
      
      toast.success('Call initiated successfully');
      setCallTo('');
      setStats(prev => ({ ...prev, callsMade: prev.callsMade + 1 }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initiate call');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50">
      {/* Sidebar */}
      <TPASidebar />

      {/* Main Content */}
      <div className="flex-1 md:ml-64 overflow-auto">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10 backdrop-blur-xl bg-white/80">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                    Communication Hub
                  </h1>
                  <p className="text-sm text-gray-600">
                    Manage all communication channels - Email, SMS, WhatsApp & Voice
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {tpaData?.contact_person_name || `${tpaData?.firstName} ${tpaData?.lastName}`}
                </p>
                <p className="text-xs text-gray-600">{tpaData?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-12 p-1 bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                <Activity className="mr-2 h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="email" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                <Mail className="mr-2 h-4 w-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="sms" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
                <Send className="mr-2 h-4 w-4" />
                SMS
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="voice" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
                <Phone className="mr-2 h-4 w-4" />
                Voice Calls
              </TabsTrigger>
            </TabsList>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6 mt-6">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
                      <MessageSquare className="h-4 w-4 text-purple-600" />
                      Total Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">{stats.totalMessages.toLocaleString()}</div>
                    <p className="text-xs text-gray-500 mt-1">All channels combined</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="h-4 w-4 text-orange-500" />
                      Emails Sent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-500">{stats.emailsSent.toLocaleString()}</div>
                    <p className="text-xs text-gray-500 mt-1">This month</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
                      <Send className="h-4 w-4 text-green-500" />
                      SMS Delivered
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-500">{stats.smsSent.toLocaleString()}</div>
                    <p className="text-xs text-gray-500 mt-1">This month</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
                      <Smartphone className="h-4 w-4 text-green-600" />
                      WhatsApp Active
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">{stats.whatsappSent.toLocaleString()}</div>
                    <p className="text-xs text-gray-500 mt-1">Active conversations</p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-teal-50 to-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4 text-teal-500" />
                      Voice Calls
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-teal-500">{stats.callsMade.toLocaleString()}</div>
                    <p className="text-xs text-gray-500 mt-1">This month</p>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-600" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Button
                      variant="outline"
                      className="justify-start hover:bg-orange-50 hover:border-orange-300"
                      onClick={() => setActiveTab('email')}
                    >
                      <Mail className="mr-2 h-4 w-4 text-orange-500" />
                      Send Email
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start hover:bg-green-50 hover:border-green-300"
                      onClick={() => setActiveTab('sms')}
                    >
                      <Send className="mr-2 h-4 w-4 text-green-500" />
                      Send SMS
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start hover:bg-green-50 hover:border-green-400"
                      onClick={() => setActiveTab('whatsapp')}
                    >
                      <MessageSquare className="mr-2 h-4 w-4 text-green-600" />
                      Send WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start hover:bg-teal-50 hover:border-teal-300"
                      onClick={() => setActiveTab('voice')}
                    >
                      <Phone className="mr-2 h-4 w-4 text-teal-500" />
                      Make Call
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-600" />
                    Recent Communication Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-green-100 rounded-full">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">SMS Campaign Sent</p>
                          <p className="text-xs text-gray-500">2,500 messages delivered</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">2 hours ago</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-orange-100 rounded-full">
                          <Mail className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Email Notification Sent</p>
                          <p className="text-xs text-gray-500">Claim approval notifications</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">5 hours ago</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-green-100 rounded-full">
                          <MessageSquare className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">WhatsApp Updates</p>
                          <p className="text-xs text-gray-500">Policy renewal reminders sent</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">1 day ago</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Email Tab */}
            <TabsContent value="email" className="space-y-6 mt-6">
              <Tabs defaultValue="send" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-white/80 backdrop-blur-sm border">
                  <TabsTrigger value="send">Send Email</TabsTrigger>
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="send" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Send Email */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Mail className="h-5 w-5 text-orange-500" />
                          Send Email
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>To Email Address</Label>
                          <Input
                            type="email"
                            placeholder="recipient@example.com"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Subject</Label>
                          <Input
                            placeholder="Email subject"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Message</Label>
                          <Textarea
                            placeholder="Email message body..."
                            rows={6}
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                          />
                        </div>
                        <Button
                          className="w-full bg-orange-500 hover:bg-orange-600"
                          onClick={handleSendEmail}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                          Send Email
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Email Status */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-5 w-5 text-gray-600" />
                          Email Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3 pt-4">
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Provider</span>
                            <Badge className="bg-orange-100 text-orange-700">
                              {emailConfig.provider.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Status</span>
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Active
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Daily Limit</span>
                            <span className="text-sm text-gray-600">500 emails</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Emails Sent Today</span>
                            <span className="text-sm text-gray-600">127 / 500</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="config" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-orange-500" />
                        Email Provider Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <Label>Email Provider</Label>
                        <Select value={emailConfig.provider} onValueChange={(value) => setEmailConfig({ ...emailConfig, provider: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sendgrid">SendGrid</SelectItem>
                            <SelectItem value="smtp">SMTP</SelectItem>
                            <SelectItem value="mailgun">Mailgun</SelectItem>
                            <SelectItem value="ses">AWS SES</SelectItem>
                            <SelectItem value="zoho">Zoho Mail</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {emailConfig.provider === 'sendgrid' && (
                        <div>
                          <Label>SendGrid API Key</Label>
                          <Input
                            type="password"
                            placeholder="SG.xxxxxxxxxxxxx"
                            value={emailConfig.apiKey}
                            onChange={(e) => setEmailConfig({ ...emailConfig, apiKey: e.target.value })}
                          />
                        </div>
                      )}

                      {emailConfig.provider === 'smtp' && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>SMTP Host</Label>
                              <Input
                                placeholder="smtp.example.com"
                                value={emailConfig.smtpHost}
                                onChange={(e) => setEmailConfig({ ...emailConfig, smtpHost: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>SMTP Port</Label>
                              <Input
                                placeholder="587"
                                value={emailConfig.smtpPort}
                                onChange={(e) => setEmailConfig({ ...emailConfig, smtpPort: e.target.value })}
                              />
                            </div>
                          </div>
                          <div>
                            <Label>SMTP Username</Label>
                            <Input
                              placeholder="username@example.com"
                              value={emailConfig.smtpUser}
                              onChange={(e) => setEmailConfig({ ...emailConfig, smtpUser: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>SMTP Password</Label>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              value={emailConfig.smtpPassword}
                              onChange={(e) => setEmailConfig({ ...emailConfig, smtpPassword: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>From Email</Label>
                          <Input
                            type="email"
                            placeholder="noreply@tpa.com"
                            value={emailConfig.fromEmail}
                            onChange={(e) => setEmailConfig({ ...emailConfig, fromEmail: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>From Name</Label>
                          <Input
                            placeholder="Heritage Health TPA"
                            value={emailConfig.fromName}
                            onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          className="flex-1 bg-orange-500 hover:bg-orange-600"
                          onClick={handleSaveEmailConfig}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
                          Save Configuration
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleTestEmailConfig}
                          disabled={testingEmail}
                        >
                          {testingEmail ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                          Test
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* SMS Tab */}
            <TabsContent value="sms" className="space-y-6 mt-6">
              <Tabs defaultValue="send" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm border">
                  <TabsTrigger value="send">Send SMS</TabsTrigger>
                  <TabsTrigger value="templates">Templates</TabsTrigger>
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="send" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Send SMS */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Send className="h-5 w-5 text-green-500" />
                          Send SMS
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Phone Number</Label>
                          <Input
                            type="tel"
                            placeholder="+91XXXXXXXXXX"
                            value={smsTo}
                            onChange={(e) => setSmsTo(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Message</Label>
                          <Textarea
                            placeholder="Your SMS message (max 160 characters)..."
                            rows={4}
                            value={smsMessage}
                            onChange={(e) => setSmsMessage(e.target.value)}
                            maxLength={160}
                          />
                          <p className="text-xs text-gray-500 mt-1">{smsMessage.length}/160 characters</p>
                        </div>
                        <Button
                          className="w-full bg-green-500 hover:bg-green-600"
                          onClick={handleSendSMS}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          Send SMS
                        </Button>
                      </CardContent>
                    </Card>

                    {/* SMS Status */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-5 w-5 text-gray-600" />
                          SMS Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3 pt-4">
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Provider</span>
                            <Badge className="bg-green-100 text-green-700">
                              {smsConfig.provider.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Status</span>
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Active
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">SMS Sent Today</span>
                            <span className="text-sm text-gray-600">234</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="templates" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-gray-600" />
                        SMS Templates
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <p className="font-medium text-sm">Claim Approved</p>
                          <p className="text-xs text-gray-500 mt-1">Your claim {'{claim_id}'} has been approved.</p>
                        </div>
                        <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <p className="font-medium text-sm">Document Required</p>
                          <p className="text-xs text-gray-500 mt-1">Please submit {'{document_name}'} for claim processing.</p>
                        </div>
                        <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <p className="font-medium text-sm">Policy Renewal</p>
                          <p className="text-xs text-gray-500 mt-1">Your policy expires on {'{expiry_date}'}. Renew now.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="config" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-green-500" />
                        SMS Provider Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <Label>SMS Provider</Label>
                        <Select value={smsConfig.provider} onValueChange={(value) => setSmsConfig({ ...smsConfig, provider: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="twilio">Twilio</SelectItem>
                            <SelectItem value="msg91">MSG91</SelectItem>
                            <SelectItem value="kaleyra">Kaleyra</SelectItem>
                            <SelectItem value="textlocal">TextLocal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {smsConfig.provider === 'twilio' && (
                        <>
                          <div>
                            <Label>Account SID</Label>
                            <Input
                              placeholder="ACxxxxxxxxxxxxx"
                              value={smsConfig.accountSid}
                              onChange={(e) => setSmsConfig({ ...smsConfig, accountSid: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Auth Token</Label>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              value={smsConfig.authToken}
                              onChange={(e) => setSmsConfig({ ...smsConfig, authToken: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>From Number</Label>
                            <Input
                              placeholder="+1234567890"
                              value={smsConfig.fromNumber}
                              onChange={(e) => setSmsConfig({ ...smsConfig, fromNumber: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      {smsConfig.provider !== 'twilio' && (
                        <div>
                          <Label>API Key</Label>
                          <Input
                            type="password"
                            placeholder="Enter API Key"
                            value={smsConfig.apiKey}
                            onChange={(e) => setSmsConfig({ ...smsConfig, apiKey: e.target.value })}
                          />
                        </div>
                      )}

                      <div>
                        <Label>Sender ID</Label>
                        <Input
                          placeholder="TPASMS"
                          maxLength={6}
                          value={smsConfig.senderId}
                          onChange={(e) => setSmsConfig({ ...smsConfig, senderId: e.target.value })}
                        />
                        <p className="text-xs text-gray-500 mt-1">Max 6 characters</p>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          className="flex-1 bg-green-500 hover:bg-green-600"
                          onClick={handleSaveSMSConfig}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
                          Save Configuration
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleTestSMSConfig}
                          disabled={testingSMS}
                        >
                          {testingSMS ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                          Test
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* WhatsApp Tab */}
            <TabsContent value="whatsapp" className="space-y-6 mt-6">
              <Tabs defaultValue="send" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm border">
                  <TabsTrigger value="send">Send Message</TabsTrigger>
                  <TabsTrigger value="templates">Templates</TabsTrigger>
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="send" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Send WhatsApp */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="h-5 w-5 text-green-600" />
                          Send WhatsApp Message
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Phone Number</Label>
                          <Input
                            type="tel"
                            placeholder="+91XXXXXXXXXX"
                            value={whatsappTo}
                            onChange={(e) => setWhatsappTo(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Message</Label>
                          <Textarea
                            placeholder="Your WhatsApp message..."
                            rows={5}
                            value={whatsappMessage}
                            onChange={(e) => setWhatsappMessage(e.target.value)}
                          />
                        </div>
                        <Button
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={handleSendWhatsApp}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                          Send WhatsApp
                        </Button>
                      </CardContent>
                    </Card>

                    {/* WhatsApp Status */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-5 w-5 text-gray-600" />
                          WhatsApp Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Alert className="mb-4">
                          <AlertDescription>
                            WhatsApp templates must be pre-approved by WhatsApp Business API.
                          </AlertDescription>
                        </Alert>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Provider</span>
                            <Badge className="bg-green-100 text-green-700">
                              {whatsappConfig.provider.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Status</span>
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Active
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="templates" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-gray-600" />
                        WhatsApp Templates
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-sm">Claim Status Update</p>
                            <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>
                          </div>
                          <p className="text-xs text-gray-500">Hello {'{name}'}, your claim is now {'{status}'}.</p>
                        </div>
                        <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-sm">Appointment Reminder</p>
                            <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>
                          </div>
                          <p className="text-xs text-gray-500">Reminder: Appointment on {'{date}'} at {'{time}'}.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="config" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-green-600" />
                        WhatsApp Provider Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <Label>WhatsApp Provider</Label>
                        <Select value={whatsappConfig.provider} onValueChange={(value) => setWhatsappConfig({ ...whatsappConfig, provider: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gupshup">Gupshup</SelectItem>
                            <SelectItem value="twilio">Twilio</SelectItem>
                            <SelectItem value="meta">Meta (Facebook)</SelectItem>
                            <SelectItem value="karix">Karix</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {whatsappConfig.provider === 'gupshup' && (
                        <>
                          <div>
                            <Label>Gupshup API Key</Label>
                            <Input
                              type="password"
                              placeholder="Enter Gupshup API Key"
                              value={whatsappConfig.apiKey}
                              onChange={(e) => setWhatsappConfig({ ...whatsappConfig, apiKey: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>App ID</Label>
                            <Input
                              placeholder="Enter App ID"
                              value={whatsappConfig.appId}
                              onChange={(e) => setWhatsappConfig({ ...whatsappConfig, appId: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      {whatsappConfig.provider === 'twilio' && (
                        <>
                          <div>
                            <Label>Account SID</Label>
                            <Input
                              placeholder="ACxxxxxxxxxxxxx"
                              value={whatsappConfig.apiKey}
                              onChange={(e) => setWhatsappConfig({ ...whatsappConfig, apiKey: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Auth Token</Label>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              value={whatsappConfig.accessToken}
                              onChange={(e) => setWhatsappConfig({ ...whatsappConfig, accessToken: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      {whatsappConfig.provider === 'meta' && (
                        <>
                          <div>
                            <Label>Phone Number ID</Label>
                            <Input
                              placeholder="Enter Phone Number ID"
                              value={whatsappConfig.phoneNumberId}
                              onChange={(e) => setWhatsappConfig({ ...whatsappConfig, phoneNumberId: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Access Token</Label>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              value={whatsappConfig.accessToken}
                              onChange={(e) => setWhatsappConfig({ ...whatsappConfig, accessToken: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      <div className="flex gap-3">
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={handleSaveWhatsAppConfig}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
                          Save Configuration
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleTestWhatsAppConfig}
                          disabled={testingWhatsApp}
                        >
                          {testingWhatsApp ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                          Test
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Voice Calls Tab */}
            <TabsContent value="voice" className="space-y-6 mt-6">
              <Tabs defaultValue="call" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm border">
                  <TabsTrigger value="call">Make Call</TabsTrigger>
                  <TabsTrigger value="history">Call History</TabsTrigger>
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="call" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Make Call */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Phone className="h-5 w-5 text-teal-500" />
                          Make Voice Call
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Phone Number</Label>
                          <Input
                            type="tel"
                            placeholder="+91XXXXXXXXXX"
                            value={callTo}
                            onChange={(e) => setCallTo(e.target.value)}
                          />
                        </div>
                        <Alert>
                          <AlertDescription>
                            Voice calls will be initiated through your configured telephony provider.
                          </AlertDescription>
                        </Alert>
                        <Button
                          className="w-full bg-teal-500 hover:bg-teal-600"
                          onClick={handleMakeCall}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                          Initiate Call
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Voice Status */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-5 w-5 text-gray-600" />
                          Voice Call Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3 pt-4">
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Provider</span>
                            <Badge className="bg-teal-100 text-teal-700">
                              {voiceConfig.provider.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Status</span>
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Active
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium">Calls Today</span>
                            <span className="text-sm text-gray-600">23</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-gray-600" />
                        Recent Calls
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">+91-9876543210</p>
                            <p className="text-xs text-gray-500">Outbound • 2m 34s</p>
                          </div>
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Completed
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">+91-9988776655</p>
                            <p className="text-xs text-gray-500">Outbound • 1m 12s</p>
                          </div>
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Completed
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">+91-8877665544</p>
                            <p className="text-xs text-gray-500">Outbound • Failed</p>
                          </div>
                          <Badge className="bg-red-100 text-red-700">
                            <XCircle className="mr-1 h-3 w-3" />
                            Failed
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="config" className="space-y-6 mt-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-teal-500" />
                        Voice Call Provider Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <Label>Voice Provider</Label>
                        <Select value={voiceConfig.provider} onValueChange={(value) => setVoiceConfig({ ...voiceConfig, provider: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exotel">Exotel</SelectItem>
                            <SelectItem value="twilio">Twilio</SelectItem>
                            <SelectItem value="knowlarity">Knowlarity</SelectItem>
                            <SelectItem value="ozonetel">Ozonetel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {voiceConfig.provider === 'exotel' && (
                        <>
                          <div>
                            <Label>Exotel API Key</Label>
                            <Input
                              type="password"
                              placeholder="Enter API Key"
                              value={voiceConfig.apiKey}
                              onChange={(e) => setVoiceConfig({ ...voiceConfig, apiKey: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>API Token</Label>
                            <Input
                              type="password"
                              placeholder="Enter API Token"
                              value={voiceConfig.apiToken}
                              onChange={(e) => setVoiceConfig({ ...voiceConfig, apiToken: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Subdomain</Label>
                            <Input
                              placeholder="e.g., yourcompany"
                              value={voiceConfig.subdomain}
                              onChange={(e) => setVoiceConfig({ ...voiceConfig, subdomain: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      {voiceConfig.provider === 'twilio' && (
                        <>
                          <div>
                            <Label>Account SID</Label>
                            <Input
                              placeholder="ACxxxxxxxxxxxxx"
                              value={voiceConfig.accountSid}
                              onChange={(e) => setVoiceConfig({ ...voiceConfig, accountSid: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Auth Token</Label>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              value={voiceConfig.apiToken}
                              onChange={(e) => setVoiceConfig({ ...voiceConfig, apiToken: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <Label>From Number</Label>
                        <Input
                          placeholder="+1234567890"
                          value={voiceConfig.fromNumber}
                          onChange={(e) => setVoiceConfig({ ...voiceConfig, fromNumber: e.target.value })}
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          className="flex-1 bg-teal-500 hover:bg-teal-600"
                          onClick={handleSaveVoiceConfig}
                          disabled={loading}
                        >
                          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
                          Save Configuration
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleTestVoiceConfig}
                          disabled={testingVoice}
                        >
                          {testingVoice ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                          Test
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default TPACommunicationHub;

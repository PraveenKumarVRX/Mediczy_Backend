/**
 * Shared Communication Module
 * Provides Email, SMS, WhatsApp functionality for different user types
 * Can be used by: Admin, Broker, Insurance Company, Hospital, TPA
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  Mail,
  Send,
  Smartphone,
  Settings,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  FileText,
  Users
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

interface CommunicationModuleProps {
  userType: 'admin' | 'broker' | 'insurance' | 'hospital' | 'tpa';
  userId?: string;
  organizationId?: string;
}

interface CommunicationStats {
  email: {
    sent: number;
    delivered: number;
    failed: number;
  };
  sms: {
    sent: number;
    delivered: number;
    failed: number;
  };
  whatsapp: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
}

const CommunicationModule: React.FC<CommunicationModuleProps> = ({
  userType,
  userId,
  organizationId
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  // Email state
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  
  // SMS state
  const [smsPhone, setSmsPhone] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  
  // WhatsApp state
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState('');

  const [stats, setStats] = useState<CommunicationStats>({
    email: { sent: 0, delivered: 0, failed: 0 },
    sms: { sent: 0, delivered: 0, failed: 0 },
    whatsapp: { sent: 0, delivered: 0, read: 0, failed: 0 }
  });

  const [recentMessages, setRecentMessages] = useState<any[]>([]);

  // Load stats based on user type
  React.useEffect(() => {
    loadStats();
  }, [userType, userId]);

  const loadStats = async () => {
    try {
      const endpoint = `/${userType}/communication/stats`;
      const { data } = await api.get(endpoint);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load communication stats:', error);
    }
  };

  const sendEmail = async () => {
    if (!emailTo || !emailSubject || !emailBody) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all email fields',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const endpoint = `/${userType}/communication/email/send`;
      const { data } = await api.post(endpoint, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
        userId,
        organizationId
      });

      toast({
        title: 'Email Sent',
        description: 'Email has been sent successfully'
      });

      // Reset form
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
      
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Failed to Send Email',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const sendSMS = async () => {
    if (!smsPhone || !smsMessage) {
      toast({
        title: 'Missing Fields',
        description: 'Please provide phone number and message',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const endpoint = `/${userType}/communication/sms/send`;
      const { data } = await api.post(endpoint, {
        phone: smsPhone,
        message: smsMessage,
        userId,
        organizationId
      });

      toast({
        title: 'SMS Sent',
        description: 'SMS has been sent successfully'
      });

      setSmsPhone('');
      setSmsMessage('');
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Failed to Send SMS',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!whatsappPhone || !whatsappMessage) {
      toast({
        title: 'Missing Fields',
        description: 'Please provide phone number and message',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const endpoint = `/${userType}/communication/whatsapp/send`;
      const { data } = await api.post(endpoint, {
        phone: whatsappPhone,
        message: whatsappMessage,
        template: whatsappTemplate,
        userId,
        organizationId
      });

      toast({
        title: 'WhatsApp Sent',
        description: 'WhatsApp message has been sent successfully'
      });

      setWhatsappPhone('');
      setWhatsappMessage('');
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Failed to Send WhatsApp',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Communication Center</h1>
          <p className="text-muted-foreground">
            Send emails, SMS, and WhatsApp messages
          </p>
        </div>
        <Button variant="outline" onClick={loadStats}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger value="sms">
            <Smartphone className="h-4 w-4 mr-2" />
            SMS
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <MessageSquare className="h-4 w-4 mr-2" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Email Stats */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Email</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.email.sent}</div>
                <div className="flex items-center space-x-4 mt-4 text-sm">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                    <span>{stats.email.delivered}</span>
                  </div>
                  <div className="flex items-center">
                    <XCircle className="h-4 w-4 text-red-500 mr-1" />
                    <span>{stats.email.failed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SMS Stats */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">SMS</CardTitle>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.sms.sent}</div>
                <div className="flex items-center space-x-4 mt-4 text-sm">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                    <span>{stats.sms.delivered}</span>
                  </div>
                  <div className="flex items-center">
                    <XCircle className="h-4 w-4 text-red-500 mr-1" />
                    <span>{stats.sms.failed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp Stats */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.whatsapp.sent}</div>
                <div className="flex items-center space-x-4 mt-4 text-sm">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                    <span>{stats.whatsapp.delivered}</span>
                  </div>
                  <div className="flex items-center">
                    <XCircle className="h-4 w-4 text-red-500 mr-1" />
                    <span>{stats.whatsapp.failed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Messages</CardTitle>
            </CardHeader>
            <CardContent>
              {recentMessages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No recent messages
                </div>
              ) : (
                <div className="space-y-2">
                  {recentMessages.map((msg, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{msg.type}</div>
                        <div className="text-sm text-muted-foreground">{msg.recipient}</div>
                      </div>
                      <Badge variant={msg.status === 'delivered' ? 'default' : 'secondary'}>
                        {msg.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Send Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>To</Label>
                <Input
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
                  placeholder="Email message"
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>
              <Button onClick={sendEmail} disabled={loading} className="w-full">
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Tab */}
        <TabsContent value="sms" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Send SMS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Phone Number</Label>
                <Input
                  placeholder="+91XXXXXXXXXX"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  placeholder="SMS message (max 160 characters)"
                  rows={4}
                  maxLength={160}
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {smsMessage.length}/160 characters
                </div>
              </div>
              <Button onClick={sendSMS} disabled={loading} className="w-full">
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send SMS
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Send WhatsApp Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Phone Number</Label>
                <Input
                  placeholder="+91XXXXXXXXXX"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>Template (Optional)</Label>
                <Select value={whatsappTemplate} onValueChange={setWhatsappTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="otp">OTP Verification</SelectItem>
                    <SelectItem value="appointment">Appointment Confirmation</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  placeholder="WhatsApp message"
                  rows={6}
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                />
              </div>
              <Button onClick={sendWhatsApp} disabled={loading} className="w-full">
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send WhatsApp
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Communication Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">Email Notifications</div>
                    <div className="text-sm text-muted-foreground">Receive email notifications</div>
                  </div>
                  <Badge variant="default">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">SMS Notifications</div>
                    <div className="text-sm text-muted-foreground">Receive SMS notifications</div>
                  </div>
                  <Badge variant="default">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">WhatsApp Notifications</div>
                    <div className="text-sm text-muted-foreground">Receive WhatsApp messages</div>
                  </div>
                  <Badge variant="default">Enabled</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CommunicationModule;

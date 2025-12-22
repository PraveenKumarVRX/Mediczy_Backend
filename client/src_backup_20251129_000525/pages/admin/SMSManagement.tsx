import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageSquare, 
  Send, 
  Settings, 
  BarChart3, 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock,
  RefreshCw,
  Plus,
  FileText,
  Smartphone,
  AlertTriangle
} from 'lucide-react';
import AdminLayout from '@/components/layout/AdminLayout';

const SMSManagement = () => {
  const [config, setConfig] = useState({
    provider: 'twilio',
    apiKey: '',
    apiSecret: '',
    senderId: 'MEDICZY',
    isConfigured: false
  });
  
  const [stats, setStats] = useState({
    today: { totalSent: 0, totalSuccess: 0, totalFailed: 0, successRate: 0 },
    thisMonth: { totalSent: 0, totalSuccess: 0, totalFailed: 0, successRate: 0 },
    allTime: { totalSent: 0, totalSuccess: 0, totalFailed: 0, successRate: 0 }
  });
  
  const [templates, setTemplates] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Send SMS form state
  const [smsForm, setSmsForm] = useState({
    to: '',
    message: '',
    templateId: '',
    variables: {}
  });

  // Bulk SMS state
  const [bulkSMS, setBulkSMS] = useState({
    recipients: '',
    message: '',
    templateId: ''
  });

  // Template form state
  const [templateForm, setTemplateForm] = useState({
    id: '',
    template: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        loadConfig(),
        loadStats(),
        loadTemplates(),
        loadLogs()
      ]);
    } catch (error) {
      console.error('Failed to load SMS data:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/config`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setConfig({ ...data.config, isConfigured: !!data.config.apiKey });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/stats`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/templates`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadLogs = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/logs?limit=10`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const updateConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (data.success) {
        alert('Configuration updated successfully!');
        await loadConfig();
      } else {
        alert('Failed to update configuration: ' + data.error);
      }
    } catch (error) {
      alert('Error updating configuration: ' + error.message);
    }
    setLoading(false);
  };

  const sendSMS = async () => {
    if (!smsForm.to || !smsForm.message) {
      alert('Phone number and message are required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(smsForm)
      });
      const data = await response.json();
      if (data.success) {
        alert('SMS sent successfully!');
        setSmsForm({ to: '', message: '', templateId: '', variables: {} });
        await loadStats();
        await loadLogs();
      } else {
        alert('Failed to send SMS: ' + data.error);
      }
    } catch (error) {
      alert('Error sending SMS: ' + error.message);
    }
    setLoading(false);
  };

  const sendBulkSMS = async () => {
    if (!bulkSMS.recipients || !bulkSMS.message) {
      alert('Recipients and message are required');
      return;
    }

    const phones = bulkSMS.recipients.split('\n').map(line => {
      const [phone, name] = line.split(',').map(s => s.trim());
      return { phone, variables: { name } };
    }).filter(r => r.phone);

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/send-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          recipients: phones,
          message: bulkSMS.message,
          templateId: bulkSMS.templateId
        })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Bulk SMS sent! Success: ${data.summary.successful}, Failed: ${data.summary.failed}`);
        setBulkSMS({ recipients: '', message: '', templateId: '' });
        await loadStats();
        await loadLogs();
      } else {
        alert('Failed to send bulk SMS: ' + data.error);
      }
    } catch (error) {
      alert('Error sending bulk SMS: ' + error.message);
    }
    setLoading(false);
  };

  const saveTemplate = async () => {
    if (!templateForm.id || !templateForm.template) {
      alert('Template ID and content are required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(templateForm)
      });
      const data = await response.json();
      if (data.success) {
        alert('Template saved successfully!');
        setTemplateForm({ id: '', template: '' });
        await loadTemplates();
      } else {
        alert('Failed to save template: ' + data.error);
      }
    } catch (error) {
      alert('Error saving template: ' + error.message);
    }
    setLoading(false);
  };

  const testSMS = async () => {
    const phone = prompt('Enter phone number for test SMS:');
    if (!phone) return;

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/sms/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ phone })
      });
      const data = await response.json();
      if (data.success) {
        alert('Test SMS sent successfully!');
        await loadStats();
        await loadLogs();
      } else {
        alert('Test SMS failed: ' + data.error);
      }
    } catch (error) {
      alert('Error sending test SMS: ' + error.message);
    }
    setLoading(false);
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color = "blue" }) => (
    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <div className={`h-12 w-12 bg-${color}-100 rounded-xl flex items-center justify-center`}>
            <Icon className={`h-6 w-6 text-${color}-600`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-green-600 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              SMS Management
            </h1>
            <p className="text-gray-600 mt-2">
              Configure and manage SMS notifications and marketing campaigns
            </p>
          </div>

          {/* Configuration Status */}
          {!config.isConfigured && (
            <Card className="shadow-lg border-0 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <h3 className="font-semibold text-yellow-800">SMS Service Not Configured</h3>
                    <p className="text-sm text-yellow-700">
                      Please configure your SMS gateway settings in the Configuration tab to start sending SMS.
                    </p>
                  </div>
                  <Button 
                    onClick={() => setActiveTab('config')}
                    variant="outline" 
                    className="ml-auto border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                  >
                    Configure Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6 bg-white/80 backdrop-blur-xl shadow-lg">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="send">Send SMS</TabsTrigger>
              <TabsTrigger value="bulk">Bulk SMS</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="config">Configuration</TabsTrigger>
            </TabsList>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6">
              {/* Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="Today's SMS"
                  value={stats.today.totalSent}
                  subtitle={`${stats.today.successRate}% success rate`}
                  icon={MessageSquare}
                  color="blue"
                />
                <StatCard
                  title="This Month"
                  value={stats.thisMonth.totalSent}
                  subtitle={`${stats.thisMonth.successRate}% success rate`}
                  icon={BarChart3}
                  color="green"
                />
                <StatCard
                  title="All Time"
                  value={stats.allTime.totalSent}
                  subtitle={`${stats.allTime.successRate}% success rate`}
                  icon={Smartphone}
                  color="purple"
                />
                <StatCard
                  title="Provider"
                  value={config.provider?.toUpperCase() || 'None'}
                  subtitle={config.isConfigured ? 'Configured' : 'Not configured'}
                  icon={Settings}
                  color={config.isConfigured ? "green" : "red"}
                />
              </div>

              {/* Quick Actions */}
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-blue-600" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button 
                      onClick={testSMS}
                      disabled={!config.isConfigured || loading}
                      className="gap-2"
                      variant="outline"
                    >
                      <Smartphone className="h-4 w-4" />
                      Test SMS
                    </Button>
                    <Button 
                      onClick={() => setActiveTab('send')}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      Send Single SMS
                    </Button>
                    <Button 
                      onClick={() => setActiveTab('bulk')}
                      className="gap-2"
                      variant="outline"
                    >
                      <Users className="h-4 w-4" />
                      Send Bulk SMS
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Logs */}
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    Recent SMS Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {logs.length > 0 ? (
                    <div className="space-y-3">
                      {logs.slice(0, 5).map((log, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {log.result?.success || log.successCount > 0 ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600" />
                            )}
                            <div>
                              <p className="text-sm font-medium">
                                {log.type === 'bulk' ? `Bulk SMS (${log.recipients} recipients)` : `To: ${log.to?.[0]}`}
                              </p>
                              <p className="text-xs text-gray-600">{new Date(log.timestamp).toLocaleString()}</p>
                            </div>
                          </div>
                          <Badge variant={log.result?.success || log.successCount > 0 ? "default" : "destructive"}>
                            {log.type === 'bulk' ? 
                              `${log.successCount}/${log.recipients} sent` : 
                              (log.result?.success ? 'Sent' : 'Failed')
                            }
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No SMS logs found</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Send SMS Tab */}
            <TabsContent value="send" className="space-y-6">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-blue-600" />
                    Send Single SMS
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone Number</label>
                    <Input
                      placeholder="+1234567890"
                      value={smsForm.to}
                      onChange={(e) => setSmsForm({ ...smsForm, to: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Template (Optional)</label>
                    <select 
                      className="w-full p-2 border rounded-md"
                      value={smsForm.templateId}
                      onChange={(e) => setSmsForm({ ...smsForm, templateId: e.target.value })}
                    >
                      <option value="">Select a template...</option>
                      {Object.entries(templates).map(([id, template]) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <Textarea
                      placeholder="Type your message here..."
                      value={smsForm.message}
                      onChange={(e) => setSmsForm({ ...smsForm, message: e.target.value })}
                      rows={4}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Character count: {smsForm.message.length}/160
                    </p>
                  </div>

                  <Button 
                    onClick={sendSMS}
                    disabled={!config.isConfigured || loading}
                    className="w-full gap-2"
                  >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send SMS
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bulk SMS Tab */}
            <TabsContent value="bulk" className="space-y-6">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-600" />
                    Send Bulk SMS
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Recipients</label>
                    <Textarea
                      placeholder="Enter phone numbers (one per line):&#10;+1234567890,John Doe&#10;+0987654321,Jane Smith"
                      value={bulkSMS.recipients}
                      onChange={(e) => setBulkSMS({ ...bulkSMS, recipients: e.target.value })}
                      rows={6}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Format: phone,name (one per line). Recipients: {bulkSMS.recipients.split('\n').filter(line => line.trim()).length}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Template (Optional)</label>
                    <select 
                      className="w-full p-2 border rounded-md"
                      value={bulkSMS.templateId}
                      onChange={(e) => setBulkSMS({ ...bulkSMS, templateId: e.target.value })}
                    >
                      <option value="">Select a template...</option>
                      {Object.entries(templates).map(([id, template]) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <Textarea
                      placeholder="Type your bulk message here... Use {name} for personalization"
                      value={bulkSMS.message}
                      onChange={(e) => setBulkSMS({ ...bulkSMS, message: e.target.value })}
                      rows={4}
                    />
                  </div>

                  <Button 
                    onClick={sendBulkSMS}
                    disabled={!config.isConfigured || loading}
                    className="w-full gap-2"
                  >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    Send Bulk SMS
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Templates Tab */}
            <TabsContent value="templates" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Add Template */}
                <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Plus className="h-5 w-5 text-green-600" />
                      Add New Template
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Template ID</label>
                      <Input
                        placeholder="e.g., appointment_reminder"
                        value={templateForm.id}
                        onChange={(e) => setTemplateForm({ ...templateForm, id: e.target.value })}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Template Content</label>
                      <Textarea
                        placeholder="Hi {name}, your appointment with Dr. {doctor} is scheduled for {date}..."
                        value={templateForm.template}
                        onChange={(e) => setTemplateForm({ ...templateForm, template: e.target.value })}
                        rows={4}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use {'{variable}'} for dynamic content
                      </p>
                    </div>

                    <Button 
                      onClick={saveTemplate}
                      disabled={loading}
                      className="w-full gap-2"
                    >
                      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Save Template
                    </Button>
                  </CardContent>
                </Card>

                {/* Existing Templates */}
                <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      Existing Templates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(templates).length > 0 ? (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {Object.entries(templates).map(([id, template]) => (
                          <div key={id} className="p-3 bg-gray-50 rounded-lg">
                            <h4 className="font-semibold text-sm text-blue-600">{id}</h4>
                            <p className="text-xs text-gray-600 mt-1">{template}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTemplateForm({ id, template })}
                              className="mt-2"
                            >
                              Edit
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No templates found</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="space-y-6">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    SMS Logs
                    <Button 
                      onClick={loadLogs}
                      size="sm"
                      variant="outline"
                      className="ml-auto gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {logs.length > 0 ? (
                    <div className="space-y-3">
                      {logs.map((log, index) => (
                        <div key={index} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-start gap-3">
                            {log.result?.success || log.successCount > 0 ? (
                              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium">
                                  {log.type === 'bulk' ? `Bulk SMS (${log.recipients} recipients)` : `To: ${log.to?.[0]}`}
                                </p>
                                {log.isTest && (
                                  <Badge variant="secondary" className="text-xs">Test</Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{log.message}</p>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>By: {log.sentBy}</span>
                                <span>{new Date(log.timestamp).toLocaleString()}</span>
                                {log.templateId && <span>Template: {log.templateId}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={log.result?.success || log.successCount > 0 ? "default" : "destructive"}>
                              {log.type === 'bulk' ? 
                                `${log.successCount}/${log.recipients} sent` : 
                                (log.result?.success ? 'Sent' : 'Failed')
                              }
                            </Badge>
                            {log.result?.messageId && (
                              <p className="text-xs text-gray-500 mt-1">ID: {log.result.messageId.slice(0, 8)}...</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No SMS logs found</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Configuration Tab */}
            <TabsContent value="config" className="space-y-6">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-gray-600" />
                    SMS Gateway Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Provider</label>
                    <select 
                      className="w-full p-2 border rounded-md"
                      value={config.provider}
                      onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                    >
                      <option value="twilio">Twilio</option>
                      <option value="aws-sns">AWS SNS</option>
                      <option value="textlocal">TextLocal</option>
                      <option value="msg91">MSG91</option>
                      <option value="fast2sms">Fast2SMS</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">API Key</label>
                    <Input
                      type="password"
                      placeholder="Enter your API key"
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">API Secret (if required)</label>
                    <Input
                      type="password"
                      placeholder="Enter your API secret"
                      value={config.apiSecret}
                      onChange={(e) => setConfig({ ...config, apiSecret: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Sender ID</label>
                    <Input
                      placeholder="e.g., MEDICZY"
                      value={config.senderId}
                      onChange={(e) => setConfig({ ...config, senderId: e.target.value })}
                    />
                  </div>

                  <Button 
                    onClick={updateConfig}
                    disabled={loading}
                    className="w-full gap-2"
                  >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                    Save Configuration
                  </Button>

                  {/* Provider Documentation */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">Provider Setup Instructions</h4>
                    <div className="text-sm text-blue-700 space-y-2">
                      {config.provider === 'twilio' && (
                        <div>
                          <p><strong>Twilio Setup:</strong></p>
                          <ul className="list-disc pl-5 space-y-1">
                            <li>API Key: Your Twilio Account SID</li>
                            <li>API Secret: Your Twilio Auth Token</li>
                            <li>Sender ID: Your Twilio phone number</li>
                          </ul>
                        </div>
                      )}
                      {config.provider === 'textlocal' && (
                        <div>
                          <p><strong>TextLocal Setup:</strong></p>
                          <ul className="list-disc pl-5 space-y-1">
                            <li>API Key: Your TextLocal API key</li>
                            <li>Sender ID: Your registered sender name (6 chars)</li>
                          </ul>
                        </div>
                      )}
                      {config.provider === 'msg91' && (
                        <div>
                          <p><strong>MSG91 Setup:</strong></p>
                          <ul className="list-disc pl-5 space-y-1">
                            <li>API Key: Your MSG91 Auth Key</li>
                            <li>Sender ID: Your registered sender ID</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SMSManagement;
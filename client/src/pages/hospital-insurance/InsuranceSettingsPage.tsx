import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchPortalSection, savePortalSection } from '@/utils/hospitalInsurancePortalApi';
import { Settings, Shield, Bell, Save, Key, Globe, Mail } from 'lucide-react';

const InsuranceSettingsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');

  const [general, setGeneral] = useState({
    autoAssignment: true, emailNotifications: true, smsNotifications: false,
    defaultCurrency: 'INR', timezone: 'Asia/Kolkata', language: 'en',
    claimPrefix: 'CLM', preAuthPrefix: 'PA', autoArchiveDays: '90',
  });

  const [apiConfig, setApiConfig] = useState({
    nhcxEndpoint: 'https://nhcx.abdm.gov.in/api/v1', nhcxApiKey: '',
    abdmEndpoint: 'https://abha.abdm.gov.in/api/v3', abdmClientId: '', abdmClientSecret: '',
    webhookUrl: '', callbackUrl: '',
  });

  useEffect(() => {
    fetchPortalSection('settings').then(res => {
      const d = res?.data || {};
      if (d.general)   setGeneral(g => ({ ...g, ...d.general }));
      if (d.apiConfig) setApiConfig(a => ({ ...a, ...d.apiConfig }));
    }).catch(() => {});
  }, []);

  const handleSave = async (section: string) => {
    try {
      await savePortalSection('settings', { general, apiConfig });
      toast({ title: 'Settings Saved', description: `${section} settings saved successfully.` });
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save settings. Try again.', variant: 'destructive' });
    }
  };

  return (
    <InsurancePortalLayout title="Settings" subtitle="Configure portal preferences and integrations">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="api">API Config</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings className="h-5 w-5" /> General Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Claim Prefix</label>
                    <Input value={general.claimPrefix} onChange={(e) => setGeneral({...general, claimPrefix: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Pre-Auth Prefix</label>
                    <Input value={general.preAuthPrefix} onChange={(e) => setGeneral({...general, preAuthPrefix: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Currency</label>
                    <Select value={general.defaultCurrency} onValueChange={(v) => setGeneral({...general, defaultCurrency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR (₹)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Timezone</label>
                    <Select value={general.timezone} onValueChange={(v) => setGeneral({...general, timezone: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Language</label>
                    <Select value={general.language} onValueChange={(v) => setGeneral({...general, language: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                        <SelectItem value="ta">Tamil</SelectItem>
                        <SelectItem value="te">Telugu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Auto-archive Claims (days)</label>
                    <Input type="number" value={general.autoArchiveDays} onChange={(e) => setGeneral({...general, autoArchiveDays: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleSave('General')}><Save className="h-4 w-4 mr-1" /> Save</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-5 w-5" /> Notification Preferences</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { key: 'newClaim', label: 'New Claim Submitted', desc: 'Notify when a new claim is created' },
                    { key: 'preAuthApproved', label: 'Pre-Auth Approved', desc: 'Notify when pre-auth is approved by insurer' },
                    { key: 'queryReceived', label: 'Query Received', desc: 'Notify when insurer raises a query' },
                    { key: 'settlement', label: 'Settlement Received', desc: 'Notify when payment settlement is received' },
                    { key: 'documentMissing', label: 'Missing Document Alert', desc: 'Alert for documents pending upload' },
                    { key: 'deadlineApproaching', label: 'Deadline Approaching', desc: 'Alert 24 hours before submission deadlines' },
                    { key: 'escalation', label: 'Escalation Alert', desc: 'Notify when a claim is escalated' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" defaultChecked className="rounded" />
                          <Mail className="h-3 w-3" /> Email
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" defaultChecked className="rounded" />
                          <Bell className="h-3 w-3" /> Push
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-4">
                  <Button onClick={() => handleSave('Notifications')}><Save className="h-4 w-4 mr-1" /> Save</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Config */}
          <TabsContent value="api" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Globe className="h-5 w-5" /> API Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="font-medium text-sm">NHCX Configuration</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm">Endpoint URL</label><Input value={apiConfig.nhcxEndpoint} onChange={(e) => setApiConfig({...apiConfig, nhcxEndpoint: e.target.value})} /></div>
                    <div><label className="text-sm">API Key</label><Input type="password" value={apiConfig.nhcxApiKey} onChange={(e) => setApiConfig({...apiConfig, nhcxApiKey: e.target.value})} placeholder="Enter API key" /></div>
                  </div>
                </div>
                <div className="space-y-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="font-medium text-sm">ABDM Configuration</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="text-sm">Endpoint URL</label><Input value={apiConfig.abdmEndpoint} onChange={(e) => setApiConfig({...apiConfig, abdmEndpoint: e.target.value})} /></div>
                    <div><label className="text-sm">Client ID</label><Input value={apiConfig.abdmClientId} onChange={(e) => setApiConfig({...apiConfig, abdmClientId: e.target.value})} /></div>
                    <div><label className="text-sm">Client Secret</label><Input type="password" value={apiConfig.abdmClientSecret} onChange={(e) => setApiConfig({...apiConfig, abdmClientSecret: e.target.value})} /></div>
                  </div>
                </div>
                <div className="space-y-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="font-medium text-sm">Webhook Settings</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm">Webhook URL</label><Input value={apiConfig.webhookUrl} onChange={(e) => setApiConfig({...apiConfig, webhookUrl: e.target.value})} placeholder="https://..." /></div>
                    <div><label className="text-sm">Callback URL</label><Input value={apiConfig.callbackUrl} onChange={(e) => setApiConfig({...apiConfig, callbackUrl: e.target.value})} placeholder="https://..." /></div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleSave('API Config')}><Save className="h-4 w-4 mr-1" /> Save</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-5 w-5" /> Security Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    { label: 'Auto-logout after inactivity', value: '30 minutes', badge: 'Active' },
                    { label: 'Two-Factor Authentication', value: 'Email OTP', badge: 'Enabled' },
                    { label: 'Password Expiry', value: '90 days', badge: 'Active' },
                    { label: 'IP Whitelisting', value: 'Not configured', badge: 'Disabled' },
                    { label: 'Audit Logging', value: 'All actions logged', badge: 'Active' },
                    { label: 'Data Encryption', value: 'AES-256 at rest, TLS 1.3 in transit', badge: 'Active' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.value}</p>
                      </div>
                      <Badge className={item.badge === 'Active' || item.badge === 'Enabled' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}>{item.badge}</Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-sm font-medium text-amber-700">Change Password</p>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <Input type="password" placeholder="Current password" />
                    <Input type="password" placeholder="New password" />
                    <Button variant="outline" onClick={() => toast({ title: 'Password Updated' })}>
                      <Key className="h-4 w-4 mr-1" /> Update
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceSettingsPage;

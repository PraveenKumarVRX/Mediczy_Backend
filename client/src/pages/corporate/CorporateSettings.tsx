import React, { useEffect, useState } from 'react';
import { Settings, Bell, Lock, Users, Building2, CreditCard, Globe, Save, Cog } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface Invoice {
  id: string;
  date: string;
  period: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
}

const CorporateSettings: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');

  const [billingOpen, setBillingOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      await api.put('/corporate/settings', {});
      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully."
      });
    } catch (error: any) {
      toast({
        title: "Failed to save settings",
        description: error?.response?.data?.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadBillingHistory = async () => {
    try {
      setBillingLoading(true);
      const { data } = await api.get('/corporate/billing/history');
      const list = ((data as any)?.data?.invoices || []) as Invoice[];
      setInvoices(list);
    } catch (error: any) {
      toast({
        title: 'Failed to load billing history',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    if (billingOpen) loadBillingHistory();
  }, [billingOpen]);

  const downloadInvoice = async (invoice: Invoice) => {
    try {
      const response = await api.get(`/corporate/billing/invoices/${encodeURIComponent(invoice.id)}/download`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${invoice.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getInvoiceStatusColor = (status: string) => {
    switch (String(status || '').toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'due':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <CorporateLayout title="Settings">
      <div className="space-y-6">
        <CorporatePageHeader
          icon={Cog}
          title="Corporate Settings"
          description="Configure your organization's health platform settings and preferences"
          gradient="from-gray-600 to-gray-800"
          actions={
            <Button size="sm" onClick={handleSaveSettings} className="bg-white text-gray-700 hover:bg-white/90 shadow-lg">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          }
        />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Globe className="h-4 w-4 mr-2" />
            Integrations
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Basic details about your organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" defaultValue="TechCorp Industries" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Select defaultValue="technology">
                  <SelectTrigger id="industry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technology">Technology</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="employeeCount">Number of Employees</Label>
                  <Input id="employeeCount" type="number" defaultValue="250" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Time Zone</Label>
                  <Select defaultValue="est">
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pst">Pacific (PST)</SelectItem>
                      <SelectItem value="mst">Mountain (MST)</SelectItem>
                      <SelectItem value="cst">Central (CST)</SelectItem>
                      <SelectItem value="est">Eastern (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Company Address</Label>
                <Textarea id="address" defaultValue="123 Business St, Suite 100, New York, NY 10001" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" defaultValue="+1 (555) 123-4567" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Contact Email</Label>
                  <Input id="email" type="email" defaultValue="hr@techcorp.com" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Health Program Settings</CardTitle>
              <CardDescription>Configure health and wellness program parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="fiscalYear">Fiscal Year Start</Label>
                <Select defaultValue="january">
                  <SelectTrigger id="fiscalYear">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="january">January</SelectItem>
                    <SelectItem value="april">April</SelectItem>
                    <SelectItem value="july">July</SelectItem>
                    <SelectItem value="october">October</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checkupFrequency">Annual Checkup Frequency</Label>
                <Select defaultValue="yearly">
                  <SelectTrigger id="checkupFrequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="biannual">Bi-annual</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mandatory Health Checkups</Label>
                  <p className="text-sm text-gray-500">Require employees to complete annual checkups</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mental Health Support</Label>
                  <p className="text-sm text-gray-500">Enable mental health counseling benefits</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Manage how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-gray-500">Receive email updates about health programs</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SMS Notifications</Label>
                  <p className="text-sm text-gray-500">Get text messages for urgent health alerts</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Health Risk Alerts</Label>
                  <p className="text-sm text-gray-500">Notify about employees at health risk</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Claim Status Updates</Label>
                  <p className="text-sm text-gray-500">Updates on insurance claim processing</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Health Reports</Label>
                  <p className="text-sm text-gray-500">Receive weekly health analytics summary</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Appointment Reminders</Label>
                  <p className="text-sm text-gray-500">Send reminders for upcoming appointments</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Access Control</CardTitle>
              <CardDescription>Manage security and access permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-gray-500">Require 2FA for admin accounts</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SSO (Single Sign-On)</Label>
                  <p className="text-sm text-gray-500">Enable SSO for employee logins</p>
                </div>
                <Switch />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input id="sessionTimeout" type="number" defaultValue="30" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IP Whitelisting</Label>
                  <p className="text-sm text-gray-500">Restrict access to specific IP addresses</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Data Encryption</Label>
                  <p className="text-sm text-gray-500">Encrypt sensitive health data at rest</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>Configure data privacy and compliance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>HIPAA Compliance Mode</Label>
                  <p className="text-sm text-gray-500">Enable HIPAA-compliant data handling</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Audit Logging</Label>
                  <p className="text-sm text-gray-500">Track all data access and modifications</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dataRetention">Data Retention Period (years)</Label>
                <Input id="dataRetention" type="number" defaultValue="7" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Settings */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
              <CardDescription>Manage your subscription and payment details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Current Plan</Label>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-semibold">Enterprise Plan</p>
                    <p className="text-sm text-gray-600">Up to 500 employees</p>
                  </div>
                  <Button variant="outline">Upgrade Plan</Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billingEmail">Billing Email</Label>
                <Input id="billingEmail" type="email" defaultValue="billing@techcorp.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-gray-600" />
                    <div>
                      <p className="font-semibold">Visa ending in 4242</p>
                      <p className="text-sm text-gray-600">Expires 12/2025</p>
                    </div>
                  </div>
                  <Button variant="outline">Update</Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billingCycle">Billing Cycle</Label>
                <Select defaultValue="annual">
                  <SelectTrigger id="billingCycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual (Save 20%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setBillingOpen(true)}>
                View Billing History
              </Button>
            </CardContent>
          </Card>

          <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
            <DialogContent className="sm:max-w-[750px]">
              <DialogHeader>
                <DialogTitle>Billing History</DialogTitle>
                <DialogDescription>View invoices and download CSV copies</DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {billingLoading && <div className="text-sm text-gray-500">Loading invoices…</div>}

                {!billingLoading && invoices.length === 0 && (
                  <div className="text-sm text-gray-500">No invoices found.</div>
                )}

                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{inv.id}</div>
                        <Badge className={getInvoiceStatusColor(inv.status)}>{String(inv.status).toUpperCase()}</Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        {inv.plan} • {inv.period} • {new Date(inv.date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-700">
                        Amount: {inv.currency} {Number(inv.amount).toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <Button variant="outline" onClick={() => downloadInvoice(inv)}>
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setBillingOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Integration Settings */}
        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Third-Party Integrations</CardTitle>
              <CardDescription>Connect external services and platforms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-semibold">HR Management System</p>
                    <p className="text-sm text-gray-600">Sync employee data automatically</p>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-semibold">Insurance Provider API</p>
                    <p className="text-sm text-gray-600">Real-time claim status updates</p>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="font-semibold">Telemedicine Platform</p>
                    <p className="text-sm text-gray-600">Enable virtual consultations</p>
                  </div>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-orange-600" />
                  <div>
                    <p className="font-semibold">Wearable Devices</p>
                    <p className="text-sm text-gray-600">Sync fitness tracker data</p>
                  </div>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="font-semibold">Calendar Integration</p>
                    <p className="text-sm text-gray-600">Sync appointments with calendars</p>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </CorporateLayout>
  );
};

export default CorporateSettings;

import React, { useEffect, useState } from 'react';
import { Settings, Bell, Lock, Users, Building2, CreditCard, Globe, Save, Cog, CheckSquare } from 'lucide-react';
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

  // Controlled eligibility form
  const [eligibility, setEligibility] = useState({
    checkupsPerYear: 1,
    minServiceMonths: 0,
    eligibleDepartments: '',
    minAge: 0,
    maxAge: 0,
    eligibleGrades: '',
  });
  const [isSavingEligibility, setIsSavingEligibility] = useState(false);

  // Controlled general form — seeded from the logged-in corporate's real
  // profile where available; overwritten by saved settings once loaded.
  let seedCompanyName = '';
  let seedEmail = '';
  try {
    const corporateDataStr = localStorage.getItem('corporateData');
    if (corporateDataStr) {
      const corporateData = JSON.parse(corporateDataStr);
      seedCompanyName = corporateData?.companyName || corporateData?.name || '';
      seedEmail = corporateData?.email || '';
    }
  } catch (e) {
    // ignore
  }

  const [general, setGeneral] = useState({
    companyName: seedCompanyName,
    industry: '',
    employeeCount: '',
    timezone: 'Asia/Kolkata',
    address: '',
    phone: '',
    email: seedEmail,
    fiscalYear: 'january',
    checkupFrequency: 'yearly',
    mandatoryCheckups: true,
    mentalHealthSupport: true,
  });

  // Controlled notification form
  const [notifs, setNotifs] = useState({
    emailNotifications: true,
    smsNotifications: false,
    healthRiskAlerts: true,
    claimStatusUpdates: true,
    weeklyReports: true,
    appointmentReminders: true,
  });

  // Controlled security form
  const [security, setSecurity] = useState({
    twoFactor: true,
    sso: false,
    sessionTimeout: '30',
    ipWhitelisting: false,
    dataEncryption: true,
    hipaaMode: true,
    auditLogging: true,
    dataRetention: '7',
  });

  // Controlled billing/integration
  const [billing, setBilling] = useState({ billingEmail: seedEmail, billingCycle: 'annual' });
  const [integrations, setIntegrations] = useState({ hrms: false, insuranceApi: false, telemedicine: false, wearables: false, calendar: false });
  const [planInfo, setPlanInfo] = useState<{ linkedPlan: boolean; planName?: string; maxEmployees?: number | null } | null>(null);

  const [rosterOptions, setRosterOptions] = useState<{ departments: string[]; grades: string[] }>({ departments: [], grades: [] });
  useEffect(() => {
    api.get('/corporate/employees').then(({ data }) => {
      const rows = data?.data?.employees || data?.data || [];
      if (!Array.isArray(rows)) return;
      setRosterOptions({
        departments: [...new Set(rows.map((r: any) => r.department || 'General'))].sort() as string[],
        grades: [...new Set(rows.map((r: any) => r.designation).filter(Boolean))].sort() as string[],
      });
    }).catch(() => {});
  }, []);
  const eligibilityOptions = (field: 'eligibleDepartments' | 'eligibleGrades', options: string[]) => {
    const selected = String(eligibility[field] || '').split(',').map(v => v.trim()).filter(Boolean);
    return <div className="space-y-2" role="group" aria-label={field === 'eligibleDepartments' ? 'Eligible departments' : 'Eligible job grades'}>
      <p className="text-xs text-slate-400">Select from the employee roster. Leave all unchecked to include everyone.</p>
      {[...new Set([...options, ...selected])].map(value => <label key={value} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={selected.includes(value)} onChange={e => setEligibility(p => ({ ...p, [field]: (e.target.checked ? [...selected, value] : selected.filter(v => v !== value)).join(',') }))} />
        {value}
      </label>)}
      {!options.length && <p className="text-xs text-slate-400">No roster values available.</p>}
    </div>;
  };

  const loadSettings = async () => {
    try {
      const [{ data }, eligRes, benefitsRes] = await Promise.all([
        api.get('/corporate/settings'),
        api.get('/corporate/settings/data').catch(() => ({ data: null })),
        api.get('/corporate/my-benefits').catch(() => ({ data: null })),
      ]);
      const saved = (data as any)?.data?.settings || {};
      if (saved.general) setGeneral((prev) => ({ ...prev, ...saved.general }));
      if (saved.notifs) setNotifs((prev) => ({ ...prev, ...saved.notifs }));
      if (saved.security) setSecurity((prev) => ({ ...prev, ...saved.security }));
      if (saved.billing) setBilling((prev) => ({ ...prev, ...saved.billing }));
      if (saved.integrations) setIntegrations((prev) => ({ ...prev, ...saved.integrations }));
      const savedElig = (eligRes.data as any)?.data?.settings?.eligibility;
      if (savedElig) setEligibility((prev) => ({ ...prev, ...savedElig }));
      const benefitsData = (benefitsRes?.data as any)?.data;
      setPlanInfo({
        linkedPlan: Boolean(benefitsData?.linkedPlan),
        planName: benefitsData?.plan?.planName,
        maxEmployees: benefitsData?.enrollment?.total ?? null,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to load settings',
        description: error?.response?.data?.message || 'Showing defaults — changes may not reflect prior saves.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const validateAndSave = () => {
    const empCount = parseInt(general.employeeCount, 10);
    if (isNaN(empCount) || empCount < 0) {
      toast({ title: 'Invalid employee count', description: 'Must be 0 or more.', variant: 'destructive' });
      return;
    }
    const timeout = parseInt(security.sessionTimeout, 10);
    if (isNaN(timeout) || timeout < 5 || timeout > 480) {
      toast({ title: 'Invalid session timeout', description: 'Must be between 5 and 480 minutes.', variant: 'destructive' });
      return;
    }
    handleSaveSettings();
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      await api.put('/corporate/settings', { general, notifs, security, billing, integrations });
      toast({ title: 'Settings Saved', description: 'Your settings have been updated successfully.' });
    } catch (error: any) {
      toast({ title: 'Failed to save settings', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEligibility = async () => {
    try {
      setIsSavingEligibility(true);
      await api.put('/corporate/settings/data', { settings: { eligibility } });
      toast({ title: 'Eligibility rules saved' });
    } catch (error: any) {
      toast({ title: 'Failed to save eligibility rules', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSavingEligibility(false);
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
        return 'bg-slate-800 text-slate-200';
    }
  };

  return (
    <CorporateLayout title="Settings">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={Cog}
          title="Corporate Settings"
          description="Configure your organization's health platform settings and preferences"
          gradient="from-gray-600 to-gray-800"
          actions={
            <Button size="sm" onClick={validateAndSave} disabled={isSaving} className="bg-white text-slate-900 hover:bg-white/90 shadow-lg font-semibold">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          }
        />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="eligibility">
            <CheckSquare className="h-4 w-4 mr-2" />
            Eligibility
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
                <Input id="companyName" value={general.companyName} onChange={e => setGeneral(p => ({ ...p, companyName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={general.industry} onValueChange={v => setGeneral(p => ({ ...p, industry: v }))}>
                  <SelectTrigger id="industry"><SelectValue /></SelectTrigger>
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
                  <Input id="employeeCount" type="number" min="0" step="1" value={general.employeeCount} onChange={e => setGeneral(p => ({ ...p, employeeCount: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Time Zone</Label>
                  <Select value={general.timezone} onValueChange={v => setGeneral(p => ({ ...p, timezone: v }))}>
                    <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
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
                <Textarea id="address" value={general.address} rows={3} onChange={e => setGeneral(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" value={general.phone} onChange={e => setGeneral(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Contact Email</Label>
                  <Input id="email" type="email" value={general.email} onChange={e => setGeneral(p => ({ ...p, email: e.target.value }))} />
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
                <Select value={general.fiscalYear} onValueChange={v => setGeneral(p => ({ ...p, fiscalYear: v }))}>
                  <SelectTrigger id="fiscalYear"><SelectValue /></SelectTrigger>
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
                <Select value={general.checkupFrequency} onValueChange={v => setGeneral(p => ({ ...p, checkupFrequency: v }))}>
                  <SelectTrigger id="checkupFrequency"><SelectValue /></SelectTrigger>
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
                  <p className="text-sm text-slate-400">Require employees to complete annual checkups</p>
                </div>
                <Switch checked={general.mandatoryCheckups} onCheckedChange={v => setGeneral(p => ({ ...p, mandatoryCheckups: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mental Health Support</Label>
                  <p className="text-sm text-slate-400">Enable mental health counseling benefits</p>
                </div>
                <Switch checked={general.mentalHealthSupport} onCheckedChange={v => setGeneral(p => ({ ...p, mentalHealthSupport: v }))} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eligibility Rules */}
        <TabsContent value="eligibility" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Eligibility Rules</CardTitle>
              <CardDescription>Define which employees qualify for health checkups and programmes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="checkupsPerYear">Checkups per year</Label>
                  <Input
                    id="checkupsPerYear"
                    type="number"
                    min="1"
                    step="1"
                    value={eligibility.checkupsPerYear}
                    onChange={e => setEligibility(p => ({ ...p, checkupsPerYear: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="minServiceMonths">Minimum months of service to be eligible</Label>
                  <Input
                    id="minServiceMonths"
                    type="number"
                    min="0"
                    step="1"
                    value={eligibility.minServiceMonths}
                    onChange={e => setEligibility(p => ({ ...p, minServiceMonths: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eligibleDepartments">Eligible departments</Label>
                {eligibilityOptions('eligibleDepartments', rosterOptions.departments)}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="minAge">Minimum age for eligibility (0 = no limit)</Label>
                <Input
                  id="minAge"
                  type="number"
                  min="0"
                  step="1"
                  value={eligibility.minAge}
                  onChange={e => setEligibility(p => ({ ...p, minAge: parseInt(e.target.value, 10) || 0 }))}
                />
                <p className="text-xs text-slate-400">Used by "Enroll All" on Annual Health Checkup batches (e.g. an "Age 40+" batch)</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxAge">Maximum age for eligibility (0 = no limit)</Label>
                <Input
                  id="maxAge"
                  type="number"
                  min="0"
                  step="1"
                  value={eligibility.maxAge}
                  onChange={e => setEligibility(p => ({ ...p, maxAge: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eligibleGrades">Eligible job grades / designations</Label>
                {eligibilityOptions('eligibleGrades', rosterOptions.grades)}
              </div>
              <Button onClick={handleSaveEligibility} disabled={isSavingEligibility} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                {isSavingEligibility ? 'Saving…' : 'Save Eligibility Rules'}
              </Button>
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
                  <p className="text-sm text-slate-400">Receive email updates about health programs</p>
                </div>
                <Switch checked={notifs.emailNotifications} onCheckedChange={v => setNotifs(p => ({ ...p, emailNotifications: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SMS Notifications</Label>
                  <p className="text-sm text-slate-400">Get text messages for urgent health alerts</p>
                </div>
                <Switch checked={notifs.smsNotifications} onCheckedChange={v => setNotifs(p => ({ ...p, smsNotifications: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Health Risk Alerts</Label>
                  <p className="text-sm text-slate-400">Notify about employees at health risk</p>
                </div>
                <Switch checked={notifs.healthRiskAlerts} onCheckedChange={v => setNotifs(p => ({ ...p, healthRiskAlerts: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Claim Status Updates</Label>
                  <p className="text-sm text-slate-400">Updates on insurance claim processing</p>
                </div>
                <Switch checked={notifs.claimStatusUpdates} onCheckedChange={v => setNotifs(p => ({ ...p, claimStatusUpdates: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Health Reports</Label>
                  <p className="text-sm text-slate-400">Receive weekly health analytics summary</p>
                </div>
                <Switch checked={notifs.weeklyReports} onCheckedChange={v => setNotifs(p => ({ ...p, weeklyReports: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Appointment Reminders</Label>
                  <p className="text-sm text-slate-400">Send reminders for upcoming appointments</p>
                </div>
                <Switch checked={notifs.appointmentReminders} onCheckedChange={v => setNotifs(p => ({ ...p, appointmentReminders: v }))} />
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
                  {/* Previously a live-looking Switch writing to local React state only. Toggling
                      it implied 2FA was enforced on admin accounts; it is not implemented at
                      all. Disabled and labelled so the gap is visible instead of implied. */}
                  <p className="text-sm text-slate-400">
                    Not enforced — MFA is not implemented. No admin account requires a second factor.
                  </p>
                </div>
                <Switch checked={false} disabled aria-label="Two-factor authentication (not available)" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SSO (Single Sign-On)</Label>
                  <p className="text-sm text-slate-400">Not available — no identity provider is connected. Employee logins use their existing credentials.</p>
                </div>
                <Switch checked={false} disabled aria-label="Single sign-on (not available)" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input id="sessionTimeout" type="number" min="5" max="480" value={security.sessionTimeout} onChange={e => setSecurity(p => ({ ...p, sessionTimeout: e.target.value }))} />
                <p className="text-xs text-slate-400">Between 5 and 480 minutes</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IP Whitelisting</Label>
                  <p className="text-sm text-slate-400">Restrict access to specific IP addresses</p>
                </div>
                <Switch checked={security.ipWhitelisting} onCheckedChange={v => setSecurity(p => ({ ...p, ipWhitelisting: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Data Encryption</Label>
                  <p className="text-sm text-slate-400">Encrypt sensitive health data at rest</p>
                </div>
                <Switch checked={security.dataEncryption} onCheckedChange={v => setSecurity(p => ({ ...p, dataEncryption: v }))} />
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
                  <p className="text-sm text-slate-400">Enable HIPAA-compliant data handling</p>
                </div>
                <Switch checked={security.hipaaMode} onCheckedChange={v => setSecurity(p => ({ ...p, hipaaMode: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Audit Logging</Label>
                  <p className="text-sm text-slate-400">Track all data access and modifications</p>
                </div>
                <Switch checked={security.auditLogging} onCheckedChange={v => setSecurity(p => ({ ...p, auditLogging: v }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dataRetention">Data Retention Period (years)</Label>
                <Input id="dataRetention" type="number" min="1" max="30" value={security.dataRetention} onChange={e => setSecurity(p => ({ ...p, dataRetention: e.target.value }))} />
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
                <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg">
                  <div>
                    <p className="font-semibold">{planInfo?.linkedPlan ? (planInfo.planName || 'Corporate Plan') : 'No plan configured'}</p>
                    <p className="text-sm text-slate-400">
                      {planInfo?.linkedPlan
                        ? (planInfo.maxEmployees ? `Up to ${planInfo.maxEmployees} employees` : 'Employee cap not set')
                        : 'Contact Mediqzy to set up a subscription plan'}
                    </p>
                  </div>
                  <Button variant="outline">{planInfo?.linkedPlan ? 'Upgrade Plan' : 'Contact Sales'}</Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billingEmail">Billing Email</Label>
                <Input id="billingEmail" type="email" value={billing.billingEmail} onChange={e => setBilling(p => ({ ...p, billingEmail: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="font-semibold">Not configured</p>
                      <p className="text-sm text-slate-400">No payment method on file</p>
                    </div>
                  </div>
                  <Button variant="outline">Add</Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billingCycle">Billing Cycle</Label>
                <Select value={billing.billingCycle} onValueChange={v => setBilling(p => ({ ...p, billingCycle: v }))}>
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
                {billingLoading && <div className="text-sm text-slate-400">Loading invoices…</div>}

                {!billingLoading && invoices.length === 0 && (
                  <div className="text-sm text-slate-400">No invoices found.</div>
                )}

                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{inv.id}</div>
                        <Badge className={getInvoiceStatusColor(inv.status)}>{String(inv.status).toUpperCase()}</Badge>
                      </div>
                      <div className="text-sm text-slate-400">
                        {inv.plan} • {inv.period} • {new Date(inv.date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-slate-300">
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
                  <div><p className="font-semibold">HR Management System</p><p className="text-sm text-slate-400">Sync employee data automatically</p></div>
                </div>
                <Switch checked={integrations.hrms} onCheckedChange={v => setIntegrations(p => ({ ...p, hrms: v }))} />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-green-600" />
                  <div><p className="font-semibold">Insurance Provider API</p><p className="text-sm text-slate-400">Real-time claim status updates</p></div>
                </div>
                <Switch checked={integrations.insuranceApi} onCheckedChange={v => setIntegrations(p => ({ ...p, insuranceApi: v }))} />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-purple-600" />
                  <div><p className="font-semibold">Telemedicine Platform</p><p className="text-sm text-slate-400">Enable virtual consultations</p></div>
                </div>
                <Switch checked={integrations.telemedicine} onCheckedChange={v => setIntegrations(p => ({ ...p, telemedicine: v }))} />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-orange-600" />
                  <div><p className="font-semibold">Wearable Devices</p><p className="text-sm text-slate-400">Sync fitness tracker data</p></div>
                </div>
                <Switch checked={integrations.wearables} onCheckedChange={v => setIntegrations(p => ({ ...p, wearables: v }))} />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-red-600" />
                  <div><p className="font-semibold">Calendar Integration</p><p className="text-sm text-slate-400">Sync appointments with calendars</p></div>
                </div>
                <Switch checked={integrations.calendar} onCheckedChange={v => setIntegrations(p => ({ ...p, calendar: v }))} />
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

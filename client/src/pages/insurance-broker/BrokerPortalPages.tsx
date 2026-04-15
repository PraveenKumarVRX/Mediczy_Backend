import { useEffect, useState } from 'react';
import BrokerLayout from '@/components/insurance-broker/BrokerLayout';
import api from '@/utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const currency = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const usePageLoader = <T,>(endpoint: string, fallback: T, key?: string) => {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get(endpoint);
      const payload = key ? response.data?.[key] : response.data;
      setData((payload as T) || fallback);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || `Failed to load ${endpoint}`);
      setData(fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { data, loading, reload: load };
};

const LoadingState = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
  </div>
);

export const BrokerPolicies = () => {
  const { data, loading } = usePageLoader('/insurance-broker/policies?limit=50', { policies: [] }, 'policies');

  return (
    <BrokerLayout title="Policies" subtitle="Track and manage all broker-managed policies">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle>Policy Register</CardTitle>
            <CardDescription>Total records: {Array.isArray(data) ? data.length : 0}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.isArray(data) && data.length > 0 ? data.map((policy: any) => (
                <div key={policy.id} className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{policy.policyNumber || `Policy #${policy.id}`}</p>
                    <p className="text-sm text-slate-400">{policy.policyType || 'Health Insurance'} • {currency(policy.premiumAmount || 0)}</p>
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30">{policy.status || 'active'}</Badge>
                </div>
              )) : <p className="text-slate-400">No policies found.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

export const BrokerCorporates = () => {
  const { data, loading } = usePageLoader('/insurance-broker/corporates?limit=50', { corporates: [] }, 'corporates');

  return (
    <BrokerLayout title="Corporates" subtitle="Manage onboarded corporate clients">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle>Corporate Accounts</CardTitle>
            <CardDescription>Total corporates: {Array.isArray(data) ? data.length : 0}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.isArray(data) && data.length > 0 ? data.map((corporate: any) => (
                <div key={corporate.id} className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{corporate.companyName || `Corporate #${corporate.id}`}</p>
                    <p className="text-sm text-slate-400">{corporate.industry || 'General'} • {corporate.city || 'NA'}</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">{corporate.status || 'active'}</Badge>
                </div>
              )) : <p className="text-slate-400">No corporates onboarded yet.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

export const BrokerProfile = () => {
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const { loading, reload } = usePageLoader('/insurance-broker/profile', { broker: null }, undefined);

  useEffect(() => {
    api.get('/insurance-broker/profile').then((res) => {
      const broker = res.data?.broker;
      setProfile(broker);
      setForm({
        brokerName: broker?.brokerName || '',
        contactPersonName: broker?.contactPersonName || '',
        phoneNumber: broker?.phoneNumber || '',
        city: broker?.city || '',
        state: broker?.state || ''
      });
    }).catch(() => {});
  }, [reload]);

  const update = async () => {
    setSaving(true);
    try {
      await api.put('/insurance-broker/profile', form);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BrokerLayout title="My Profile" subtitle="Maintain your broker profile and contact details">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50 max-w-3xl">
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
            <CardDescription>Broker ID: {profile?.id || '-'}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input value={form.brokerName || ''} onChange={(e) => setForm({ ...form, brokerName: e.target.value })} placeholder="Broker Name" className="bg-slate-900 border-slate-700 text-white" />
            <Input value={form.contactPersonName || ''} onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })} placeholder="Contact Person" className="bg-slate-900 border-slate-700 text-white" />
            <Input value={form.phoneNumber || ''} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="Phone Number" className="bg-slate-900 border-slate-700 text-white" />
            <Input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="bg-slate-900 border-slate-700 text-white" />
            <Input value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" className="bg-slate-900 border-slate-700 text-white" />
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={update} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

export const BrokerCommissions = () => {
  const { data, loading } = usePageLoader('/insurance-broker/commissions', {}, 'commissions');

  return (
    <BrokerLayout title="Commissions" subtitle="Commission ledger and payout status">
      {loading ? <LoadingState /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>Total Earned</CardDescription><CardTitle>{currency((data as any).totalEarned || 0)}</CardTitle></CardHeader></Card>
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>Available</CardDescription><CardTitle>{currency((data as any).available || 0)}</CardTitle></CardHeader></Card>
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>Paid</CardDescription><CardTitle>{currency((data as any).paid || 0)}</CardTitle></CardHeader></Card>
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>In Review</CardDescription><CardTitle>{currency((data as any).inReview || 0)}</CardTitle></CardHeader></Card>
        </div>
      )}
    </BrokerLayout>
  );
};

export const BrokerReports = () => {
  const { data, loading } = usePageLoader('/insurance-broker/reports', {}, 'report');

  return (
    <BrokerLayout title="Reports" subtitle="Business KPIs and operational summary">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader><CardTitle>Report Snapshot</CardTitle><CardDescription>Generated at {(data as any)?.generatedAt ? new Date((data as any).generatedAt).toLocaleString('en-IN') : '-'}</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-slate-700 rounded-lg bg-slate-900/50"><p className="text-slate-400 text-sm">Total Policies</p><p className="text-white text-2xl font-bold">{(data as any)?.kpis?.totalPolicies || 0}</p></div>
            <div className="p-4 border border-slate-700 rounded-lg bg-slate-900/50"><p className="text-slate-400 text-sm">Premium Facilitated</p><p className="text-white text-2xl font-bold">{currency((data as any)?.kpis?.premiumFacilitated || 0)}</p></div>
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

export const BrokerAnalytics = () => {
  const { data, loading } = usePageLoader('/insurance-broker/analytics', {}, 'analytics');

  return (
    <BrokerLayout title="Analytics" subtitle="Performance insights and conversion metrics">
      {loading ? <LoadingState /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>Conversion Rate</CardDescription><CardTitle>{(data as any).conversionRate || 0}%</CardTitle></CardHeader></Card>
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>Active Policies</CardDescription><CardTitle>{(data as any).activePolicies || 0}</CardTitle></CardHeader></Card>
          <Card className="border-slate-700 bg-slate-800/50"><CardHeader><CardDescription>Pending Policies</CardDescription><CardTitle>{(data as any).pendingPolicies || 0}</CardTitle></CardHeader></Card>
        </div>
      )}
    </BrokerLayout>
  );
};

export const BrokerNotifications = () => {
  const { data, loading } = usePageLoader('/insurance-broker/notifications', { notifications: [], unreadCount: 0 }, 'data');

  return (
    <BrokerLayout title="Notifications" subtitle="Compliance and operational alerts">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle>Unread: {(data as any).unreadCount || 0}</CardTitle>
            <CardDescription>Broker notifications and operational alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.isArray((data as any).notifications) && (data as any).notifications.length > 0 ? (data as any).notifications.map((item: any) => (
              <div key={item.id} className="p-3 rounded-lg border border-slate-700 bg-slate-900/50">
                <p className="text-white font-medium">{item.title}</p>
                <p className="text-slate-400 text-sm">{item.message}</p>
              </div>
            )) : <p className="text-slate-400">No notifications right now.</p>}
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

export const BrokerSettings = () => {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const { loading } = usePageLoader('/insurance-broker/settings', {}, 'settings');

  useEffect(() => {
    api.get('/insurance-broker/settings').then((res) => setSettings(res.data?.settings || {})).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/insurance-broker/settings', settings);
      toast.success('Settings saved');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BrokerLayout title="Settings" subtitle="Configure your portal preferences">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50 max-w-2xl">
          <CardHeader><CardTitle>Portal Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input value={settings.language || ''} onChange={(e) => setSettings({ ...settings, language: e.target.value })} placeholder="Language" className="bg-slate-900 border-slate-700 text-white" />
            <Input value={settings.timezone || ''} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} placeholder="Timezone" className="bg-slate-900 border-slate-700 text-white" />
            <Input value={String(settings.weeklyReport ?? true)} onChange={(e) => setSettings({ ...settings, weeklyReport: e.target.value === 'true' })} placeholder="weeklyReport true/false" className="bg-slate-900 border-slate-700 text-white" />
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

export const BrokerSupport = () => {
  const { data, loading } = usePageLoader('/insurance-broker/support', {}, 'support');

  return (
    <BrokerLayout title="Help & Support" subtitle="Dedicated support for broker operations">
      {loading ? <LoadingState /> : (
        <Card className="border-slate-700 bg-slate-800/50 max-w-3xl">
          <CardHeader><CardTitle>{(data as any).portalName || 'Intermediary Wellness Portal'}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-slate-300">Email: {(data as any).email || '-'}</p>
            <p className="text-slate-300">Phone: {(data as any).phone || '-'}</p>
            <p className="text-slate-300">Hours: {(data as any).hours || '-'}</p>
            <p className="text-slate-300">SLA: {(data as any).sla || '-'}</p>
          </CardContent>
        </Card>
      )}
    </BrokerLayout>
  );
};

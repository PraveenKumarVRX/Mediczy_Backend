import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, Loader2, Save, CheckCircle2,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

interface HospitalBasic {
  name: string; registrationNo: string; address: string; city: string; state: string; pin: string;
  phone: string; email: string; website: string;
}
interface GeneralSettings {
  autoAssignment: boolean; emailNotifications: boolean; smsNotifications: boolean;
  claimPrefix: string; preAuthPrefix: string; autoArchiveDays: string;
}

const InsuranceDeskSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [basic, setBasic] = useState<HospitalBasic>({
    name: '', registrationNo: '', address: '', city: '', state: '', pin: '', phone: '', email: '', website: '',
  });
  const [general, setGeneral] = useState<GeneralSettings>({
    autoAssignment: true, emailNotifications: true, smsNotifications: false,
    claimPrefix: 'CLM', preAuthPrefix: 'PA', autoArchiveDays: '90',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, settingsRes] = await Promise.all([
        api.get('/hospital/insurance/portal/hospital-profile'),
        api.get('/hospital/insurance/portal/settings'),
      ]);
      if (profileRes.data.data?.basic) setBasic((b) => ({ ...b, ...profileRes.data.data.basic }));
      if (settingsRes.data.data?.general) setGeneral((g) => ({ ...g, ...settingsRes.data.data.general }));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      await api.put('/hospital/insurance/portal/hospital-profile', { data: { basic } });
      setSaved('profile');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save hospital profile.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(null), 3000);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      await api.put('/hospital/insurance/portal/settings', { data: { general } });
      setSaved('general');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save settings.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(null), 3000);
    }
  };

  if (loading) {
    return (
      <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
        loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
        title="Settings" subtitle="Insurance portal configuration" copilotModule="insurance">
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading settings…
        </div>
      </HospDeptLayout>
    );
  }

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Settings" subtitle="Insurance portal configuration" copilotModule="insurance">
      {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Hospital Profile</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Hospital Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Hospital Name</Label><Input value={basic.name} onChange={(e) => setBasic((b) => ({ ...b, name: e.target.value }))} /></div>
                <div><Label>Registration Number</Label><Input value={basic.registrationNo} onChange={(e) => setBasic((b) => ({ ...b, registrationNo: e.target.value }))} /></div>
                <div className="sm:col-span-2"><Label>Address</Label><Input value={basic.address} onChange={(e) => setBasic((b) => ({ ...b, address: e.target.value }))} /></div>
                <div><Label>City</Label><Input value={basic.city} onChange={(e) => setBasic((b) => ({ ...b, city: e.target.value }))} /></div>
                <div><Label>State</Label><Input value={basic.state} onChange={(e) => setBasic((b) => ({ ...b, state: e.target.value }))} /></div>
                <div><Label>PIN Code</Label><Input value={basic.pin} onChange={(e) => setBasic((b) => ({ ...b, pin: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input value={basic.phone} onChange={(e) => setBasic((b) => ({ ...b, phone: e.target.value }))} /></div>
                <div><Label>Email</Label><Input value={basic.email} onChange={(e) => setBasic((b) => ({ ...b, email: e.target.value }))} /></div>
                <div><Label>Website</Label><Input value={basic.website} onChange={(e) => setBasic((b) => ({ ...b, website: e.target.value }))} /></div>
              </div>
              <Button onClick={saveProfile} disabled={saving} className="gap-1 bg-teal-600 hover:bg-teal-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved === 'profile' ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saved === 'profile' ? 'Saved' : 'Save Profile'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">General Settings</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div><Label>Auto-assign new claims</Label><p className="text-xs text-muted-foreground">Automatically route new claims to available staff</p></div>
                <Switch checked={general.autoAssignment} onCheckedChange={(v) => setGeneral((g) => ({ ...g, autoAssignment: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Email notifications</Label><p className="text-xs text-muted-foreground">Claim updates, queries, and approvals via email</p></div>
                <Switch checked={general.emailNotifications} onCheckedChange={(v) => setGeneral((g) => ({ ...g, emailNotifications: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>SMS notifications</Label><p className="text-xs text-muted-foreground">Critical alerts via SMS</p></div>
                <Switch checked={general.smsNotifications} onCheckedChange={(v) => setGeneral((g) => ({ ...g, smsNotifications: v }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label>Claim # Prefix</Label><Input value={general.claimPrefix} onChange={(e) => setGeneral((g) => ({ ...g, claimPrefix: e.target.value }))} /></div>
                <div><Label>Pre-Auth # Prefix</Label><Input value={general.preAuthPrefix} onChange={(e) => setGeneral((g) => ({ ...g, preAuthPrefix: e.target.value }))} /></div>
                <div><Label>Auto-archive after (days)</Label><Input value={general.autoArchiveDays} onChange={(e) => setGeneral((g) => ({ ...g, autoArchiveDays: e.target.value }))} /></div>
              </div>
              <Button onClick={saveSettings} disabled={saving} className="gap-1 bg-teal-600 hover:bg-teal-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved === 'general' ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saved === 'general' ? 'Saved' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HospDeptLayout>
  );
};

export default InsuranceDeskSettings;

import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, Plus, Phone, Mail, Megaphone,
} from 'lucide-react';
import api from '@/utils/api';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/insurance-desk/dashboard' }] },
  { title: 'Claims & Auth', items: [
    { icon: ClipboardList, label: 'Pre-Authorization',   href: '/insurance-desk/pre-auth' },
    { icon: FileText,      label: 'Active Claims',       href: '/insurance-desk/claims' },
    { icon: FileText,      label: 'Documents',           href: '/insurance-desk/documents' },
  ]},
  { title: 'Management', items: [
    { icon: Building2,  label: 'TPA Management',      href: '/insurance-desk/tpa' },
    { icon: UserCheck,  label: 'Patient Insurance',   href: '/insurance-desk/patient-insurance' },
    { icon: Search,     label: 'Claim Search',        href: '/insurance-desk/search' },
  ]},
  { title: 'Reports', items: [
    { icon: BarChart3,  label: 'Analytics', href: '/insurance-desk/analytics' },
    { icon: Settings,   label: 'Settings',  href: '/insurance-desk/settings' },
    { icon: HelpCircle, label: 'Support',   href: '/insurance-desk/support' },
  ]},
];

interface PayerContact { id: string; name: string; phone: string; email: string; tpa: string; }
interface PayerEmail { id: string; insurer: string; primaryEmail: string; ccEmails: string; type: string; region: string; }
interface Announcement { id: string; insurer: string; title: string; date: string; content: string; }

const emptyContact = { name: '', phone: '', email: '', tpa: '' };

const InsuranceDeskTPA = () => {
  const [contacts, setContacts] = useState<PayerContact[]>([]);
  const [payerEmails, setPayerEmails] = useState<PayerEmail[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newContact, setNewContact] = useState(emptyContact);
  const [showAddContact, setShowAddContact] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/portal/payer-management');
      setContacts(data.data?.contacts || []);
      setPayerEmails(data.data?.payerEmails || []);
      setAnnouncements(data.data?.announcements || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load TPA/payer directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!newContact.name.trim()) return;
    setSaving(true);
    try {
      const updatedContacts = [...contacts, { ...newContact, id: `contact-${Date.now()}` }];
      await api.put('/hospital/insurance/portal/payer-management', {
        data: { contacts: updatedContacts, payerEmails, announcements },
      });
      setContacts(updatedContacts);
      setNewContact(emptyContact);
      setShowAddContact(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save contact.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="TPA Management" subtitle="Third-party administrator directory" copilotModule="insurance">
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" className="gap-1" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading directory…
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Insurer & TPA Contacts</CardTitle>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => setShowAddContact((s) => !s)}>
                <Plus className="h-4 w-4" /> Add Contact
              </Button>
            </CardHeader>
            <CardContent>
              {showAddContact && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 p-3 border rounded-lg bg-muted/30">
                  <Input placeholder="Insurer / TPA name" value={newContact.name} onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))} />
                  <Input placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))} />
                  <Input placeholder="Email" value={newContact.email} onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))} />
                  <div className="flex gap-2">
                    <Input placeholder="TPA (if applicable)" value={newContact.tpa} onChange={(e) => setNewContact((c) => ({ ...c, tpa: e.target.value }))} />
                    <Button size="sm" onClick={addContact} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insurer</TableHead>
                      <TableHead>TPA</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="secondary">{c.tpa || 'Direct'}</Badge></TableCell>
                        <TableCell className="text-sm"><a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" />{c.phone}</a></TableCell>
                        <TableCell className="text-sm"><a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" />{c.email}</a></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Claim & Pre-Auth Submission Emails</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insurer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Primary Email</TableHead>
                      <TableHead>CC</TableHead>
                      <TableHead>Region</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payerEmails.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.insurer}</TableCell>
                        <TableCell><Badge variant="outline">{p.type.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-sm">{p.primaryEmail}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.ccEmails || '—'}</TableCell>
                        <TableCell>{p.region}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {announcements.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" /> Insurer Announcements</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="border-l-2 border-teal-500 pl-3 py-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{a.title}</span>
                      <Badge variant="secondary" className="text-xs">{a.insurer}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(a.date).toLocaleDateString('en-IN')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.content}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskTPA;

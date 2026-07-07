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
  Radio, CheckCircle2, XCircle,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

interface PayerContact { id: string; name: string; phone: string; email: string; tpa: string; }
interface PayerEmail { id: string; insurer: string; primaryEmail: string; ccEmails: string; type: string; region: string; }
interface Announcement { id: string; insurer: string; title: string; date: string; content: string; }
interface TpaProvider {
  id: string;
  name: string;
  capabilities: { claimStatus: boolean; claims: boolean; preAuth: boolean; ecard: boolean; networkHospitals: boolean };
}
interface TpaStatusResult {
  supported: boolean;
  live?: boolean;
  message?: string;
  status?: unknown;
}

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

  const [providers, setProviders] = useState<TpaProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [claimIdInput, setClaimIdInput] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusResult, setStatusResult] = useState<TpaStatusResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const { data } = await api.get('/hospital/insurance/tpa/providers');
      setProviders(data.providers || []);
    } catch {
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadProviders(); }, [load, loadProviders]);

  const checkClaimStatus = async () => {
    const claimId = claimIdInput.trim();
    if (!claimId || !/^\d+$/.test(claimId)) {
      setStatusError('Enter a numeric Claim ID (see Active Claims or Claim Search).');
      return;
    }
    setCheckingStatus(true);
    setStatusError(null);
    setStatusResult(null);
    try {
      const { data } = await api.post(`/hospital/insurance/claims/${claimId}/tpa-status`);
      setStatusResult(data);
    } catch (err: any) {
      setStatusError(err?.response?.data?.message || 'Could not check live status.');
    } finally {
      setCheckingStatus(false);
    }
  };

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
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Radio className="h-4 w-4 text-teal-600" /> Live Claim Status Lookup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <Input
                  className="max-w-xs"
                  placeholder="Claim ID (e.g. 55)"
                  value={claimIdInput}
                  onChange={(e) => setClaimIdInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') checkClaimStatus(); }}
                />
                <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={checkClaimStatus} disabled={checkingStatus}>
                  {checkingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check Live Status'}
                </Button>
              </div>
              {statusError && <p className="text-sm text-red-600">{statusError}</p>}
              {statusResult && (
                <div className={`text-sm p-3 rounded-lg border flex items-start gap-2 ${
                  statusResult.live ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
                }`}>
                  {statusResult.live
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
                  <div>
                    {statusResult.live
                      ? <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(statusResult.status, null, 2)}</pre>
                      : <span>{statusResult.message}</span>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Integrated TPA/Insurer Connections</CardTitle>
            </CardHeader>
            <CardContent>
              {providersLoading ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Claims</TableHead>
                        <TableHead>Live Status</TableHead>
                        <TableHead>Pre-Auth</TableHead>
                        <TableHead>e-Card</TableHead>
                        <TableHead>Network Hospitals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providers.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          {(['claims', 'claimStatus', 'preAuth', 'ecard', 'networkHospitals'] as const).map((cap) => (
                            <TableCell key={cap}>
                              {p.capabilities?.[cap]
                                ? <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300">Connected</Badge>
                                : <Badge variant="outline" className="text-muted-foreground">—</Badge>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                "Connected" means Mediczy has a real API integration built for that capability. A live call still needs
                that TPA's partner-issued credentials configured — until then, status checks report the connection
                error honestly instead of a fabricated result.
              </p>
            </CardContent>
          </Card>

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

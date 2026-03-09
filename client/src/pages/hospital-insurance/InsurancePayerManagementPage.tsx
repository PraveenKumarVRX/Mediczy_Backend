import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2, Save, CheckCircle2, Building2 } from 'lucide-react';

const InsurancePayerManagementPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('payers');
  const [search, setSearch] = useState('');
  const [showAddPayer, setShowAddPayer] = useState(false);

  const [payerEmails, setPayerEmails] = useState([
    { id: 1, insurer: 'Star Health', primaryEmail: 'claims@starhealth.in', ccEmails: 'escalation@starhealth.in', type: 'claims', region: 'South' },
    { id: 2, insurer: 'Star Health', primaryEmail: 'preauth@starhealth.in', ccEmails: '', type: 'pre_auth', region: 'South' },
    { id: 3, insurer: 'ICICI Lombard', primaryEmail: 'health.claims@icicilombard.com', ccEmails: 'senior.claims@icicilombard.com', type: 'claims', region: 'West' },
    { id: 4, insurer: 'HDFC Ergo', primaryEmail: 'tpa.claims@hdfcergo.com', ccEmails: '', type: 'claims', region: 'All India' },
    { id: 5, insurer: 'Bajaj Allianz', primaryEmail: 'hospital.claims@bajajallianz.co.in', ccEmails: '', type: 'claims', region: 'North' },
  ]);

  const [announcements] = useState([
    { id: 1, insurer: 'Star Health', title: 'New claim submission portal', date: '2025-06-15', content: 'All hospitals must switch to new e-claims portal by July 1, 2025. Training sessions available.' },
    { id: 2, insurer: 'ICICI Lombard', title: 'Updated tariff rates effective July 2025', date: '2025-06-10', content: 'Revised tariff rates for room rent and procedures. Check the updated schedule.' },
    { id: 3, insurer: 'IRDAI', title: 'Mandatory NHCX integration by Q3 2025', date: '2025-06-01', content: 'All network hospitals must onboard NHCX by September 2025.' },
  ]);

  const [newEmail, setNewEmail] = useState({ insurer: '', primaryEmail: '', ccEmails: '', type: 'claims', region: '' });

  const filteredEmails = payerEmails.filter(pe =>
    pe.insurer.toLowerCase().includes(search.toLowerCase()) ||
    pe.primaryEmail.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddEmail = () => {
    if (!newEmail.insurer || !newEmail.primaryEmail) {
      toast({ title: 'Error', description: 'Insurer and primary email required.', variant: 'destructive' });
      return;
    }
    setPayerEmails([...payerEmails, { ...newEmail, id: Date.now() }]);
    setNewEmail({ insurer: '', primaryEmail: '', ccEmails: '', type: 'claims', region: '' });
    setShowAddPayer(false);
    toast({ title: 'Added', description: 'Payer email configuration added.' });
  };

  return (
    <InsurancePortalLayout title="Payer Management" subtitle="Manage insurer contacts, emails, and announcements">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="payers">Payer Emails</TabsTrigger>
            <TabsTrigger value="announcements">Announcements</TabsTrigger>
            <TabsTrigger value="contacts">Contact Directory</TabsTrigger>
          </TabsList>

          {/* Payer Emails */}
          <TabsContent value="payers" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search insurer or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button onClick={() => setShowAddPayer(!showAddPayer)}>
                <Plus className="h-4 w-4 mr-1" /> Add Payer Email
              </Button>
            </div>

            {showAddPayer && (
              <Card className="border-2 border-indigo-200">
                <CardContent className="p-4">
                  <div className="grid grid-cols-5 gap-3">
                    <Input value={newEmail.insurer} onChange={(e) => setNewEmail({...newEmail, insurer: e.target.value})} placeholder="Insurer Name" />
                    <Input type="email" value={newEmail.primaryEmail} onChange={(e) => setNewEmail({...newEmail, primaryEmail: e.target.value})} placeholder="Primary Email" />
                    <Input value={newEmail.ccEmails} onChange={(e) => setNewEmail({...newEmail, ccEmails: e.target.value})} placeholder="CC Emails (comma sep)" />
                    <Select value={newEmail.type} onValueChange={(v) => setNewEmail({...newEmail, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claims">Claims</SelectItem>
                        <SelectItem value="pre_auth">Pre-Auth</SelectItem>
                        <SelectItem value="escalation">Escalation</SelectItem>
                        <SelectItem value="settlement">Settlement</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddEmail}><Save className="h-4 w-4 mr-1" /> Save</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Insurer</th>
                      <th className="py-2 px-3 text-left font-medium">Primary Email</th>
                      <th className="py-2 px-3 text-left font-medium">CC Emails</th>
                      <th className="py-2 px-3 text-left font-medium">Type</th>
                      <th className="py-2 px-3 text-left font-medium">Region</th>
                      <th className="py-2 px-3 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmails.map(pe => (
                      <tr key={pe.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-medium">{pe.insurer}</td>
                        <td className="py-2 px-3">{pe.primaryEmail}</td>
                        <td className="py-2 px-3 text-muted-foreground">{pe.ccEmails || '-'}</td>
                        <td className="py-2 px-3"><Badge variant="outline">{pe.type.replace('_', '-')}</Badge></td>
                        <td className="py-2 px-3">{pe.region}</td>
                        <td className="py-2 px-3 text-center">
                          <Button variant="ghost" size="sm"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-600"
                            onClick={() => { setPayerEmails(payerEmails.filter(p => p.id !== pe.id)); toast({ title: 'Deleted' }); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Announcements */}
          <TabsContent value="announcements" className="space-y-3">
            {announcements.map(ann => (
              <Card key={ann.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{ann.insurer}</Badge>
                        <span className="text-xs text-muted-foreground">{ann.date}</span>
                      </div>
                      <p className="font-medium">{ann.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{ann.content}</p>
                    </div>
                    <Button variant="ghost" size="sm"><CheckCircle2 className="h-4 w-4 text-green-600" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Contact Directory */}
          <TabsContent value="contacts" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-5 w-5" /> Insurer Contact Directory</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { name: 'Star Health', phone: '044-28288800', email: 'customercare@starhealth.in', tpa: 'Direct' },
                    { name: 'ICICI Lombard', phone: '1800-266-9725', email: 'customersupport@icicilombard.com', tpa: 'Direct' },
                    { name: 'HDFC Ergo', phone: '1800-266-0700', email: 'healthclaims@hdfcergo.com', tpa: 'Medi Assist' },
                    { name: 'Bajaj Allianz', phone: '1800-209-5858', email: 'baglobal@bajajallianz.co.in', tpa: 'Direct' },
                    { name: 'New India Assurance', phone: '1800-209-1415', email: 'cmd@newindia.co.in', tpa: 'Paramount/Vidal' },
                    { name: 'Max Bupa (Niva)', phone: '1800-200-5577', email: 'care@nivabupa.com', tpa: 'Direct' },
                  ].map((contact, i) => (
                    <Card key={i} className="bg-slate-50 dark:bg-slate-800/50">
                      <CardContent className="p-3">
                        <p className="font-medium">{contact.name}</p>
                        <div className="grid grid-cols-2 gap-1 mt-2 text-sm">
                          <span className="text-muted-foreground">Phone:</span><span>{contact.phone}</span>
                          <span className="text-muted-foreground">Email:</span><span className="text-xs">{contact.email}</span>
                          <span className="text-muted-foreground">TPA:</span><span>{contact.tpa}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsurancePayerManagementPage;

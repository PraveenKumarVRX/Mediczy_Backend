import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchPortalSection, savePortalSection } from '@/utils/hospitalInsurancePortalApi';
import { Building2, Bed, Users, Mail, Save, Plus, Trash2, CreditCard } from 'lucide-react';

const InsuranceHospitalProfilePage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(false);

  const [basic, setBasic] = useState({
    name: '', registrationNo: '', rohiniId: '', address: '', city: '', state: '', pin: '',
    phone: '', email: '', website: '', type: 'multi_specialty', establishedYear: '',
    latitude: '', longitude: '',
  });

  const [account, setAccount] = useState({
    bankName: '', accountNo: '', ifsc: '', branchName: '', accountType: 'current',
    gstNumber: '', panNumber: '',
  });

  const [rooms, setRooms] = useState<any[]>([
    { type: 'General Ward', beds: 0, amenities: 'AC, TV', rate: 0 },
    { type: 'Semi-Private', beds: 0, amenities: 'AC, TV, Attached Bath', rate: 0 },
    { type: 'Private', beds: 0, amenities: 'AC, TV, Bath, Fridge', rate: 0 },
    { type: 'Deluxe', beds: 0, amenities: 'Full amenities', rate: 0 },
    { type: 'ICU', beds: 0, amenities: 'Ventilator, Monitor', rate: 0 },
    { type: 'NICU', beds: 0, amenities: 'Neonatal care', rate: 0 },
    { type: 'PICU', beds: 0, amenities: 'Pediatric care', rate: 0 },
  ]);

  const [teamEmails, setTeamEmails] = useState({
    claimTeamEmail: '', secondaryEmails: [''], otherTeam: '',
  });

  const [users, setUsers] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'claim_executive', phone: '' });

  // Load persisted profile on mount
  useEffect(() => {
    fetchPortalSection('hospital-profile').then(res => {
      const d = res?.data || {};
      if (d.basic)      setBasic(b => ({ ...b, ...d.basic }));
      if (d.account)    setAccount(a => ({ ...a, ...d.account }));
      if (d.rooms?.length) setRooms(d.rooms);
      if (d.teamEmails) setTeamEmails(t => ({ ...t, ...d.teamEmails }));
      if (d.users?.length) setUsers(d.users);
    }).catch(() => {});
  }, []);

  const handleSaveBasic = async () => {
    setLoading(true);
    try {
      await savePortalSection('hospital-profile', { basic, account, rooms, teamEmails, users });
      toast({ title: 'Saved', description: 'Hospital basic details saved.' });
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save. Try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleSaveAccount = async () => {
    setLoading(true);
    try {
      await savePortalSection('hospital-profile', { basic, account, rooms, teamEmails, users });
      toast({ title: 'Saved', description: 'Account details saved.' });
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save. Try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleSaveInfrastructure = async () => {
    setLoading(true);
    try {
      await savePortalSection('hospital-profile', { basic, account, rooms, teamEmails, users });
      toast({ title: 'Saved', description: 'Infrastructure details saved.' });
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save. Try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) {
      toast({ title: 'Error', description: 'Name and email required', variant: 'destructive' });
      return;
    }
    setUsers(u => [...u, { ...newUser, id: Date.now(), status: 'active' }]);
    setNewUser({ name: '', email: '', role: 'claim_executive', phone: '' });
    toast({ title: 'User Added', description: `${newUser.name} added to insurance team.` });
  };

  const totalBeds = rooms.reduce((sum, r) => sum + (Number(r.beds) || 0), 0);

  return (
    <InsurancePortalLayout title="Hospital Profile" subtitle="Manage hospital details, infrastructure & team">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="basic">Basic Details</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="infra">Infrastructure</TabsTrigger>
            <TabsTrigger value="team">Team Config</TabsTrigger>
            <TabsTrigger value="users">User Accounts</TabsTrigger>
          </TabsList>

          {/* Basic Details */}
          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Hospital Basic Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Hospital Name</label>
                    <Input value={basic.name} onChange={(e) => setBasic({...basic, name: e.target.value})} placeholder="Hospital name" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Registration Number</label>
                    <Input value={basic.registrationNo} onChange={(e) => setBasic({...basic, registrationNo: e.target.value})} placeholder="Registration no." />
                  </div>
                  <div>
                    <label className="text-sm font-medium">ROHINI ID</label>
                    <Input value={basic.rohiniId} onChange={(e) => setBasic({...basic, rohiniId: e.target.value})} placeholder="ROHINI ID" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Address</label>
                    <Textarea value={basic.address} onChange={(e) => setBasic({...basic, address: e.target.value})} rows={2} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">City</label>
                    <Input value={basic.city} onChange={(e) => setBasic({...basic, city: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">State</label>
                    <Input value={basic.state} onChange={(e) => setBasic({...basic, state: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">PIN Code</label>
                    <Input value={basic.pin} onChange={(e) => setBasic({...basic, pin: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Phone</label>
                    <Input value={basic.phone} onChange={(e) => setBasic({...basic, phone: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input type="email" value={basic.email} onChange={(e) => setBasic({...basic, email: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Website</label>
                    <Input value={basic.website} onChange={(e) => setBasic({...basic, website: e.target.value})} placeholder="https://" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Hospital Type</label>
                    <Select value={basic.type} onValueChange={(v) => setBasic({...basic, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multi_specialty">Multi-Specialty</SelectItem>
                        <SelectItem value="super_specialty">Super-Specialty</SelectItem>
                        <SelectItem value="general">General Hospital</SelectItem>
                        <SelectItem value="nursing_home">Nursing Home</SelectItem>
                        <SelectItem value="clinic">Clinic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Established Year</label>
                    <Input type="number" value={basic.establishedYear} onChange={(e) => setBasic({...basic, establishedYear: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Latitude</label>
                    <Input value={basic.latitude} onChange={(e) => setBasic({...basic, latitude: e.target.value})} placeholder="e.g. 28.6139" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Longitude</label>
                    <Input value={basic.longitude} onChange={(e) => setBasic({...basic, longitude: e.target.value})} placeholder="e.g. 77.2090" />
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <Button onClick={handleSaveBasic} disabled={loading}>
                    <Save className="h-4 w-4 mr-1" /> Save Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Details */}
          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Account & Financial Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Bank Name</label>
                    <Input value={account.bankName} onChange={(e) => setAccount({...account, bankName: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Account Number</label>
                    <Input value={account.accountNo} onChange={(e) => setAccount({...account, accountNo: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">IFSC Code</label>
                    <Input value={account.ifsc} onChange={(e) => setAccount({...account, ifsc: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Branch Name</label>
                    <Input value={account.branchName} onChange={(e) => setAccount({...account, branchName: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Account Type</label>
                    <Select value={account.accountType} onValueChange={(v) => setAccount({...account, accountType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">Current</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">GST Number</label>
                    <Input value={account.gstNumber} onChange={(e) => setAccount({...account, gstNumber: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">PAN Number</label>
                    <Input value={account.panNumber} onChange={(e) => setAccount({...account, panNumber: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <Button onClick={handleSaveAccount} disabled={loading}>
                    <Save className="h-4 w-4 mr-1" /> Save Account Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Infrastructure */}
          <TabsContent value="infra" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bed className="h-5 w-5" /> Infrastructure Details
                  <Badge className="ml-2 bg-indigo-100 text-indigo-700">Total Beds: {totalBeds}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Room Type</th>
                      <th className="py-2 px-3 text-center font-medium">No. of Beds</th>
                      <th className="py-2 px-3 text-left font-medium">Amenities</th>
                      <th className="py-2 px-3 text-right font-medium">Rate/Day (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-3 font-medium">{room.type}</td>
                        <td className="py-2 px-3 text-center">
                          <Input
                            type="number"
                            className="w-20 mx-auto text-center h-8"
                            value={room.beds}
                            onChange={(e) => {
                              const updated = [...rooms];
                              updated[i].beds = parseInt(e.target.value) || 0;
                              setRooms(updated);
                            }}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            className="h-8"
                            value={room.amenities}
                            onChange={(e) => {
                              const updated = [...rooms];
                              updated[i].amenities = e.target.value;
                              setRooms(updated);
                            }}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            className="w-28 ml-auto h-8 text-right"
                            value={room.rate}
                            onChange={(e) => {
                              const updated = [...rooms];
                              updated[i].rate = parseInt(e.target.value) || 0;
                              setRooms(updated);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between mt-4">
                  <Button variant="outline" size="sm" onClick={() => setRooms([...rooms, { type: '', beds: 0, amenities: '', rate: 0 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Room Type
                  </Button>
                  <Button onClick={handleSaveInfrastructure} disabled={loading}>
                    <Save className="h-4 w-4 mr-1" /> Save Infrastructure
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Configuration */}
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Claim Team Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Claim Team Primary Email</label>
                  <Input value={teamEmails.claimTeamEmail} onChange={(e) => setTeamEmails({...teamEmails, claimTeamEmail: e.target.value})} placeholder="claims@hospital.com" />
                </div>
                <div>
                  <label className="text-sm font-medium">Secondary Email IDs</label>
                  {teamEmails.secondaryEmails.map((email, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <Input
                        value={email}
                        onChange={(e) => {
                          const updated = [...teamEmails.secondaryEmails];
                          updated[i] = e.target.value;
                          setTeamEmails({...teamEmails, secondaryEmails: updated});
                        }}
                        placeholder="secondary@hospital.com"
                      />
                      <Button variant="ghost" size="icon" onClick={() => {
                        const updated = teamEmails.secondaryEmails.filter((_, idx) => idx !== i);
                        setTeamEmails({...teamEmails, secondaryEmails: updated.length ? updated : ['']});
                      }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setTeamEmails({...teamEmails, secondaryEmails: [...teamEmails.secondaryEmails, '']})}>
                    <Plus className="h-3 w-3 mr-1" /> Add Email
                  </Button>
                </div>
                <div>
                  <label className="text-sm font-medium">Other Team Contact</label>
                  <Input value={teamEmails.otherTeam} onChange={(e) => setTeamEmails({...teamEmails, otherTeam: e.target.value})} placeholder="finance@hospital.com" />
                </div>
                <div className="flex justify-end">
                  <Button><Save className="h-4 w-4 mr-1" /> Save Team Config</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Accounts */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> User Accounts</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <Input value={newUser.name} onChange={(e) => setNewUser({...newUser, name: e.target.value})} placeholder="Name" />
                  <Input type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} placeholder="Email" />
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({...newUser, role: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claim_executive">Claim Executive</SelectItem>
                      <SelectItem value="claim_manager">Claim Manager</SelectItem>
                      <SelectItem value="insurance_coordinator">Insurance Coordinator</SelectItem>
                      <SelectItem value="finance_manager">Finance Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddUser}><Plus className="h-4 w-4 mr-1" /> Add User</Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Name</th>
                      <th className="py-2 px-3 text-left font-medium">Email</th>
                      <th className="py-2 px-3 text-left font-medium">Role</th>
                      <th className="py-2 px-3 text-left font-medium">Status</th>
                      <th className="py-2 px-3 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No users configured. Add team members above.</td></tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="border-b">
                          <td className="py-2 px-3 font-medium">{user.name}</td>
                          <td className="py-2 px-3">{user.email}</td>
                          <td className="py-2 px-3"><Badge variant="outline">{user.role.replace(/_/g, ' ')}</Badge></td>
                          <td className="py-2 px-3"><Badge className="bg-green-100 text-green-700">Active</Badge></td>
                          <td className="py-2 px-3 text-center">
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setUsers(u => u.filter(x => x.id !== user.id))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceHospitalProfilePage;

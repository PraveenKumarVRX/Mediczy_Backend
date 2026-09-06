import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Stethoscope, Plus, Pencil, Trash2, Globe, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

const CATEGORIES = ['opd', 'diagnostics', 'pharmacy', 'dental', 'vision', 'health_checkup', 'mental_wellness', 'fitness', 'vaccination', 'other'];
const categoryLabel = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

interface Provider {
  id: number;
  corporateId: number | null;
  corporateName: string | null;
  category: string;
  name: string;
  providerType: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  isCashless: boolean;
  status: string;
  notes: string | null;
}

const emptyForm = {
  name: '', category: 'dental', providerType: '', address: '', city: '', phone: '', email: '',
  isCashless: false, notes: '', corporateId: '',
};

const CorporateBenefitProviders = () => {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/corporate-benefit-providers');
      setProviders((data as any)?.data?.providers || []);
    } catch {
      toast({ title: 'Failed to load providers', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: Provider) => {
    setEditingId(p.id);
    setForm({
      name: p.name, category: p.category, providerType: p.providerType || '', address: p.address || '',
      city: p.city || '', phone: p.phone || '', email: p.email || '', isCashless: p.isCashless,
      notes: p.notes || '', corporateId: p.corporateId ? String(p.corporateId) : '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Provider name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), category: form.category, providerType: form.providerType || undefined,
        address: form.address || undefined, city: form.city || undefined, phone: form.phone || undefined,
        email: form.email || undefined, isCashless: form.isCashless, notes: form.notes || undefined,
        corporateId: form.corporateId ? Number(form.corporateId) : null,
      };
      if (editingId) {
        await api.put(`/admin/corporate-benefit-providers/${editingId}`, payload);
        toast({ title: 'Provider updated' });
      } else {
        await api.post('/admin/corporate-benefit-providers', payload);
        toast({ title: 'Provider added' });
      }
      setDialogOpen(false);
      load();
    } catch (error: any) {
      toast({ title: 'Could not save provider', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/corporate-benefit-providers/${deleteTarget.id}`);
      toast({ title: `${deleteTarget.name} removed from the network` });
      setDeleteTarget(null);
      load();
    } catch {
      toast({ title: 'Could not remove provider', variant: 'destructive' });
    }
  };

  const filtered = providers.filter((p) => categoryFilter === 'all' || p.category === categoryFilter);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Stethoscope className="w-7 h-7 text-sky-600" />
            <div>
              <h1 className="text-2xl font-bold">Benefit Network Providers</h1>
              <p className="text-sm text-muted-foreground">Cashless directory for dental, vision, OPD, vaccination, and other wallet categories — shown to HR and employees when requesting an authorization.</p>
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Add Provider
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{filtered.length} provider{filtered.length === 1 ? '' : 's'}</CardTitle>
              <CardDescription>Global entries (no corporate) are visible to every corporate; corporate-specific entries are visible only to that corporate.</CardDescription>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No providers in this category yet — add one to make it selectable when employees request an authorization.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Cashless</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="secondary">{categoryLabel(p.category)}</Badge></TableCell>
                      <TableCell>
                        {p.corporateId ? (
                          <span className="flex items-center gap-1 text-xs"><Building2 className="w-3.5 h-3.5" /> {p.corporateName || `#${p.corporateId}`}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-emerald-600"><Globe className="w-3.5 h-3.5" /> Global</span>
                        )}
                      </TableCell>
                      <TableCell>{p.city || '—'}</TableCell>
                      <TableCell className="text-xs">{p.phone || p.email || '—'}</TableCell>
                      <TableCell>{p.isCashless ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Cashless</Badge> : <span className="text-xs text-muted-foreground">Reimbursement</span>}</TableCell>
                      <TableCell><Badge variant={p.status === 'active' ? 'outline' : 'destructive'} className="capitalize">{p.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                          {p.status === 'active' && (
                            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(p)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Provider' : 'Add Provider'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Provider type</Label>
              <Input value={form.providerType} onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value }))} placeholder="Clinic, hospital, individual..." />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Restrict to one corporate (leave blank for global — visible to everyone)</Label>
              <Input type="number" value={form.corporateId} onChange={(e) => setForm((f) => ({ ...f, corporateId: e.target.value }))} placeholder="Corporate ID (optional)" />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.isCashless} onCheckedChange={(v) => setForm((f) => ({ ...f, isCashless: Boolean(v) }))} />
              Cashless (vs. reimbursement-only)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Provider'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name} from the network?</AlertDialogTitle>
            <AlertDialogDescription>It will no longer be selectable for new authorizations. This can be undone by editing it back to active.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default CorporateBenefitProviders;

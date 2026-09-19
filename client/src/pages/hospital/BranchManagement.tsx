/**
 * Branch Management — Multi-Branch Architecture (Phase 1) admin UI
 * Added 2026-09-18. Business/admin UI only — no clinical content, no
 * SaMD-relevant decisions. Talks to /api/hospital-branch (server/routes/hospital-branch.route.js).
 */

import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Users } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

type Branch = {
  id: number;
  organization_id: number;
  name: string;
  address: string | null;
  is_active: boolean;
  is_main: boolean;
};

export default function BranchManagement() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBranches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/hospital-branch/branches');
      const data = res.data?.data ?? res.data;
      setBranches(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not load branches. Your account may not have organization context set up yet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const createBranch = async () => {
    if (!newName.trim()) {
      toast({ title: 'Branch name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/hospital-branch/branches', { name: newName.trim(), address: newAddress.trim() || undefined });
      toast({ title: 'Branch created', description: `${newName} has been added.` });
      setDialogOpen(false);
      setNewName('');
      setNewAddress('');
      loadBranches();
    } catch (e: any) {
      toast({ title: 'Failed to create branch', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <HospitalLayout title="Branch Management" subtitle="Multi-location setup — Phase 1 (schema and staff assignment; branch-scoped clinical UI is a separate, later phase)">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Branches</h2>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Branch</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a new branch</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="branch-name">Branch name</Label>
                <Input id="branch-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tadepalle" />
              </div>
              <div>
                <Label htmlFor="branch-address">Address (optional)</Label>
                <Input id="branch-address" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Street, city" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createBranch} disabled={saving}>{saving ? 'Saving...' : 'Create Branch'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">All Branches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>}
          {!loading && error && <p className="text-sm text-red-500 py-6 text-center">{error}</p>}
          {!loading && !error && branches.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No branches yet — this organization is running as a single implicit location. Add a branch above to start using multi-location features.
            </p>
          )}
          {!loading && !error && branches.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Staff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {b.name} {b.is_main && <Badge variant="outline" className="ml-2">Main</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.address || '—'}</TableCell>
                    <TableCell>
                      <Badge className={b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-xs">
                        <Users className="h-3.5 w-3.5 mr-1" /> Manage staff
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        This is Phase 1 (branch registry + staff assignment). The branch switcher in the main navigation and
        cross-branch patient timeline view are planned follow-ups, per the multi-branch design document.
      </p>
    </HospitalLayout>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/hooks/use-toast';
import { Search, Eye, Edit, Building2, Phone, Mail, MapPin, RefreshCw } from 'lucide-react';
import api from '@/utils/api';

interface Broker {
  id: number;
  brokerName: string;
  email: string;
  phoneNumber?: string;
  contactPersonName?: string;
  irdaiLicenseNumber?: string;
  businessType: string;
  commissionPercentage: number;
  status: 'active' | 'inactive' | 'suspended';
  city?: string;
  state?: string;
  pincode?: string;
  officeAddress?: string;
  createdAt?: string;
}

const statusColor: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  inactive: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const TeamBrokerManagement = () => {
  const { toast } = useToast();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [selected, setSelected] = useState<Broker | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Broker>>({});

  const fetchBrokers = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * limit;
      const { data } = await api.get(
        `/team/brokers?limit=${limit}&offset=${offset}&status=${statusFilter}&search=${encodeURIComponent(search)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('teamToken')}` } }
      );
      setBrokers(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to fetch brokers', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBrokers(); }, [page, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchBrokers();
  };

  const openEdit = (broker: Broker) => {
    setSelected(broker);
    setEditForm({
      status: broker.status,
      contactPersonName: broker.contactPersonName || '',
      phoneNumber: broker.phoneNumber || '',
      city: broker.city || '',
      state: broker.state || '',
      commissionPercentage: broker.commissionPercentage,
      irdaiLicenseNumber: broker.irdaiLicenseNumber || '',
    });
    setEditOpen(true);
  };

  const openView = (broker: Broker) => {
    setSelected(broker);
    setViewOpen(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      await api.put(`/team/brokers/${selected.id}`, editForm, {
        headers: { Authorization: `Bearer ${localStorage.getItem('teamToken')}` },
      });
      toast({ title: 'Saved', description: 'Broker updated successfully' });
      setEditOpen(false);
      fetchBrokers();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to update broker', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Broker Management</h1>
            <p className="text-slate-400 text-sm mt-1">Manage Intermediary Wellness Portal broker accounts</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchBrokers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardContent className="pt-4">
            <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, email, city…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={loading}>Search</Button>
            </form>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="text-slate-400 text-sm">Showing {brokers.length} of {total} brokers</div>

        {/* Table */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Broker</TableHead>
                  <TableHead className="text-slate-400">Contact</TableHead>
                  <TableHead className="text-slate-400">Location</TableHead>
                  <TableHead className="text-slate-400">Commission</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400 py-12">Loading…</TableCell>
                  </TableRow>
                ) : brokers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400 py-12">No brokers found</TableCell>
                  </TableRow>
                ) : brokers.map(broker => (
                  <TableRow key={broker.id} className="border-slate-700 hover:bg-slate-700/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{broker.brokerName}</p>
                          <p className="text-slate-500 text-xs">{broker.businessType}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-slate-300 text-sm flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" /> {broker.email}
                        </p>
                        {broker.phoneNumber && (
                          <p className="text-slate-400 text-xs flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500" /> {broker.phoneNumber}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(broker.city || broker.state) ? (
                        <p className="text-slate-300 text-sm flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {[broker.city, broker.state].filter(Boolean).join(', ')}
                        </p>
                      ) : <span className="text-slate-500 text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <span className="text-white text-sm font-medium">{broker.commissionPercentage}%</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs border ${statusColor[broker.status] || statusColor.inactive}`}>
                        {broker.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openView(broker)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(broker)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.brokerName}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-slate-400">Email</p><p className="text-white">{selected.email}</p></div>
                <div><p className="text-slate-400">Phone</p><p className="text-white">{selected.phoneNumber || '—'}</p></div>
                <div><p className="text-slate-400">Contact Person</p><p className="text-white">{selected.contactPersonName || '—'}</p></div>
                <div><p className="text-slate-400">Business Type</p><p className="text-white">{selected.businessType}</p></div>
                <div><p className="text-slate-400">IRDAI License</p><p className="text-white">{selected.irdaiLicenseNumber || '—'}</p></div>
                <div><p className="text-slate-400">Commission</p><p className="text-white">{selected.commissionPercentage}%</p></div>
                <div><p className="text-slate-400">City</p><p className="text-white">{selected.city || '—'}</p></div>
                <div><p className="text-slate-400">State</p><p className="text-white">{selected.state || '—'}</p></div>
                <div><p className="text-slate-400">Status</p>
                  <Badge className={`text-xs border ${statusColor[selected.status] || statusColor.inactive}`}>{selected.status}</Badge>
                </div>
                <div><p className="text-slate-400">Registered</p><p className="text-white">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('en-IN') : '—'}</p></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Broker — {selected?.brokerName}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Status</label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v as Broker['status'] }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Contact Person</label>
              <Input value={editForm.contactPersonName || ''} onChange={e => setEditForm(f => ({ ...f, contactPersonName: e.target.value }))} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Phone</label>
              <Input value={editForm.phoneNumber || ''} onChange={e => setEditForm(f => ({ ...f, phoneNumber: e.target.value }))} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">City</label>
              <Input value={editForm.city || ''} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">State</label>
              <Input value={editForm.state || ''} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Commission %</label>
              <Input type="number" min={0} max={100} value={editForm.commissionPercentage ?? ''} onChange={e => setEditForm(f => ({ ...f, commissionPercentage: Number(e.target.value) }))} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">IRDAI License</label>
              <Input value={editForm.irdaiLicenseNumber || ''} onChange={e => setEditForm(f => ({ ...f, irdaiLicenseNumber: e.target.value }))} className="bg-slate-800 border-slate-700 text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default TeamBrokerManagement;

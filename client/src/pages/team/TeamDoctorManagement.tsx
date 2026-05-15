import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Eye, CheckCircle2, XCircle, RefreshCw, Stethoscope,
  Clock, User, Mail, Phone, MapPin, FileText, Download, Shield,
  BookOpen, Award, Trash2,
} from 'lucide-react';
import api from '@/utils/api';

interface Doctor {
  id: number;
  prefix?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  specialization?: string;
  experience?: number;
  qualifications?: string[];
  registrationNumber?: string;
  medicalCouncilRegistrationNumber?: string;
  medicalCouncilName?: string;
  practiceAddress?: string;
  practiceCity?: string;
  practiceState?: string;
  practiceZipCode?: string;
  isVerified: boolean;
  accountStatus?: string;
  status?: string;
  metadata?: {
    rejectedAt?: string;
    rejectionReason?: string;
  };
  documents?: Record<string, any>;
  createdAt?: string;
}

const isRejectedDoctor = (doctor: Doctor) =>
  doctor.accountStatus === 'rejected' || (!doctor.isVerified && doctor.status === 'inactive');

const statusBadge = (doctor: Doctor) => {
  if (isRejectedDoctor(doctor))
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">Rejected</Badge>;
  if (doctor.isVerified)
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Pending</Badge>;
};

const TeamDoctorManagement = () => {
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [selected, setSelected] = useState<Doctor | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('teamToken')}` });

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * limit;
      const { data } = await api.get(
        `/team/registered-doctors?limit=${limit}&offset=${offset}&status=${statusFilter}&search=${encodeURIComponent(search)}`,
        { headers: authHeader() }
      );
      setDoctors(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to fetch doctors', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDoctors(); }, [page, statusFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchDoctors(); };

  const openView = async (doctor: Doctor) => {
    try {
      const { data } = await api.get(`/team/registered-doctors/${doctor.id}`, { headers: authHeader() });
      setSelected(data.doctor);
    } catch { setSelected(doctor); }
    setViewOpen(true);
  };

  const handleActivate = async (doctor: Doctor) => {
    setActionLoading(true);
    try {
      await api.patch(`/team/registered-doctors/${doctor.id}/activate`, {}, { headers: authHeader() });
      toast({ title: 'Doctor Activated', description: `${doctor.firstName} ${doctor.lastName} account is now active. Activation email sent.` });
      fetchDoctors();
      setViewOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to activate', variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.patch(`/team/registered-doctors/${selected.id}/reject`, { reason: rejectReason || undefined }, { headers: authHeader() });
      toast({ title: 'Registration Rejected', description: 'Rejection email sent to doctor.' });
      setRejectOpen(false);
      setViewOpen(false);
      fetchDoctors();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to reject', variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await api.delete(`/team/registered-doctors/${deleteTarget.id}`, { headers: authHeader() });
      toast({ title: 'Doctor Deleted', description: `${deleteTarget.firstName} ${deleteTarget.lastName} has been removed.` });
      setDeleteOpen(false);
      setViewOpen(false);
      setDeleteTarget(null);
      fetchDoctors();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to delete doctor', variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const downloadAgreementPDF = (doctor: Doctor) => {
    const pdf = doctor.documents?.agreement?.pdf;
    if (!pdf) { toast({ title: 'No PDF', description: 'Agreement PDF not available for this registration.', variant: 'destructive' }); return; }
    const link = document.createElement('a');
    link.href = pdf;
    link.download = `Agreement_${doctor.firstName}_${doctor.lastName}_${doctor.id}.pdf`;
    link.click();
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Doctor Management</h1>
              <p className="text-sm text-slate-400">Review registrations, verify documents, activate accounts</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDoctors} disabled={loading} className="border-slate-700 text-slate-300">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Registrations', value: total, icon: User, color: 'text-blue-400' },
            { label: 'Pending Verification', value: doctors.filter(d => !d.isVerified && !isRejectedDoctor(d)).length, icon: Clock, color: 'text-amber-400' },
            { label: 'Active Doctors', value: doctors.filter(d => d.isVerified).length, icon: CheckCircle2, color: 'text-emerald-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email, specialization…"
                  className="pl-9 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-40 bg-slate-900 border-slate-600 text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Search</Button>
            </form>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-400">Doctor</TableHead>
                  <TableHead className="text-slate-400">Specialization</TableHead>
                  <TableHead className="text-slate-400">Contact</TableHead>
                  <TableHead className="text-slate-400">Registered</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-10">Loading…</TableCell></TableRow>
                ) : doctors.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-10">No doctor registrations found.</TableCell></TableRow>
                ) : doctors.map(doc => (
                  <TableRow key={doc.id} className="border-slate-700 hover:bg-slate-700/30">
                    <TableCell>
                      <div className="font-medium text-white">{doc.prefix} {doc.firstName} {doc.lastName}</div>
                      <div className="text-xs text-slate-400">{doc.email}</div>
                    </TableCell>
                    <TableCell className="text-slate-300 text-sm">{doc.specialization || '—'}</TableCell>
                    <TableCell className="text-slate-300 text-sm">{doc.phoneNumber || '—'}</TableCell>
                    <TableCell className="text-slate-400 text-xs">
                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-IN') : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(doc)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openView(doc)}
                          className="h-7 px-2 border-slate-600 text-slate-300 hover:text-white">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {!doc.isVerified && !isRejectedDoctor(doc) && (
                          <>
                            <Button size="sm" onClick={() => handleActivate(doc)} disabled={actionLoading}
                              className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setSelected(doc); setRejectReason(''); setRejectOpen(true); }}
                              className="h-7 px-2 border-red-600/40 text-red-400 hover:text-red-300 text-xs">
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {doc.documents?.agreement?.pdf && (
                          <Button size="sm" variant="outline" onClick={() => downloadAgreementPDF(doc)}
                            className="h-7 px-2 border-slate-600 text-slate-300 hover:text-white">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline"
                          onClick={() => { setDeleteTarget(doc); setDeleteOpen(true); }}
                          className="h-7 px-2 border-red-700/40 text-red-500 hover:text-red-400 hover:border-red-600/60">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {/* Pagination */}
          {total > limit && (
            <div className="p-4 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400">
              <span>Showing {(page-1)*limit+1}–{Math.min(page*limit, total)} of {total}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page===1} onClick={() => setPage(p=>p-1)}
                  className="border-slate-700 text-slate-300">Previous</Button>
                <Button size="sm" variant="outline" disabled={page*limit>=total} onClick={() => setPage(p=>p+1)}
                  className="border-slate-700 text-slate-300">Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Detail view dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-400" />
              Doctor Registration Detail
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5 text-sm">
              {/* Status banner */}
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${selected.isVerified ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : isRejectedDoctor(selected) ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'}`}>
                {selected.isVerified ? <><CheckCircle2 className="h-4 w-4" /> Account Active</> : isRejectedDoctor(selected) ? <><XCircle className="h-4 w-4" /> Registration Rejected</> : <><Clock className="h-4 w-4" /> Pending Manual Activation</>}
              </div>

              {/* Personal */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                <h3 className="font-semibold text-slate-300 flex items-center gap-1.5"><User className="h-4 w-4" /> Personal Info</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-slate-400">
                  <span><strong className="text-slate-300">Name:</strong> {selected.prefix} {selected.firstName} {selected.lastName}</span>
                  <span><strong className="text-slate-300">Email:</strong> {selected.email}</span>
                  <span><strong className="text-slate-300">Phone:</strong> {selected.phoneNumber || '—'}</span>
                  <span><strong className="text-slate-300">Joined:</strong> {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('en-IN') : '—'}</span>
                </div>
              </div>

              {/* Professional */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                <h3 className="font-semibold text-slate-300 flex items-center gap-1.5"><Award className="h-4 w-4" /> Professional Details</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-slate-400">
                  <span><strong className="text-slate-300">Specialization:</strong> {selected.specialization || '—'}</span>
                  <span><strong className="text-slate-300">Experience:</strong> {selected.experience ?? '—'} yrs</span>
                  <span className="col-span-2"><strong className="text-slate-300">Qualifications:</strong> {(selected.qualifications||[]).join(', ') || '—'}</span>
                  <span><strong className="text-slate-300">Reg. No.:</strong> {selected.registrationNumber || selected.medicalCouncilRegistrationNumber || '—'}</span>
                  <span><strong className="text-slate-300">Council:</strong> {selected.medicalCouncilName || '—'}</span>
                </div>
              </div>

              {/* Address */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                <h3 className="font-semibold text-slate-300 flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Practice Address</h3>
                <p className="text-slate-400">{[selected.practiceAddress, selected.practiceCity, selected.practiceState, selected.practiceZipCode].filter(Boolean).join(', ') || '—'}</p>
              </div>

              {/* Documents */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                <h3 className="font-semibold text-slate-300 flex items-center gap-1.5"><FileText className="h-4 w-4" /> Submitted Documents</h3>
                {selected.documents && Object.keys(selected.documents).length > 0 ? (
                  <div className="space-y-1.5">
                    {(['idProof','addressProof','medicalDegree','councilCertificate'] as const).map(key => {
                      const doc = selected.documents?.[key];
                      if (!doc) return null;
                      return (
                        <div key={key} className="flex items-center gap-2 text-slate-400">
                          <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-300 font-medium capitalize">{key.replace(/([A-Z])/g,' $1')}:</span>
                          <span className="text-slate-400">{doc.name || '—'}</span>
                          {doc.data && (
                            <a href={doc.data} download={doc.name || key}
                              className="ml-auto text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                              <Download className="h-3 w-3" /> Download
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-slate-500">No documents uploaded</p>}
              </div>

              {/* Agreement */}
              {selected.documents?.agreement && (
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 space-y-2">
                  <h3 className="font-semibold text-blue-300 flex items-center gap-1.5"><Shield className="h-4 w-4" /> Agreement</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-slate-400 text-xs">
                    <span><strong className="text-slate-300">ID:</strong> {selected.documents.agreement.agreementId || '—'}</span>
                    <span><strong className="text-slate-300">Version:</strong> {selected.documents.agreement.termsVersion || '1.0'}</span>
                    <span className="col-span-2"><strong className="text-slate-300">Signed:</strong> {selected.documents.agreement.signedAt ? new Date(selected.documents.agreement.signedAt).toLocaleString('en-IN') : '—'}</span>
                  </div>
                  {selected.documents.agreement.pdf && (
                    <Button size="sm" onClick={() => downloadAgreementPDF(selected)}
                      className="bg-blue-600 hover:bg-blue-700 text-white mt-1">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Download Agreement PDF
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2 pt-2">
            {selected && !selected.isVerified && !isRejectedDoctor(selected) && (
              <>
                <Button onClick={() => handleActivate(selected)} disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Activate Account
                </Button>
                <Button variant="outline" onClick={() => { setRejectReason(''); setRejectOpen(true); }}
                  className="border-red-600/40 text-red-400 hover:text-red-300">
                  <XCircle className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              </>
            )}
            {selected && (
              <Button variant="outline"
                onClick={() => { setDeleteTarget(selected); setDeleteOpen(true); }}
                className="border-red-700/40 text-red-500 hover:text-red-400">
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewOpen(false)} className="border-slate-700 text-slate-300 ml-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <XCircle className="h-5 w-5" /> Reject Registration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-slate-400 text-sm">Provide a reason that will be emailed to the doctor.</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. ID proof document is unclear. Please re-submit with a valid government ID."
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 min-h-24 resize-none" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
            <Button onClick={handleReject} disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white">
              {actionLoading ? 'Rejecting…' : 'Send Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-5 w-5" /> Delete Doctor
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-slate-300 text-sm">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-white">
                {deleteTarget?.prefix} {deleteTarget?.firstName} {deleteTarget?.lastName}
              </span>?
            </p>
            <p className="text-slate-500 text-xs">This action cannot be undone. All registration data for this doctor will be removed.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
            <Button onClick={handleDelete} disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white">
              {actionLoading ? 'Deleting…' : 'Yes, Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default TeamDoctorManagement;

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  UserPlus, Users, Mail, Phone, ShieldCheck, ShieldEllipsis, Crown, Trash2,
  ArrowLeftRight, RefreshCw, Copy, Check, Lock, Stethoscope, Hospital,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

const MAX_HR_STAFF = 15;

interface HrTeamMember {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'corporate_admin' | 'hr_staff' | 'corporate_cmo' | 'corporate_ohc';
  invited_by: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_LABEL: Record<HrTeamMember['role'], string> = {
  corporate_admin: 'Super HR',
  hr_staff: 'HR Staff',
  corporate_cmo: 'Chief Medical Officer',
  corporate_ohc: 'OHC Staff',
};

function fullName(m: Pick<HrTeamMember, 'firstName' | 'lastName' | 'email'>) {
  const name = `${m.firstName || ''} ${m.lastName || ''}`.trim();
  return name || m.email;
}

function decodeOwnUserId(): number | null {
  try {
    const token = localStorage.getItem('corporateToken');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    const id = payload?.id ?? payload?.userId;
    return id ? Number(id) : null;
  } catch {
    return null;
  }
}

const CorporateHrTeam = () => {
  const { toast } = useToast();
  const [team, setTeam] = useState<HrTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ firstName: string; lastName: string; email: string; phoneNumber: string; registrationNumber: string; role: 'hr_staff' | 'corporate_cmo' | 'corporate_ohc' }>({
    firstName: '', lastName: '', email: '', phoneNumber: '', registrationNumber: '', role: 'hr_staff',
  });
  const [tempCredential, setTempCredential] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<HrTeamMember | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<HrTeamMember | null>(null);

  const ownId = useMemo(decodeOwnUserId, []);
  const me = useMemo(() => team.find((m) => Number(m.id) === ownId) || null, [team, ownId]);
  const isSuperAdmin = me?.role === 'corporate_admin';

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const resp = await api.get('/corporate/hr/team');
      setTeam(resp.data?.data || []);
    } catch (err: any) {
      toast({
        title: 'Failed to load HR team',
        description: err?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeam(); }, []);

  const superAdminName = useMemo(() => {
    const admin = team.find((m) => m.role === 'corporate_admin');
    return admin ? fullName(admin) : null;
  }, [team]);

  const resetInviteForm = () => setInviteForm({ firstName: '', lastName: '', email: '', phoneNumber: '', registrationNumber: '', role: 'hr_staff' });

  const submitInvite = async () => {
    if (!inviteForm.email.trim()) {
      toast({ title: 'Email is required', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const resp = await api.post('/corporate/hr/team', inviteForm);
      const data = resp.data?.data;
      toast({
        title: `${fullName({ firstName: inviteForm.firstName, lastName: inviteForm.lastName, email: inviteForm.email })} added as ${ROLE_LABEL[inviteForm.role]}`,
        description: data?.emailStatus === 'sent'
          ? `Login instructions were emailed to ${inviteForm.email}.`
          : 'The welcome email could not be sent — share the temporary password shown next.',
      });
      setInviteOpen(false);
      resetInviteForm();
      if (data?.tempPassword) {
        setTempCredential({ email: data.email, password: data.tempPassword });
      }
      fetchTeam();
    } catch (err: any) {
      toast({
        title: 'Could not add team member',
        description: err?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setActionLoading(true);
    try {
      await api.delete(`/corporate/hr/team/${removeTarget.id}`);
      toast({ title: `${fullName(removeTarget)} removed from the HR team` });
      setRemoveTarget(null);
      fetchTeam();
    } catch (err: any) {
      toast({
        title: 'Could not remove team member',
        description: err?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const confirmPromote = async () => {
    if (!promoteTarget) return;
    setActionLoading(true);
    try {
      await api.post(`/corporate/hr/team/${promoteTarget.id}/promote`);
      toast({
        title: `${fullName(promoteTarget)} is now the Super HR`,
        description: 'You have been moved to HR Staff.',
      });
      setPromoteTarget(null);
      fetchTeam();
    } catch (err: any) {
      toast({
        title: 'Could not transfer Super HR',
        description: err?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const copyTempPassword = async () => {
    if (!tempCredential) return;
    try {
      await navigator.clipboard.writeText(tempCredential.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the password is still visible to copy manually */
    }
  };

  const seatsUsed = team.length;

  return (
    <CorporateLayout title="HR Team" subtitle="Manage who has HR access to the corporate portal">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={Users}
          title="HR Team"
          description="One Super HR owns this account; Super HR can invite and manage additional HR Staff"
          gradient="from-teal-600 to-teal-800"
          badge={{ text: `${seatsUsed}/${MAX_HR_STAFF} seats used`, variant: 'teal' }}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchTeam} title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
              {isSuperAdmin ? (
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
                  disabled={seatsUsed >= MAX_HR_STAFF}
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus className="w-4 h-4" /> Add Team Member
                </Button>
              ) : (
                <span title="Only the Super HR (Corporate Admin) can invite new members">
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-white gap-2 opacity-50 cursor-not-allowed"
                    disabled
                  >
                    <UserPlus className="w-4 h-4" /> Add Team Member
                  </Button>
                </span>
              )}
            </div>
          }
        />

        {!loading && !isSuperAdmin && (
          <Card className="!p-0 bg-amber-500/[0.06] border-amber-500/20">
            <CardContent className="p-4 flex items-center gap-3 text-sm text-amber-300">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>
                Only the Super HR can invite, remove, or hand off HR access.
                {superAdminName ? <> Current Super HR: <strong>{superAdminName}</strong>.</> : null}
              </span>
            </CardContent>
          </Card>
        )}

        <Card className="!p-0 bg-slate-900/50 border-white/[0.06]">
          <CardHeader className="pb-0">
            <CardTitle className="text-base font-semibold text-white">
              {team.length} team member{team.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-10 h-10 border-4 border-t-teal-500 border-slate-200 rounded-full animate-spin" />
              </div>
            ) : team.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No HR team members found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-slate-800/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Login</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {team.map((member) => {
                      const isSelf = Number(member.id) === ownId;
                      const isAdminRow = member.role === 'corporate_admin';
                      const isCmoRow = member.role === 'corporate_cmo';
                      const isOhcRow = member.role === 'corporate_ohc';
                      const avatarGradient = isAdminRow
                        ? 'from-amber-500 to-amber-600'
                        : isCmoRow
                        ? 'from-indigo-500 to-indigo-600'
                        : isOhcRow
                        ? 'from-sky-500 to-sky-600'
                        : 'from-teal-500 to-teal-600';
                      return (
                        <tr key={member.id} className="hover:bg-slate-800/30 transition-colors border-b border-white/[0.04]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gradient-to-br ${avatarGradient}`}>
                                {fullName(member).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-white">
                                  {fullName(member)}{isSelf && <span className="text-xs text-slate-500 font-normal"> (you)</span>}
                                </p>
                                <p className="text-xs text-slate-500">Joined {new Date(member.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {isAdminRow ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-500/15 text-amber-400 border-amber-500/30">
                                <Crown className="w-3 h-3" /> Super HR
                              </span>
                            ) : isCmoRow ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-indigo-500/15 text-indigo-400 border-indigo-500/30">
                                <Stethoscope className="w-3 h-3" /> Chief Medical Officer
                              </span>
                            ) : isOhcRow ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-sky-500/15 text-sky-400 border-sky-500/30">
                                <Hospital className="w-3 h-3" /> OHC Staff
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-teal-500/15 text-teal-400 border-teal-500/30">
                                <ShieldCheck className="w-3 h-3" /> HR Staff
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Mail className="w-3 h-3" /> {member.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'Never'}
                          </td>
                          <td className="px-4 py-3">
                            {isSuperAdmin && !isSelf && !isAdminRow ? (
                              <div className="flex items-center justify-end gap-2">
                                {!isCmoRow && !isOhcRow && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    onClick={() => setPromoteTarget(member)}
                                  >
                                    <ArrowLeftRight className="w-3.5 h-3.5" /> Make Super HR
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                                  onClick={() => setRemoveTarget(member)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Remove
                                </Button>
                              </div>
                            ) : (
                              <div className="text-right text-xs text-slate-600">—</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) resetInviteForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              {inviteForm.role === 'corporate_cmo'
                ? "They'll get portal access as Chief Medical Officer and OHC super-admin — able to run the corporate-linked clinic workspace, triage workplace emergencies, issue certificates when a medical registration is on file, and scrutinize claims."
                : inviteForm.role === 'corporate_ohc'
                ? "They'll get portal access as OHC Staff — able to issue fitness certificates and return-to-work clearances, manage employee health records, and process health claims/wallet authorizations, but not manage the HR team."
                : "They'll get portal access as HR Staff — able to manage employees and reports, but not the HR team itself."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="hr-role">Role</Label>
              <Select value={inviteForm.role} onValueChange={(v: 'hr_staff' | 'corporate_cmo' | 'corporate_ohc') => setInviteForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger id="hr-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr_staff">HR Staff</SelectItem>
                  <SelectItem value="corporate_cmo">Chief Medical Officer (OHC super-admin)</SelectItem>
                  <SelectItem value="corporate_ohc">OHC Staff (on-site clinic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-first-name">First name</Label>
              <Input id="hr-first-name" value={inviteForm.firstName} onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-last-name">Last name</Label>
              <Input id="hr-last-name" value={inviteForm.lastName} onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="hr-email">Email</Label>
              <Input id="hr-email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="hr-phone">Phone (optional)</Label>
              <Input id="hr-phone" value={inviteForm.phoneNumber} onChange={(e) => setInviteForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
            </div>
            {inviteForm.role === 'corporate_cmo' && <div className="col-span-2 space-y-1.5"><Label htmlFor="hr-registration">Medical registration number (optional)</Label><Input id="hr-registration" value={inviteForm.registrationNumber} placeholder="Required before signing fitness certificates" onChange={(e) => setInviteForm((f) => ({ ...f, registrationNumber: e.target.value }))} /></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={submitInvite} disabled={actionLoading} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
              <UserPlus className="w-4 h-4" /> {actionLoading ? 'Adding...' : `Add ${ROLE_LABEL[inviteForm.role]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal (only when the welcome email failed to send) */}
      <Dialog open={!!tempCredential} onOpenChange={(open) => !open && setTempCredential(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share these login details</DialogTitle>
            <DialogDescription>
              The welcome email didn't go out, so share this temporary password with {tempCredential?.email} directly. It won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label>Email</Label>
              <p className="text-sm text-slate-300 mt-1">{tempCredential?.email}</p>
            </div>
            <div>
              <Label>Temporary password</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3 py-2 rounded-md bg-slate-800 border border-white/10 text-teal-300 text-sm">
                  {tempCredential?.password}
                </code>
                <Button size="icon" variant="outline" onClick={copyTempPassword}>
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempCredential(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget ? fullName(removeTarget) : ''} from the HR team?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll immediately lose access to the corporate portal. This can be undone by inviting them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              onClick={(e) => { e.preventDefault(); confirmRemove(); }}
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote confirm */}
      <AlertDialog open={!!promoteTarget} onOpenChange={(open) => !open && setPromoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldEllipsis className="w-5 h-5 text-amber-400" /> Make {promoteTarget ? fullName(promoteTarget) : ''} the Super HR?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This hands off full HR ownership: {promoteTarget ? fullName(promoteTarget) : 'they'} will be able to invite and remove
              HR staff. <strong>You will be moved to HR Staff</strong> and lose these controls until someone hands them back to you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              onClick={(e) => { e.preventDefault(); confirmPromote(); }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {actionLoading ? 'Transferring...' : 'Transfer Super HR'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CorporateLayout>
  );
};

export default CorporateHrTeam;

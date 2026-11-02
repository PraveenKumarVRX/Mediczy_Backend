import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Mail, Send, Upload, UserPlus, XCircle } from 'lucide-react';

export interface WelcomeEmailDraft {
  id: string;
  to: string;
  userId?: string;
  employeeId?: string;
  draftToken?: string;
  draftExpiresAt?: string;
  deliveryId?: string | number | null;
  employeeName: string;
  subject: string;
  html: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  error?: string;
}

export interface WelcomeEmailTargetEmployee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  welcomeEmailStatus?: string | null;
  hasUserAccount?: boolean;
  welcomeEligible?: boolean;
}

export interface WelcomeEmailTemplateOption {
  id: string;
  name: string;
}

interface CorporateWelcomeEmailBatchDialogProps {
  open: boolean;
  drafts: WelcomeEmailDraft[];
  sending: boolean;
  savingTemplate?: boolean;
  preparing?: boolean;
  employees?: WelcomeEmailTargetEmployee[];
  selectedEmployeeIds?: string[];
  onSelectedEmployeeIdsChange?: (ids: string[]) => void;
  templateOptions?: WelcomeEmailTemplateOption[];
  selectedTemplateId?: string;
  selectedTemplateSubject?: string;
  selectedTemplateHtml?: string;
  approvedTemplateId?: string | null;
  approvingTemplate?: boolean;
  onSelectedTemplateChange?: (templateId: string) => void;
  onApproveTemplate?: (templateId: string) => void;
  onPrepareFromEmployees?: (args: { mode: 'single' | 'selected' | 'all'; singleEmployeeId?: string; singleEmployeeEmail?: string; sendImmediately: boolean }) => void;
  welcomePrepareStats?: {
    total: number;
    eligible: number;
    alreadyWelcomed: number;
    notYetProvisioned?: number;
  };
  onProvisionRosterAccounts?: () => void;
  provisioningRosterAccounts?: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftsChange: (drafts: WelcomeEmailDraft[]) => void;
  onSendSelected: (drafts: WelcomeEmailDraft[], provider: 'auto' | 'ses' | 'brevo') => void;
  onSaveTemplate?: (template: { name: string; subject: string; html: string }) => void | Promise<void>;
  onPrepareSingle?: () => void;
  onPrepareBulk?: () => void;
}

const getStatusBadge = (status: WelcomeEmailDraft['status']) => {
  if (status === 'sent') return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Sent</Badge>;
  if (status === 'failed') return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
  if (status === 'sending') return <Badge variant="secondary">Sending</Badge>;
  return <Badge variant="outline">Draft</Badge>;
};

export default function CorporateWelcomeEmailBatchDialog({
  open,
  drafts,
  sending,
  savingTemplate = false,
  preparing = false,
  employees = [],
  selectedEmployeeIds = [],
  onSelectedEmployeeIdsChange,
  templateOptions = [],
  selectedTemplateId,
  selectedTemplateSubject,
  selectedTemplateHtml,
  approvedTemplateId,
  approvingTemplate = false,
  onSelectedTemplateChange,
  onApproveTemplate,
  onPrepareFromEmployees,
  welcomePrepareStats,
  onProvisionRosterAccounts,
  provisioningRosterAccounts = false,
  onOpenChange,
  onDraftsChange,
  onSendSelected,
  onSaveTemplate,
  onPrepareSingle,
  onPrepareBulk,
}: CorporateWelcomeEmailBatchDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string>('');
  const [provider, setProvider] = useState<'auto' | 'ses' | 'brevo'>('auto');
  const [prepareMode, setPrepareMode] = useState<'single' | 'selected' | 'all'>('selected');
  const [singleEmployeeId, setSingleEmployeeId] = useState<string>('');
  const [singleEmployeeSearch, setSingleEmployeeSearch] = useState<string>('');
  const [singleSearchIndex, setSingleSearchIndex] = useState(0);
  const [selectedModeSearch, setSelectedModeSearch] = useState('');
  const [onlyNotWelcomed, setOnlyNotWelcomed] = useState(true);
  const [confirmSend, setConfirmSend] = useState<{ provision: number; emails: number } | null>(null);
  const [templateName, setTemplateName] = useState('Corporate employee welcome_sigin');

  useEffect(() => {
    if (!open) return;
    const unsentDrafts = drafts.filter((draft) => draft.status !== 'sent');
    const draftIds = unsentDrafts.map((draft) => draft.id);
    setSelectedIds(draftIds);
    setActiveDraftId((current) => {
      if (current) {
        const currentDraft = drafts.find((draft) => draft.id === current);
        if (currentDraft && currentDraft.status !== 'sent') {
          return current;
        }
      }
      return draftIds[0] || '';
    });
  }, [drafts, open]);

  useEffect(() => {
    if (!open) return;
    if (!activeDraft) return;
    if (!templateName.trim() || templateName === 'Corporate employee welcome_sigin') {
      setTemplateName(activeDraft.subject?.trim() || 'Corporate employee welcome_sigin');
    }
  }, [activeDraftId, open]);

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) || drafts[0];
  const filteredSingleEmployees = useMemo(() => {
    const query = singleEmployeeSearch.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) => {
      const name = (employee.name || '').toLowerCase();
      const email = (employee.email || '').toLowerCase();
      const employeeId = (employee.employeeId || '').toLowerCase();
      return name.includes(query) || email.includes(query) || employeeId.includes(query);
    });
  }, [employees, singleEmployeeSearch]);

  const filteredSelectedEmployees = useMemo(() => {
    const query = selectedModeSearch.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) => {
      const name = (employee.name || '').toLowerCase();
      const email = (employee.email || '').toLowerCase();
      const employeeId = (employee.employeeId || '').toLowerCase();
      return name.includes(query) || email.includes(query) || employeeId.includes(query);
    });
  }, [employees, selectedModeSearch]);

  // A row's welcome status, used both to badge it and to decide whether it can be ticked.
  // "ready" = has a login account and hasn't been welcomed; the only state that can be
  // selected for a NEW draft. "no-account" rows are shown greyed (provision them via the
  // amber button above first); "welcomed" are hidden by default.
  const welcomeStatusOf = (employee: WelcomeEmailTargetEmployee): 'welcomed' | 'ready' | 'no-account' | 'no-email' => {
    const status = String(employee.welcomeEmailStatus || '').toLowerCase();
    if (status === 'sent' || status === 'queued') return 'welcomed';
    if (employee.hasUserAccount === false) return 'no-account';
    if (!employee.email?.trim()) return 'no-email';
    return 'ready';
  };

  // The list the user actually asked for: employees who have NOT received a welcome
  // email yet, selectable right here. Default hides already-welcomed.
  const visibleSelectedEmployees = useMemo(() => {
    if (!onlyNotWelcomed) return filteredSelectedEmployees;
    return filteredSelectedEmployees.filter((employee) => welcomeStatusOf(employee) !== 'welcomed');
  }, [filteredSelectedEmployees, onlyNotWelcomed]);
  const EMPLOYEE_LIST_CAP = 300;
  const cappedSelectedEmployees = visibleSelectedEmployees.slice(0, EMPLOYEE_LIST_CAP);

  const toggleEmployeeSelected = (id: string, checked: boolean) => {
    if (!id) return;
    const next = checked
      ? Array.from(new Set([...selectedEmployeeIds, id]))
      : selectedEmployeeIds.filter((item) => item !== id);
    onSelectedEmployeeIdsChange?.(next);
  };

  const selectedDrafts = useMemo(
    () => drafts.filter((draft) => selectedIds.includes(draft.id) && draft.status !== 'sent'),
    [drafts, selectedIds]
  );

  // Render the selected template with representative sample values so the user can see
  // exactly what an employee will receive before preparing or sending anything - the
  // actual per-employee drafts substitute the real name/UID/login the same way server-side.
  const fillSampleTokens = (raw: string) => {
    const sample: Record<string, string> = {
      employeeName: 'Priya Sharma', firstName: 'Priya', lastName: 'Sharma',
      email: 'priya.sharma@company.com', companyName: 'Your Company',
      employeeId: 'EMP1024', department: 'Operations',
      temporaryPassword: 'E7K2PX', password: 'E7K2PX',
      username: 'priya.sharma@company.com', userId: 'priya.sharma@company.com',
      loginIdentifier: 'priya.sharma@company.com', loginUrl: 'https://app.mediqzy.com/login',
    };
    let out = String(raw || '');
    out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => (key in sample ? sample[key] : `{{${key}}}`));
    const bracket: Record<string, string> = {
      '[Employee Name]': sample.employeeName, '[First Name]': sample.firstName, '[Last Name]': sample.lastName,
      '[Temporary Password]': sample.temporaryPassword, '[Password]': sample.password,
      '[Username]': sample.username, '[User ID]': sample.userId, '[Employee ID]': sample.employeeId,
      '[Employee Email ID / Mobile Number]': sample.loginIdentifier, '[Company Name]': sample.companyName,
      '[Department]': sample.department, '[Login URL]': sample.loginUrl,
      '[generated securely at send time]': sample.temporaryPassword,
    };
    for (const [token, value] of Object.entries(bracket)) out = out.split(token).join(value);
    return out;
  };
  const templatePreview = useMemo(() => {
    if (!selectedTemplateHtml) return null;
    return { subject: fillSampleTokens(selectedTemplateSubject || ''), html: fillSampleTokens(selectedTemplateHtml) };
  }, [selectedTemplateHtml, selectedTemplateSubject]);

  useEffect(() => {
    if (singleSearchIndex >= filteredSingleEmployees.length) {
      setSingleSearchIndex(0);
    }
  }, [filteredSingleEmployees, singleSearchIndex]);

  const updateDraft = (id: string, patch: Partial<WelcomeEmailDraft>) => {
    onDraftsChange(drafts.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  };

  const allUnsentIds = drafts.filter((draft) => draft.status !== 'sent').map((draft) => draft.id);
  const allSelected = allUnsentIds.length > 0 && allUnsentIds.every((id) => selectedIds.includes(id));
  const hasDrafts = drafts.length > 0;
  const selectedEmployeeCount = selectedEmployeeIds.length;
  const totalEmployees = welcomePrepareStats?.total ?? employees.length;
  const eligibleEmployees = welcomePrepareStats?.eligible ?? employees.length;
  const alreadyWelcomedEmployees = welcomePrepareStats?.alreadyWelcomed ?? Math.max(totalEmployees - eligibleEmployees, 0);
  const notYetProvisionedEmployees = welcomePrepareStats?.notYetProvisioned ?? 0;

  // "Prepare" produces editable drafts, which only exist for employees that already have
  // an account — a no-account employee can't be drafted (sending provisions + emails them
  // in one step). "Send" in All mode additionally provisions the no-account ones, so it's
  // enabled whenever anyone (ready or not-yet-provisioned) still needs a welcome.
  const canPrepareDrafts = prepareMode === 'all'
    ? eligibleEmployees > 0
    : prepareMode === 'selected'
      ? selectedEmployeeCount > 0
      : Boolean(singleEmployeeId);
  const canSend = prepareMode === 'all'
    ? (eligibleEmployees + notYetProvisionedEmployees) > 0
    : prepareMode === 'selected'
      ? selectedEmployeeCount > 0
      : Boolean(singleEmployeeId);

  const selectedSingleEmployee = prepareMode === 'single'
    ? employees.find((employee) => String(employee.id) === String(singleEmployeeId || '').trim())
    : null;

  const startPreparation = (handler?: () => void) => {
    onOpenChange(false);
    handler?.();
  };

  const fireSend = () => {
    onPrepareFromEmployees?.({
      mode: prepareMode,
      singleEmployeeId,
      singleEmployeeEmail: selectedSingleEmployee?.email,
      sendImmediately: true,
    });
  };

  // How many accounts will be created and how many real emails sent if the user sends now.
  const sendProvisionCount = prepareMode === 'all' ? notYetProvisionedEmployees : 0;
  const sendEmailCount = prepareMode === 'all'
    ? eligibleEmployees + notYetProvisionedEmployees
    : prepareMode === 'selected'
      ? selectedEmployeeCount
      : 1;

  // Confirm before a consequential bulk send — creating accounts, or emailing many people,
  // can't be undone. A single employee or a tiny selection sends straight through.
  const requestSend = () => {
    if (sendProvisionCount > 0 || sendEmailCount >= 10) {
      setConfirmSend({ provision: sendProvisionCount, emails: sendEmailCount });
      return;
    }
    fireSend();
  };

  const handleSingleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (filteredSingleEmployees.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSingleSearchIndex((current) => (current + 1) % filteredSingleEmployees.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSingleSearchIndex((current) => (current - 1 + filteredSingleEmployees.length) % filteredSingleEmployees.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filteredSingleEmployees[singleSearchIndex] || filteredSingleEmployees[0];
      if (selected) setSingleEmployeeId(selected.id);
    }
  };

  const handleSelectAllMatchedEmployees = () => {
    // Only employees actually shown in the list and emailable right now (have an account,
    // not already welcomed) — never silently select rows the user can't see or can't send to.
    const matchedIds = visibleSelectedEmployees
      .filter((employee) => welcomeStatusOf(employee) === 'ready')
      .map((employee) => employee.id);
    if (matchedIds.length === 0) return;
    onSelectedEmployeeIdsChange?.(Array.from(new Set([...selectedEmployeeIds, ...matchedIds])));
  };

  const handleClearMatchedEmployees = () => {
    const matchedIds = new Set(visibleSelectedEmployees.map((employee) => employee.id));
    onSelectedEmployeeIdsChange?.(selectedEmployeeIds.filter((id) => !matchedIds.has(id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-background/95">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Prepare Welcome Email Batch
          </DialogTitle>
          <DialogDescription>
            Review and edit welcome emails before sending them to newly created employees.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-full">
          <div className="xl:col-span-4 border rounded-lg min-h-[320px] xl:min-h-0 overflow-hidden bg-background flex flex-col">
            {!!onPrepareFromEmployees && (
              <div className="border-b p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prepare New Drafts</p>
                {(eligibleEmployees + notYetProvisionedEmployees) > 0 && (
                  <div className="rounded-md border bg-background p-2">
                    <p className="text-sm font-semibold">
                      {eligibleEmployees + notYetProvisionedEmployees} of {totalEmployees} employees have not received a welcome email
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {eligibleEmployees} ready to welcome now
                      {notYetProvisionedEmployees > 0 ? ` • ${notYetProvisionedEmployees} need an account provisioned first` : ''}
                    </p>
                  </div>
                )}
                {notYetProvisionedEmployees > 0 && (
                  <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1.5">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {notYetProvisionedEmployees} employee{notYetProvisionedEmployees === 1 ? '' : 's'} on the roster
                      {notYetProvisionedEmployees === 1 ? ' has' : ' have'} no login account yet, so they don't appear as
                      selectable targets below — they can't receive a welcome email until one is created.
                    </p>
                    {onProvisionRosterAccounts && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        disabled={provisioningRosterAccounts}
                        onClick={onProvisionRosterAccounts}
                      >
                        {provisioningRosterAccounts
                          ? 'Provisioning…'
                          : `Provision ${notYetProvisionedEmployees} Account${notYetProvisionedEmployees === 1 ? '' : 's'} & Send Welcome`}
                      </Button>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Target</Label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={prepareMode}
                    onChange={(event) => { setConfirmSend(null); setPrepareMode(event.target.value as 'single' | 'selected' | 'all'); }}
                  >
                    <option value="single">Single employee</option>
                    <option value="selected">Selected employees ({selectedEmployeeCount})</option>
                    <option value="all">
                      All not-yet-welcomed ({eligibleEmployees + notYetProvisionedEmployees})
                    </option>
                  </select>
                  {prepareMode === 'all' && (
                    <p className="text-[11px] text-muted-foreground">
                      {alreadyWelcomedEmployees > 0 && <>{alreadyWelcomedEmployees} already welcomed will be skipped. </>}
                      <strong>Send Now</strong> welcomes all {eligibleEmployees + notYetProvisionedEmployees}: emails the {eligibleEmployees} with an account
                      {notYetProvisionedEmployees > 0 ? <> and creates accounts + credential emails for the {notYetProvisionedEmployees} new ones</> : null}.
                      {' '}<strong>Prepare</strong> drafts only the {eligibleEmployees} with an account.
                    </p>
                  )}
                </div>

                {prepareMode === 'single' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Employee</Label>
                    <Input
                      value={singleEmployeeSearch}
                      onChange={(event) => {
                        setSingleEmployeeSearch(event.target.value);
                        setSingleSearchIndex(0);
                      }}
                      onKeyDown={handleSingleSearchKeyDown}
                      placeholder="Search by name, email, or employee ID"
                      className="h-9"
                    />
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={singleEmployeeId}
                      onChange={(event) => setSingleEmployeeId(event.target.value)}
                    >
                      <option value="">Select employee</option>
                      {filteredSingleEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name || employee.employeeId} ({employee.email})
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      {filteredSingleEmployees.length} match{filteredSingleEmployees.length === 1 ? '' : 'es'}
                      {filteredSingleEmployees[singleSearchIndex] ? ` • Enter selects ${filteredSingleEmployees[singleSearchIndex].name || filteredSingleEmployees[singleSearchIndex].employeeId}` : ''}
                    </p>
                  </div>
                )}

                {prepareMode === 'selected' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Choose recipients</Label>
                    <Input
                      value={selectedModeSearch}
                      onChange={(event) => setSelectedModeSearch(event.target.value)}
                      placeholder="Filter by name, email, or employee ID"
                      className="h-9"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={onlyNotWelcomed}
                          onCheckedChange={(checked) => setOnlyNotWelcomed(checked === true)}
                          className="h-3.5 w-3.5"
                        />
                        Only not-yet-welcomed
                      </label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleSelectAllMatchedEmployees}>
                          Select All
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleClearMatchedEmployees}>
                          Clear
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-56 rounded-md border">
                      <div className="divide-y">
                        {cappedSelectedEmployees.length === 0 && (
                          <p className="p-3 text-[11px] text-muted-foreground">
                            {onlyNotWelcomed ? 'Everyone matching your filter has already been welcomed.' : 'No employees match your filter.'}
                          </p>
                        )}
                        {cappedSelectedEmployees.map((employee) => {
                          const status = welcomeStatusOf(employee);
                          const selectable = status === 'ready';
                          const checked = Boolean(employee.id) && selectedEmployeeIds.includes(employee.id);
                          return (
                            <label
                              key={employee.id || employee.employeeId || employee.email}
                              className={`flex items-start gap-2 p-2 text-xs ${selectable ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'}`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={!selectable}
                                onCheckedChange={(value) => toggleEmployeeSelected(employee.id, value === true)}
                                className="mt-0.5 h-3.5 w-3.5"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{employee.name || employee.employeeId || employee.email}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">{employee.email || '—'}{employee.employeeId ? ` · ${employee.employeeId}` : ''}</span>
                              </span>
                              {status === 'welcomed' && <Badge className="bg-green-600 hover:bg-green-600 shrink-0 text-[9px] px-1.5 py-0">Welcomed</Badge>}
                              {status === 'ready' && <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0">Not sent</Badge>}
                              {status === 'no-account' && <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700 dark:text-amber-300 text-[9px] px-1.5 py-0">No account</Badge>}
                              {status === 'no-email' && <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0">No email</Badge>}
                            </label>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <p className="text-[11px] text-muted-foreground">
                      Showing {cappedSelectedEmployees.length} of {visibleSelectedEmployees.length}
                      {visibleSelectedEmployees.length > EMPLOYEE_LIST_CAP ? ' — refine your filter to see more' : ''}
                      {' • '}{selectedEmployeeIds.length} selected
                    </p>
                  </div>
                )}

                {templateOptions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Email Template</Label>
                      {approvedTemplateId
                        ? <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5">✅ Approved: {templateOptions.find(t => t.id === approvedTemplateId)?.name || approvedTemplateId}</span>
                        : <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5">⚠ No approved template</span>
                      }
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 h-9 rounded-md border bg-background px-2 text-sm"
                        value={selectedTemplateId || ''}
                        onChange={(event) => onSelectedTemplateChange?.(event.target.value)}
                      >
                        {templateOptions.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={approvingTemplate || !selectedTemplateId || selectedTemplateId === approvedTemplateId}
                        onClick={() => selectedTemplateId && onApproveTemplate?.(selectedTemplateId)}
                        className="shrink-0 h-9 px-3 text-xs font-semibold rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {approvingTemplate ? 'Saving…' : selectedTemplateId === approvedTemplateId ? '✅ Approved' : 'Approve'}
                      </button>
                    </div>
                    {selectedTemplateId && approvedTemplateId && selectedTemplateId !== approvedTemplateId && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Selected template differs from approved — click Approve to update.</p>
                    )}
                    {!approvedTemplateId && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Select a template and click Approve before preparing drafts.</p>
                    )}
                  </div>
                )}

                {confirmSend ? (
                  <div className="rounded-md border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Confirm — this can't be undone</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {confirmSend.provision > 0 && <>This will create <strong>{confirmSend.provision}</strong> new login account{confirmSend.provision === 1 ? '' : 's'} and </>}
                      {confirmSend.provision > 0 ? 'email' : 'This will email'} <strong>{confirmSend.emails}</strong> employee{confirmSend.emails === 1 ? '' : 's'} right now.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={preparing || sending} onClick={() => setConfirmSend(null)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={preparing || sending}
                        onClick={() => { setConfirmSend(null); fireSend(); }}
                      >
                        {preparing || sending ? 'Sending…' : `Yes, send ${confirmSend.emails}`}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canPrepareDrafts || preparing || sending}
                      onClick={() => onPrepareFromEmployees({
                        mode: prepareMode,
                        singleEmployeeId,
                        singleEmployeeEmail: selectedSingleEmployee?.email,
                        sendImmediately: false,
                      })}
                    >
                      {preparing
                        ? 'Preparing...'
                        : prepareMode === 'all'
                          ? `Prepare ${eligibleEmployees} draft${eligibleEmployees === 1 ? '' : 's'}`
                          : 'Prepare'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canSend || preparing || sending}
                      onClick={requestSend}
                    >
                      {prepareMode === 'all'
                        ? `Welcome all ${eligibleEmployees + notYetProvisionedEmployees}`
                        : prepareMode === 'selected'
                          ? `Send ${selectedEmployeeCount}`
                          : 'Send Now'}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <div>
                <p className="text-sm font-medium">{drafts.length} prepared</p>
                <p className="text-xs text-muted-foreground">{selectedDrafts.length} selected to send</p>
              </div>
              {hasDrafts && allUnsentIds.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(allSelected ? [] : allUnsentIds)}
                >
                  {allSelected ? 'Clear' : 'Select All'}
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="divide-y">
                {!hasDrafts && (
                  <div className="p-4 text-sm text-muted-foreground space-y-3">
                    <p>No welcome email drafts are prepared yet.</p>
                    <p>Use Add Employee or Bulk Upload and keep Welcome email handling set to Prepare batch for review.</p>
                  </div>
                )}
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    role="button"
                    tabIndex={0}
                    className={`w-full text-left p-3 hover:bg-muted/50 cursor-pointer ${activeDraft?.id === draft.id ? 'bg-muted' : ''}`}
                    onClick={() => setActiveDraftId(draft.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedIds.includes(draft.id)}
                        disabled={draft.status === 'sent'}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) => toggleSelected(draft.id, checked === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{draft.employeeName || draft.to}</p>
                          {getStatusBadge(draft.status)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{draft.to}</p>
                        {draft.error && <p className="text-xs text-red-600 mt-1">{draft.error}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="xl:col-span-8 min-h-[320px] xl:min-h-0">
            {activeDraft ? (
              <div className="space-y-3 border rounded-lg p-3 bg-background">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>To</Label>
                    <Input value={activeDraft.to} onChange={(event) => updateDraft(activeDraft.id, { to: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Subject</Label>
                    <Input value={activeDraft.subject} onChange={(event) => updateDraft(activeDraft.id, { subject: event.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email HTML</Label>
                  <Textarea
                    className="font-mono text-xs h-64"
                    value={activeDraft.html}
                    onChange={(event) => updateDraft(activeDraft.id, { html: event.target.value })}
                  />
                </div>
                {!!onSaveTemplate && (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                    <div className="space-y-1">
                      <Label>Template Name</Label>
                      <Input
                        value={templateName}
                        onChange={(event) => setTemplateName(event.target.value)}
                        placeholder="Corporate employee welcome_sigin"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={savingTemplate || !templateName.trim() || !activeDraft.subject.trim() || !activeDraft.html.trim()}
                      onClick={() => onSaveTemplate({
                        name: templateName,
                        subject: activeDraft.subject,
                        html: activeDraft.html,
                      })}
                    >
                      {savingTemplate ? 'Saving...' : 'Save Template'}
                    </Button>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Preview</Label>
                  <iframe
                    title="Welcome email preview"
                    className="w-full h-[32vh] rounded-md border bg-white"
                    srcDoc={activeDraft.html}
                  />
                </div>
              </div>
            ) : templatePreview ? (
              <div className="space-y-3 border rounded-lg p-3 bg-background">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Template preview</p>
                  <Badge variant="outline" className="text-[10px]">Sample data</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This is how the selected template looks with example values. Each employee's real name, login ID and
                  temporary password are filled in when you Prepare or Send.
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input value={templatePreview.subject} readOnly className="h-9 bg-muted/40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preview</Label>
                  <iframe
                    title="Welcome template preview"
                    className="w-full h-[48vh] rounded-md border bg-white"
                    srcDoc={templatePreview.html}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {onPrepareSingle && (
                    <Button type="button" size="sm" onClick={() => startPreparation(onPrepareSingle)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Employee
                    </Button>
                  )}
                  {onPrepareBulk && (
                    <Button type="button" size="sm" variant="outline" onClick={() => startPreparation(onPrepareBulk)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Bulk Upload
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-[320px] border rounded-lg flex items-center justify-center p-6 bg-background">
                <div className="max-w-md text-center space-y-4">
                  <div className="mx-auto h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No welcome email drafts prepared</p>
                    <p className="text-sm text-muted-foreground">
                      Prepare drafts while adding one employee or during bulk upload. You can edit every email before sending.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {onPrepareSingle && (
                      <Button type="button" onClick={() => startPreparation(onPrepareSingle)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Employee
                      </Button>
                    )}
                    {onPrepareBulk && (
                      <Button type="button" variant="outline" onClick={() => startPreparation(onPrepareBulk)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Bulk Upload
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        <DialogFooter className="gap-2 border-t px-5 py-3 bg-background/95">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Close</Button>
          {hasDrafts && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Send via</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'auto' | 'ses' | 'brevo')}
                  disabled={sending}
                >
                  <option value="auto">Auto (SES)</option>
                  <option value="ses">AWS SES</option>
                  <option value="brevo">Brevo SMTP</option>
                </select>
              </div>
              <Button onClick={() => onSendSelected(selectedDrafts, provider)} disabled={sending || selectedDrafts.length === 0}>
                <Send className="h-4 w-4 mr-2" />
                {sending ? 'Sending...' : `Send ${selectedDrafts.length} Email${selectedDrafts.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

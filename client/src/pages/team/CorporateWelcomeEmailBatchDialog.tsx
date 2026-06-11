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
  approvedTemplateId?: string | null;
  approvingTemplate?: boolean;
  onSelectedTemplateChange?: (templateId: string) => void;
  onApproveTemplate?: (templateId: string) => void;
  onPrepareFromEmployees?: (args: { mode: 'single' | 'selected' | 'all'; singleEmployeeId?: string; singleEmployeeEmail?: string; sendImmediately: boolean }) => void;
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
  approvedTemplateId,
  approvingTemplate = false,
  onSelectedTemplateChange,
  onApproveTemplate,
  onPrepareFromEmployees,
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

  const selectedDrafts = useMemo(
    () => drafts.filter((draft) => selectedIds.includes(draft.id) && draft.status !== 'sent'),
    [drafts, selectedIds]
  );

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
  const canPrepare = prepareMode === 'all'
    ? employees.length > 0
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
    const matchedIds = filteredSelectedEmployees.map((employee) => employee.id);
    if (matchedIds.length === 0) return;
    onSelectedEmployeeIdsChange?.(Array.from(new Set([...selectedEmployeeIds, ...matchedIds])));
  };

  const handleClearMatchedEmployees = () => {
    const matchedIds = new Set(filteredSelectedEmployees.map((employee) => employee.id));
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
                <div className="space-y-1">
                  <Label className="text-xs">Target</Label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={prepareMode}
                    onChange={(event) => setPrepareMode(event.target.value as 'single' | 'selected' | 'all')}
                  >
                    <option value="single">Single employee</option>
                    <option value="selected">Selected employees ({selectedEmployeeCount})</option>
                    <option value="all">All employees ({employees.length})</option>
                  </select>
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
                    <Label className="text-xs">Filter selected targets</Label>
                    <Input
                      value={selectedModeSearch}
                      onChange={(event) => setSelectedModeSearch(event.target.value)}
                      placeholder="Filter by name, email, or employee ID"
                      className="h-9"
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={handleSelectAllMatchedEmployees}>
                        Select All Matched
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={handleClearMatchedEmployees}>
                        Clear Matched
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {filteredSelectedEmployees.length} matched • {selectedEmployeeIds.length} currently selected
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

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canPrepare || preparing || sending}
                    onClick={() => onPrepareFromEmployees({
                      mode: prepareMode,
                      singleEmployeeId,
                      singleEmployeeEmail: selectedSingleEmployee?.email,
                      sendImmediately: false,
                    })}
                  >
                    {preparing ? 'Preparing...' : 'Prepare'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canPrepare || preparing || sending}
                    onClick={() => onPrepareFromEmployees({
                      mode: prepareMode,
                      singleEmployeeId,
                      singleEmployeeEmail: selectedSingleEmployee?.email,
                      sendImmediately: true,
                    })}
                  >
                    Send Now
                  </Button>
                </div>
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

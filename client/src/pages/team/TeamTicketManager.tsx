import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ticketService, Ticket, CreateTicketData } from '@/services/ticketService';
import {
  Ticket as TicketIcon,
  Search,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  User,
  Calendar,
  MessageSquare,
  RefreshCw,
  Send,
  Star,
  Flag,
  ChevronRight,
  Loader2,
  Download,
  UserCheck,
  Lock,
  AlertTriangle,
  Inbox,
  Tag,
  ArrowUpCircle,
  Eye,
  MoreVertical,
  Filter,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700 border-red-200',
  'in-progress': 'bg-blue-100 text-blue-700 border-blue-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
};

const PRIORITY_CONFIG: Record<string, { dot: string; label: string; ring: string }> = {
  critical: { dot: 'bg-red-500', label: 'Critical', ring: 'ring-red-300' },
  high:     { dot: 'bg-orange-500', label: 'High', ring: 'ring-orange-300' },
  medium:   { dot: 'bg-yellow-500', label: 'Medium', ring: 'ring-yellow-300' },
  low:      { dot: 'bg-green-500', label: 'Low', ring: 'ring-green-300' },
};

const CATEGORY_LABELS: Record<string, string> = {
  'appointment-cancellation': 'Cancellation',
  'appointment-reschedule': 'Reschedule',
  'doctor-consultation': 'Consultation',
  'health-checkup': 'Health Check',
  'prescription': 'Prescription',
  'health-report': 'Report',
  'billing': 'Billing',
  'complaint': 'Complaint',
  'technical': 'Technical',
  'other': 'Other',
};

const STATUS_FLOW = ['open', 'in-progress', 'pending', 'resolved', 'closed'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function slaHours(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

// ─── Mini Components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
      }`}
    >
      {status}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span
      title={cfg?.label ?? priority}
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-400'}`}
    />
  );
}

function SLABadge({ createdAt, status }: { createdAt: string; status: string }) {
  if (status === 'resolved' || status === 'closed') return null;
  const h = slaHours(createdAt);
  let cls = 'text-green-600 bg-green-50';
  if (h > 24) cls = 'text-red-600 bg-red-50';
  else if (h > 4) cls = 'text-orange-600 bg-orange-50';
  else if (h > 1) cls = 'text-yellow-600 bg-yellow-50';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${cls}`}>
      {formatHours(h)}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      ))}
    </div>
  );
}

// ─── Create Ticket Form ─────────────────────────────────────────────────────────

interface CreateFormProps {
  agents: Agent[];
  onCreated: (ticket: Ticket) => void;
  onClose: () => void;
}

interface Agent {
  _id: string;
  name: string;
  email: string;
  role: string;
}

function CreateTicketForm({ agents, onCreated, onClose }: CreateFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<CreateTicketData & { assignee: string }>>({
    title: '',
    description: '',
    priority: 'medium',
    category: 'doctor-consultation',
    requester: { name: '', email: '', role: 'team' },
    tags: [],
    source: 'team-portal',
  });

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim() || !form.description?.trim()) {
      toast({ title: 'Validation', description: 'Title and description are required.', variant: 'destructive' });
      return;
    }
    if (!form.requester?.email?.trim()) {
      toast({ title: 'Validation', description: 'Requester email is required.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload: CreateTicketData = {
        title: form.title!,
        description: form.description!,
        priority: form.priority || 'medium',
        category: form.category || 'other',
        requester: form.requester!,
        tags: form.tags || [],
        source: 'team-portal',
        ...(form.assignee ? { assignee: form.assignee } : {}),
      };
      const created = await ticketService.createTicket(payload);
      onCreated(created);
      toast({ title: '✅ Ticket Created', description: `#${created.ticketId} submitted successfully.` });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create ticket', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-1">
        <Label>Title *</Label>
        <Input
          placeholder="Brief summary of the issue"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">🟢 Low</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="critical">🔴 Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => set('category', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description *</Label>
        <Textarea
          placeholder="Detailed description — steps to reproduce, expected vs actual behaviour..."
          rows={4}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Requester Name *</Label>
          <Input
            placeholder="Full name"
            value={form.requester?.name}
            onChange={(e) => setForm((f) => ({ ...f, requester: { ...f.requester!, name: e.target.value } }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Requester Email *</Label>
          <Input
            type="email"
            placeholder="email@example.com"
            value={form.requester?.email}
            onChange={(e) => setForm((f) => ({ ...f, requester: { ...f.requester!, email: e.target.value } }))}
          />
        </div>
      </div>

      {agents.length > 0 && (
        <div className="space-y-1">
          <Label>Assign To (Optional)</Label>
          <Select value={form.assignee || ''} onValueChange={(v) => set('assignee', v || undefined)}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name} ({a.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Submit Ticket
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Ticket Detail Panel ────────────────────────────────────────────────────────

interface DetailPanelProps {
  ticket: Ticket;
  agents: Agent[];
  onStatusChange: (id: string, status: string, resolution?: string) => Promise<void>;
  onSendMessage: (id: string, msg: string, isInternal: boolean) => Promise<void>;
  onAssign: (id: string, agentId: string) => Promise<void>;
  onEscalate: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}

function TicketDetailPanel({
  ticket,
  agents,
  onStatusChange,
  onSendMessage,
  onAssign,
  onEscalate,
  onClose,
}: DetailPanelProps) {
  const [newMsg, setNewMsg] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [showResolutionInput, setShowResolutionInput] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [showEscalate, setShowEscalate] = useState(false);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket.messages?.length]);

  const handleSend = async () => {
    if (!newMsg.trim()) return;
    setSendingMsg(true);
    await onSendMessage(ticket.ticketId, newMsg.trim(), isInternal);
    setNewMsg('');
    setSendingMsg(false);
  };

  const handleStatusClick = (s: string) => {
    if (s === 'resolved' || s === 'closed') {
      setPendingStatus(s);
      setShowResolutionInput(true);
    } else {
      confirmStatusChange(s);
    }
  };

  const confirmStatusChange = async (s: string, resolution?: string) => {
    setUpdatingStatus(true);
    setShowResolutionInput(false);
    await onStatusChange(ticket.ticketId, s, resolution);
    setPendingStatus(null);
    setResolutionText('');
    setUpdatingStatus(false);
  };

  const handleAssign = async (agentId: string) => {
    setAssigningAgent(true);
    await onAssign(ticket.ticketId, agentId);
    setAssigningAgent(false);
  };

  const handleEscalate = async () => {
    if (!escalateReason.trim()) return;
    setShowEscalate(false);
    await onEscalate(ticket.ticketId, escalateReason.trim());
    setEscalateReason('');
  };

  const age = slaHours(ticket.createdAt);

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
      {/* Fixed Header */}
      <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
        <div className="flex items-start gap-2">
          <PriorityDot priority={ticket.priority} />
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base leading-snug pr-6">{ticket.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                #{ticket.ticketId}
              </span>
              <StatusBadge status={ticket.status} />
              <span className="capitalize text-xs font-medium text-muted-foreground">
                {PRIORITY_CONFIG[ticket.priority]?.label ?? ticket.priority}
              </span>
              <span className="text-xs text-muted-foreground">
                {CATEGORY_LABELS[ticket.category] ?? ticket.category}
              </span>
              <SLABadge createdAt={ticket.createdAt} status={ticket.status} />
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-6 py-4 space-y-5">

            {/* Description */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Description
              </p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </div>

            <Separator />

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Requester:</span>
                <strong className="text-foreground truncate">
                  {ticket.requester?.name || ticket.requester?.email || '—'}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" />
                <span>Assignee:</span>
                <strong className="text-foreground truncate">
                  {ticket.assignee?.name || 'Unassigned'}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Created:</span>
                <strong className="text-foreground">
                  {new Date(ticket.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Age:</span>
                <strong className={`${age > 24 ? 'text-red-600' : age > 4 ? 'text-orange-600' : 'text-foreground'}`}>
                  {formatHours(age)}
                </strong>
              </div>
              {ticket.dueDate && (
                <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                  <Flag className="h-3.5 w-3.5" />
                  <span>Due:</span>
                  <strong className={`${new Date(ticket.dueDate) < new Date() ? 'text-red-600' : 'text-foreground'}`}>
                    {new Date(ticket.dueDate).toLocaleDateString()} 
                    {new Date(ticket.dueDate) < new Date() ? ' ⚠️ Overdue' : ''}
                  </strong>
                </div>
              )}
            </div>

            {/* Tags */}
            {ticket.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-muted rounded-full">
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <Separator />

            {/* Status Actions */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Change Status
              </p>
              {showResolutionInput && pendingStatus ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Provide a resolution summary before marking as <strong>{pendingStatus}</strong>:
                  </p>
                  <Textarea
                    placeholder="Describe how this was resolved..."
                    rows={3}
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => confirmStatusChange(pendingStatus!, resolutionText || undefined)}
                      disabled={updatingStatus}
                    >
                      {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                      Confirm {pendingStatus}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setShowResolutionInput(false); setPendingStatus(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {STATUS_FLOW.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusClick(s)}
                      disabled={updatingStatus || ticket.status === s}
                      className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        ticket.status === s
                          ? (STATUS_COLORS[s] || 'bg-gray-100 text-gray-600 border-gray-200') + ' font-semibold'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                      } disabled:opacity-50 cursor-pointer`}
                    >
                      {s}
                    </button>
                  ))}
                  {updatingStatus && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              )}
            </div>

            {/* Agent Assignment */}
            {agents.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Assign Agent
                </p>
                <Select
                  value={ticket.assignee?.agentId || ''}
                  onValueChange={(v) => v && handleAssign(v)}
                  disabled={assigningAgent}
                >
                  <SelectTrigger className="w-full">
                    {assigningAgent ? (
                      <span className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-3 w-3 animate-spin" /> Assigning...
                      </span>
                    ) : (
                      <SelectValue placeholder="Select agent to assign" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              (a as any).isOnline ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          />
                          {a.name}
                          <span className="text-muted-foreground text-xs">({a.role})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Escalate */}
            {!showEscalate ? (
              <Button
                size="sm"
                variant="outline"
                className="text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => setShowEscalate(true)}
              >
                <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                Escalate Ticket
              </Button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder="Reason for escalation..."
                  rows={2}
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleEscalate} disabled={!escalateReason.trim()}>
                    Escalate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowEscalate(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Messages */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Messages ({ticket.messages?.length ?? 0})
              </p>
              {(ticket.messages?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  No messages yet — start the conversation below.
                </p>
              ) : (
                <div className="space-y-3">
                  {ticket.messages.map((m) => (
                    <div
                      key={m.messageId}
                      className={`rounded-xl p-3 text-sm relative ${
                        m.sender.type === 'agent'
                          ? 'bg-blue-50 border border-blue-100 ml-4'
                          : m.sender.type === 'system'
                          ? 'bg-gray-50 border border-dashed border-gray-200 text-muted-foreground text-xs italic'
                          : 'bg-white border border-gray-100 shadow-sm'
                      }`}
                    >
                      {m.isInternal && (
                        <span className="absolute top-2 right-2 text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full border border-yellow-200 flex items-center gap-0.5">
                          <Lock className="h-2 w-2" /> internal
                        </span>
                      )}
                      <p className="pr-16 leading-relaxed">{m.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />
                        {m.sender.name}
                        <span className="text-gray-300">·</span>
                        {timeAgo(m.timestamp)}
                      </p>
                    </div>
                  ))}
                  <div ref={msgEndRef} />
                </div>
              )}
            </div>

            {/* Resolution */}
            {ticket.resolution && (
              <>
                <Separator />
                <div className="rounded-xl p-4 bg-green-50 border border-green-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="font-semibold text-green-700 text-sm">Resolution</p>
                  </div>
                  <p className="text-sm">{ticket.resolution.summary}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Resolved by {ticket.resolution.resolvedBy} · {timeAgo(ticket.resolution.resolvedAt)}
                  </p>
                </div>
              </>
            )}

            {/* Satisfaction */}
            {ticket.satisfaction && (
              <>
                <Separator />
                <div className="rounded-xl p-3 bg-amber-50 border border-amber-100">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Customer Satisfaction</p>
                  <StarRating rating={ticket.satisfaction.rating} />
                  {ticket.satisfaction.feedback && (
                    <p className="text-xs mt-1.5 text-muted-foreground italic">
                      "{ticket.satisfaction.feedback}"
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Bottom spacer */}
            <div className="h-2" />
          </div>
        </ScrollArea>
      </div>

      {/* Fixed Reply Box */}
      <div className="px-6 py-4 border-t shrink-0 bg-gray-50/50 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsInternal(!isInternal)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
              isInternal
                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            <Lock className="h-3 w-3" />
            {isInternal ? 'Internal note' : 'Public reply'}
          </button>
        </div>
        <div className="flex gap-2">
          <Textarea
            placeholder={isInternal ? 'Internal note (only visible to team)...' : 'Compose reply...'}
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            rows={2}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
            }}
          />
          <Button
            className="self-end"
            size="sm"
            onClick={handleSend}
            disabled={sendingMsg || !newMsg.trim()}
          >
            {sendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
      </div>
    </DialogContent>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function TeamTicketManager() {
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState({
    total: 0, open: 0, inProgress: 0, pending: 0, resolved: 0, closed: 0,
    avgResponseTime: '—', avgResolutionTime: '—', satisfactionScore: 0,
  });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Filters
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority'>('newest');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // UI state
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load data
  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const filters: any = { limit: 200 };
      if (search) filters.search = search;
      if (statusTab !== 'all') filters.status = statusTab;
      if (filterPriority !== 'all') filters.priority = filterPriority;
      if (filterCategory !== 'all') filters.category = filterCategory;

      const [tdResp, statsResp, agentsResp] = await Promise.all([
        ticketService.getTickets(filters),
        ticketService.getTicketStats().catch(() => null),
        ticketService.getAgents().catch(() => []),
      ]);

      const ticketData = (tdResp as any) as { tickets: Ticket[]; pagination: any };
      setTickets(ticketData.tickets || []);
      setAgents(((agentsResp as any) || []) as Agent[]);
      if (statsResp) {
        const g = (statsResp as any).general ?? statsResp;
        setStats((prev) => ({ ...prev, ...g }));
      }
      setLastRefresh(new Date());
    } catch (err: any) {
      if (!silent) {
        toast({ title: 'Error', description: err.message || 'Failed to load tickets', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusTab, filterPriority, filterCategory]);

  // Initial load
  useEffect(() => { load(false); }, []);

  // Debounce filter changes
  useEffect(() => {
    const id = setTimeout(() => { setPage(1); load(true); }, 400);
    return () => clearTimeout(id);
  }, [search, statusTab, filterPriority, filterCategory]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [load]);

  // Sort + paginate client-side
  const sorted = [...tickets].sort((a, b) => {
    if (sortBy === 'priority') {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 9) - (order[b.priority as keyof typeof order] ?? 9);
    }
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return sortBy === 'newest' ? db - da : da - db;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Count by status for tab badges
  const countByStatus = tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  // Actions
  const handleStatusChange = useCallback(async (ticketId: string, newStatus: string, resolution?: string) => {
    try {
      await ticketService.updateTicket(ticketId, {
        status: newStatus,
        ...(resolution ? { resolution } : {}),
      });
      setTickets((prev) => prev.map((t) =>
        t.ticketId === ticketId ? { ...t, status: newStatus as any, updatedAt: new Date().toISOString() } : t
      ));
      setSelectedTicket((prev) =>
        prev?.ticketId === ticketId ? { ...prev, status: newStatus as any, updatedAt: new Date().toISOString() } : prev
      );
      toast({ title: 'Status Updated', description: `Ticket #${ticketId} → ${newStatus}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update', variant: 'destructive' });
    }
  }, []);

  const handleSendMessage = useCallback(async (ticketId: string, content: string, isInternal: boolean) => {
    try {
      const updated = (await ticketService.addMessage(ticketId, content, isInternal)) as any as Ticket;
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? updated : t)));
      setSelectedTicket((prev) => (prev?.ticketId === ticketId ? updated : prev));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send', variant: 'destructive' });
    }
  }, []);

  const handleAssign = useCallback(async (ticketId: string, agentId: string) => {
    try {
      const updated = (await ticketService.assignTicket(ticketId, agentId)) as any as Ticket;
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? updated : t)));
      setSelectedTicket((prev) => (prev?.ticketId === ticketId ? updated : prev));
      toast({ title: 'Assigned', description: `Ticket #${ticketId} assigned.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to assign', variant: 'destructive' });
    }
  }, []);

  const handleEscalate = useCallback(async (ticketId: string, reason: string) => {
    try {
      await ticketService.escalateTicket(ticketId, reason);
      toast({ title: 'Escalated', description: `Ticket #${ticketId} escalated.` });
      load(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to escalate', variant: 'destructive' });
    }
  }, [load]);

  const handleCreated = useCallback((t: Ticket) => {
    setTickets((prev) => [t, ...prev]);
    setStats((prev) => ({ ...prev, total: prev.total + 1, open: prev.open + 1 }));
  }, []);

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      setExporting(true);
      const data = await ticketService.exportTickets(format);
      const blob = new Blob(
        [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
        { type: format === 'csv' ? 'text/csv' : 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: `Tickets exported as ${format.toUpperCase()}` });
    } catch (err: any) {
      toast({ title: 'Export Error', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const TAB_ITEMS = [
    { key: 'all', label: 'All', count: tickets.length },
    { key: 'open', label: 'Open', count: countByStatus['open'] || 0 },
    { key: 'in-progress', label: 'In Progress', count: countByStatus['in-progress'] || 0 },
    { key: 'pending', label: 'Pending', count: countByStatus['pending'] || 0 },
    { key: 'resolved', label: 'Resolved', count: countByStatus['resolved'] || 0 },
    { key: 'closed', label: 'Closed', count: countByStatus['closed'] || 0 },
  ];

  const STAT_CARDS = [
    { label: 'Total', value: stats.total, icon: TicketIcon, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Open', value: stats.open, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'In Progress', value: stats.inProgress, icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Satisfaction', value: stats.satisfactionScore ? `${stats.satisfactionScore}/5` : '—', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        <p className="text-muted-foreground">Loading tickets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TicketIcon className="h-6 w-6 text-indigo-600" />
            Support Ticket Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track, route, and resolve support issues · refreshed {timeAgo(lastRefresh.toISOString())}
            {refreshing && <RefreshCw className="inline ml-1.5 h-3 w-3 animate-spin" />}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => handleExport('csv')}
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => handleExport('json')}
            >
              JSON
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {/* New Ticket */}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Support Ticket</DialogTitle>
                <DialogDescription>Submit a new issue for the support team.</DialogDescription>
              </DialogHeader>
              <CreateTicketForm
                agents={agents}
                onCreated={handleCreated}
                onClose={() => setShowCreate(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_CARDS.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
                <div className={`rounded-lg p-2 ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TAB_ITEMS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => { setStatusTab(key); setPage(1); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
              statusTab === key
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                statusTab === key ? 'bg-indigo-700 text-indigo-100' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by title, ID, requester..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={filterPriority} onValueChange={(v) => { setFilterPriority(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">🔴 Critical</SelectItem>
            <SelectItem value="high">🟠 High</SelectItem>
            <SelectItem value="medium">🟡 Medium</SelectItem>
            <SelectItem value="low">🟢 Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(1); }}>
          <SelectTrigger className="w-[155px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([val, lbl]) => (
              <SelectItem key={val} value={val}>{lbl}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="priority">By Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ticket List */}
      {paginated.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Inbox className="h-14 w-14 text-muted-foreground mb-4 opacity-20" />
            <p className="text-lg font-semibold mb-1">No tickets found</p>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusTab !== 'all' || filterPriority !== 'all' || filterCategory !== 'all'
                ? 'Try clearing your filters'
                : 'No tickets yet — create the first one to get started'}
            </p>
            {statusTab === 'all' && !search && filterPriority === 'all' && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Ticket
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {paginated.map((ticket) => (
            <Dialog
              key={ticket._id}
              open={selectedTicket?._id === ticket._id}
              onOpenChange={(open) => {
                if (open) setSelectedTicket(ticket);
                else setSelectedTicket(null);
              }}
            >
              <DialogTrigger asChild>
                <Card className="cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all group">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      {/* Priority */}
                      <div className="pt-1.5 flex-shrink-0">
                        <PriorityDot priority={ticket.priority} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate max-w-xs group-hover:text-indigo-700 transition-colors">
                            {ticket.title}
                          </span>
                          <StatusBadge status={ticket.status} />
                          <SLABadge createdAt={ticket.createdAt} status={ticket.status} />
                          <span className="text-xs text-muted-foreground font-mono">
                            #{ticket.ticketId}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="capitalize">
                            {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {ticket.requester?.name || ticket.requester?.email || '—'}
                          </span>
                          {ticket.assignee?.name && (
                            <span className="flex items-center gap-1 text-blue-600">
                              <UserCheck className="h-3 w-3" />
                              {ticket.assignee.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {ticket.messages?.length ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(ticket.createdAt)}
                          </span>
                          {/* Tags */}
                          {ticket.tags?.slice(0, 2).map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 bg-muted rounded-full text-[10px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-indigo-500 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </DialogTrigger>

              {selectedTicket?._id === ticket._id && (
                <TicketDetailPanel
                  ticket={selectedTicket}
                  agents={agents}
                  onStatusChange={handleStatusChange}
                  onSendMessage={handleSendMessage}
                  onAssign={handleAssign}
                  onEscalate={handleEscalate}
                  onClose={() => setSelectedTicket(null)}
                />
              )}
            </Dialog>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            Page {page} of {totalPages} · {sorted.length} tickets
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next →
          </Button>
        </div>
      )}

      {totalPages <= 1 && sorted.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing all {sorted.length} ticket{sorted.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}


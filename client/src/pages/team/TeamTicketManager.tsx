import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700 border-red-200',
  'in-progress': 'bg-blue-100 text-blue-700 border-blue-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
      }`}
    >
      {status}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-1 ${
        PRIORITY_DOT[priority] ?? 'bg-gray-400'
      }`}
    />
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Create Ticket Form ────────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: (ticket: Ticket) => void;
  onClose: () => void;
  defaultEmail?: string;
  defaultName?: string;
}

function CreateTicketForm({ onCreated, onClose, defaultEmail = '', defaultName = '' }: CreateFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<CreateTicketData>>({
    title: '',
    description: '',
    priority: 'medium',
    category: 'technical',
    requester: { name: defaultName, email: defaultEmail, role: 'team' },
    tags: [],
  });

  const set = (key: keyof CreateTicketData, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim() || !form.description?.trim()) {
      toast({ title: 'Validation', description: 'Title and description are required.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const created = await ticketService.createTicket(form as CreateTicketData);
      onCreated(created);
      toast({ title: 'Ticket Created', description: `Ticket ${created.ticketId} submitted successfully.` });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create ticket', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>Title *</Label>
        <Input
          placeholder="Brief summary of the issue"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => set('category', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
              <SelectItem value="integration">Integration</SelectItem>
              <SelectItem value="feature-request">Feature Request</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description *</Label>
        <Textarea
          placeholder="Detailed description of the issue, steps to reproduce, expected vs actual behaviour..."
          rows={4}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Your Name</Label>
          <Input
            placeholder="Name"
            value={form.requester?.name}
            onChange={(e) =>
              setForm((f) => ({ ...f, requester: { ...f.requester!, name: e.target.value } }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Your Email</Label>
          <Input
            type="email"
            placeholder="email@example.com"
            value={form.requester?.email}
            onChange={(e) =>
              setForm((f) => ({ ...f, requester: { ...f.requester!, email: e.target.value } }))
            }
          />
        </div>
      </div>

      <DialogFooter>
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

// ─── Ticket Detail Panel ───────────────────────────────────────────────────────

interface DetailPanelProps {
  ticket: Ticket;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onSendMessage: (id: string, msg: string) => Promise<void>;
  onClose: () => void;
}

function TicketDetailPanel({ ticket, onStatusChange, onSendMessage, onClose }: DetailPanelProps) {
  const [newMsg, setNewMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleSend = async () => {
    if (!newMsg.trim()) return;
    setSendingMsg(true);
    await onSendMessage(ticket.ticketId, newMsg.trim());
    setNewMsg('');
    setSendingMsg(false);
  };

  const handleStatus = async (s: string) => {
    setUpdatingStatus(true);
    await onStatusChange(ticket.ticketId, s);
    setUpdatingStatus(false);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
      <DialogHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-lg leading-tight">{ticket.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs">#{ticket.ticketId}</span>
              <StatusBadge status={ticket.status} />
              <span className="capitalize text-xs">
                <PriorityDot priority={ticket.priority} />
                {ticket.priority}
              </span>
              <span className="text-xs">{ticket.category}</span>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <ScrollArea className="flex-1 min-h-0 pr-2">
        <div className="space-y-5">
          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Description
            </p>
            <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>Requester: <strong className="text-foreground">{ticket.requester?.name || '—'}</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>Assignee: <strong className="text-foreground">{ticket.assignee?.name || 'Unassigned'}</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Created: <strong className="text-foreground">{new Date(ticket.createdAt).toLocaleDateString()}</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Updated: <strong className="text-foreground">{timeAgo(ticket.updatedAt)}</strong></span>
            </div>
          </div>

          {/* Status change */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Update Status:
            </span>
            {['open', 'in-progress', 'pending', 'resolved', 'closed'].map((s) => (
              <button
                key={s}
                onClick={() => handleStatus(s)}
                disabled={updatingStatus || ticket.status === s}
                className={`px-2 py-0.5 text-xs rounded-full border transition-opacity ${
                  ticket.status === s
                    ? (STATUS_COLORS[s] || 'bg-gray-100 text-gray-600 border-gray-200')
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                } disabled:opacity-50`}
              >
                {s}
              </button>
            ))}
            {updatingStatus && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {/* Tags */}
          {ticket.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ticket.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-xs bg-muted rounded-full">{tag}</span>
              ))}
            </div>
          )}

          {/* Messages */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Messages ({ticket.messages?.length ?? 0})
            </p>
            {(ticket.messages?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic">No messages yet.</p>
            ) : (
              <div className="space-y-3">
                {ticket.messages.map((m) => (
                  <div
                    key={m.messageId}
                    className={`rounded-lg p-3 text-sm ${
                      m.sender.type === 'agent'
                        ? 'bg-blue-50 border border-blue-100'
                        : m.sender.type === 'system'
                        ? 'bg-gray-50 border border-gray-100 italic text-muted-foreground text-xs'
                        : 'bg-white border'
                    }`}
                  >
                    {m.isInternal && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded mr-1">
                        internal
                      </span>
                    )}
                    <p>{m.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {m.sender.name} · {timeAgo(m.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resolution */}
          {ticket.resolution && (
            <div className="rounded-lg p-3 bg-green-50 border border-green-100 text-sm">
              <p className="font-semibold text-green-700 mb-1">Resolution</p>
              <p>{ticket.resolution.summary}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Resolved by {ticket.resolution.resolvedBy} · {timeAgo(ticket.resolution.resolvedAt)}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Reply box */}
      <div className="pt-3 border-t flex gap-2">
        <Input
          placeholder="Type a message..."
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
        />
        <Button size="sm" onClick={handleSend} disabled={sendingMsg || !newMsg.trim()}>
          {sendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </DialogContent>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TeamTicketManager() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({
    total: 0, open: 0, inProgress: 0, pending: 0, resolved: 0, closed: 0,
    avgResponseTime: '—', avgResolutionTime: '—', satisfactionScore: 0,
  });

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [tdResp, statsResp] = await Promise.all([
          ticketService.getTickets({ limit: 100 }),
          ticketService.getTicketStats().catch(() => null),
        ]);
        setTickets(tdResp.tickets || []);
        if (statsResp) {
          const g = (statsResp as any).general ?? statsResp;
          setStats((prev) => ({ ...prev, ...g }));
        }
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to load tickets',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Re-fetch on filter changes (debounced)
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const filters: any = { limit: 100 };
        if (search) filters.search = search;
        if (filterStatus !== 'all') filters.status = filterStatus;
        if (filterPriority !== 'all') filters.priority = filterPriority;
        const resp = await ticketService.getTickets(filters);
        setTickets(resp.tickets || []);
      } catch {}
    }, 500);
    return () => clearTimeout(id);
  }, [search, filterStatus, filterPriority]);

  const handleStatusChange = useCallback(
    async (ticketId: string, newStatus: string) => {
      try {
        await ticketService.updateTicket(ticketId, { status: newStatus });
        setTickets((prev) =>
          prev.map((t) =>
            t.ticketId === ticketId ? { ...t, status: newStatus as any, updatedAt: new Date().toISOString() } : t
          )
        );
        setSelectedTicket((prev) =>
          prev?.ticketId === ticketId ? { ...prev, status: newStatus as any, updatedAt: new Date().toISOString() } : prev
        );
        toast({ title: 'Status Updated', description: `Ticket ${ticketId} → ${newStatus}` });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to update status', variant: 'destructive' });
      }
    },
    []
  );

  const handleSendMessage = useCallback(
    async (ticketId: string, content: string) => {
      try {
        const updated = await ticketService.addMessage(ticketId, content);
        setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? updated : t)));
        setSelectedTicket((prev) => (prev?.ticketId === ticketId ? updated : prev));
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to send message', variant: 'destructive' });
      }
    },
    []
  );

  const handleCreated = useCallback((t: Ticket) => {
    setTickets((prev) => [t, ...prev]);
    setStats((prev) => ({ ...prev, total: prev.total + 1, open: prev.open + 1 }));
  }, []);

  // Derived
  const displayed = tickets; // server-side filtering already applied

  const statCards = [
    { label: 'Total', value: stats.total, icon: TicketIcon, color: 'text-indigo-600' },
    { label: 'Open', value: stats.open, icon: AlertCircle, color: 'text-red-600' },
    { label: 'In Progress', value: stats.inProgress, icon: RefreshCw, color: 'text-blue-600' },
    { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-600' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TicketIcon className="h-6 w-6 text-indigo-600" />
            Support Ticket Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track, create, and resolve support issues
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
              <DialogDescription>
                Submit a new issue for the support team to address.
              </DialogDescription>
            </DialogHeader>
            <CreateTicketForm
              onCreated={handleCreated}
              onClose={() => setShowCreate(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
                <Icon className={`h-7 w-7 opacity-20 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by title, ID or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ticket List */}
      {displayed.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TicketIcon className="h-12 w-12 text-muted-foreground mb-3 opacity-30" />
            <p className="text-lg font-medium">No tickets found</p>
            <p className="text-sm text-muted-foreground mb-4">
              {search || filterStatus !== 'all' || filterPriority !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create the first support ticket to get started'}
            </p>
            {!search && filterStatus === 'all' && filterPriority === 'all' && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Ticket
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((ticket) => (
            <Dialog
              key={ticket._id}
              open={selectedTicket?._id === ticket._id}
              onOpenChange={(open) => {
                if (open) setSelectedTicket(ticket);
                else setSelectedTicket(null);
              }}
            >
              <DialogTrigger asChild>
                <Card className="cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      {/* Priority dot */}
                      <div className="pt-1.5">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            PRIORITY_DOT[ticket.priority] ?? 'bg-gray-400'
                          }`}
                        />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate max-w-sm">
                            {ticket.title}
                          </span>
                          <StatusBadge status={ticket.status} />
                          <span className="text-xs text-muted-foreground font-mono">
                            #{ticket.ticketId}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="capitalize">{ticket.category}</span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {ticket.requester?.name || ticket.requester?.email || '—'}
                          </span>
                          {ticket.assignee && (
                            <span>→ {ticket.assignee.name}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {ticket.messages?.length ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(ticket.createdAt)}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </DialogTrigger>

              {/* Detail dialog rendered when open */}
              {selectedTicket?._id === ticket._id && (
                <TicketDetailPanel
                  ticket={selectedTicket}
                  onStatusChange={handleStatusChange}
                  onSendMessage={handleSendMessage}
                  onClose={() => setSelectedTicket(null)}
                />
              )}
            </Dialog>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Showing {displayed.length} ticket{displayed.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

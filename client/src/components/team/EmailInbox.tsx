import React, { useState, useEffect } from 'react';
import { Mail, Star, Trash2, Archive, Clock, AlertCircle, CheckCircle, Settings, Send, RefreshCw, X, Reply, Ticket as TicketIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';
import { Link } from 'react-router-dom';

interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  htmlBody?: string;
  isRead: boolean;
  isStarred: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  aiIntent: string;
  aiSummary: string;
  aiSentiment: 'positive' | 'neutral' | 'negative';
  receivedAt: string;
  aiProcessed: boolean;
  autoUpdatesApplied: any[];
}

interface InboxStats {
  total: number;
  unread: number;
  starred: number;
  byIntent: Record<string, number>;
  bySentiment: Record<string, number>;
}

// Map AI email intent → ticket category
const intentToCategory = (intent: string): string => {
  const map: Record<string, string> = {
    appointment_request: 'doctor-consultation',
    appointment_cancel: 'appointment-cancellation',
    appointment_reschedule: 'appointment-reschedule',
    test_result: 'health-report',
    prescription: 'prescription',
    billing: 'billing',
    feedback: 'complaint',
    patient_query: 'other',
  };
  return map[intent] || 'other';
};

// Parse RFC 2822 "Name" <email@domain.com> → { name, email }
function parseFromField(raw: string): { name: string; email: string } {
  const match = raw.match(/^.*?"?([^"<>]+)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  // plain email
  return { name: raw.trim(), email: raw.trim() };
}

const EmailInbox: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [folder, setFolder] = useState('inbox');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendData, setSendData] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    htmlContent: ''
  });

  // ── Create-Ticket state ────────────────────────────────────────────
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState('');
  const [ticketError, setTicketError] = useState('');
  const [ticketForm, setTicketForm] = useState({
    title: '',
    description: '',
    category: 'other',
    priority: 'medium',
    requesterName: '',
    requesterEmail: '',
  });

  const openTicketModal = (email: Email) => {
    const sender = parseFromField(email.from);
    // Best description: aiSummary > body > htmlBody stripped > subject fallback
    const rawBody = email.body || email.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    const description = email.aiSummary || rawBody.slice(0, 500) || `Email from ${sender.email} regarding: ${email.subject}`;
    setTicketForm({
      title: email.subject || 'Email enquiry',
      description,
      category: intentToCategory(email.aiIntent),
      priority: email.priority === 'urgent' ? 'critical' : email.priority === 'high' ? 'high' : email.priority === 'normal' ? 'medium' : 'low',
      requesterName: email.fromName || sender.name,
      requesterEmail: sender.email,
    });
    setTicketSuccess('');
    setTicketError('');
    setShowTicketModal(true);
  };

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketLoading(true);
    setTicketError('');
    try {
      const res = await api.post('/tickets', {
        title: ticketForm.title,
        description: ticketForm.description,
        category: ticketForm.category,
        priority: ticketForm.priority,
        source: 'email',
        requester: {
          name: ticketForm.requesterName,
          email: ticketForm.requesterEmail,
          role: 'Customer',
        },
        tags: ['email', 'team-created'],
      });
      const t = res.data?.ticket || res.data;
      setTicketSuccess(`Ticket ${t?.ticketId || t?.ticketNumber || ''} created successfully!`);
    } catch (err: any) {
      setTicketError(err?.response?.data?.message || 'Failed to create ticket');
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
    fetchStats();
  }, [page, unreadOnly, folder]);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const response = await api.get('/team/emails/inbox', {
        params: {
          page,
          limit: 20,
          unreadOnly,
          folder,
          search: searchTerm
        }
      });

      if (response.data.success) {
        setEmails(response.data.data.emails);
      }
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/team/emails/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const syncEmails = async () => {
    try {
      setSyncing(true);
      console.log('📧 Starting email sync...');
      const response = await api.post('/team/emails/sync');
      console.log('✅ Sync response:', response.data);
      if (response.data.success) {
        // Refresh inbox and stats after sync
        await fetchInbox();
        await fetchStats();
        alert(`✅ Email sync successful! ${response.data.data.newEmails} new emails received.`);
      }
    } catch (error: any) {
      console.error('❌ Sync failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      const message = error.response?.data?.message || error.response?.data?.error || 'Failed to sync emails';
      alert(`❌ Sync failed: ${message}`);
    } finally {
      setSyncing(false);
    }
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sendData.to.trim() || !sendData.subject.trim() || !sendData.htmlContent.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSendLoading(true);
      const response = await api.post('/team/emails/send', {
        to: sendData.to.trim(),
        cc: sendData.cc.trim() || undefined,
        bcc: sendData.bcc.trim() || undefined,
        subject: sendData.subject.trim(),
        htmlContent: sendData.htmlContent.trim()
      });

      if (response.data.success) {
        setShowSendModal(false);
        setSendData({
          to: '',
          cc: '',
          bcc: '',
          subject: '',
          htmlContent: ''
        });
        alert('✅ Email sent successfully!');
        // Optionally refresh the inbox
        await fetchInbox();
      }
    } catch (error: any) {
      console.error('Failed to send email:', error);
      const message = error.response?.data?.message || 'Failed to send email';
      alert(`❌ Send failed: ${message}`);
    } finally {
      setSendLoading(false);
    }
  };

  const startReply = (email: Email) => {
    setSendData({
      to: email.from,
      cc: '',
      bcc: '',
      subject: email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`,
      htmlContent: `\n\n<hr/>\n<p><strong>On ${new Date(email.receivedAt).toLocaleString()}, ${email.fromName || email.from} wrote:</strong></p>\n<blockquote>${(email.body || '').replace(/\n/g, '<br/>')}</blockquote>`
    });
    setShowSendModal(true);
  };

  const markAsRead = async (emailId: string) => {
    try {
      await api.put(`/team/emails/${emailId}/mark-read`);
      setEmails(emails.map(e => e.id === emailId ? { ...e, isRead: true } : e));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const toggleStar = async (emailId: string) => {
    try {
      const response = await api.put(`/team/emails/${emailId}/toggle-star`);
      if (response.data.success) {
        setEmails(emails.map(e => 
          e.id === emailId ? { ...e, isStarred: response.data.data.isStarred } : e
        ));
      }
    } catch (error) {
      console.error('Failed to toggle star:', error);
    }
  };

  const deleteEmail = async (emailId: string) => {
    try {
      await api.delete(`/team/emails/${emailId}`);
      setEmails(emails.filter(e => e.id !== emailId));
    } catch (error) {
      console.error('Failed to delete email:', error);
    }
  };

  const selectEmail = async (email: Email) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      await markAsRead(email.id);
    }
  };

  const getIntentIcon = (intent: string) => {
    const icons: Record<string, JSX.Element> = {
      appointment_request: <Clock className="w-4 h-4" />,
      test_result: <CheckCircle className="w-4 h-4" />,
      patient_query: <AlertCircle className="w-4 h-4" />,
      prescription: <AlertCircle className="w-4 h-4" />,
      billing: <AlertCircle className="w-4 h-4" />,
      feedback: <CheckCircle className="w-4 h-4" />
    };
    return icons[intent] || <Mail className="w-4 h-4" />;
  };

  const getPriorityColor = (priority: string): 'default' | 'destructive' | 'secondary' | 'outline' | 'success' => {
    const colors: Record<string, 'default' | 'destructive' | 'secondary' | 'outline' | 'success'> = {
      urgent: 'destructive',
      high: 'destructive',
      normal: 'default',
      low: 'secondary'
    };
    return colors[priority] || 'default';
  };

  const getSentimentColor = (sentiment: string) => {
    const colors: Record<string, string> = {
      positive: 'bg-green-500/10 border-green-500/20',
      neutral: 'bg-muted/40 border-border',
      negative: 'bg-red-500/10 border-red-500/20'
    };
    return colors[sentiment] || 'bg-muted/40 border-border';
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel - Email List */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Inbox
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowSendModal(true)}
                className="flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={syncEmails}
                disabled={syncing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Emails'}
              </Button>
              <Button
                variant={unreadOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setUnreadOnly(!unreadOnly);
                  setPage(1);
                }}
              >
                Unread ({stats?.unread || 0})
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link to="/team/settings" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  SMTP Settings
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {/* Search Bar */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search emails..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Folder Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {['inbox', 'sent', 'draft', 'spam', 'notifications'].map(
                (f) => (
                  <Button
                    key={f}
                    variant={folder === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setFolder(f);
                      setPage(1);
                    }}
                    className="whitespace-nowrap"
                  >
                    {f.toUpperCase()}
                  </Button>
                )
              )}
            </div>

            {/* Email List */}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading emails...</div>
            ) : emails.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No emails found</div>
            ) : (
              <div className="space-y-2">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => selectEmail(email)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedEmail?.id === email.id
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : email.isRead
                        ? 'bg-card hover:bg-muted/40 border-border'
                        : 'bg-blue-500/10 border-blue-500/20 font-semibold hover:bg-blue-500/15'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(email.id);
                        }}
                        className="mt-1"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                          }`}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{email.fromName}</span>
                          {email.aiProcessed && (
                            <span className="text-xs bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                              {getIntentIcon(email.aiIntent)}
                            </span>
                          )}
                          <Badge variant={getPriorityColor(email.priority)} className="text-xs">
                            {email.priority}
                          </Badge>
                        </div>
                        <div className="text-sm text-foreground truncate mb-1">{email.subject}</div>
                        {email.aiSummary && (
                          <div className="text-xs text-muted-foreground truncate">{email.aiSummary}</div>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(email.receivedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            <div className="mt-4 flex justify-between items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Email Details & Stats */}
      <div className="space-y-4">
        {/* Stats Card */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                  <div className="text-xs text-muted-foreground">Total Emails</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.unread}</div>
                  <div className="text-xs text-muted-foreground">Unread</div>
                </div>
              </div>

              {Object.entries(stats.bySentiment).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-2">Sentiment</div>
                  <div className="space-y-1 text-xs">
                    {Object.entries(stats.bySentiment).map(([sentiment, count]) => (
                      <div key={sentiment} className="flex justify-between">
                        <span className="capitalize text-muted-foreground">{sentiment}:</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Email Details */}
        {selectedEmail && (
          <Card className={getSentimentColor(selectedEmail.aiSentiment)}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Email Details</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openTicketModal(selectedEmail)}
                    title="Create Ticket from this email"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 rounded font-medium transition-colors"
                  >
                    <TicketIcon className="w-3.5 h-3.5" />
                    Raise Ticket
                  </button>
                  <button onClick={() => startReply(selectedEmail)} title="Reply">
                    <Reply className="w-4 h-4 text-blue-500" />
                  </button>
                  <button onClick={() => toggleStar(selectedEmail.id)}>
                    <Star
                      className={`w-4 h-4 ${
                        selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                      }`}
                    />
                  </button>
                  <button onClick={() => deleteEmail(selectedEmail.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">From</div>
                <div className="text-sm">{selectedEmail.from}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Subject</div>
                <div className="text-sm font-semibold">{selectedEmail.subject}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Received</div>
                <div className="text-sm">
                  {new Date(selectedEmail.receivedAt).toLocaleString()}
                </div>
              </div>

              {/* AI Analysis */}
              {selectedEmail.aiProcessed && (
                <>
                  <div className="pt-3 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">🤖 AI Analysis</div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground">Intent: </span>
                        <Badge variant="outline" className="text-xs">
                          {selectedEmail.aiIntent?.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>

                      <div>
                        <span className="text-xs font-semibold text-muted-foreground">Sentiment: </span>
                        <Badge variant="outline" className="text-xs">
                          {selectedEmail.aiSentiment}
                        </Badge>
                      </div>

                      <div>
                        <span className="text-xs font-semibold text-muted-foreground">Priority: </span>
                        <Badge variant={getPriorityColor(selectedEmail.priority)}>
                          {selectedEmail.priority}
                        </Badge>
                      </div>

                      {selectedEmail.aiSummary && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground block mb-1">Summary:</span>
                          <p className="text-xs text-foreground bg-background border border-border p-2 rounded">
                            {selectedEmail.aiSummary}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Auto Updates */}
                  {selectedEmail.autoUpdatesApplied?.length > 0 && (
                    <div className="pt-3 border-t">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">✨ Auto Updates</div>
                      <div className="space-y-1">
                        {selectedEmail.autoUpdatesApplied.map((update, idx) => (
                          <div key={idx} className="text-xs bg-background border border-border p-2 rounded">
                            <div className="font-semibold text-foreground">{update.type}</div>
                            <div className="text-muted-foreground">{update.action}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Email Body Preview */}
              <div className="pt-3 border-t">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Preview</div>
                <div className="text-xs text-foreground bg-background border border-border p-2 rounded max-h-48 overflow-y-auto">
                  {selectedEmail.body}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>

    {/* Create Ticket Modal */}
    {showTicketModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-background border border-border rounded-xl w-full max-w-lg shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <TicketIcon className="w-4 h-4 text-orange-500" />
              Create Ticket from Email
            </div>
            <button onClick={() => setShowTicketModal(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          {ticketSuccess ? (
            <div className="p-6 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-green-700 font-semibold">{ticketSuccess}</p>
              <p className="text-sm text-muted-foreground mt-1">The ticket has been assigned to the team.</p>
              <button
                onClick={() => setShowTicketModal(false)}
                className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={submitTicket} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Title</label>
                <input
                  type="text" required value={ticketForm.title}
                  onChange={e => setTicketForm({ ...ticketForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
                  <select
                    value={ticketForm.category}
                    onChange={e => setTicketForm({ ...ticketForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="appointment-cancellation">Appointment Cancellation</option>
                    <option value="appointment-reschedule">Reschedule</option>
                    <option value="doctor-consultation">Doctor Consultation</option>
                    <option value="health-checkup">Health Checkup</option>
                    <option value="prescription">Prescription</option>
                    <option value="health-report">Health Report</option>
                    <option value="billing">Billing</option>
                    <option value="complaint">Complaint</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Priority</label>
                  <select
                    value={ticketForm.priority}
                    onChange={e => setTicketForm({ ...ticketForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Requester Name</label>
                  <input
                    type="text" required value={ticketForm.requesterName}
                    onChange={e => setTicketForm({ ...ticketForm, requesterName: e.target.value })}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Requester Email</label>
                  <input
                    type="email" required value={ticketForm.requesterEmail}
                    onChange={e => setTicketForm({ ...ticketForm, requesterEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
                <textarea
                  rows={4} value={ticketForm.description}
                  onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
              </div>
              {ticketError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{ticketError}</p>
              )}
              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <button type="button" onClick={() => setShowTicketModal(false)}
                  className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted text-foreground"
                >
                  Cancel
                </button>
                <button type="submit" disabled={ticketLoading}
                  className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2"
                >
                  <TicketIcon className="w-3.5 h-3.5" />
                  {ticketLoading ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )}

    {/* Send Email Modal */}
    {showSendModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-background border-b border-border">
            <CardTitle>Send Email</CardTitle>
            <button
              onClick={() => setShowSendModal(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={sendEmail} className="space-y-4">
              {/* To */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  To *
                </label>
                <input
                  type="email"
                  required
                  value={sendData.to}
                  onChange={(e) => setSendData({ ...sendData, to: e.target.value })}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* CC */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  CC
                </label>
                <input
                  type="email"
                  value={sendData.cc}
                  onChange={(e) => setSendData({ ...sendData, cc: e.target.value })}
                  placeholder="cc@example.com"
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* BCC */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  BCC
                </label>
                <input
                  type="email"
                  value={sendData.bcc}
                  onChange={(e) => setSendData({ ...sendData, bcc: e.target.value })}
                  placeholder="bcc@example.com"
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={sendData.subject}
                  onChange={(e) => setSendData({ ...sendData, subject: e.target.value })}
                  placeholder="Email subject"
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Message *
                </label>
                <textarea
                  required
                  value={sendData.htmlContent}
                  onChange={(e) => setSendData({ ...sendData, htmlContent: e.target.value })}
                  placeholder="Email message content"
                  rows={10}
                  className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">You can use HTML formatting in the message</p>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSendModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={sendLoading}
                  className="flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendLoading ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )}
  </>
  );
};

export default EmailInbox;

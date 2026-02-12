import React, { useState, useEffect } from 'react';
import { Mail, Star, Trash2, Archive, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';

interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
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

const EmailInbox: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, appointment_request, test_result, etc.

  useEffect(() => {
    fetchInbox();
    fetchStats();
  }, [page, unreadOnly, filter]);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const response = await api.get('/team/emails/inbox', {
        params: {
          page,
          limit: 20,
          unreadOnly,
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

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      urgent: 'destructive',
      high: 'warning',
      normal: 'default',
      low: 'secondary'
    };
    return colors[priority] || 'default';
  };

  const getSentimentColor = (sentiment: string) => {
    const colors: Record<string, string> = {
      positive: 'bg-green-50 border-green-200',
      neutral: 'bg-gray-50 border-gray-200',
      negative: 'bg-red-50 border-red-200'
    };
    return colors[sentiment] || 'bg-gray-50 border-gray-200';
  };

  return (
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
                variant={unreadOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setUnreadOnly(!unreadOnly);
                  setPage(1);
                }}
              >
                Unread ({stats?.unread || 0})
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
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {['all', 'appointment_request', 'test_result', 'patient_query', 'prescription'].map(
                (f) => (
                  <Button
                    key={f}
                    variant={filter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setFilter(f);
                      setPage(1);
                    }}
                    className="whitespace-nowrap"
                  >
                    {f === 'all' ? 'All' : f.replace(/_/g, ' ').toUpperCase()}
                  </Button>
                )
              )}
            </div>

            {/* Email List */}
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading emails...</div>
            ) : emails.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No emails found</div>
            ) : (
              <div className="space-y-2">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => selectEmail(email)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedEmail?.id === email.id
                        ? 'bg-blue-50 border-blue-300'
                        : email.isRead
                        ? 'bg-white hover:bg-gray-50'
                        : 'bg-blue-50 border-blue-100 font-semibold hover:bg-blue-100'
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
                            email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{email.fromName}</span>
                          {email.aiProcessed && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                              {getIntentIcon(email.aiIntent)}
                            </span>
                          )}
                          <Badge variant={getPriorityColor(email.priority)} className="text-xs">
                            {email.priority}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-700 truncate mb-1">{email.subject}</div>
                        {email.aiSummary && (
                          <div className="text-xs text-gray-500 truncate">{email.aiSummary}</div>
                        )}
                      </div>

                      <div className="text-xs text-gray-500 whitespace-nowrap">
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
              <span className="text-sm text-gray-600">Page {page}</span>
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
                  <div className="text-xs text-gray-600">Total Emails</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.unread}</div>
                  <div className="text-xs text-gray-600">Unread</div>
                </div>
              </div>

              {Object.entries(stats.bySentiment).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Sentiment</div>
                  <div className="space-y-1 text-xs">
                    {Object.entries(stats.bySentiment).map(([sentiment, count]) => (
                      <div key={sentiment} className="flex justify-between">
                        <span className="capitalize text-gray-600">{sentiment}:</span>
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
                  <button onClick={() => toggleStar(selectedEmail.id)}>
                    <Star
                      className={`w-4 h-4 ${
                        selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'
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
                <div className="text-xs font-semibold text-gray-600 mb-1">From</div>
                <div className="text-sm">{selectedEmail.from}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Subject</div>
                <div className="text-sm font-semibold">{selectedEmail.subject}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Received</div>
                <div className="text-sm">
                  {new Date(selectedEmail.receivedAt).toLocaleString()}
                </div>
              </div>

              {/* AI Analysis */}
              {selectedEmail.aiProcessed && (
                <>
                  <div className="pt-3 border-t">
                    <div className="text-xs font-semibold text-gray-600 mb-2">🤖 AI Analysis</div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs font-semibold text-gray-600">Intent: </span>
                        <Badge variant="outline" className="text-xs">
                          {selectedEmail.aiIntent?.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>

                      <div>
                        <span className="text-xs font-semibold text-gray-600">Sentiment: </span>
                        <Badge variant="outline" className="text-xs">
                          {selectedEmail.aiSentiment}
                        </Badge>
                      </div>

                      <div>
                        <span className="text-xs font-semibold text-gray-600">Priority: </span>
                        <Badge variant={getPriorityColor(selectedEmail.priority)}>
                          {selectedEmail.priority}
                        </Badge>
                      </div>

                      {selectedEmail.aiSummary && (
                        <div>
                          <span className="text-xs font-semibold text-gray-600 block mb-1">Summary:</span>
                          <p className="text-xs text-gray-700 bg-white p-2 rounded">
                            {selectedEmail.aiSummary}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Auto Updates */}
                  {selectedEmail.autoUpdatesApplied?.length > 0 && (
                    <div className="pt-3 border-t">
                      <div className="text-xs font-semibold text-gray-600 mb-2">✨ Auto Updates</div>
                      <div className="space-y-1">
                        {selectedEmail.autoUpdatesApplied.map((update, idx) => (
                          <div key={idx} className="text-xs bg-white p-2 rounded">
                            <div className="font-semibold text-gray-700">{update.type}</div>
                            <div className="text-gray-600">{update.action}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Email Body Preview */}
              <div className="pt-3 border-t">
                <div className="text-xs font-semibold text-gray-600 mb-2">Preview</div>
                <div className="text-xs text-gray-700 bg-white p-2 rounded max-h-48 overflow-y-auto">
                  {selectedEmail.body}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default EmailInbox;

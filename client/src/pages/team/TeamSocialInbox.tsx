import { useEffect, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  Instagram, Facebook, Send, Loader2, RefreshCw, MessageCircle, AlertCircle,
} from 'lucide-react';
import api from '@/utils/api';

interface Conversation {
  id: number;
  channel: 'instagram' | 'facebook';
  contact_name: string | null;
  external_user_id: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_direction: 'inbound' | 'outbound' | null;
  unread_count: number;
}

interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  body: string | null;
  created_at: string;
}

interface Status {
  facebook: { connected: boolean; pageId: string | null };
  instagram: { connected: boolean; businessAccountId: string | null };
}

const ChannelIcon = ({ channel }: { channel: 'instagram' | 'facebook' }) =>
  channel === 'instagram'
    ? <Instagram className="h-4 w-4 text-pink-500" />
    : <Facebook className="h-4 w-4 text-blue-600" />;

const TeamSocialInbox = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'all' | 'instagram' | 'facebook'>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadStatus = async () => {
    try {
      const { data } = await api.get('/social-inbox/status');
      if (data?.success) setStatus(data);
    } catch (err) {
      console.error('Failed to load social inbox status', err);
    }
  };

  const loadConversations = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/social-inbox/conversations', {
        params: { channel: tab === 'all' ? undefined : tab, status: 'all' },
      });
      if (data?.success) setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { loadConversations(); }, [tab]);

  const openConversation = async (c: Conversation) => {
    setSelected(c);
    setLoadingMessages(true);
    try {
      const { data } = await api.get(`/social-inbox/conversations/${c.id}/messages`);
      if (data?.success) setMessages(data.messages || []);
      setConversations((prev) => prev.map((x) => x.id === c.id ? { ...x, unread_count: 0 } : x));
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setLoadingMessages(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/social-inbox/conversations/${selected.id}/reply`, { text: reply.trim() });
      setMessages((prev) => [...prev, { id: Date.now(), direction: 'outbound', body: reply.trim(), created_at: new Date().toISOString() }]);
      setReply('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err: any) {
      console.error('Failed to send reply', err);
      toast({ title: 'Failed to send', description: err?.response?.data?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const notConnected = status && !status.facebook.connected && !status.instagram.connected;

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-4 animate-in fade-in duration-500">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-pink-500" />
              Social Inbox
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Instagram Direct and Facebook Messenger conversations, in one place.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadConversations} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {notConnected && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Not connected to Meta yet</p>
                <p className="text-muted-foreground mt-1">
                  Add <code className="text-xs bg-muted px-1 rounded">FB_PAGE_ACCESS_TOKEN</code>, <code className="text-xs bg-muted px-1 rounded">FB_PAGE_ID</code> and
                  {' '}<code className="text-xs bg-muted px-1 rounded">IG_BUSINESS_ACCOUNT_ID</code> to the server environment, and subscribe the
                  {' '}<code className="text-xs bg-muted px-1 rounded">messages</code> webhook field for your Page/Instagram account in the Meta App dashboard
                  (pointed at the existing <code className="text-xs bg-muted px-1 rounded">/api/fb-leads/webhook</code> callback URL). Once connected, inbound DMs will appear here automatically.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          {(['all', 'instagram', 'facebook'] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)} className="capitalize">
              {t === 'instagram' && <Instagram className="h-3.5 w-3.5 mr-1.5" />}
              {t === 'facebook' && <Facebook className="h-3.5 w-3.5 mr-1.5" />}
              {t}
            </Button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                Conversations
                <Badge variant="outline">{conversations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : conversations.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground px-4">
                  No conversations yet. Inbound Instagram and Messenger DMs will show up here once connected.
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openConversation(c)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${selected?.id === c.id ? 'bg-pink-500/5 border-l-2 border-pink-500' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <ChannelIcon channel={c.channel} />
                        <p className="font-medium text-sm truncate">{c.contact_name || c.external_user_id}</p>
                        {c.unread_count > 0 && <Badge className="ml-auto bg-pink-500 text-white text-[10px]">{c.unread_count}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.last_direction === 'outbound' ? 'You: ' : ''}{c.last_message_preview || '—'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col min-h-[500px]">
            {!selected ? (
              <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Select a conversation to view messages.</p>
                </div>
              </CardContent>
            ) : (
              <>
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ChannelIcon channel={selected.channel} />
                    {selected.contact_name || selected.external_user_id}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto py-4 space-y-2">
                  {loadingMessages ? (
                    <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${m.direction === 'outbound' ? 'bg-pink-500 text-white' : 'bg-muted'}`}>
                          {m.body}
                          <div className={`text-[10px] mt-1 ${m.direction === 'outbound' ? 'text-pink-100' : 'text-muted-foreground'}`}>
                            {new Date(m.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </CardContent>
                <div className="p-3 border-t flex gap-2">
                  <Input
                    placeholder="Type a reply…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !sending) sendReply(); }}
                  />
                  <Button onClick={sendReply} disabled={sending || !reply.trim()} className="bg-pink-500 hover:bg-pink-600 text-white">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default TeamSocialInbox;

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, MapPin, Clock, Send, MessageCircle, Calendar, Users, Star, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import MainLayout from '@/components/layout/MainLayoutdoctor';

interface ContactMessage {
  id: string;
  from: string;
  subject: string;
  message: string;
  timestamp: string;
  status: 'new' | 'read' | 'replied';
  priority: 'low' | 'medium' | 'high';
  senderType: 'patient' | 'admin' | 'system';
}

const DoctorContact: React.FC = () => {
  const { toast } = useToast();
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [replyMessage, setReplyMessage] = useState('');

  // Fetch messages from API
  const { data: messages = [], isLoading, error, refetch } = useQuery({
    queryKey: ['doctor-messages'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/messages');
        return response.data.messages || [];
      } catch (err: any) {
        console.warn('Failed to fetch messages:', err.message);
        // Return empty array as fallback
        return [];
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const handleSendReply = async () => {
    if (!selectedMessage || !replyMessage.trim()) return;

    try {
      await api.post('/doctors/messages/reply', {
        messageId: selectedMessage.id,
        reply: replyMessage.trim()
      });

      toast({
        title: "Reply sent successfully",
        description: "Your response has been sent to the patient.",
      });

      setReplyMessage('');
      setSelectedMessage(null);
      refetch(); // Refresh messages
    } catch (err: any) {
      toast({
        title: "Failed to send reply",
        description: err.message || "An error occurred while sending your reply.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    try {
      await api.patch(`/doctors/messages/${messageId}/read`);
      refetch(); // Refresh messages
    } catch (err: any) {
      console.warn('Failed to mark message as read:', err.message);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case 'read': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'replied': return <Send className="h-4 w-4 text-purple-500" />;
      default: return <MessageCircle className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading messages...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-500 mb-4">Failed to load messages</p>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact & Messages</h1>
          <p className="text-muted-foreground">
            Manage your communications with patients and hospital administration
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Messages List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Messages ({messages.length})
                </CardTitle>
                <CardDescription>
                  Recent communications and notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedMessage?.id === message.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => {
                          setSelectedMessage(message);
                          if (message.status === 'new') {
                            handleMarkAsRead(message.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusIcon(message.status)}
                              <span className="font-medium">{message.from}</span>
                              <Badge variant={getPriorityColor(message.priority) as any} className="text-xs">
                                {message.priority}
                              </Badge>
                            </div>
                            <h4 className="font-medium mb-1">{message.subject}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {message.message}
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(message.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Message Details & Reply */}
          <div>
            {selectedMessage ? (
              <Card>
                <CardHeader>
                  <CardTitle>Message Details</CardTitle>
                  <CardDescription>
                    From: {selectedMessage.from} • {new Date(selectedMessage.timestamp).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Subject</Label>
                    <p className="text-sm">{selectedMessage.subject}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Message</Label>
                    <div className="mt-1 p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{selectedMessage.message}</p>
                    </div>
                  </div>

                  {selectedMessage.status !== 'replied' && (
                    <div className="space-y-3">
                      <Label htmlFor="reply">Reply</Label>
                      <Textarea
                        id="reply"
                        placeholder="Type your response..."
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        rows={4}
                      />
                      <Button
                        onClick={handleSendReply}
                        disabled={!replyMessage.trim()}
                        className="w-full"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Send Reply
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Select a message to view details</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorContact;

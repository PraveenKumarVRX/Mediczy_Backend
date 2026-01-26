/**
 * Support Chat Widget Component
 * In-app chat for patients to connect with support team via RocketChat
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageCircle, 
  Send, 
  X, 
  Minimize2, 
  Maximize2,
  Phone,
  Bot,
  User,
  Loader2,
  Star,
  ThumbsUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Message {
  id: string;
  text: string;
  timestamp: string;
  isFromAgent: boolean;
  senderName: string;
  attachments?: any[];
}

interface Department {
  id: string;
  name: string;
}

interface ChatSession {
  roomId: string;
  visitorToken: string;
  department: string;
}

interface DrIshaSuggestion {
  available: boolean;
  message: string;
  hint: string;
}

const SupportChatWidget: React.FC = () => {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('general');
  const [showDepartmentSelect, setShowDepartmentSelect] = useState(true);
  const [drIshaSuggestion, setDrIshaSuggestion] = useState<DrIshaSuggestion | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load departments and check for active chat on mount
  useEffect(() => {
    loadDepartments();
    checkActiveChat();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Start polling when chat is active
  useEffect(() => {
    if (session && isOpen) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [session, isOpen]);

  const loadDepartments = async () => {
    try {
      const { data } = await api.get('/support/departments');
      if (data.success) {
        setDepartments(data.data.departments);
      }
    } catch (error) {
      console.error('Failed to load departments:', error);
      // Use default departments
      setDepartments([
        { id: 'general', name: 'General Support' },
        { id: 'billing', name: 'Billing & Payments' },
        { id: 'pharmacy', name: 'Pharmacy Orders' },
        { id: 'appointments', name: 'Appointments' },
        { id: 'technical', name: 'Technical Support' }
      ]);
    }
  };

  const checkActiveChat = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const { data } = await api.get('/support/chat/active', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data.success && data.data.hasActiveChat) {
        setSession({
          roomId: data.data.roomId,
          visitorToken: data.data.visitorToken,
          department: data.data.department
        });
        setShowDepartmentSelect(false);
        setUnreadCount(1); // Indicate there's an active chat
      }
    } catch (error) {
      console.error('Check active chat error:', error);
    }
  };

  const startChat = async (initialMessage?: string) => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');

      const { data } = await api.post('/support/chat/start', {
        message: initialMessage || `Started support chat in ${selectedDepartment}`,
        department: selectedDepartment
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data.success) {
        setSession({
          roomId: data.data.roomId,
          visitorToken: data.data.visitorToken,
          department: data.data.department
        });
        setShowDepartmentSelect(false);
        
        // Load chat history
        await loadMessages(data.data.roomId, data.data.visitorToken);
        
        toast.success('Connected to support');
      }
    } catch (error: any) {
      console.error('Start chat error:', error);
      toast.error('Failed to connect to support');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (roomId?: string, visitorToken?: string) => {
    try {
      const token = localStorage.getItem('token');
      const rid = roomId || session?.roomId;
      const vToken = visitorToken || session?.visitorToken;

      if (!rid || !vToken) return;

      const { data } = await api.get('/support/chat/history', {
        params: { roomId: rid, visitorToken: vToken, limit: 100 },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data.success) {
        setMessages(data.data.messages);
      }
    } catch (error) {
      console.error('Load messages error:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !session) return;

    try {
      setIsSending(true);
      const token = localStorage.getItem('token');
      const messageText = inputMessage.trim();
      setInputMessage('');

      // Optimistically add message
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        text: messageText,
        timestamp: new Date().toISOString(),
        isFromAgent: false,
        senderName: 'You'
      };
      setMessages(prev => [...prev, optimisticMessage]);

      const { data } = await api.post('/support/chat/message', {
        roomId: session.roomId,
        visitorToken: session.visitorToken,
        message: messageText
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data.success) {
        // Check for Dr. iSHA suggestion
        if (data.data.drIshaSuggestion?.available) {
          setDrIshaSuggestion(data.data.drIshaSuggestion);
        }
      }
    } catch (error) {
      console.error('Send message error:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const startPolling = () => {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(() => {
      loadMessages();
    }, 3000); // Poll every 3 seconds
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const closeChat = async (withFeedback = false) => {
    if (!session) return;

    try {
      const token = localStorage.getItem('token');

      await api.post('/support/chat/close', {
        roomId: session.roomId,
        visitorToken: session.visitorToken,
        rating: withFeedback ? feedbackRating : undefined,
        comment: withFeedback ? feedbackComment : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSession(null);
      setMessages([]);
      setShowDepartmentSelect(true);
      setShowFeedback(false);
      setDrIshaSuggestion(null);
      toast.success('Chat closed');
    } catch (error) {
      console.error('Close chat error:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Render chat button (when closed)
  if (!isOpen) {
    return (
      <Button
        onClick={() => { setIsOpen(true); setUnreadCount(0); }}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 z-50"
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-red-500">
            {unreadCount}
          </Badge>
        )}
      </Button>
    );
  }

  // Render minimized chat
  if (isMinimized) {
    return (
      <Card className="fixed bottom-6 right-6 w-72 shadow-lg z-50">
        <CardHeader className="py-3 px-4 bg-green-600 text-white rounded-t-lg flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Support Chat</CardTitle>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-white hover:bg-green-700"
              onClick={() => setIsMinimized(false)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-white hover:bg-green-700"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-xl z-50 flex flex-col">
        {/* Header */}
        <CardHeader className="py-3 px-4 bg-green-600 text-white rounded-t-lg flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <div>
              <CardTitle className="text-sm font-medium">Support Chat</CardTitle>
              {session && (
                <p className="text-xs text-green-100">{session.department}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-white hover:bg-green-700"
              onClick={() => setIsMinimized(true)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-white hover:bg-green-700"
              onClick={() => setShowFeedback(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* Department Selection */}
          {showDepartmentSelect && !session && (
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">How can we help you today?</p>
              <div className="grid grid-cols-2 gap-2">
                {departments.map((dept) => (
                  <Button
                    key={dept.id}
                    variant={selectedDepartment === dept.id ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-auto py-2"
                    onClick={() => setSelectedDepartment(dept.id)}
                  >
                    {dept.name}
                  </Button>
                ))}
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => startChat()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4 mr-2" />
                )}
                Start Chat
              </Button>
            </div>
          )}

          {/* Messages Area */}
          {session && (
            <>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <Bot className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">Connected to support</p>
                      <p className="text-xs">An agent will be with you shortly</p>
                    </div>
                  )}
                  
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isFromAgent ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.isFromAgent
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-green-600 text-white'
                        }`}
                      >
                        {msg.isFromAgent && (
                          <p className="text-xs font-medium mb-1 opacity-70">
                            {msg.senderName}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        <p className={`text-xs mt-1 ${
                          msg.isFromAgent ? 'text-gray-500' : 'text-green-100'
                        }`}>
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Dr. iSHA Suggestion */}
              {drIshaSuggestion && (
                <div className="mx-4 mb-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <Bot className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-blue-800 mb-1">
                        💡 Dr. iSHA Suggestion
                      </p>
                      <p className="text-sm text-blue-700">{drIshaSuggestion.message}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 shrink-0"
                      onClick={() => setDrIshaSuggestion(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 border-t bg-white shrink-0">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    disabled={isSending}
                    className="flex-1"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isSending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Feedback Dialog */}
      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate Your Experience</DialogTitle>
            <DialogDescription>
              Help us improve our support by sharing your feedback
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  variant={feedbackRating >= rating ? 'default' : 'outline'}
                  size="icon"
                  className={feedbackRating >= rating ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                  onClick={() => setFeedbackRating(rating)}
                >
                  <Star className={`h-5 w-5 ${feedbackRating >= rating ? 'fill-current' : ''}`} />
                </Button>
              ))}
            </div>
            <Textarea
              placeholder="Any additional comments? (optional)"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { closeChat(false); setIsOpen(false); }}>
              Skip & Close
            </Button>
            <Button onClick={() => { closeChat(true); setIsOpen(false); }} className="bg-green-600">
              <ThumbsUp className="h-4 w-4 mr-2" />
              Submit & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SupportChatWidget;

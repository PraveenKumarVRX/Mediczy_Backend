import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ticketService, Ticket, TicketStats } from '@/services/ticketService';
import {
  Ticket as TicketIcon,
  Search,
  Plus,
  Filter,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  User,
  Calendar,
  MessageSquare,
  Phone,
  Mail,
  Zap,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  Edit,
  Eye,
  Archive,
  Trash2,
  Send,
  Paperclip,
  Star,
  Flag,
  Users,
  BarChart3,
  FileText,
  Settings,
  RefreshCw,
  Download,
  Upload,
  Tag,
  History,
  Bell,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

export default function TicketManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('tickets');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  // API state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<any>({
    total: 0,
    open: 0,
    inProgress: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
    avgResponseTime: '0 hours',
    avgResolutionTime: '0 days',
    satisfactionScore: 0,
    categories: {},
    priorities: {}
  });
  const [agents, setAgents] = useState([]);

  // Load tickets and stats from API
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        const [ticketsResponse, statsResponse, agentsResponse] = await Promise.all([
          ticketService.getTickets({ limit: 50 }),
          ticketService.getTicketStats(),
          ticketService.getAgents()
        ]);

        setTickets(ticketsResponse.tickets || []);
        setStats(statsResponse || stats);
        setAgents(agentsResponse || []);
      } catch (error) {
        console.error('Error loading ticket data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load ticket data. Please try again.',
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    // Set up real-time updates
    const unsubscribe = ticketService.subscribeToUpdates((updatedTickets) => {
      setTickets(updatedTickets);
    });

    return unsubscribe;
  }, []);

  // Refresh data when filters change
  useEffect(() => {
    const loadFilteredTickets = async () => {
      try {
        const filters: any = { limit: 50 };
        
        if (searchQuery) filters.search = searchQuery;
        if (filterStatus !== 'all') filters.status = filterStatus;
        if (filterPriority !== 'all') filters.priority = filterPriority;

        const response = await ticketService.getTickets(filters);
        setTickets(response.tickets || []);
      } catch (error) {
        console.error('Error filtering tickets:', error);
      }
    };

    const debounceTimer = setTimeout(loadFilteredTickets, 500);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, filterStatus, filterPriority]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-700 border-red-200';
      case 'in-progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'resolved': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      await ticketService.updateTicket(ticketId, { status: newStatus });
      
      // Update local state
      setTickets(prev => prev.map(ticket => 
        ticket.ticketId === ticketId ? { ...ticket, status: newStatus as any, updatedAt: new Date().toISOString() } : ticket
      ));
      
      if (selectedTicket?.ticketId === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, status: newStatus as any, updatedAt: new Date().toISOString() } : null);
      }
      
      toast({ title: 'Status Updated', description: `Ticket ${ticketId} status changed to ${newStatus}` });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to update ticket status',
        variant: 'destructive'
      });
    }
  };

  const handleAssignTicket = async (ticketId: string, agentId: string) => {
    try {
      await ticketService.assignTicket(ticketId, agentId);
      
      const agent = agents.find((a: any) => a._id === agentId);
      
      // Update local state
      setTickets(prev => prev.map(ticket => 
        ticket.ticketId === ticketId ? { 
          ...ticket, 
          assignee: agent ? { 
            name: agent.name, 
            email: agent.email, 
            agentId: agent._id 
          } : undefined,
          updatedAt: new Date().toISOString()
        } : ticket
      ));
      
      if (selectedTicket?.ticketId === ticketId) {
        setSelectedTicket(prev => prev ? { 
          ...prev, 
          assignee: agent ? { 
            name: agent.name, 
            email: agent.email, 
            agentId: agent._id 
          } : undefined,
          updatedAt: new Date().toISOString()
        } : null);
      }
      
      toast({ title: 'Ticket Assigned', description: `Ticket ${ticketId} assigned to ${agent?.name}` });
    } catch (error) {
      console.error('Error assigning ticket:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to assign ticket',
        variant: 'destructive'
      });
    }
  };

  const handleSendMessage = async (ticketId: string) => {
    if (newMessage.trim()) {
      try {
        const updatedTicket = await ticketService.addMessage(ticketId, newMessage.trim());
        
        // Update local state
        setTickets(prev => prev.map(ticket => 
          ticket.ticketId === ticketId ? updatedTicket : ticket
        ));
        
        if (selectedTicket?.ticketId === ticketId) {
          setSelectedTicket(updatedTicket);
        }
        
        setNewMessage('');
        toast({ title: 'Message Sent', description: 'Your message has been added to the ticket' });
      } catch (error) {
        console.error('Error sending message:', error);
        toast({ 
          title: 'Error', 
          description: 'Failed to send message',
          variant: 'destructive'
        });
      }
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.ticketId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || ticket.priority === filterPriority;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Service Ticket Management</h1>
            <p className="text-muted-foreground">
              Comprehensive customer support and service ticket management
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Dialog open={showTicketModal} onOpenChange={setShowTicketModal}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Ticket</DialogTitle>
                  <DialogDescription>
                    Create a new support ticket for tracking customer issues
                  </DialogDescription>
                </DialogHeader>
                <CreateTicketForm onSubmit={(data) => {
                  const newTicket = {
                    id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
                    ...data,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    messages: [],
                    attachments: [],
                    satisfaction: null,
                    resolution: null
                  };
                  setTickets(prev => [newTicket, ...prev]);
                  setShowTicketModal(false);
                  toast({ title: 'Ticket Created', description: `New ticket ${newTicket.ticketId} has been created` });
                }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Total Tickets</h3>
                <TicketIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">
                  <TrendingUp className="inline h-3 w-3 mr-1" />
                  +8% from last month
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Open Tickets</h3>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-red-600">{stats.open}</div>
                <p className="text-xs text-muted-foreground">{stats.inProgress} in progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Avg Resolution</h3>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{stats.avgResolutionTime}</div>
                <p className="text-xs text-muted-foreground">Response: {stats.avgResponseTime}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Satisfaction</h3>
                <Star className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{stats.satisfactionScore}/5</div>
                <p className="text-xs text-muted-foreground">Based on {stats.resolved} resolved tickets</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tickets" className="flex items-center space-x-2">
              <TicketIcon className="h-4 w-4" />
              <span>Tickets</span>
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Agents</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Tickets Tab */}
          <TabsContent value="tickets" className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Ticket List */}
              <div className="flex-1 space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tickets..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
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

                {/* Tickets List */}
                <div className="space-y-3">
                  {filteredTickets.map((ticket) => (
                    <Card 
                      key={ticket.ticketId} 
                      className={`cursor-pointer hover:shadow-md transition-shadow ${
                        selectedTicket?.ticketId === ticket.ticketId ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className={`h-3 w-3 rounded-full ${getPriorityColor(ticket.priority)}`} />
                              <Badge className={getStatusColor(ticket.status)} variant="outline">
                                {ticket.status.replace('-', ' ')}
                              </Badge>
                              <span className="text-sm font-mono text-muted-foreground">{ticket.ticketId}</span>
                            </div>
                            <h4 className="font-semibold truncate">{ticket.title}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {ticket.description}
                            </p>
                            <div className="flex items-center space-x-4 mt-3 text-xs text-muted-foreground">
                              <span className="flex items-center">
                                <User className="h-3 w-3 mr-1" />
                                {ticket.requester.name}
                              </span>
                              <span className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {new Date(ticket.createdAt).toLocaleDateString()}
                              </span>
                              <span className="flex items-center">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                {ticket.messages.length} messages
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedTicket(ticket)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Ticket
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleStatusChange(ticket.ticketId, 'in-progress')}>
                                  <Clock className="mr-2 h-4 w-4" />
                                  Mark In Progress
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(ticket.ticketId, 'resolved')}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Mark Resolved
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {ticket.assignee && (
                              <div className="flex items-center space-x-1 text-xs">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-xs">
                                    {ticket.assignee.name.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-muted-foreground">{ticket.assignee.name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Ticket Detail Panel */}
              {selectedTicket && (
                <div className="lg:w-96">
                  <Card className="h-[calc(100vh-300px)]">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{selectedTicket.title}</CardTitle>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge className={getStatusColor(selectedTicket.status)} variant="outline">
                              {selectedTicket.status.replace('-', ' ')}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {selectedTicket.priority}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {selectedTicket.category}
                            </Badge>
                          </div>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground">{selectedTicket.ticketId}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Ticket Info */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Requester:</span>
                          <div className="flex items-center space-x-1">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-xs">
                                {selectedTicket.requester.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <span>{selectedTicket.requester.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Assignee:</span>
                          <Select 
                            value={selectedTicket.assignee?.email || ''} 
                            onValueChange={(value) => {
                              const agent = agents.find((a: any) => a.email === value);
                              handleAssignTicket(selectedTicket.ticketId, agent?._id);
                            }}
                          >
                            <SelectTrigger className="w-[200px] h-8">
                              <SelectValue placeholder="Assign to..." />
                            </SelectTrigger>
                            <SelectContent>
                              {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.email}>
                                  {agent.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Created:</span>
                          <span>{new Date(selectedTicket.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Due Date:</span>
                          <span>{new Date(selectedTicket.dueDate).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <h4 className="font-medium mb-2">Description</h4>
                        <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>
                      </div>

                      {/* Tags */}
                      {selectedTicket.tags.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Tags</h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedTicket.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Messages */}
                      <div className="flex-1">
                        <h4 className="font-medium mb-2">Messages ({selectedTicket.messages.length})</h4>
                        <ScrollArea className="h-48 border rounded-md p-3">
                          <div className="space-y-3">
                            {selectedTicket.messages.map((message) => (
                              <div key={message.messageId} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium">{message.sender.name}</span>
                                  <span className="text-muted-foreground">
                                    {new Date(message.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm bg-muted/30 p-2 rounded">{message.content}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>

                      {/* Message Input */}
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Add a message..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          rows={3}
                        />
                        <div className="flex items-center justify-between">
                          <Button variant="ghost" size="sm">
                            <Paperclip className="h-4 w-4 mr-1" />
                            Attach
                          </Button>
                          <Button size="sm" onClick={() => handleSendMessage(selectedTicket.ticketId)}>
                            <Send className="h-4 w-4 mr-1" />
                            Send
                          </Button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="flex-1">
                              Change Status
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => handleStatusChange(selectedTicket.ticketId, 'open')}>
                              <AlertCircle className="mr-2 h-4 w-4" />
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(selectedTicket.ticketId, 'in-progress')}>
                              <Clock className="mr-2 h-4 w-4" />
                              In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(selectedTicket.ticketId, 'pending')}>
                              <XCircle className="mr-2 h-4 w-4" />
                              Pending
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(selectedTicket.ticketId, 'resolved')}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Resolved
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader className="pb-4">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={agent.avatar} />
                        <AvatarFallback>
                          {agent.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{agent.role}</p>
                      </div>
                      <Badge variant={agent.status === 'online' ? 'default' : 'secondary'}>
                        {agent.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Active Tickets:</span>
                        <span className="font-medium">{agent.activeTickets}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Resolved Today:</span>
                        <span className="font-medium">{agent.resolvedToday}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Average Rating:</span>
                        <div className="flex items-center">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 mr-1" />
                          <span className="font-medium">{agent.avgRating}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" className="flex-1">
                        <MessageSquare className="mr-1 h-3 w-3" />
                        Message
                      </Button>
                      <Button size="sm" variant="outline">
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Tickets by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(stats.categories || {}).map(([category, count]: [string, any]) => (
                        <div key={category} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{category.replace(/([A-Z])/g, ' $1')}</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${((count as number) / Math.max(...Object.values(stats.categories || {}).map(v => v as number))) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count as number}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Priority Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(stats.priorities || {}).map(([priority, count]: [string, any]) => (
                        <div key={priority} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`h-3 w-3 rounded-full ${getPriorityColor(priority)}`} />
                            <span className="text-sm capitalize">{priority}</span>
                          </div>
                          <span className="text-sm font-medium">{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">87%</div>
                      <div className="text-sm text-muted-foreground">Resolution Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">94%</div>
                      <div className="text-sm text-muted-foreground">First Contact Resolution</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">4.3/5</div>
                      <div className="text-sm text-muted-foreground">Customer Satisfaction</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Ticket Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Auto-assign tickets</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email notifications</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">SMS notifications</span>
                      <input type="checkbox" className="toggle" />
                    </div>
                    <div>
                      <Label>Default Priority</Label>
                      <Select defaultValue="medium">
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
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SLA Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label>Response Time Target</Label>
                      <Select defaultValue="2">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 hour</SelectItem>
                          <SelectItem value="2">2 hours</SelectItem>
                          <SelectItem value="4">4 hours</SelectItem>
                          <SelectItem value="8">8 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Resolution Time Target</Label>
                      <Select defaultValue="24">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="4">4 hours</SelectItem>
                          <SelectItem value="8">8 hours</SelectItem>
                          <SelectItem value="24">24 hours</SelectItem>
                          <SelectItem value="48">48 hours</SelectItem>
                          <SelectItem value="72">72 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Escalation Time</Label>
                      <Select defaultValue="4">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 hours</SelectItem>
                          <SelectItem value="4">4 hours</SelectItem>
                          <SelectItem value="8">8 hours</SelectItem>
                          <SelectItem value="12">12 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// Create Ticket Form Component
function CreateTicketForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'technical',
    requester: {
      name: '',
      email: '',
      role: 'User'
    },
    assignee: null,
    dueDate: '',
    tags: [],
    status: 'open'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Title</Label>
          <Input
            placeholder="Brief description of the issue"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}>
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
        <div>
          <Label>Category</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
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
        <div>
          <Label>Requester Name</Label>
          <Input
            placeholder="Full name"
            value={formData.requester.name}
            onChange={(e) => setFormData(prev => ({ 
              ...prev, 
              requester: { ...prev.requester, name: e.target.value }
            }))}
            required
          />
        </div>
        <div>
          <Label>Requester Email</Label>
          <Input
            type="email"
            placeholder="email@example.com"
            value={formData.requester.email}
            onChange={(e) => setFormData(prev => ({ 
              ...prev, 
              requester: { ...prev.requester, email: e.target.value }
            }))}
            required
          />
        </div>
        <div className="md:col-span-2">
          <Label>Description</Label>
          <Textarea
            placeholder="Detailed description of the issue..."
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={4}
            required
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit">Create Ticket</Button>
      </DialogFooter>
    </form>
  );
}
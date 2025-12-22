// Ticket API service for frontend integration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface Ticket {
  _id: string;
  ticketId: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'technical' | 'performance' | 'integration' | 'feature-request' | 'billing' | 'other';
  requester: {
    name: string;
    email: string;
    role: string;
    userId?: string;
  };
  assignee?: {
    name: string;
    email: string;
    agentId: string;
  };
  dueDate?: string;
  tags: string[];
  messages: TicketMessage[];
  attachments: TicketAttachment[];
  resolution?: {
    summary: string;
    resolvedBy: string;
    resolvedAt: string;
    resolutionTime: number;
  };
  satisfaction?: {
    rating: number;
    feedback: string;
    submittedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  messageId: string;
  sender: {
    name: string;
    email?: string;
    userId?: string;
    type: 'user' | 'agent' | 'system';
  };
  content: string;
  timestamp: string;
  isInternal: boolean;
}

export interface TicketAttachment {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface TicketStats {
  general: {
    total: number;
    open: number;
    inProgress: number;
    pending: number;
    resolved: number;
    closed: number;
    avgResponseTime: string;
    avgResolutionTime: string;
    satisfactionScore: number;
  };
  categories: Record<string, number>;
  priorities: Record<string, number>;
  agentPerformance: Array<{
    _id: string;
    name: string;
    email: string;
    totalTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number;
    avgSatisfaction: number;
  }>;
}

export interface CreateTicketData {
  title: string;
  description: string;
  priority: string;
  category: string;
  requester: {
    name: string;
    email: string;
    role?: string;
    userId?: string;
  };
  assignee?: string;
  dueDate?: string;
  tags?: string[];
  message?: string;
  source?: string;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  category?: string;
  assignee?: string;
  requester?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

class TicketService {
  private async makeRequest(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('userToken');
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    };

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Get all tickets with filters and pagination
  async getTickets(filters: TicketFilters = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const url = `/tickets${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest(url);
  }

  // Get ticket statistics
  async getTicketStats(filters: { startDate?: string; endDate?: string; category?: string; priority?: string } = {}): Promise<TicketStats> {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const url = `/tickets/stats${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest(url);
  }

  // Get single ticket
  async getTicket(ticketId: string): Promise<Ticket> {
    return this.makeRequest(`/tickets/${ticketId}`);
  }

  // Create new ticket
  async createTicket(ticketData: CreateTicketData): Promise<Ticket> {
    return this.makeRequest('/tickets', {
      method: 'POST',
      body: JSON.stringify(ticketData),
    });
  }

  // Update ticket
  async updateTicket(ticketId: string, updateData: Partial<CreateTicketData & { status?: string; resolution?: string }>): Promise<Ticket> {
    return this.makeRequest(`/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  // Add message to ticket
  async addMessage(ticketId: string, content: string, isInternal: boolean = false) {
    return this.makeRequest(`/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, isInternal }),
    });
  }

  // Assign ticket
  async assignTicket(ticketId: string, assigneeId: string) {
    return this.makeRequest(`/tickets/${ticketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId }),
    });
  }

  // Escalate ticket
  async escalateTicket(ticketId: string, reason: string, escalateToId?: string) {
    return this.makeRequest(`/tickets/${ticketId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason, escalateToId }),
    });
  }

  // Submit satisfaction rating
  async submitSatisfaction(ticketId: string, rating: number, feedback?: string) {
    return this.makeRequest(`/tickets/${ticketId}/satisfaction`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  }

  // Delete ticket (admin only)
  async deleteTicket(ticketId: string) {
    return this.makeRequest(`/tickets/${ticketId}`, {
      method: 'DELETE',
    });
  }

  // Bulk operations
  async bulkUpdate(operation: string, ticketIds: string[], data: any) {
    return this.makeRequest('/tickets/bulk', {
      method: 'POST',
      body: JSON.stringify({ operation, ticketIds, data }),
    });
  }

  // Get agents
  async getAgents() {
    return this.makeRequest('/agents');
  }

  // Export tickets
  async exportTickets(format: 'json' | 'csv', filters: TicketFilters = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const url = `/tickets/export/${format}${queryString ? `?${queryString}` : ''}`;
    
    const token = localStorage.getItem('adminToken') || localStorage.getItem('userToken');
    
    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    if (format === 'json') {
      return response.json();
    } else {
      return response.text();
    }
  }

  // Real-time ticket updates (WebSocket simulation with polling)
  subscribeToUpdates(callback: (tickets: Ticket[]) => void, interval: number = 30000) {
    const poll = async () => {
      try {
        const response = await this.getTickets({ limit: 50 });
        callback(response.tickets);
      } catch (error) {
        console.error('Error polling ticket updates:', error);
      }
    };

    const intervalId = setInterval(poll, interval);
    
    // Initial poll
    poll();
    
    return () => clearInterval(intervalId);
  }

  // Chat integration helpers
  async getChatRelatedTickets(channelId?: string) {
    const filters: TicketFilters = {
      category: 'technical',
      search: 'chat'
    };

    if (channelId) {
      filters.search = `chat ${channelId}`;
    }

    return this.getTickets(filters);
  }

  async createChatIssueTicket(channelName: string, issueDescription: string, reportedBy: { name: string; email: string }) {
    const ticketData: CreateTicketData = {
      title: `Chat issue in #${channelName}`,
      description: `Issue reported in chat channel #${channelName}: ${issueDescription}`,
      priority: 'medium',
      category: 'technical',
      requester: reportedBy,
      tags: ['chat', 'channel', channelName],
      source: 'chat'
    };

    return this.createTicket(ticketData);
  }

  // Healthcare-specific ticket helpers
  async createEmergencyTicket(description: string, reportedBy: { name: string; email: string }) {
    const ticketData: CreateTicketData = {
      title: 'Emergency Support Required',
      description,
      priority: 'critical',
      category: 'technical',
      requester: reportedBy,
      tags: ['emergency', 'urgent', 'priority-1'],
      source: 'emergency'
    };

    return this.createTicket(ticketData);
  }

  async getHealthcareTickets() {
    return this.getTickets({
      search: 'patient medical doctor consultation emergency',
      limit: 50
    });
  }
}

export const ticketService = new TicketService();
export default TicketService;
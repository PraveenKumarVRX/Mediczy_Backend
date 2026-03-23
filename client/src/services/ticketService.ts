// Ticket API service for frontend integration
import api from '@/utils/api';
import axios from 'axios';

export interface Ticket {
  _id: string;
  ticketId: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'appointment-cancellation' | 'appointment-reschedule' | 'doctor-consultation' | 'health-checkup' | 'prescription' | 'health-report' | 'billing' | 'complaint' | 'other';
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
  private async makeRequest<T>(
    url: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; data?: any; params?: any; headers?: Record<string, string> } = {}
  ): Promise<T> {
    try {
      const response = await api.request<T>({
        url,
        method: options.method || 'GET',
        data: options.data,
        params: options.params,
        headers: options.headers,
      });
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as any)?.message ||
          error.message ||
          `HTTP error! status: ${error.response?.status}`;
        throw new Error(message);
      }
      throw error;
    }
  }

  // Get all tickets with filters and pagination
  async getTickets(filters: TicketFilters = {}) {
    const params: Record<string, any> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params[key] = value;
      }
    });

    return this.makeRequest('/tickets', { params });
  }

  // Get ticket statistics
  async getTicketStats(filters: { startDate?: string; endDate?: string; category?: string; priority?: string } = {}): Promise<TicketStats> {
    const params: Record<string, any> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params[key] = value;
      }
    });

    return this.makeRequest('/tickets/stats', { params });
  }

  // Get single ticket
  async getTicket(ticketId: string): Promise<Ticket> {
    return this.makeRequest(`/tickets/${ticketId}`);
  }

  // Create new ticket
  async createTicket(ticketData: CreateTicketData): Promise<Ticket> {
    return this.makeRequest('/tickets', { method: 'POST', data: ticketData });
  }

  // Update ticket
  async updateTicket(ticketId: string, updateData: Partial<CreateTicketData & { status?: string; resolution?: string }>): Promise<Ticket> {
    return this.makeRequest(`/tickets/${ticketId}`, { method: 'PUT', data: updateData });
  }

  // Add message to ticket
  async addMessage(ticketId: string, content: string, isInternal: boolean = false) {
    return this.makeRequest(`/tickets/${ticketId}/messages`, {
      method: 'POST',
      data: { content, isInternal },
    });
  }

  // Assign ticket
  async assignTicket(ticketId: string, assigneeId: string) {
    return this.makeRequest(`/tickets/${ticketId}/assign`, { method: 'POST', data: { assigneeId } });
  }

  // Escalate ticket
  async escalateTicket(ticketId: string, reason: string, escalateToId?: string) {
    return this.makeRequest(`/tickets/${ticketId}/escalate`, {
      method: 'POST',
      data: { reason, escalateToId },
    });
  }

  // Submit satisfaction rating
  async submitSatisfaction(ticketId: string, rating: number, feedback?: string) {
    return this.makeRequest(`/tickets/${ticketId}/satisfaction`, {
      method: 'POST',
      data: { rating, feedback },
    });
  }

  // Delete ticket (admin only)
  async deleteTicket(ticketId: string) {
    return this.makeRequest(`/tickets/${ticketId}`, { method: 'DELETE' });
  }

  // Bulk operations
  async bulkUpdate(operation: string, ticketIds: string[], data: any) {
    return this.makeRequest('/tickets/bulk', {
      method: 'POST',
      data: { operation, ticketIds, data },
    });
  }

  // Get agents
  async getAgents() {
    return this.makeRequest('/tickets/agents');
  }

  // Export tickets
  async exportTickets(format: 'json' | 'csv', filters: TicketFilters = {}) {
    const params: Record<string, any> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params[key] = value;
      }
    });

    if (format === 'json') {
      return this.makeRequest(`/tickets/export/${format}`, { params });
    }

    const response = await api.get(`/tickets/export/${format}`, {
      params,
      responseType: 'text' as any,
      transformResponse: [(data) => data],
    });
    return response.data as unknown as string;
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
import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true,
    match: /^TKT-\d{3,}$/
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxLength: 255
  },
  description: {
    type: String,
    required: true,
    maxLength: 2000
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'pending', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['technical', 'performance', 'integration', 'feature-request', 'billing', 'other'],
    required: true
  },
  requester: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    role: {
      type: String,
      enum: ['Patient', 'Doctor', 'Admin', 'Staff', 'User'],
      default: 'User'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  assignee: {
    name: String,
    email: String,
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  dueDate: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  messages: [{
    messageId: {
      type: String,
      required: true
    },
    sender: {
      name: {
        type: String,
        required: true
      },
      email: String,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      type: {
        type: String,
        enum: ['user', 'agent', 'system'],
        required: true
      }
    },
    content: {
      type: String,
      required: true,
      maxLength: 2000
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    isInternal: {
      type: Boolean,
      default: false
    },
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  attachments: [{
    fileName: {
      type: String,
      required: true
    },
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  resolution: {
    summary: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date,
    resolutionTime: Number // in minutes
  },
  satisfaction: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    submittedAt: Date
  },
  sla: {
    responseDeadline: Date,
    resolutionDeadline: Date,
    responseTime: Number, // in minutes
    resolutionTime: Number, // in minutes
    breached: {
      type: Boolean,
      default: false
    }
  },
  escalation: {
    level: {
      type: Number,
      default: 0
    },
    escalatedAt: Date,
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  },
  metadata: {
    source: {
      type: String,
      enum: ['web', 'email', 'chat', 'phone', 'whatsapp', 'api'],
      default: 'web'
    },
    userAgent: String,
    ipAddress: String,
    sessionId: String,
    referenceTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket'
    }
  },
  analytics: {
    firstResponseTime: Number, // in minutes
    totalResponseTime: Number, // in minutes
    reopenCount: {
      type: Number,
      default: 0
    },
    viewCount: {
      type: Number,
      default: 0
    },
    lastViewedAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ticketSchema.index({ status: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ 'requester.email': 1 });
ticketSchema.index({ 'assignee.email': 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ dueDate: 1 });
ticketSchema.index({ category: 1 });
ticketSchema.index({ tags: 1 });

// Virtual for ticket age
ticketSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)); // in days
});

// Virtual for is overdue
ticketSchema.virtual('isOverdue').get(function() {
  return this.dueDate && new Date() > this.dueDate && this.status !== 'resolved' && this.status !== 'closed';
});

// Virtual for response time status
ticketSchema.virtual('responseStatus').get(function() {
  if (!this.sla.responseDeadline) return 'no-sla';
  if (this.messages.some(msg => msg.sender.type === 'agent')) return 'responded';
  if (new Date() > this.sla.responseDeadline) return 'breached';
  return 'pending';
});

// Auto-generate ticket ID
ticketSchema.pre('save', async function(next) {
  if (!this.ticketId) {
    const count = await mongoose.model('Ticket').countDocuments();
    this.ticketId = `TKT-${String(count + 1).padStart(3, '0')}`;
  }
  
  // Calculate SLA deadlines
  if (this.isNew && !this.sla.responseDeadline) {
    const now = new Date();
    const responseHours = this.priority === 'critical' ? 1 : 
                         this.priority === 'high' ? 2 : 
                         this.priority === 'medium' ? 4 : 8;
    
    const resolutionHours = this.priority === 'critical' ? 4 : 
                           this.priority === 'high' ? 8 : 
                           this.priority === 'medium' ? 24 : 72;
    
    this.sla.responseDeadline = new Date(now.getTime() + responseHours * 60 * 60 * 1000);
    this.sla.resolutionDeadline = new Date(now.getTime() + resolutionHours * 60 * 60 * 1000);
    
    // Set due date if not provided
    if (!this.dueDate) {
      this.dueDate = this.sla.resolutionDeadline;
    }
  }
  
  next();
});

// Update analytics on status change
ticketSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'resolved' || this.status === 'closed') {
      if (!this.resolution.resolvedAt) {
        this.resolution.resolvedAt = new Date();
        if (this.resolution.resolvedAt && this.createdAt) {
          this.resolution.resolutionTime = Math.floor(
            (this.resolution.resolvedAt - this.createdAt) / (1000 * 60)
          );
        }
      }
    }
    
    // Calculate first response time
    if (!this.analytics.firstResponseTime && this.messages.length > 0) {
      const firstAgentMessage = this.messages.find(msg => msg.sender.type === 'agent');
      if (firstAgentMessage) {
        this.analytics.firstResponseTime = Math.floor(
          (new Date(firstAgentMessage.timestamp) - this.createdAt) / (1000 * 60)
        );
      }
    }
  }
  
  next();
});

// Static methods for analytics
ticketSchema.statics.getStatistics = async function(filter = {}) {
  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
        avgResponseTime: { $avg: '$analytics.firstResponseTime' },
        avgResolutionTime: { $avg: '$resolution.resolutionTime' }
      }
    }
  ];
  
  const [stats] = await this.aggregate(pipeline);
  return stats || {
    total: 0, open: 0, inProgress: 0, pending: 0, resolved: 0, closed: 0,
    avgResponseTime: 0, avgResolutionTime: 0
  };
};

ticketSchema.statics.getCategoryStats = async function(filter = {}) {
  return this.aggregate([
    { $match: filter },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

ticketSchema.statics.getPriorityStats = async function(filter = {}) {
  return this.aggregate([
    { $match: filter },
    { $group: { _id: '$priority', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

ticketSchema.statics.getAgentPerformance = async function(filter = {}) {
  return this.aggregate([
    { $match: { ...filter, 'assignee.agentId': { $exists: true } } },
    {
      $group: {
        _id: '$assignee.agentId',
        name: { $first: '$assignee.name' },
        email: { $first: '$assignee.email' },
        totalTickets: { $sum: 1 },
        resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        avgResolutionTime: { $avg: '$resolution.resolutionTime' },
        avgSatisfaction: { $avg: '$satisfaction.rating' }
      }
    },
    { $sort: { resolvedTickets: -1 } }
  ]);
};

// Instance methods
ticketSchema.methods.addMessage = function(messageData) {
  const message = {
    messageId: `MSG-${Date.now()}`,
    ...messageData,
    timestamp: new Date()
  };
  
  this.messages.push(message);
  return this.save();
};

ticketSchema.methods.assignTo = function(agent) {
  this.assignee = {
    name: agent.name,
    email: agent.email,
    agentId: agent._id
  };
  
  if (this.status === 'open') {
    this.status = 'in-progress';
  }
  
  return this.save();
};

ticketSchema.methods.escalate = function(reason, escalateTo) {
  this.escalation.level += 1;
  this.escalation.escalatedAt = new Date();
  this.escalation.reason = reason;
  
  if (escalateTo) {
    this.escalation.escalatedTo = escalateTo;
    this.assignee = {
      name: escalateTo.name,
      email: escalateTo.email,
      agentId: escalateTo._id
    };
  }
  
  this.priority = this.priority === 'low' ? 'medium' : 
                  this.priority === 'medium' ? 'high' : 'critical';
  
  return this.save();
};

ticketSchema.methods.resolve = function(resolution, resolvedBy) {
  this.status = 'resolved';
  this.resolution = {
    summary: resolution,
    resolvedBy: resolvedBy,
    resolvedAt: new Date()
  };
  
  if (this.createdAt) {
    this.resolution.resolutionTime = Math.floor(
      (this.resolution.resolvedAt - this.createdAt) / (1000 * 60)
    );
  }
  
  return this.save();
};

export default mongoose.model('Ticket', ticketSchema);
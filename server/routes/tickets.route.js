import express from 'express';
import Ticket from '../models/ticket.model.js';
import { User } from '../models/user.model.intelligent.js';
import auth from '../middleware/auth.js';
import supportChat from '../services/support-chat-provider.service.js';

/**
 * Ticket chat mirroring. The RocketChat build created a private channel per ticket and posted a
 * notification to #GENERAL; Chatwoot has no channel-per-ticket concept, so notes are mirrored into
 * a Chatwoot conversation keyed by the ticket (and a shared "support-feed" thread in place of
 * #GENERAL). Every call is best-effort and never throws: creating or updating a ticket must not
 * depend on the chat workspace being reachable. Under RocketChat these calls were all failing and
 * logging once per ticket; postTicketNote() warns once per process instead.
 */
const ticketChat = {
  createChannel: async (name) => ({ created: false, reason: 'chatwoot_has_no_per_ticket_channel', name }),
  sendMessage: async (channel, text) => {
    const key = String(channel) === 'GENERAL' ? 'support-feed' : String(channel).replace(/^ticket-/, '');
    return supportChat.postTicketNote({ ticketId: key, body: text });
  },
};
import logger from '../config/logger.js';
import slaTracker from '../services/sla-tracker.service.js';
import closedLoopNotifier from '../services/closed-loop-notifier.service.js';

const router = express.Router();

// Get all tickets with filtering, sorting, and pagination
router.get('/', auth, async (req, res) => {
  try {
    const {
      status,
      priority,
      category,
      assignee,
      requester,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (assignee) filter['assignee.email'] = assignee;
    // SECURITY: a non-staff user may only see their OWN tickets. Previously the list was
    // unscoped, so any authenticated user received every user's tickets.
    const isStaff = req.user?.isAdmin === true
      || ['admin', 'super_admin', 'team', 'team_member', 'team_lead', 'support', 'support_agent', 'agent', 'hospital'].includes(req.user?.role);
    if (!isStaff) {
      filter['requester.email'] = req.user?.email || '__no_such_user__';
    } else if (requester) {
      filter['requester.email'] = requester;
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ticketId: { $regex: search, $options: 'i' } },
        { 'requester.name': { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const tickets = await Ticket.find(filter)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Ticket.countDocuments(filter);

    res.json({
      tickets,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Error fetching tickets', error: error.message });
  }
});

// Get ticket statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const { startDate, endDate, category, priority } = req.query;
    
    // Build filter for date range
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const [
      generalStats,
      categoryStats,
      priorityStats,
      agentPerformance
    ] = await Promise.all([
      Ticket.getStatistics(filter),
      Ticket.getCategoryStats(filter),
      Ticket.getPriorityStats(filter),
      Ticket.getAgentPerformance(filter)
    ]);

    // Calculate satisfaction score
    const satisfactionResult = await Ticket.aggregate([
      { $match: { ...filter, 'satisfaction.rating': { $exists: true } } },
      { $group: { _id: null, avgSatisfaction: { $avg: '$satisfaction.rating' } } }
    ]);

    const satisfactionScore = satisfactionResult[0]?.avgSatisfaction || 0;

    res.json({
      general: {
        ...generalStats,
        satisfactionScore: Number(satisfactionScore.toFixed(1)),
        avgResponseTime: generalStats.avgResponseTime ? 
          `${Math.round(generalStats.avgResponseTime / 60 * 10) / 10} hours` : 'N/A',
        avgResolutionTime: generalStats.avgResolutionTime ? 
          `${Math.round(generalStats.avgResolutionTime / (60 * 24) * 10) / 10} days` : 'N/A'
      },
      categories: categoryStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      priorities: priorityStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      agentPerformance
    });
  } catch (error) {
    console.error('Error fetching ticket statistics:', error);
    res.status(500).json({ message: 'Error fetching statistics', error: error.message });
  }
});

// Create ticket from WhatsApp conversation (no auth required for internal service)
// IMPORTANT: This route must come BEFORE /tickets/:id to avoid route conflicts
router.post('/from-whatsapp', async (req, res) => {
  try {
    const {
      phoneNumber,
      customerName,
      message,
      conversationHistory = [],
      priority = 'medium',
      category = 'technical'
    } = req.body;

    if (!phoneNumber || !customerName || !message) {
      return res.status(400).json({ 
        message: 'Missing required fields: phoneNumber, customerName, message' 
      });
    }

    // Simplified ticket creation for PostgreSQL model
    // Note: This creates a basic ticket. Full MongoDB features not available yet.
    const ticketNumber = `WA${Date.now()}`;
    
    logger.info(`Creating WhatsApp ticket for ${customerName} (${phoneNumber})`);

    // Mirror to the agent workspace (best-effort; ticket handling must not depend on it)
    try {
      const channelName = `ticket-${ticketNumber}`.toLowerCase();
      
      // Create private channel for ticket discussion (ignore if already exists)
      try {
        await ticketChat.createChannel(channelName, [], true);
        logger.info(`Mirrored ticket thread: ${channelName}`);
      } catch (channelError) {
        // Channel might already exist, that's okay
        logger.warn(`Channel creation note for ${channelName}:`, channelError.message);
      }
      
      // Post comprehensive notification to GENERAL channel
      const notificationMessage = `📱 *WhatsApp Ticket Request*\n\n` +
        `🎫 *Ticket:* ${ticketNumber}\n` +
        `👤 *Customer:* ${customerName}\n` +
        `📞 *Phone:* ${phoneNumber}\n` +
        `🔥 *Priority:* ${priority.toUpperCase()}\n` +
        `📌 *Category:* ${category}\n` +
        `💬 *Issue:* ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}\n\n` +
        `🗨️ *Discuss in:* #${channelName}\n` +
        `⏰ *Created:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

      await ticketChat.sendMessage('GENERAL', notificationMessage);
      
      // Try to post to ticket channel (might fail if channel doesn't exist)
      try {
        await ticketChat.sendMessage(channelName, notificationMessage);
      } catch (msgError) {
        logger.warn(`Could not post to ${channelName}:`, msgError.message);
      }
      
      // Post conversation history to ticket channel if available
      if (conversationHistory.length > 0) {
        try {
          const historyMessage = `📋 *Recent Conversation History:*\n\n` +
            conversationHistory.slice(-5).map((msg, idx) => 
              `${idx + 1}. ${msg.sender === 'user' ? '👤' : '🤖'} **${msg.sender === 'user' ? customerName : 'Dr. iSHA'}**: ${msg.content}`
            ).join('\n\n');
          
          await ticketChat.sendMessage(channelName, historyMessage);
        } catch (histError) {
          logger.warn('Could not post conversation history:', histError.message);
        }
      }
      
      logger.info(`Mirrored WhatsApp ticket to the agent workspace: ${channelName}`);
    } catch (rcError) {
      logger.error('Agent-workspace mirror error for WhatsApp ticket (non-fatal):', rcError.message);
      // Don't fail the whole request if the agent workspace is unreachable
    }

    res.status(201).json({
      success: true,
      ticket: {
        ticketId: ticketNumber,
        title: `WhatsApp Support: ${customerName}`,
        status: 'open',
        priority,
        category,
        phoneNumber,
        customerName
      },
      message: 'Ticket notification sent to the support team'
    });
  } catch (error) {
    console.error('Error creating WhatsApp ticket:', error);
    logger.error('WhatsApp ticket error:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Error creating ticket from WhatsApp', 
      error: error.message 
    });
  }
});

// ─── Routes that MUST come before /:id to avoid Express param capture ─────────

// Get agents for assignment
router.get('/agents', auth, async (req, res) => {
  try {
    const rows = await User.findAll({
      where: { role: ['admin', 'agent', 'support', 'team'] },
      attributes: ['id', 'uid', 'firstName', 'lastName', 'email', 'role'],
    });
    const agents = rows.map(u => ({
      _id:   u.uid || String(u.id),
      name:  `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      email: u.email,
      role:  u.role,
    }));
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Error fetching agents', error: error.message });
  }
});

// Export tickets
router.get('/export/:format', auth, async (req, res) => {
  try {
    const { format } = req.params;
    const { status, priority, category, startDate, endDate } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const tickets = await Ticket.find(filter).lean();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=tickets.json');
      return res.json(tickets);
    }

    if (format === 'csv') {
      const csvHeaders = [
        'Ticket ID', 'Title', 'Status', 'Priority', 'Category',
        'Requester Name', 'Requester Email', 'Assignee',
        'Created At', 'Resolved At', 'Resolution Time (hours)'
      ];
      const csvData = tickets.map(t => [
        t.ticketId || t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        t.category,
        t.requester?.name || '',
        t.requester?.email || '',
        t.assignee?.name || '',
        t.createdAt,
        t.resolution?.resolvedAt || '',
        t.resolution?.resolutionTime ? (t.resolution.resolutionTime / 60).toFixed(2) : ''
      ]);
      const csv = [csvHeaders, ...csvData].map(row => row.join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tickets.csv');
      return res.send(csv);
    }

    res.status(400).json({ message: 'Unsupported export format. Use json or csv.' });
  } catch (error) {
    console.error('Error exporting tickets:', error);
    res.status(500).json({ message: 'Error exporting tickets', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// Get single ticket by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // SECURITY: a non-staff user may only open their own ticket.
    const isStaff = req.user?.isAdmin === true
      || ['admin', 'super_admin', 'team', 'team_member', 'team_lead', 'support', 'support_agent', 'agent', 'hospital'].includes(req.user?.role);
    if (!isStaff && ticket.requester?.email && req.user?.email && ticket.requester.email !== req.user.email) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Increment view count
    ticket.analytics.viewCount += 1;
    ticket.analytics.lastViewedAt = new Date();
    await ticket.save();

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ message: 'Error fetching ticket', error: error.message });
  }
});

// Create new ticket
router.post('/', auth, async (req, res) => {
  try {
    const {
      title,
      description,
      priority = 'medium',
      category,
      requester,
      assignee,
      dueDate,
      tags = [],
      source = 'web'
    } = req.body;

    // Validate required fields
    if (!title || !category || !requester) {
      return res.status(400).json({ 
        message: 'Missing required fields: title, category, requester' 
      });
    }

    // Default description to title if not provided
    const ticketDescription = description || title;

    // Create ticket object
    const ticketData = {
      title,
      description: ticketDescription,
      priority,
      category,
      requester: {
        name: requester.name,
        email: requester.email,
        role: requester.role || 'User',
        userId: requester.userId || req.user.id
      },
      tags,
      metadata: {
        source,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    };

    if (dueDate) {
      ticketData.dueDate = new Date(dueDate);
    }

    // Assign ticket if assignee is provided
    if (assignee) {
      const agent = await User.findOne({ 
        $or: [{ email: assignee }, { _id: assignee }] 
      });
      
      if (agent) {
        ticketData.assignee = {
          name: agent.name,
          email: agent.email,
          agentId: agent._id
        };
        ticketData.status = 'in-progress';
      }
    }

    const ticket = new Ticket(ticketData);
    await ticket.save();

    // Add initial message if provided
    if (req.body.message) {
      await ticket.addMessage({
        sender: {
          name: requester.name,
          email: requester.email,
          userId: ticketData.requester.userId,
          type: 'user'
        },
        content: req.body.message
      });
    }

    // Mirror this ticket to the agent workspace
    try {
      const channelName = `ticket-${ticket.ticketId || ticket._id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      // Create private channel for ticket discussion
      await ticketChat.createChannel(channelName, [], true);
      
      // Post ticket creation notification to GENERAL channel
      const priorityEmoji = {
        'low': '🔵',
        'medium': '🟡',
        'high': '🟠',
        'critical': '🔴'
      }[priority] || '⚪';

      const categoryEmoji = {
        'appointment-cancellation': '❌',
        'appointment-reschedule': '📅',
        'doctor-consultation': '👨‍⚕️',
        'health-checkup': '🏥',
        'prescription': '💊',
        'health-report': '📋',
        'billing': '💳',
        'complaint': '⚠️',
        'technical': '🔧',
        'integration': '🔗',
        'performance': '⚡',
        'feature-request': '✨',
        'other': '📝'
      }[category] || '📋';

      const notificationMessage = `🎫 *New Support Ticket Created*\n\n` +
        `📋 *Ticket:* ${ticket.ticketId || ticket._id}\n` +
        `${priorityEmoji} *Priority:* ${priority.toUpperCase()}\n` +
        `${categoryEmoji} *Category:* ${category}\n` +
        `👤 *From:* ${requester.name} (${requester.email})\n` +
        `📌 *Title:* ${title}\n` +
        `📝 *Description:* ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n\n` +
        `💬 *Discuss in:* #${channelName}\n` +
        `⏰ *Created:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

      await ticketChat.sendMessage('GENERAL', notificationMessage);
      
      logger.info(`Mirrored ticket thread for ticket: ${channelName}`);
    } catch (rcError) {
      logger.error('Ticket chat mirroring error (non-fatal):', rcError.message);
      // Don't fail ticket creation if the agent workspace is unreachable
    }

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Error creating ticket', error: error.message });
  }
});

// Update ticket
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      category,
      assignee,
      dueDate,
      tags,
      resolution
    } = req.body;

    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Update basic fields
    if (title) ticket.title = title;
    if (description) ticket.description = description;
    if (priority) ticket.priority = priority;
    if (category) ticket.category = category;
    if (dueDate) ticket.dueDate = new Date(dueDate);
    if (tags) ticket.tags = tags;

    // Track if we need to send an agent-workspace notification
    let statusChanged = false;
    let oldStatus = ticket.status;

    // Handle status changes
    if (status && status !== ticket.status) {
      statusChanged = true;
      if (status === 'resolved' && resolution) {
        await ticket.resolve(resolution, req.user.id);
      } else {
        ticket.status = status;
      }
    }

    // Handle assignee changes
    if (assignee) {
      if (assignee === null) {
        ticket.assignee = undefined;
      } else {
        const agent = await User.findOne({ 
          $or: [{ email: assignee }, { _id: assignee }] 
        });
        
        if (agent) {
          await ticket.assignTo(agent);
        }
      }
    }

    await ticket.save();

    // ── Closed-loop feedback hooks on resolution ──────────────────────────────
    if (statusChanged && (status === 'resolved' || status === 'closed')) {
      const ticketId = String(ticket.ticketId || ticket._id);

      // Mark SLA as resolved (clears resolution_met_at if unset)
      slaTracker.recordMet(ticketId, 'resolution').catch(() => {});

      // Schedule 24-h follow-up rating request
      closedLoopNotifier.scheduleFollowup({
        ticketId,
        severity:       ticket.slaInfo?.severity,
        requesterName:  ticket.requester?.name,
        requesterEmail: ticket.requester?.email,
        requesterPhone: ticket.requester?.phone,
      }).catch(() => {});
    }

    // Send an agent-workspace notification for status changes
    if (statusChanged) {
      try {
        const channelName = `ticket-${ticket.ticketId || ticket._id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        const statusEmoji = {
          'open': '🆕',
          'in-progress': '⚙️',
          'pending': '⏸️',
          'resolved': '✅',
          'closed': '🔒'
        }[status] || '📝';

        const updateMessage = `${statusEmoji} *Ticket Status Updated*\n\n` +
          `📋 *Ticket:* ${ticket.ticketId || ticket._id}\n` +
          `📊 *Status:* ${oldStatus} → ${status}\n` +
          `👤 *Updated by:* ${req.user.name || 'System'}\n` +
          `⏰ *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` +
          (resolution ? `\n\n✅ *Resolution:* ${resolution}` : '');

        // Post to ticket channel
        await ticketChat.sendMessage(channelName, updateMessage);
        
        // Post major updates to GENERAL channel
        if (status === 'resolved' || status === 'closed') {
          await ticketChat.sendMessage('GENERAL', updateMessage);
        }
        
        logger.info(`Mirrored ticket update to the agent workspace: ${ticket.ticketId}`);
      } catch (rcError) {
        logger.error('Agent-workspace notification error (non-fatal):', rcError.message);
      }
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ message: 'Error updating ticket', error: error.message });
  }
});

// Add message to ticket
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content, isInternal = false } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // SECURITY: a non-staff user may only reply on their own ticket, and never post an internal note.
    const isStaff = req.user?.isAdmin === true
      || ['admin', 'super_admin', 'team', 'team_member', 'team_lead', 'support', 'support_agent', 'agent', 'hospital'].includes(req.user?.role);
    if (!isStaff && ticket.requester?.email && req.user?.email && ticket.requester.email !== req.user.email) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    const internalNote = isStaff ? isInternal : false;

    // Determine sender type
    const senderType = isStaff ? 'agent' : 'user';

    await ticket.addMessage({
      sender: {
        name: req.user.name,
        email: req.user.email,
        userId: req.user.id,
        type: senderType
      },
      content: content.trim(),
      isInternal: internalNote
    });

    // Mirror the message to the agent workspace
    try {
      const channelName = `ticket-${ticket.ticketId || ticket._id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      const senderIcon = senderType === 'agent' ? '👨‍💼' : '👤';
      const visibilityTag = internalNote ? ' 🔒 *[INTERNAL]*' : '';
      
      const chatMessage = `${senderIcon} *${req.user.name}*${visibilityTag}\n\n${content.trim()}`;
      
      await ticketChat.sendMessage(channelName, chatMessage);
      logger.info(`Mirrored message to the agent workspace: ${channelName}`);
    } catch (rcError) {
      logger.error('Agent-workspace message mirror error (non-fatal):', rcError.message);
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ message: 'Error adding message', error: error.message });
  }
});

// Assign ticket
router.post('/:id/assign', auth, async (req, res) => {
  try {
    const { assigneeId } = req.body;

    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const agent = await User.findById(assigneeId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    await ticket.assignTo(agent);

    // Add system message
    await ticket.addMessage({
      sender: {
        name: 'System',
        type: 'system'
      },
      content: `Ticket assigned to ${agent.name}`,
      isInternal: true
    });

    res.json(ticket);
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ message: 'Error assigning ticket', error: error.message });
  }
});

// Escalate ticket
router.post('/:id/escalate', auth, async (req, res) => {
  try {
    const { reason, escalateToId } = req.body;

    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    let escalateTo = null;
    if (escalateToId) {
      escalateTo = await User.findById(escalateToId);
      if (!escalateTo) {
        return res.status(404).json({ message: 'Escalation target not found' });
      }
    }

    await ticket.escalate(reason, escalateTo);

    // Add system message
    await ticket.addMessage({
      sender: {
        name: 'System',
        type: 'system'
      },
      content: `Ticket escalated to level ${ticket.escalation.level}. Reason: ${reason}`,
      isInternal: true
    });

    res.json(ticket);
  } catch (error) {
    console.error('Error escalating ticket:', error);
    res.status(500).json({ message: 'Error escalating ticket', error: error.message });
  }
});

// Submit satisfaction rating
router.post('/:id/satisfaction', async (req, res) => {
  try {
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.satisfaction = {
      rating,
      feedback: feedback || '',
      submittedAt: new Date()
    };

    await ticket.save();

    res.json({ message: 'Satisfaction rating submitted successfully' });
  } catch (error) {
    console.error('Error submitting satisfaction rating:', error);
    res.status(500).json({ message: 'Error submitting rating', error: error.message });
  }
});

// Delete ticket (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete tickets' });
    }

    const ticket = await Ticket.findOneAndDelete({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ message: 'Error deleting ticket', error: error.message });
  }
});

// Bulk operations
router.post('/bulk', auth, async (req, res) => {
  try {
    const { operation, ticketIds, data } = req.body;

    if (!operation || !ticketIds || !Array.isArray(ticketIds)) {
      return res.status(400).json({ message: 'Invalid bulk operation request' });
    }

    let updateData = {};
    let results = [];

    switch (operation) {
      case 'assign':
        if (!data.assigneeId) {
          return res.status(400).json({ message: 'Assignee ID is required' });
        }
        
        const agent = await User.findById(data.assigneeId);
        if (!agent) {
          return res.status(404).json({ message: 'Agent not found' });
        }

        updateData = {
          'assignee.name': agent.name,
          'assignee.email': agent.email,
          'assignee.agentId': agent._id,
          status: 'in-progress'
        };
        break;

      case 'updateStatus':
        if (!data.status) {
          return res.status(400).json({ message: 'Status is required' });
        }
        updateData = { status: data.status };
        break;

      case 'updatePriority':
        if (!data.priority) {
          return res.status(400).json({ message: 'Priority is required' });
        }
        updateData = { priority: data.priority };
        break;

      case 'addTags':
        if (!data.tags || !Array.isArray(data.tags)) {
          return res.status(400).json({ message: 'Tags array is required' });
        }
        await Ticket.updateMany(
          { _id: { $in: ticketIds } },
          { $addToSet: { tags: { $each: data.tags } } }
        );
        results = await Ticket.find({ _id: { $in: ticketIds } });
        return res.json({ message: 'Tags added successfully', results });

      default:
        return res.status(400).json({ message: 'Invalid operation' });
    }

    await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      { $set: updateData }
    );

    results = await Ticket.find({ _id: { $in: ticketIds } });
    res.json({ message: 'Bulk operation completed successfully', results });
  } catch (error) {
    console.error('Error performing bulk operation:', error);
    res.status(500).json({ message: 'Error performing bulk operation', error: error.message });
  }
});


export default router;

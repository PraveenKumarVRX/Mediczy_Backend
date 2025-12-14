import express from 'express';
import Ticket from '../models/ticket.model.intelligent.js';
import User from '../models/user.model.intelligent.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all tickets with filtering, sorting, and pagination
router.get('/tickets', auth, async (req, res) => {
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
    if (requester) filter['requester.email'] = requester;
    
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
router.get('/tickets/stats', auth, async (req, res) => {
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

// Get single ticket by ID
router.get('/tickets/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ 
      $or: [{ ticketId: req.params.id }, { _id: req.params.id }] 
    });

    if (!ticket) {
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
router.post('/tickets', auth, async (req, res) => {
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
    if (!title || !description || !category || !requester) {
      return res.status(400).json({ 
        message: 'Missing required fields: title, description, category, requester' 
      });
    }

    // Create ticket object
    const ticketData = {
      title,
      description,
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

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Error creating ticket', error: error.message });
  }
});

// Update ticket
router.put('/tickets/:id', auth, async (req, res) => {
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

    // Handle status changes
    if (status && status !== ticket.status) {
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
    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ message: 'Error updating ticket', error: error.message });
  }
});

// Add message to ticket
router.post('/tickets/:id/messages', auth, async (req, res) => {
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

    // Determine sender type
    const senderType = req.user.role === 'admin' || req.user.role === 'agent' ? 'agent' : 'user';

    await ticket.addMessage({
      sender: {
        name: req.user.name,
        email: req.user.email,
        userId: req.user.id,
        type: senderType
      },
      content: content.trim(),
      isInternal
    });

    res.json(ticket);
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ message: 'Error adding message', error: error.message });
  }
});

// Assign ticket
router.post('/tickets/:id/assign', auth, async (req, res) => {
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
router.post('/tickets/:id/escalate', auth, async (req, res) => {
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
router.post('/tickets/:id/satisfaction', async (req, res) => {
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
router.delete('/tickets/:id', auth, async (req, res) => {
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
router.post('/tickets/bulk', auth, async (req, res) => {
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

// Get agents for assignment
router.get('/agents', auth, async (req, res) => {
  try {
    const agents = await User.find({ 
      role: { $in: ['admin', 'agent', 'support'] } 
    }).select('name email role isOnline lastActivity');

    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Error fetching agents', error: error.message });
  }
});

// Export tickets
router.get('/tickets/export/:format', auth, async (req, res) => {
  try {
    const { format } = req.params;
    const {
      status,
      priority,
      category,
      startDate,
      endDate
    } = req.query;

    // Build filter
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
      res.json(tickets);
    } else if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = [
        'Ticket ID', 'Title', 'Status', 'Priority', 'Category',
        'Requester Name', 'Requester Email', 'Assignee',
        'Created At', 'Resolved At', 'Resolution Time (hours)'
      ];
      
      const csvData = tickets.map(ticket => [
        ticket.ticketId,
        `"${ticket.title}"`,
        ticket.status,
        ticket.priority,
        ticket.category,
        ticket.requester.name,
        ticket.requester.email,
        ticket.assignee ? ticket.assignee.name : '',
        ticket.createdAt,
        ticket.resolution.resolvedAt || '',
        ticket.resolution.resolutionTime ? (ticket.resolution.resolutionTime / 60).toFixed(2) : ''
      ]);

      const csv = [csvHeaders, ...csvData].map(row => row.join(',')).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tickets.csv');
      res.send(csv);
    } else {
      res.status(400).json({ message: 'Unsupported export format' });
    }
  } catch (error) {
    console.error('Error exporting tickets:', error);
    res.status(500).json({ message: 'Error exporting tickets', error: error.message });
  }
});

export default router;
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';
import { classifySentiment } from '../services/ai-brain/sentiment-classifier.service.js';

// Define ChatConversation model for PostgreSQL
// Note: Using camelCase field names to match existing table structure
const ChatConversationModel = sequelize.define('ChatConversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  conversationId: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  // Explicit user references for analytics and linking
  userId1: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id_1',
    comment: 'First participant user ID'
  },
  userId2: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id_2',
    comment: 'Second participant user ID'
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'direct'
  },
  participants: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  // Health diary tracking
  healthContext: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Health-related context from conversation (symptoms, medications, etc.)'
  },
  // Conversation categorization for analytics
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'general',
    comment: 'conversation category: general, medical, appointment, prescription, etc.'
  },
  // Archive status for retention/compliance
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived'
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastMessagePreview: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  messageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Total messages in conversation for analytics'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'chat_conversations',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    { fields: ['user_id_1'] },
    { fields: ['user_id_2'] },
    { fields: ['category'] },
    { fields: ['is_archived'] }
  ]
});

// Define ChatMessage model for PostgreSQL
const ChatMessageModel = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  conversationId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Sender user ID from users table'
  },
  senderType: {
    type: DataTypes.STRING(20),
    defaultValue: 'user'
  },
  recipientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Recipient user ID from users table'
  },
  recipientType: {
    type: DataTypes.STRING(20),
    defaultValue: 'doctor'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  messageType: {
    type: DataTypes.STRING(20),
    defaultValue: 'text',
    comment: 'text, image, audio, file, prescription, health_update'
  },
  // Health diary extraction fields
  healthKeywords: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Extracted health keywords: symptoms, medications, vitals'
  },
  healthSentiment: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'positive, neutral, negative for patient mood/health sentiment'
  },
  channel: {
    type: DataTypes.STRING(20),
    defaultValue: 'app',
    comment: 'app, whatsapp, email, chatwoot, sms'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'sent'
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'chat_messages',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    { fields: ['conversationId'] },
    { fields: ['senderId'] },
    { fields: ['recipientId'] },
    { fields: ['channel'] },
    { fields: ['healthSentiment'] },
    { fields: ['createdAt'] }
  ]
});

// Set up associations
ChatConversationModel.hasMany(ChatMessageModel, { foreignKey: 'conversationId', as: 'messages' });
ChatMessageModel.belongsTo(ChatConversationModel, { foreignKey: 'conversationId', as: 'conversation' });

/**
 * Intelligent Chat Model
 * Provides chat functionality using PostgreSQL
 */
class ChatModel {
  /**
   * Find or create a conversation between two users
   */
  async findOrCreateConversation(userId1, userId2, types = { user1: 'user', user2: 'doctor' }) {
    const conversationId = [userId1, userId2].sort().join('_');
    
    let conversation = await ChatConversationModel.findOne({ 
      where: { conversationId }
    });
    
    if (!conversation) {
      conversation = await ChatConversationModel.create({
        conversationId,
        userId1: Math.min(userId1, userId2),  // Store in consistent order for easier querying
        userId2: Math.max(userId1, userId2),
        type: 'direct',
        category: 'general',
        participants: [
          { id: userId1, type: types.user1 },
          { id: userId2, type: types.user2 }
        ]
      });
    }
    
    return conversation;
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationIdInput, messageData) {
    const { senderId, receiverId, text, senderType = 'user', messageType = 'text', attachments = [] } = messageData;
    
    // Find conversation by string ID or numeric ID
    let conversation;
    if (typeof conversationIdInput === 'string' && conversationIdInput.includes('_')) {
      conversation = await ChatConversationModel.findOne({ where: { conversationId: conversationIdInput } });
    } else {
      conversation = await ChatConversationModel.findByPk(conversationIdInput);
    }
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    // Create message
    const message = await ChatMessageModel.create({
      conversationId: conversation.id,
      senderId,
      senderType,
      recipientId: receiverId,
      recipientType: senderType === 'user' ? 'doctor' : 'user',
      content: text,
      messageType,
      attachments,
      status: 'sent',
      deliveredAt: new Date()
    });
    
    // Update conversation
    await conversation.update({
      lastMessagePreview: text,
      lastMessageAt: new Date()
    });

    // healthSentiment was defined on this model (comment: "patient mood/health
    // sentiment") but nothing ever computed it. Only classify the patient's own
    // messages, matching that comment. Fire-and-forget — never block message
    // delivery on this; the column fills in a moment after the message appears.
    if (senderType === 'user') {
      classifySentiment(text)
        .then((result) => result && message.update({ healthSentiment: result.sentiment }))
        .catch((err) => console.warn('[ChatModel] healthSentiment classification failed:', err.message));
    }

    return message;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationIdInput, userId) {
    // Find conversation
    let conversation;
    if (typeof conversationIdInput === 'string' && conversationIdInput.includes('_')) {
      conversation = await ChatConversationModel.findOne({ where: { conversationId: conversationIdInput } });
    } else {
      conversation = await ChatConversationModel.findByPk(conversationIdInput);
    }
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    // Mark messages as read
    await ChatMessageModel.update(
      { status: 'read', readAt: new Date() },
      { 
        where: { 
          conversationId: conversation.id,
          recipientId: userId,
          status: { [Op.ne]: 'read' }
        }
      }
    );
    
    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async findById(conversationIdInput) {
    if (typeof conversationIdInput === 'string' && conversationIdInput.includes('_')) {
      return ChatConversationModel.findOne({ 
        where: { conversationId: conversationIdInput },
        include: [{ model: ChatMessageModel, as: 'messages', order: [['createdAt', 'ASC']] }]
      });
    }
    return ChatConversationModel.findByPk(conversationIdInput, {
      include: [{ model: ChatMessageModel, as: 'messages', order: [['createdAt', 'ASC']] }]
    });
  }

  /**
   * Get user conversations
   */
  async findUserConversations(userId) {
    return ChatConversationModel.findAll({
      where: sequelize.literal(`participants @> '[{"id": ${userId}}]'`),
      order: [['lastMessageAt', 'DESC']]
    });
  }

  /**
   * Get conversation stats
   */
  async getStats() {
    const [conversations, messages] = await Promise.all([
      ChatConversationModel.count(),
      ChatMessageModel.count()
    ]);
    
    return {
      totalConversations: conversations,
      totalMessages: messages,
      activeConversations: conversations,
      avgMessagesPerConversation: conversations > 0 ? messages / conversations : 0
    };
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationIdInput, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    let conversation;
    if (typeof conversationIdInput === 'string' && conversationIdInput.includes('_')) {
      conversation = await ChatConversationModel.findOne({ where: { conversationId: conversationIdInput } });
    } else {
      conversation = await ChatConversationModel.findByPk(conversationIdInput);
    }
    
    if (!conversation) {
      return [];
    }
    
    return ChatMessageModel.findAll({
      where: { conversationId: conversation.id },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
  }

  /**
   * Get analytics for a specific user's conversations
   */
  async getUserConversationAnalytics(userId, startDate = null, endDate = null) {
    const whereClause = {
      [Op.or]: [
        { userId1: userId },
        { userId2: userId }
      ]
    };

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = startDate;
      if (endDate) whereClause.createdAt[Op.lte] = endDate;
    }

    const conversations = await ChatConversationModel.findAll({
      where: whereClause,
      include: [{
        model: ChatMessageModel,
        as: 'messages',
        attributes: ['id', 'createdAt', 'healthSentiment', 'channel']
      }],
      raw: false
    });

    return {
      totalConversations: conversations.length,
      totalMessages: conversations.reduce((sum, conv) => sum + (conv.messages?.length || 0), 0),
      conversations: conversations.map(conv => ({
        conversationId: conv.conversationId,
        category: conv.category,
        messageCount: conv.messages?.length || 0,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        healthSentiments: conv.messages?.map(m => m.healthSentiment).filter(s => s)
      }))
    };
  }

  /**
   * Extract health insights from conversations for health diary
   */
  async getUserHealthInsights(userId, startDate = null, endDate = null) {
    const whereClause = {
      [Op.or]: [
        { senderId: userId },
        { recipientId: userId }
      ]
    };

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = startDate;
      if (endDate) whereClause.createdAt[Op.lte] = endDate;
    }

    const messages = await ChatMessageModel.findAll({
      where: whereClause,
      attributes: ['id', 'content', 'healthKeywords', 'healthSentiment', 'channel', 'createdAt', 'messageType']
    });

    const healthMessages = messages.filter(m => m.healthKeywords || m.messageType === 'health_update');
    const sentiments = messages
      .filter(m => m.healthSentiment)
      .map(m => m.healthSentiment);

    return {
      totalMessages: messages.length,
      healthRelatedMessages: healthMessages.length,
      sentimentBreakdown: {
        positive: sentiments.filter(s => s === 'positive').length,
        neutral: sentiments.filter(s => s === 'neutral').length,
        negative: sentiments.filter(s => s === 'negative').length
      },
      channels: [...new Set(messages.map(m => m.channel))],
      healthInsights: healthMessages.map(m => ({
        date: m.createdAt,
        keywords: m.healthKeywords,
        sentiment: m.healthSentiment,
        type: m.messageType
      }))
    };
  }

  /**
   * Get conversation statistics for analytics dashboard
   */
  async getConversationStats(userId) {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const userConvs = {
      [Op.or]: [
        { userId1: userId },
        { userId2: userId }
      ]
    };

    const weekConvs = await ChatConversationModel.findAll({
      where: {
        ...userConvs,
        createdAt: { [Op.gte]: oneWeekAgo }
      }
    });

    const monthConvs = await ChatConversationModel.findAll({
      where: {
        ...userConvs,
        createdAt: { [Op.gte]: oneMonthAgo }
      }
    });

    const allConvs = await ChatConversationModel.findAll({
      where: userConvs
    });

    return {
      thisWeek: weekConvs.length,
      thisMonth: monthConvs.length,
      allTime: allConvs.length,
      averageConversationLength: allConvs.length > 0 ? Math.round(
        allConvs.reduce((sum, conv) => sum + (conv.messageCount || 0), 0) / allConvs.length
      ) : 0,
      lastConversationAt: allConvs.length > 0 ? 
        new Date(Math.max(...allConvs.map(c => c.lastMessageAt?.getTime() || 0))) : null
    };
  }

  /**
   * Archive old conversations for compliance
   */
  async archiveOldConversations(olderThanDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await ChatConversationModel.update(
      { 
        isArchived: true, 
        archivedAt: new Date() 
      },
      {
        where: {
          lastMessageAt: { [Op.lt]: cutoffDate },
          isArchived: false
        }
      }
    );

    return {
      archived: result[0],
      timestamp: new Date()
    };
  }
}

// Legacy compatibility exports
export class Conversation {
  static async findOrCreateConversation(userId1, userId2) {
    const chatModel = new ChatModel();
    return await chatModel.findOrCreateConversation(userId1, userId2);
  }
  
  static async findById(conversationId) {
    const chatModel = new ChatModel();
    return await chatModel.findById(conversationId);
  }
  
  static async find(query) {
    const chatModel = new ChatModel();
    if (query['participants.id']) {
      return await chatModel.findUserConversations(query['participants.id'].$eq || query['participants.id']);
    }
    return ChatConversationModel.findAll();
  }
  
  async addMessage(messageData) {
    const chatModel = new ChatModel();
    return await chatModel.addMessage(this.id || this._id || this.conversationId, messageData);
  }
  
  async markAsRead(userId) {
    const chatModel = new ChatModel();
    return await chatModel.markAsRead(this.id || this._id || this.conversationId, userId);
  }
}

export class Message {
  static async findAll(options) {
    return ChatMessageModel.findAll(options);
  }
  
  static async create(data) {
    return ChatMessageModel.create(data);
  }
  
  static async findByPk(id) {
    return ChatMessageModel.findByPk(id);
  }
}

export { ChatConversationModel, ChatMessageModel };
export default ChatModel;

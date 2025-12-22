import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

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
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'direct'
  },
  participants: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastMessagePreview: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'chat_conversations',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
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
    allowNull: false
  },
  senderType: {
    type: DataTypes.STRING(20),
    defaultValue: 'user'
  },
  recipientId: {
    type: DataTypes.INTEGER,
    allowNull: false
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
    defaultValue: 'text'
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
  updatedAt: 'updatedAt'
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
        type: 'direct',
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

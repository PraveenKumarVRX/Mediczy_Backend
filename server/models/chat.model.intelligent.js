import { connectToDb as getIntelligentDB } from '../db/mariadb.js';

/**
 * Intelligent Chat Model
 * Provides chat functionality using the intelligent database
 */
class ChatModel {
  constructor() {
    this.db = getIntelligentDB();
  }

  /**
   * Find or create a conversation between two users
   */
  async findOrCreateConversation(userId1, userId2) {
    const conversationId = [userId1, userId2].sort().join('_');
    
    let conversation = await this.db.Chat.findOne({ id: conversationId });
    
    if (!conversation) {
      conversation = await this.db.Chat.create({
        id: conversationId,
        participants: [
          { id: userId1, unreadCount: 0 },
          { id: userId2, unreadCount: 0 }
        ],
        messages: [],
        isActive: true,
        lastMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    return conversation;
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId, messageData) {
    const { senderId, receiverId, text, senderType } = messageData;
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: senderType === 'user' ? 'doctor' : 'user' },
      text,
      read: false,
      readAt: null,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    // Get conversation and add message
    const conversation = await this.db.Chat.findOne({ id: conversationId });
    if (conversation) {
      conversation.messages.push(message);
      conversation.lastMessage = {
        text,
        sender: senderId,
        senderModel: senderType === 'user' ? 'User' : 'Doctor',
        timestamp: message.timestamp
      };
      conversation.updatedAt = new Date().toISOString();
      
      // Update unread count for receiver
      const receiverParticipant = conversation.participants.find(p => p.id === receiverId);
      if (receiverParticipant) {
        receiverParticipant.unreadCount += 1;
      }
      
      await this.db.Chat.update(conversationId, conversation);
      return message;
    }
    
    throw new Error('Conversation not found');
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId, userId) {
    const conversation = await this.db.Chat.findOne({ id: conversationId });
    if (conversation) {
      // Reset unread count for user
      const userParticipant = conversation.participants.find(p => p.id === userId);
      if (userParticipant) {
        userParticipant.unreadCount = 0;
      }
      
      // Mark user's received messages as read
      conversation.messages.forEach(message => {
        if (message.receiver.id === userId && !message.read) {
          message.read = true;
          message.readAt = new Date().toISOString();
        }
      });
      
      conversation.updatedAt = new Date().toISOString();
      await this.db.Chat.update(conversationId, conversation);
      return conversation;
    }
    
    throw new Error('Conversation not found');
  }

  /**
   * Get conversation by ID
   */
  async findById(conversationId) {
    return await this.db.Chat.findOne({ id: conversationId });
  }

  /**
   * Get user conversations
   */
  async findUserConversations(userId) {
    return await this.db.Chat.findAll({
      where: {
        'participants.id': userId
      },
      sort: { 'lastMessage.timestamp': -1 }
    });
  }

  /**
   * Get conversation stats
   */
  async getStats() {
    const conversations = await this.db.Chat.findAll();
    const totalMessages = conversations.reduce((sum, conv) => sum + (conv.messages?.length || 0), 0);
    
    return {
      totalConversations: conversations.length,
      totalMessages,
      activeConversations: conversations.filter(conv => conv.isActive).length,
      avgMessagesPerConversation: conversations.length > 0 ? totalMessages / conversations.length : 0
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
    return await chatModel.db.Chat.findAll();
  }
  
  async addMessage(messageData) {
    const chatModel = new ChatModel();
    return await chatModel.addMessage(this.id || this._id, messageData);
  }
  
  async markAsRead(userId) {
    const chatModel = new ChatModel();
    return await chatModel.markAsRead(this.id || this._id, userId);
  }
}

export class Message {
  // Placeholder for message operations if needed
}

export default ChatModel;

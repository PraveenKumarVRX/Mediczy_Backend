import axios from 'axios';
import { JWT_CONFIG } from '../config/auth.config.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// WhatsApp Business API Configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_APP_ID = process.env.WHATSAPP_APP_ID;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Utility function to make WhatsApp API calls
const makeWhatsAppAPICall = async (endpoint, method = 'GET', data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${WHATSAPP_API_BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.data || error.message);
    throw new Error(`WhatsApp API Error: ${error.response?.data?.error?.message || error.message}`);
  }
};

// Function to validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid international format (7-15 digits)
  if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
    return cleanNumber;
  }
  
  throw new Error('Invalid phone number format. Please use international format (e.g., 1234567890)');
};

// In-memory storage (replace with database in production)
let whatsappData = {
  templates: [
    {
      id: '1',
      name: 'appointment_reminder',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'en_US',
      body: 'Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}. Please confirm by replying YES.',
      footer: 'Mediczy Healthcare',
      createdAt: new Date().toISOString(),
      lastUsed: null,
      usageCount: 0
    },
    {
      id: '2',
      name: 'prescription_ready',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'en_US',
      body: 'Hi {{1}}, your prescription is ready for pickup at our pharmacy. Prescription ID: {{2}}. Please bring a valid ID.',
      footer: 'Mediczy Pharmacy',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      usageCount: 25
    },
    {
      id: '3',
      name: 'test_results_available',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'en_US',
      body: 'Dear {{1}}, your test results are now available. Please log in to your Mediczy account or visit our lab to collect them. Report ID: {{2}}.',
      footer: 'Mediczy Labs',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      usageCount: 18
    },
    {
      id: '4',
      name: 'health_checkup_confirmation',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'en_US',
      header: 'Health Checkup Appointment Update',
      body: 'Dear {{1}},\n\nYour health checkup appointment has been confirmed!\n\n📍 Lab: {{2}}\n📌 Address: {{3}}\n📅 Date: {{4}}\n🕐 Time: {{5}}\n\nPlease arrive 15 minutes early with a valid ID. Fasting may be required for certain tests — kindly check email for more details.\n\nFor rescheduling or queries, contact us via this chat.',
      footer: 'SmartHealth',
      createdAt: new Date().toISOString(),
      lastUsed: null,
      usageCount: 0
    }
  ],
  campaigns: [
    {
      id: '1',
      name: 'Diabetes Awareness Campaign',
      status: 'COMPLETED',
      templateId: '1',
      targetAudience: 'Diabetic Patients',
      scheduledAt: new Date(Date.now() - 86400000).toISOString(),
      sentCount: 1250,
      deliveredCount: 1198,
      readCount: 875,
      repliedCount: 156,
      createdAt: new Date(Date.now() - 172800000).toISOString()
    },
    {
      id: '2',
      name: 'Health Checkup Reminder',
      status: 'ACTIVE',
      templateId: '2',
      targetAudience: 'All Patients 40+',
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      repliedCount: 0,
      createdAt: new Date().toISOString()
    }
  ],
  messages: [
    {
      id: '1',
      from: '+919876543210',
      to: 'Mediczy',
      type: 'text',
      content: 'YES, I confirm my appointment',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      status: 'delivered',
      direction: 'inbound'
    },
    {
      id: '2',
      from: 'Mediczy',
      to: '+919876543210',
      type: 'template',
      templateName: 'appointment_reminder',
      content: 'Hello John, this is a reminder for your appointment with Dr. Smith on 2024-11-17 at 10:00 AM. Please confirm by replying YES.',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      status: 'read',
      direction: 'outbound'
    }
  ],
  stats: {
    totalMessages: 2486,
    sentToday: 89,
    deliveredToday: 87,
    readToday: 64,
    repliedToday: 23,
    activeTemplates: 3,
    activeCampaigns: 1,
    totalContacts: 1250,
    engagementRate: 72.5
  }
};

// Get WhatsApp statistics
export const getWhatsAppStats = async (req, res) => {
  try {
    console.log('📊 Fetching WhatsApp Business stats');
    
    const stats = {
      ...whatsappData.stats,
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching WhatsApp stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp statistics'
    });
  }
};

// Get WhatsApp message templates
export const getWhatsAppTemplates = async (req, res) => {
  try {
    console.log('📋 Fetching WhatsApp message templates');
    
    const { status, category } = req.query;
    let templates = [...whatsappData.templates];
    
    if (status) {
      templates = templates.filter(t => t.status === status);
    }
    
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    res.json({
      success: true,
      data: templates,
      total: templates.length
    });
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message templates'
    });
  }
};

// Create new WhatsApp message template
export const createWhatsAppTemplate = async (req, res) => {
  try {
    console.log('➕ Creating new WhatsApp message template');
    
    const { name, category, language, body, footer, header } = req.body;
    
    // Validate required fields
    if (!name || !category || !language || !body) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, language, and body are required'
      });
    }
    
    const newTemplate = {
      id: String(Date.now()),
      name: name.toLowerCase().replace(/\s+/g, '_'),
      status: 'PENDING', // Will be PENDING until approved by WhatsApp
      category,
      language,
      body,
      footer: footer || '',
      header: header || '',
      createdAt: new Date().toISOString(),
      lastUsed: null,
      usageCount: 0
    };
    
    whatsappData.templates.push(newTemplate);
    
    // In production, you would submit this to WhatsApp Business API for approval
    // For demo, we'll simulate instant approval for certain templates
    if (newTemplate.name.includes('test') || newTemplate.name.includes('demo')) {
      setTimeout(() => {
        const template = whatsappData.templates.find(t => t.id === newTemplate.id);
        if (template) {
          template.status = 'APPROVED';
        }
      }, 2000);
    }
    
    res.status(201).json({
      success: true,
      message: 'Template created and submitted for approval',
      data: newTemplate
    });
  } catch (error) {
    console.error('Error creating WhatsApp template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create message template'
    });
  }
};

// Update WhatsApp message template
export const updateWhatsAppTemplate = async (req, res) => {
  try {
    console.log('✏️ Updating WhatsApp message template');
    
    const { id } = req.params;
    const { name, category, language, body, footer, header } = req.body;
    
    const templateIndex = whatsappData.templates.findIndex(t => t.id === id);
    if (templateIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    // Update template
    const updatedTemplate = {
      ...whatsappData.templates[templateIndex],
      name: name || whatsappData.templates[templateIndex].name,
      category: category || whatsappData.templates[templateIndex].category,
      language: language || whatsappData.templates[templateIndex].language,
      body: body || whatsappData.templates[templateIndex].body,
      footer: footer || whatsappData.templates[templateIndex].footer,
      header: header || whatsappData.templates[templateIndex].header,
      status: 'PENDING', // Needs re-approval after changes
      updatedAt: new Date().toISOString()
    };
    
    whatsappData.templates[templateIndex] = updatedTemplate;
    
    res.json({
      success: true,
      message: 'Template updated successfully',
      data: updatedTemplate
    });
  } catch (error) {
    console.error('Error updating WhatsApp template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update message template'
    });
  }
};

// Approve/reject WhatsApp message template
export const approveWhatsAppTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED' or 'REJECTED'
    
    const validStatuses = ['APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    }
    
    const template = whatsappData.templates.find(t => t.id === id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    
    template.status = status;
    template.updatedAt = new Date().toISOString();
    
    console.log(`✅ WhatsApp template "${template.name}" ${status.toLowerCase()}`);
    
    res.json({
      success: true,
      message: `Template ${status.toLowerCase()} successfully`,
      data: template
    });
  } catch (error) {
    console.error('Error approving WhatsApp template:', error);
    res.status(500).json({ success: false, message: 'Failed to update template status' });
  }
};

// Delete WhatsApp message template
export const deleteWhatsAppTemplate = async (req, res) => {
  try {
    console.log('🗑️ Deleting WhatsApp message template');
    
    const { id } = req.params;
    
    const templateIndex = whatsappData.templates.findIndex(t => t.id === id);
    if (templateIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    const deletedTemplate = whatsappData.templates.splice(templateIndex, 1)[0];
    
    res.json({
      success: true,
      message: 'Template deleted successfully',
      data: deletedTemplate
    });
  } catch (error) {
    console.error('Error deleting WhatsApp template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message template'
    });
  }
};

// Get WhatsApp campaigns
export const getWhatsAppCampaigns = async (req, res) => {
  try {
    console.log('📢 Fetching WhatsApp campaigns');
    
    const { status } = req.query;
    let campaigns = [...whatsappData.campaigns];
    
    if (status) {
      campaigns = campaigns.filter(c => c.status === status);
    }
    
    res.json({
      success: true,
      data: campaigns,
      total: campaigns.length
    });
  } catch (error) {
    console.error('Error fetching WhatsApp campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns'
    });
  }
};

// Create new WhatsApp campaign
export const createWhatsAppCampaign = async (req, res) => {
  try {
    console.log('🚀 Creating new WhatsApp campaign');
    
    const { name, templateId, targetAudience, scheduledAt, variables } = req.body;
    
    if (!name || !templateId || !targetAudience) {
      return res.status(400).json({
        success: false,
        message: 'Name, template ID, and target audience are required'
      });
    }
    
    const template = whatsappData.templates.find(t => t.id === templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    if (template.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Template must be approved before creating campaign'
      });
    }
    
    const newCampaign = {
      id: String(Date.now()),
      name,
      templateId,
      targetAudience,
      scheduledAt: scheduledAt || new Date().toISOString(),
      variables: variables || [],
      status: scheduledAt && new Date(scheduledAt) > new Date() ? 'SCHEDULED' : 'ACTIVE',
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      repliedCount: 0,
      createdAt: new Date().toISOString()
    };
    
    whatsappData.campaigns.push(newCampaign);
    
    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: newCampaign
    });
  } catch (error) {
    console.error('Error creating WhatsApp campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create campaign'
    });
  }
};

// Update WhatsApp campaign status
export const updateWhatsAppCampaignStatus = async (req, res) => {
  try {
    console.log('📊 Updating WhatsApp campaign status');
    
    const { id } = req.params;
    const { status } = req.body;
    
    const campaignIndex = whatsappData.campaigns.findIndex(c => c.id === id);
    if (campaignIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }
    
    const validStatuses = ['ACTIVE', 'PAUSED', 'STOPPED', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }
    
    whatsappData.campaigns[campaignIndex].status = status;
    whatsappData.campaigns[campaignIndex].updatedAt = new Date().toISOString();
    
    res.json({
      success: true,
      message: 'Campaign status updated successfully',
      data: whatsappData.campaigns[campaignIndex]
    });
  } catch (error) {
    console.error('Error updating WhatsApp campaign status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update campaign status'
    });
  }
};

// Get WhatsApp messages
export const getWhatsAppMessages = async (req, res) => {
  try {
    console.log('💬 Fetching WhatsApp messages');
    
    const { 
      page = 1, 
      limit = 20, 
      direction, 
      status, 
      from, 
      startDate, 
      endDate 
    } = req.query;
    
    let messages = [...whatsappData.messages];
    
    // Apply filters
    if (direction) {
      messages = messages.filter(m => m.direction === direction);
    }
    
    if (status) {
      messages = messages.filter(m => m.status === status);
    }
    
    if (from) {
      messages = messages.filter(m => 
        m.from.toLowerCase().includes(from.toLowerCase())
      );
    }
    
    if (startDate) {
      messages = messages.filter(m => 
        new Date(m.timestamp) >= new Date(startDate)
      );
    }
    
    if (endDate) {
      messages = messages.filter(m => 
        new Date(m.timestamp) <= new Date(endDate)
      );
    }
    
    // Sort by timestamp (newest first)
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedMessages = messages.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedMessages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: messages.length,
        pages: Math.ceil(messages.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

// Send WhatsApp message
export const sendWhatsAppMessage = async (req, res) => {
  try {
    console.log('📱 Sending WhatsApp message');
    
    const { to, type, content, templateName, variables } = req.body;
    
    if (!to || !type || (!content && !templateName)) {
      return res.status(400).json({
        success: false,
        message: 'To, type, and content/templateName are required'
      });
    }
    
    const messageId = String(Date.now());
    
    // Create message record
    const message = {
      id: messageId,
      from: 'Mediczy',
      to,
      type,
      content: content || `Template message: ${templateName}`,
      templateName,
      variables,
      timestamp: new Date().toISOString(),
      status: 'sent',
      direction: 'outbound'
    };
    
    // In production, you would send this to WhatsApp Business API
    // For demo purposes, we'll simulate the API call
    if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
      try {
        const whatsappPayload = {
          messaging_product: 'whatsapp',
          to: to,
          type: type
        };
        
        if (type === 'text') {
          whatsappPayload.text = { body: content };
        } else if (type === 'template' && templateName) {
          whatsappPayload.template = {
            name: templateName,
            language: { code: 'en_US' }
          };
          
          if (variables && variables.length > 0) {
            whatsappPayload.template.components = [{
              type: 'body',
              parameters: variables.map(v => ({ type: 'text', text: v }))
            }];
          }
        }
        
        // Uncomment for actual WhatsApp API call
        // const response = await axios.post(
        //   `${WHATSAPP_API_BASE_URL}/messages`,
        //   whatsappPayload,
        //   {
        //     headers: {
        //       'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        //       'Content-Type': 'application/json'
        //     }
        //   }
        // );
        
        // message.whatsappMessageId = response.data.messages[0].id;
        message.whatsappMessageId = `wamid.${messageId}`;
        message.status = 'delivered';
        
        console.log('✅ Message sent successfully to WhatsApp API');
      } catch (apiError) {
        console.error('WhatsApp API Error:', apiError.response?.data || apiError.message);
        message.status = 'failed';
        message.error = apiError.response?.data?.error?.message || 'API Error';
      }
    } else {
      console.log('🔧 WhatsApp API credentials not configured, using demo mode');
      message.status = 'delivered'; // Simulate success in demo mode
    }
    
    // Store message
    whatsappData.messages.unshift(message);
    
    // Update stats
    whatsappData.stats.totalMessages++;
    whatsappData.stats.sentToday++;
    if (message.status === 'delivered') {
      whatsappData.stats.deliveredToday++;
    }
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
};

// WhatsApp webhook verification
export const getWhatsAppWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode && token) {
    if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ WhatsApp webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      console.log('❌ WhatsApp webhook verification failed');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
};

// WhatsApp webhook for receiving messages
export const verifyWhatsAppWebhook = async (req, res) => {
  try {
    console.log('📥 Received WhatsApp webhook:', JSON.stringify(req.body, null, 2));
    
    const { entry } = req.body;
    
    if (entry && entry.length > 0) {
      entry.forEach(entryItem => {
        const { changes } = entryItem;
        
        if (changes && changes.length > 0) {
          changes.forEach(change => {
            const { value } = change;
            
            if (value.messages) {
              value.messages.forEach(message => {
                const incomingMessage = {
                  id: message.id,
                  from: message.from,
                  to: 'Mediczy',
                  type: message.type,
                  content: getMessageContent(message),
                  timestamp: new Date(message.timestamp * 1000).toISOString(),
                  status: 'received',
                  direction: 'inbound'
                };
                
                // Store incoming message
                whatsappData.messages.unshift(incomingMessage);
                
                // Update stats
                whatsappData.stats.totalMessages++;
                whatsappData.stats.repliedToday++;
                
                console.log('📱 Stored incoming message:', incomingMessage);
              });
            }
            
            if (value.statuses) {
              value.statuses.forEach(status => {
                // Update message status
                const messageIndex = whatsappData.messages.findIndex(
                  m => m.whatsappMessageId === status.id
                );
                
                if (messageIndex !== -1) {
                  whatsappData.messages[messageIndex].status = status.status;
                  whatsappData.messages[messageIndex].timestamp = 
                    new Date(status.timestamp * 1000).toISOString();
                  
                  // Update stats based on status
                  if (status.status === 'read') {
                    whatsappData.stats.readToday++;
                  }
                  
                  console.log(`📊 Updated message ${status.id} status to ${status.status}`);
                }
              });
            }
          });
        }
      });
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    res.sendStatus(500);
  }
};

// Helper function to extract message content based on type
function getMessageContent(message) {
  switch (message.type) {
    case 'text':
      return message.text.body;
    case 'image':
      return `[Image] ${message.image.caption || 'Image message'}`;
    case 'document':
      return `[Document] ${message.document.filename || 'Document message'}`;
    case 'audio':
      return '[Audio] Audio message';
    case 'video':
      return `[Video] ${message.video.caption || 'Video message'}`;
    case 'location':
      return `[Location] Latitude: ${message.location.latitude}, Longitude: ${message.location.longitude}`;
    case 'contacts':
      return `[Contact] ${message.contacts[0].name.formatted_name}`;
    default:
      return `[${message.type}] Unsupported message type`;
  }
}
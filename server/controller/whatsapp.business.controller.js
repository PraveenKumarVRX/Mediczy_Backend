import axios from 'axios';
import { JWT_CONFIG } from '../config/auth.config.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { scanOnly } from '../services/minio-upload.service.js';

// Facebook WhatsApp Business Manager API Configuration
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_PHONE_NUMBER = process.env.WHATSAPP_PHONE_NUMBER;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const FACEBOOK_GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';
const FACEBOOK_GRAPH_API_URL = process.env.FACEBOOK_GRAPH_API_URL || 'https://graph.facebook.com';

// Facebook Graph API utility function
const makeGraphAPICall = async (endpoint, method = 'GET', data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${FACEBOOK_GRAPH_API_URL}/${FACEBOOK_GRAPH_API_VERSION}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${FACEBOOK_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      if (data instanceof FormData) {
        config.data = data;
        config.headers = {
          ...config.headers,
          ...data.getHeaders()
        };
        delete config.headers['Content-Type'];
      } else {
        config.data = data;
      }
    }

    console.log(`🔗 Making Facebook Graph API call: ${method} ${config.url}`);
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('🚨 Facebook Graph API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    throw new Error(
      `Facebook Graph API Error: ${error.response?.data?.error?.message || 
                                   error.response?.data?.message || 
                                   error.message}`
    );
  }
};

// Validate phone number for WhatsApp (international format without +)
const validatePhoneNumber = (phoneNumber) => {
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
    return cleanNumber;
  }
  throw new Error('Invalid phone number. Use international format without + (e.g., 1234567890)');
};

// Verify Facebook App Access Token
export const verifyAppToken = async (req, res) => {
  try {
    const response = await makeGraphAPICall('/me');
    
    res.json({
      success: true,
      message: 'Facebook app token verified successfully',
      data: {
        appId: response.id,
        appName: response.name,
        tokenValid: true
      }
    });
  } catch (error) {
    console.error('Error verifying app token:', error);
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid Facebook app token'
    });
  }
};

// Get WhatsApp Business Account Information
export const getBusinessAccount = async (req, res) => {
  try {
    const response = await makeGraphAPICall(`/${WHATSAPP_BUSINESS_ACCOUNT_ID}?fields=id,name,timezone_offset_min,message_template_namespace,account_review_status`);
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Error fetching WhatsApp Business Account:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch business account'
    });
  }
};

// Get Phone Numbers associated with Business Account
export const getPhoneNumbers = async (req, res) => {
  try {
    const response = await makeGraphAPICall(`/${WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`);
    
    res.json({
      success: true,
      data: response.data || []
    });
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch phone numbers'
    });
  }
};

// Get Specific Phone Number Details
export const getPhoneNumberDetails = async (req, res) => {
  try {
    const response = await makeGraphAPICall(`/${WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,throughput,account_mode`);
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Error fetching phone number details:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch phone number details'
    });
  }
};

// Update Business Profile
export const updateBusinessProfile = async (req, res) => {
  try {
    const { about, address, description, email, profile_picture_url, websites, vertical } = req.body;

    const profileData = {};
    if (about) profileData.about = about;
    if (address) profileData.address = address;
    if (description) profileData.description = description;
    if (email) profileData.email = email;
    if (profile_picture_url) profileData.profile_picture_url = profile_picture_url;
    if (websites) profileData.websites = websites;
    if (vertical) profileData.vertical = vertical;

    const response = await makeGraphAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/whatsapp_business_profile`,
      'POST',
      profileData
    );

    res.json({
      success: true,
      message: 'Business profile updated successfully',
      data: response
    });
  } catch (error) {
    console.error('Error updating business profile:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update business profile'
    });
  }
};

// Send WhatsApp Message via Facebook Graph API
export const sendMessage = async (req, res) => {
  try {
    const { 
      to, 
      type, 
      text, 
      template, 
      interactive, 
      image, 
      document, 
      audio, 
      video, 
      location, 
      contacts 
    } = req.body;

    if (!to) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipient phone number is required' 
      });
    }

    const validatedPhoneNumber = validatePhoneNumber(to);
    
    const messageData = {
      messaging_product: "whatsapp",
      to: validatedPhoneNumber,
      type: type || 'text'
    };

    // Add message content based on type
    switch (type) {
      case 'text':
        if (!text || !text.body) {
          return res.status(400).json({
            success: false,
            error: 'Text body is required for text messages'
          });
        }
        messageData.text = text;
        break;

      case 'template':
        if (!template) {
          return res.status(400).json({
            success: false,
            error: 'Template data is required for template messages'
          });
        }
        messageData.template = template;
        break;

      case 'interactive':
        if (!interactive) {
          return res.status(400).json({
            success: false,
            error: 'Interactive data is required for interactive messages'
          });
        }
        messageData.interactive = interactive;
        break;

      case 'image':
        if (!image) {
          return res.status(400).json({
            success: false,
            error: 'Image data is required for image messages'
          });
        }
        messageData.image = image;
        break;

      case 'document':
        if (!document) {
          return res.status(400).json({
            success: false,
            error: 'Document data is required for document messages'
          });
        }
        messageData.document = document;
        break;

      case 'audio':
        if (!audio) {
          return res.status(400).json({
            success: false,
            error: 'Audio data is required for audio messages'
          });
        }
        messageData.audio = audio;
        break;

      case 'video':
        if (!video) {
          return res.status(400).json({
            success: false,
            error: 'Video data is required for video messages'
          });
        }
        messageData.video = video;
        break;

      case 'location':
        if (!location) {
          return res.status(400).json({
            success: false,
            error: 'Location data is required for location messages'
          });
        }
        messageData.location = location;
        break;

      case 'contacts':
        if (!contacts) {
          return res.status(400).json({
            success: false,
            error: 'Contacts data is required for contacts messages'
          });
        }
        messageData.contacts = contacts;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid message type. Supported types: text, template, interactive, image, document, audio, video, location, contacts'
        });
    }

    // Send message via Facebook Graph API
    const response = await makeGraphAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      'POST',
      messageData
    );

    res.json({
      success: true,
      message: 'WhatsApp message sent successfully',
      data: {
        messageId: response.messages[0].id,
        recipientId: response.contacts[0].wa_id,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send WhatsApp message'
    });
  }
};

// Send Template Message with Healthcare Templates
export const sendHealthcareTemplate = async (req, res) => {
  try {
    const { to, templateName, templateLanguage, components } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({
        success: false,
        error: 'Recipient and template name are required'
      });
    }

    const validatedPhoneNumber = validatePhoneNumber(to);

    const messageData = {
      messaging_product: "whatsapp",
      to: validatedPhoneNumber,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: templateLanguage || 'en_US'
        }
      }
    };

    // Add components if provided
    if (components && components.length > 0) {
      messageData.template.components = components;
    }

    const response = await makeGraphAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      'POST',
      messageData
    );

    res.json({
      success: true,
      message: 'Healthcare template message sent successfully',
      data: {
        messageId: response.messages[0].id,
        recipientId: response.contacts[0].wa_id,
        templateName,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error sending healthcare template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send healthcare template'
    });
  }
};

// Upload Media to WhatsApp
export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    // AV scan before uploading to WhatsApp API
    const avResult = await scanOnly(req.file.path);
    if (!avResult.clean) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'File rejected: malware detected'
      });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));
    formData.append('type', req.file.mimetype);
    formData.append('messaging_product', 'whatsapp');

    const response = await axios({
      method: 'POST',
      url: `${WHATSAPP_API_BASE_URL}/${WHATSAPP_APP_ID}/media`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        ...formData.getHeaders()
      },
      data: formData
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: 'Media uploaded successfully',
      data: {
        mediaId: response.data.id,
        mediaType: req.file.mimetype
      }
    });

  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload media'
    });
  }
};

// Get Media URL
export const getMediaUrl = async (req, res) => {
  try {
    const { mediaId } = req.params;

    const response = await makeWhatsAppAPICall(`/${mediaId}`);

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error getting media URL:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get media URL'
    });
  }
};

// Create Message Template (Real API)
export const createMessageTemplate = async (req, res) => {
  try {
    const { 
      name, 
      category, 
      language, 
      components,
      allowCategoryChange 
    } = req.body;

    if (!name || !category || !components) {
      return res.status(400).json({
        success: false,
        error: 'Name, category, and components are required'
      });
    }

    const templateData = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category: category.toUpperCase(),
      language: language || 'en_US',
      components: components,
      allow_category_change: allowCategoryChange || false
    };

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
      'POST',
      templateData
    );

    res.json({
      success: true,
      message: 'Template created successfully',
      data: response
    });

  } catch (error) {
    console.error('Error creating message template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create template'
    });
  }
};

// Get Message Templates
export const getMessageTemplates = async (req, res) => {
  try {
    const { limit, fields } = req.query;
    
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (fields) params.append('fields', fields);

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?${params.toString()}`
    );

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error fetching message templates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch templates'
    });
  }
};

// Delete Message Template
export const deleteMessageTemplate = async (req, res) => {
  try {
    const { templateName } = req.params;

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
      'DELETE',
      { name: templateName }
    );

    res.json({
      success: true,
      message: 'Template deleted successfully',
      data: response
    });

  } catch (error) {
    console.error('Error deleting message template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete template'
    });
  }
};

// Set up webhook endpoint for receiving messages
export const handleWebhook = async (req, res) => {
  try {
    const { body } = req;

    // Verify webhook signature. Fixed 2026-09-18 per WABA production-readiness
    // review: this previously only checked the signature IF the header was
    // present — an attacker could bypass verification entirely by simply
    // omitting X-Hub-Signature-256. Now mandatory whenever a Meta app secret is
    // configured. With no secret it is skipped (with a warning) outside production
    // only, so local/dev works; in production the webhook is refused (fail closed).
    if (FACEBOOK_APP_SECRET) {
      const signature = req.headers['x-hub-signature-256'];
      if (!signature) {
        return res.status(401).json({ success: false, error: 'Missing webhook signature' });
      }
      // Meta signs the exact bytes it sent. Re-serialising the parsed body
      // (JSON.stringify) changes non-ASCII escaping/whitespace, which would
      // reject genuine webhooks carrying e.g. Hindi/Telugu text or emoji.
      const signedPayload = req.rawBody ?? JSON.stringify(body);
      const expectedSignature = crypto
        .createHmac('sha256', FACEBOOK_APP_SECRET)
        .update(signedPayload)
        .digest('hex');
      const expected = Buffer.from(`sha256=${expectedSignature}`);
      const received = Buffer.from(String(signature));
      const validSignature = expected.length === received.length && crypto.timingSafeEqual(expected, received);
      if (!validSignature) {
        return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      // Fail closed: without the app secret an unsigned POST cannot be told apart
      // from a forged one, so refuse rather than accept unauthenticated events.
      console.error('[WhatsApp Webhook] FACEBOOK_APP_SECRET is not configured — rejecting webhook in production.');
      return res.status(503).json({ success: false, error: 'Webhook not configured' });
    } else {
      console.warn('[WhatsApp Webhook] FACEBOOK_APP_SECRET not configured — signature verification skipped (non-production only).');
    }

    // Process webhook data
    if (body.object === 'whatsapp_business_account') {
      body.entry.forEach(entry => {
        entry.changes.forEach(change => {
          if (change.field === 'messages') {
            const messages = change.value.messages || [];
            const statuses = change.value.statuses || [];

            // Process incoming messages
            messages.forEach(message => {
              console.log('Received message:', message);
              // Store message in database
              // Trigger auto-responses if needed
            });

            // Process message status updates
            statuses.forEach(status => {
              console.log('Message status update:', status);
              // Update message status in database
            });
          }
        });
      });
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
};

// Verify webhook during setup
export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.error('Webhook verification failed');
    res.status(403).send('Forbidden');
  }
};

// Get Analytics and Insights
export const getAnalytics = async (req, res) => {
  try {
    const { start, end, granularity, metric_types } = req.query;

    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    if (granularity) params.append('granularity', granularity);
    if (metric_types) params.append('metric_types', metric_types);

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/analytics?${params.toString()}`
    );

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analytics'
    });
  }
};

// Get Phone Number Info
export const getPhoneNumberInfo = async (req, res) => {
  try {
    const response = await makeWhatsAppAPICall(`/${WHATSAPP_PHONE_NUMBER_ID}`);

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error fetching phone number info:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch phone number info'
    });
  }
};

// Register Phone Number
export const registerPhoneNumber = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        success: false,
        error: 'PIN is required for phone number registration'
      });
    }

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/register`,
      'POST',
      { pin }
    );

    res.json({
      success: true,
      message: 'Phone number registered successfully',
      data: response
    });

  } catch (error) {
    console.error('Error registering phone number:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register phone number'
    });
  }
};

// Request Verification Code
export const requestVerificationCode = async (req, res) => {
  try {
    const { code_method, language } = req.body;

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/request_code`,
      'POST',
      {
        code_method: code_method || 'SMS',
        language: language || 'en_US'
      }
    );

    res.json({
      success: true,
      message: 'Verification code requested',
      data: response
    });

  } catch (error) {
    console.error('Error requesting verification code:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to request verification code'
    });
  }
};

// Verify Phone Number
export const verifyPhoneNumber = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required'
      });
    }

    const response = await makeWhatsAppAPICall(
      `/${WHATSAPP_PHONE_NUMBER_ID}/verify_code`,
      'POST',
      { code }
    );

    res.json({
      success: true,
      message: 'Phone number verified successfully',
      data: response
    });

  } catch (error) {
    console.error('Error verifying phone number:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify phone number'
    });
  }
};

// Get Media Information
export const getMediaInfo = async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID is required'
      });
    }

    const response = await makeGraphAPICall(`/${mediaId}`);
    
    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error fetching media info:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch media information'
    });
  }
};

// Download Media
export const downloadMedia = async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID is required'
      });
    }

    // Get media info first
    const mediaInfo = await makeGraphAPICall(`/${mediaId}`);
    
    // Download the media file
    const mediaResponse = await axios.get(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${FACEBOOK_ACCESS_TOKEN}`
      },
      responseType: 'stream'
    });

    // Set appropriate headers
    res.setHeader('Content-Type', mediaInfo.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${mediaInfo.id}"`);
    
    // Pipe the media stream to response
    mediaResponse.data.pipe(res);

  } catch (error) {
    console.error('Error downloading media:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download media'
    });
  }
};

// Send Bulk Messages
export const sendBulkMessages = async (req, res) => {
  try {
    const { recipients, message, send_immediately = false } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required and must not be empty'
      });
    }
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    // Mock bulk messaging for demo purposes  
    const results = {
      total_recipients: recipients.length,
      sent: recipients.map((recipient, index) => ({
        phone: typeof recipient === 'string' ? recipient : recipient.phone,
        name: recipient.name || null,
        status: 'sent',
        message_id: `msg_${Date.now()}_${index}`,
        timestamp: new Date().toISOString()
      })),
      failed: [],
      summary: {
        total: recipients.length,
        sent: recipients.length,
        failed: 0,
        success_rate: 100
      }
    };

    res.json({
      success: true,
      message: 'Bulk messaging completed (mock implementation)',
      data: results
    });

  } catch (error) {
    console.error('Error sending bulk messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send bulk messages'
    });
  }
};

// Create Healthcare-specific Templates
export const createHealthcareTemplates = async (req, res) => {
  try {
    const healthcareTemplates = [
      {
        name: "appointment_reminder",
        category: "UTILITY",
        language: "en_US",
        status: 'APPROVED'
      },
      {
        name: "test_results_ready",
        category: "UTILITY", 
        language: "en_US",
        status: 'APPROVED'
      },
      {
        name: "prescription_ready",
        category: "UTILITY",
        language: "en_US", 
        status: 'APPROVED'
      }
    ];

    res.json({
      success: true,
      message: 'Healthcare templates creation process completed (mock implementation)',
      data: healthcareTemplates
    });

  } catch (error) {
    console.error('Error creating healthcare templates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create healthcare templates'
    });
  }
};

// Get Specific Message Template
export const getMessageTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required'
      });
    }

    // Mock template data
    const mockTemplate = {
      id: templateId,
      name: "appointment_reminder",
      category: "UTILITY",
      language: "en_US",
      status: "APPROVED",
      components: [
        {
          type: "HEADER",
          text: "🩺 Appointment Reminder"
        },
        {
          type: "BODY", 
          text: "Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}."
        }
      ],
      quality_score: {
        score: "HIGH"
      }
    };
    
    res.json({
      success: true,
      data: mockTemplate
    });

  } catch (error) {
    console.error('Error fetching message template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch message template'
    });
  }
};

// Default export for the module
export default {
  verifyAppToken,
  getBusinessAccount,
  getPhoneNumbers,
  getPhoneNumberDetails,
  getBusinessProfile: getBusinessAccount, // Alias for compatibility
  updateBusinessProfile,
  sendAdvancedMessage: sendMessage, // Alias for compatibility 
  sendMessage,
  sendHealthcareTemplate,
  uploadMedia,
  getMediaUrl,
  createMessageTemplate,
  getMessageTemplates,
  deleteMessageTemplate,
  handleWebhook,
  verifyWebhook,
  getAnalytics,
  getPhoneNumberInfo,
  registerPhoneNumber,
  requestVerificationCode,
  verifyPhoneNumber,
  
  // Additional Facebook WhatsApp Business Manager Functions
  getMediaInfo,
  downloadMedia,
  sendBulkMessages,
  createHealthcareTemplates,
  getMessageTemplate
};
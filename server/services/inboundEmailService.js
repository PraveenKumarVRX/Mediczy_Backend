import Imap from 'imap';
import simpleParser from 'mailparser';
import EmailInbox from '../models/emailInbox.model.js';
import { aiProcessEmail } from './aiEmailProcessor.service.js';
import { autoUpdatePortal } from './emailAutoUpdate.service.js';

class InboundEmailService {
  constructor() {
    this.connections = new Map(); // Store connections per team member
  }

  /**
   * Connect to IMAP server and fetch emails
   */
  async connectAndFetchEmails(teamMemberId, imapConfig) {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: imapConfig.email,
        password: imapConfig.password,
        host: imapConfig.host || 'imap.gmail.com',
        port: imapConfig.port || 993,
        tls: imapConfig.tls !== undefined ? imapConfig.tls : true,
        tlsOptions: { rejectUnauthorized: false }
      });

      const openInbox = (cb) => {
        imap.openBox('INBOX', false, cb);
      };

      imap.openBox('INBOX', false, async (err, box) => {
        if (err) {
          reject(new Error(`Failed to open INBOX: ${err.message}`));
          return;
        }

        try {
          // Fetch recent emails (unread + last 50)
          const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]];
          const results = await new Promise((res, rej) => {
            imap.search(searchCriteria, (err, results) => {
              if (err) rej(err);
              else res(results || []);
            });
          });

          if (results.length === 0) {
            imap.end();
            resolve({ success: true, newEmails: 0 });
            return;
          }

          const f = imap.fetch(results.slice(0, 50), { bodies: '' });
          const emails = [];

          f.on('message', async (msg, seqno) => {
            try {
              const email = await this.parseEmailMessage(msg, teamMemberId);
              emails.push(email);
            } catch (parseError) {
              console.error(`Error parsing email ${seqno}:`, parseError);
            }
          });

          f.on('error', (err) => {
            console.error('Fetch error:', err);
          });

          f.on('end', async () => {
            try {
              // Process all emails
              const savedEmails = await this.processAndSaveEmails(emails, teamMemberId);
              imap.end();
              resolve({ success: true, newEmails: savedEmails.length, savedEmails });
            } catch (error) {
              reject(error);
            }
          });
        } catch (error) {
          imap.end();
          reject(error);
        }
      });

      imap.on('error', (err) => {
        reject(new Error(`IMAP error: ${err.message}`));
      });

      imap.openBox('INBOX', false, (err) => {
        if (err) {
          reject(err);
          return;
        }
        imap.end();
      });
    });
  }

  /**
   * Parse email message from IMAP
   */
  async parseEmailMessage(msg, teamMemberId) {
    return new Promise((resolve, reject) => {
      simpleParser(msg, {}, async (err, parsed) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const email = {
            teamMemberId,
            messageId: parsed.messageId || `${Date.now()}-${Math.random()}`,
            from: parsed.from?.text || '',
            fromName: parsed.from?.text?.split('<')[0]?.trim() || '',
            subject: parsed.subject || '(No Subject)',
            body: parsed.text || '',
            htmlBody: parsed.html || '',
            attachments: this.extractAttachments(parsed.attachments),
            receivedAt: parsed.date || new Date(),
            threadId: parsed.inReplyTo || parsed.messageId,
            inReplyTo: parsed.inReplyTo
          };

          // Extract recipients
          if (parsed.to) {
            email.to = parsed.to.value?.map(t => t.address) || [];
          }
          if (parsed.cc) {
            email.cc = parsed.cc.value?.map(t => t.address) || [];
          }

          resolve(email);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Extract attachments from email
   */
  extractAttachments(attachments = []) {
    return attachments.map(att => ({
      filename: att.filename,
      mimeType: att.contentType,
      size: att.size,
      contentId: att.contentId,
      contentDisposition: att.contentDisposition,
      downloadUrl: `/api/team/emails/attachments/${att.contentId}` // Will be implemented
    }));
  }

  /**
   * Process and save emails with AI analysis
   */
  async processAndSaveEmails(emails, teamMemberId) {
    const savedEmails = [];

    for (const emailData of emails) {
      try {
        // Check if email already exists
        const existing = await EmailInbox.findOne({
          where: { messageId: emailData.messageId }
        });

        if (existing) {
          console.log(`Email ${emailData.messageId} already processed`);
          continue;
        }

        // Create email record
        const email = await EmailInbox.create(emailData);

        // Process with AI in background
        setTimeout(() => {
          this.processEmailWithAI(email).catch(err => {
            console.error(`AI processing failed for email ${email.id}:`, err);
          });
        }, 0);

        savedEmails.push(email);
      } catch (error) {
        console.error('Error saving email:', error);
      }
    }

    return savedEmails;
  }

  /**
   * Process email with AI and auto-update portal
   */
  async processEmailWithAI(email) {
    try {
      console.log(`🤖 Processing email ${email.id} with AI...`);

      // Analyze email content
      const aiAnalysis = await aiProcessEmail({
        subject: email.subject,
        body: email.body,
        from: email.from,
        teamMemberId: email.teamMemberId
      });

      // Update email with AI results
      await email.update({
        aiProcessed: true,
        aiSummary: aiAnalysis.summary,
        aiIntent: aiAnalysis.intent,
        aiEntities: aiAnalysis.entities,
        aiSentiment: aiAnalysis.sentiment,
        aiConfidence: aiAnalysis.confidence,
        priority: aiAnalysis.priority || 'normal'
      });

      console.log(`✅ AI analysis complete for email ${email.id}`);
      console.log(`   Intent: ${aiAnalysis.intent}`);
      console.log(`   Entities: ${JSON.stringify(aiAnalysis.entities)}`);

      // Auto-update portal if applicable
      if (aiAnalysis.intent !== 'other' && aiAnalysis.confidence > 0.7) {
        const updates = await autoUpdatePortal(email, aiAnalysis);
        
        if (updates.length > 0) {
          await email.update({
            autoUpdatesApplied: updates
          });
          console.log(`✨ Applied ${updates.length} auto-updates for email ${email.id}`);
        }
      }

      return email;
    } catch (error) {
      console.error(`Error processing email with AI:`, error);
      throw error;
    }
  }

  /**
   * Get inbox for team member
   */
  async getInbox(teamMemberId, options = {}) {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      labels = null,
      search = null
    } = options;

    const where = { teamMemberId };

    if (unreadOnly) {
      where.isRead = false;
    }

    if (labels) {
      where.labels = { $contains: labels };
    }

    if (search) {
      where[Op.or] = [
        { subject: { [Op.iLike]: `%${search}%` } },
        { body: { [Op.iLike]: `%${search}%` } },
        { from: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await EmailInbox.findAndCountAll({
      where,
      order: [['receivedAt', 'DESC']],
      limit,
      offset
    });

    return {
      emails: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      unreadCount: await EmailInbox.count({ where: { ...where, isRead: false } })
    };
  }

  /**
   * Mark email as read
   */
  async markAsRead(emailId) {
    return await EmailInbox.update(
      { isRead: true },
      { where: { id: emailId } }
    );
  }

  /**
   * Star/unstar email
   */
  async toggleStar(emailId) {
    const email = await EmailInbox.findByPk(emailId);
    if (!email) throw new Error('Email not found');

    email.isStarred = !email.isStarred;
    return await email.save();
  }

  /**
   * Delete email
   */
  async deleteEmail(emailId) {
    return await EmailInbox.destroy({
      where: { id: emailId }
    });
  }

  /**
   * Add label to email
   */
  async addLabel(emailId, label) {
    const email = await EmailInbox.findByPk(emailId);
    if (!email) throw new Error('Email not found');

    if (!email.labels.includes(label)) {
      email.labels = [...email.labels, label];
      await email.save();
    }

    return email;
  }

  /**
   * Sync emails periodically
   */
  async scheduledSync(teamMemberId, imapConfig) {
    try {
      const result = await this.connectAndFetchEmails(teamMemberId, imapConfig);
      console.log(`📧 Sync complete for team member ${teamMemberId}: ${result.newEmails} new emails`);
      return result;
    } catch (error) {
      console.error(`Sync failed for team member ${teamMemberId}:`, error);
      throw error;
    }
  }
}

export default new InboundEmailService();

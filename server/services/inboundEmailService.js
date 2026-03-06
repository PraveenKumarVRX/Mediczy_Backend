import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { Op } from 'sequelize';
import EmailInbox from '../models/emailInbox.model.js';
import { aiProcessEmail } from './aiEmailProcessor.service.js';
import { autoUpdatePortal } from './emailAutoUpdate.service.js';
import { detectEmailIntent, createAutoTicket } from './autoTicketService.js';
import { processEmailFull } from './emailAutoProcessService.js';

class InboundEmailService {
  constructor() {
    this.connections = new Map(); // Store connections per team member
  }

  /**
   * Connect to IMAP server and fetch emails
   * @param {number} teamMemberId
   * @param {object} imapConfig
   * @param {number} [daysBack=30]  - how many days back to search (default 30)
   */
  async connectAndFetchEmails(teamMemberId, imapConfig, daysBack = 30) {
    // Determine the furthest-back date we should fetch.
    // Use: (a) daysBack ceiling, or (b) 1 day before the earliest email
    // already stored — so we never miss a gap.
    let sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    try {
      const earliest = await EmailInbox.findOne({
        where: { teamMemberId },
        order: [['receivedAt', 'ASC']],
        attributes: ['receivedAt']
      });
      if (earliest) {
        // fetch 1 day before our earliest stored email to catch any gaps,
        // but no further back than daysBack
        const oneDayBefore = new Date(earliest.receivedAt.getTime() - 24 * 60 * 60 * 1000);
        if (oneDayBefore < sinceDate) sinceDate = oneDayBefore;
      }
    } catch (_) { /* non-fatal */ }

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: imapConfig.username || imapConfig.email,
        password: imapConfig.password,
        host: imapConfig.host || 'imap.gmail.com',
        port: imapConfig.port || 993,
        tls: imapConfig.tls !== undefined ? imapConfig.tls : true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 15000,
        connTimeout: 15000
      });

      imap.once('ready', () => {
        imap.openBox('INBOX', false, async (err) => {
          if (err) {
            imap.end();
            reject(new Error(`Failed to open INBOX: ${err.message}`));
            return;
          }

          try {
            const searchCriteria = ['ALL', ['SINCE', sinceDate]];
            console.log(`📥 IMAP SINCE date for team ${teamMemberId}: ${sinceDate.toISOString().slice(0, 10)}`);
            const results = await new Promise((res, rej) => {
              imap.search(searchCriteria, (err, results) => {
                if (err) rej(err);
                else res(results || []);
              });
            });

            console.log(`📥 IMAP search for team ${teamMemberId}: ${results.length} messages matched`);

            if (results.length === 0) {
              imap.end();
              resolve({ success: true, newEmails: 0 });
              return;
            }

            // Fetch up to 200 most recent messages (sort desc, take first 200)
            const toFetch = results.slice(-200);
            const f = imap.fetch(toFetch, { bodies: '' });
            const emails = [];
            const parseTasks = [];

            f.on('message', (msg, seqno) => {
              const task = this.parseEmailMessage(msg, teamMemberId)
                .then((email) => {
                  emails.push(email);
                })
                .catch((parseError) => {
                  console.error(`Error parsing email ${seqno}:`, parseError);
                });

              parseTasks.push(task);
            });

            f.on('error', (err) => {
              console.error('Fetch error:', err);
            });

            f.on('end', async () => {
              try {
                await Promise.allSettled(parseTasks);
                // Process all emails
                const savedEmails = await this.processAndSaveEmails(emails, teamMemberId);
                imap.end();
                resolve({ success: true, newEmails: savedEmails.length, savedEmails });
              } catch (error) {
                imap.end();
                reject(error);
              }
            });
          } catch (error) {
            imap.end();
            reject(error);
          }
        });
      });

      imap.once('error', (err) => {
        reject(new Error(`IMAP error: ${err.message}`));
      });

      imap.connect();
    });
  }

  /**
   * Parse email message from IMAP
   */
  async parseEmailMessage(msg, teamMemberId) {
    return new Promise((resolve, reject) => {
      let completed = false;

      msg.once('body', async (stream) => {
        if (completed) return;

        try {
          const parsed = await simpleParser(stream);

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

          if (parsed.to) {
            email.to = parsed.to.value?.map(t => t.address) || [];
          }
          if (parsed.cc) {
            email.cc = parsed.cc.value?.map(t => t.address) || [];
          }

          completed = true;
          resolve(email);
        } catch (error) {
          completed = true;
          reject(error);
        }
      });

      msg.once('error', (error) => {
        if (completed) return;
        completed = true;
        reject(error);
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
        // Check if email already exists for THIS team member
        const existing = await EmailInbox.findOne({
          where: { messageId: emailData.messageId, teamMemberId }
        });

        if (existing) {
          // Silently skip — only log at debug level to reduce noise
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
        console.error(`Error saving email (teamMember=${teamMemberId}, msgId=${emailData?.messageId?.substring(0,40)}):`, error?.message || error);
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

      // Auto-process: create ticket + save health report + update employee email
      try {
        // Run in background — non-blocking
        setImmediate(() => {
          processEmailFull(email).then(result => {
            const parts = [];
            if (result.ticketId)     parts.push(`ticket=${result.ticketId}`);
            if (result.reportSaved)  parts.push('report saved');
            if (result.emailUpdated) parts.push('employee email updated');
            if (parts.length)
              console.log(`[emailAutoProcess] email ${email.id}: ${parts.join(', ')}`);
          }).catch(e => console.error('[emailAutoProcess] error:', e.message));
        });
      } catch (atErr) {
        console.error('[emailAutoProcess] init error:', atErr.message);
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
      const labelList = Array.isArray(labels) ? labels : [labels];
      where.labels = { [Op.contains]: labelList };
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
  async scheduledSync(teamMemberId, imapConfig, daysBack = 30) {
    try {
      const result = await this.connectAndFetchEmails(teamMemberId, imapConfig, daysBack);
      console.log(`📧 Sync complete for team member ${teamMemberId}: ${result.newEmails} new emails`);
      return result;
    } catch (error) {
      console.error(`Sync failed for team member ${teamMemberId}:`, error);
      throw error;
    }
  }
}

export default new InboundEmailService();

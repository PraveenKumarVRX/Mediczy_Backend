/**
 * public-report.route.js
 *
 * Public (no-auth) endpoint for streaming health-report PDFs via
 * signed, time-limited JWT download tokens.
 *
 * GET /api/public/report-download/:token
 *
 * Token payload: { emailId, contentId, fileName, exp }
 * Generated in emailAutoProcessService.js — valid for 7 days.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import EmailInbox from '../models/emailInbox.model.js';
import logger from '../config/logger.js';

const router = express.Router();

router.get('/report-download/:token', async (req, res) => {
  const { token } = req.params;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn(`[publicReport] Invalid or expired token: ${err.message}`);
    return res.status(410).type('text/plain').send('This link has expired or is invalid.');
  }

  const { emailId, contentId, fileName } = payload;

  try {
    const email = await EmailInbox.findByPk(emailId);
    if (!email) {
      return res.status(404).type('text/plain').send('Report not found.');
    }

    const attachments = Array.isArray(email.attachments) ? email.attachments : [];
    const att = attachments.find(
      a => a.contentId === contentId || a.contentId === `<${contentId}>`
    );

    if (!att?.contentBase64) {
      logger.warn(`[publicReport] Attachment not found — emailId=${emailId} contentId=${contentId}`);
      return res.status(404).type('text/plain').send('Attachment not found.');
    }

    const buf = Buffer.from(att.contentBase64, 'base64');
    const safeFileName = (fileName || 'health-report.pdf').replace(/[^a-zA-Z0-9._\- ]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);

    logger.info(`[publicReport] Served report "${safeFileName}" from emailId=${emailId}`);
  } catch (err) {
    logger.error(`[publicReport] Error serving report: ${err.message}`);
    res.status(500).type('text/plain').send('Unable to retrieve report. Please try again later.');
  }
});

export default router;

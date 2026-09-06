/**
 * Admin/team corporate OPD & wellness wallet quoting tool.
 * Generic by design — takes whatever employee count, tiers, and
 * categories a prospect asks for; nothing here is specific to any one
 * deal.
 *
 *   POST /api/admin/corporate-quotes           — create + calculate a quote
 *   GET  /api/admin/corporate-quotes           — list saved quotes
 *   GET  /api/admin/corporate-quotes/:id       — get one quote
 *   PUT  /api/admin/corporate-quotes/:id       — update inputs + recalculate
 *   GET  /api/admin/corporate-quotes/:id/pdf   — generate/download the proposal PDF
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import {
  createCorporateQuote, updateCorporateQuote, listCorporateQuotes, getCorporateQuote,
} from '../../services/corporate-quote.service.js';
import { generateCorporateQuotePdf } from '../../services/corporate-quote-pdf.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const canQuote = requireRole(['admin', 'team']);

router.post('/', authUser, canQuote, async (req, res) => {
  try {
    const quote = await createCorporateQuote(req.body || {}, req.user?.id || null);
    return res.status(201).json({ success: true, data: { quote } });
  } catch (error) {
    console.error('[admin] POST /corporate-quotes error:', error.message);
    const status = /required|must be|must match|greater than zero/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to create quote' });
  }
});

router.get('/', authUser, canQuote, async (req, res) => {
  try {
    const quotes = await listCorporateQuotes();
    return res.json({ success: true, data: { quotes } });
  } catch (error) {
    console.error('[admin] GET /corporate-quotes error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load quotes' });
  }
});

router.get('/:id', authUser, canQuote, async (req, res) => {
  try {
    const quote = await getCorporateQuote(parseInt(req.params.id, 10));
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
    return res.json({ success: true, data: { quote } });
  } catch (error) {
    console.error('[admin] GET /corporate-quotes/:id error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load quote' });
  }
});

router.put('/:id', authUser, canQuote, async (req, res) => {
  try {
    const quote = await updateCorporateQuote(parseInt(req.params.id, 10), req.body || {});
    return res.json({ success: true, data: { quote } });
  } catch (error) {
    console.error('[admin] PUT /corporate-quotes/:id error:', error.message);
    const status = /not found/i.test(error.message) ? 404 : /required|must be|must match|greater than zero/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to update quote' });
  }
});

// Stream the PDF back directly through this already-authenticated route
// rather than mounting /pdfs as a static path — same reasoning as the
// existing claims/pre-auth PDF routes in hospital-insurance.route.js:
// a public static path would expose these documents with no auth check.
router.get('/:id/pdf', authUser, canQuote, async (req, res) => {
  try {
    const quote = await getCorporateQuote(parseInt(req.params.id, 10));
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
    const relativePath = await generateCorporateQuotePdf(quote);
    const filePath = path.join(__dirname, '..', '..', 'public', relativePath);
    const downloadName = `${quote.prospectName.replace(/[^a-z0-9]+/gi, '-')}-quote.pdf`;
    res.download(filePath, downloadName, (err) => {
      if (err && !res.headersSent) {
        console.error('[admin] quote PDF download error:', err.message);
        res.status(500).json({ success: false, message: 'Could not send PDF file' });
      }
    });
  } catch (error) {
    console.error('[admin] GET /corporate-quotes/:id/pdf error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to generate proposal PDF' });
  }
});

export default router;

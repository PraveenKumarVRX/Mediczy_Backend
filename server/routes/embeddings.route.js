import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  upsertEmbeddings,
  searchEmbeddings,
  listEmbeddings,
  deleteEmbedding,
  embeddingsStats
} from '../repositories/embeddings.repository.js';

const router = Router();

router.use(authUser);
router.use(requireRole('admin'));

router.post('/', async (req, res) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const result = await upsertEmbeddings(entries);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/search', async (req, res) => {
  try {
    const { vector, k, namespace, filter } = req.body;
    const results = await searchEmbeddings(vector, { k, namespace, filter });
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { namespace, limit, offset } = req.query;
    const rows = await listEmbeddings({
      namespace,
      limit: parseInt(limit || '50', 10),
      offset: parseInt(offset || '0', 10)
    });
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteEmbedding(req.params.id);
    res.status(200).json({ deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await embeddingsStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

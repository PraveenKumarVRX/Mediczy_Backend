/**
 * /api/mental-health — the My SmartHealth app's Mind & Mood sync (QA-09).
 *
 * A thin layer over the health diary, NOT a second store: a mood is a
 * health_diary row with entryType 'mood' (mood = the app's 1–5 intensity), a
 * journal entry is entryType 'note' tagged 'journal'. The web's diary and the
 * app therefore read and write one record. Rows are private (isPrivate) and
 * only ever the caller's own.
 *
 * Writes are idempotent on the app's clientId (its offline-store local id), so
 * a retried sync never duplicates an entry.
 *
 * Deliberately NOT here: assessments (PHQ-9/GAD-7 scoring is screening — a
 * governed SaMD feature, MED-MIND-001) and AI coaching (an ungoverned LLM
 * output). Those paths stay 404, which the app already treats as "not
 * available yet". Journal text is scanned for crisis language exactly like the
 * diary: the only effect is helpline numbers in the response; nothing is
 * flagged or reported (see utils/crisis-detection.js).
 */
import express from 'express';
import { Op } from 'sequelize';
import { HealthDiary } from '../models/postgres/ehr.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';
import { HELPLINES, detectCrisis, crisisSupportPayload } from '../utils/crisis-detection.js';

const router = express.Router();

/** The app's EMOTION_LIBRARY: id -> 1..5 (Great 5 … Struggling 1). */
export const MOOD_SCALE = Object.freeze({ very_positive: 5, positive: 4, neutral: 3, negative: 2, very_negative: 1 });
const JOURNAL_TAG = 'journal';
const SOURCE = 'msh-app';

const userIdOf = (req) => Number(req.user?.id);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clientIdOf = (v) => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) ? v : null);
const dateOr = (v, fallback) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : fallback; };
const bad = (res, message) => res.status(400).json({ success: false, message });
const withSupport = (body, ...text) => { const support = crisisSupportPayload(detectCrisis(...text)); return support ? { ...body, support } : body; };

/** 1..5 from moodId, else from a numeric intensity; null when neither is valid. */
export function moodScore(moodId, intensity) {
  if (moodId != null) return MOOD_SCALE[moodId] ?? null;
  const n = Number(intensity);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

const moodOut = (e) => ({
  id: e.id, moodId: e.data?.moodId ?? null, label: e.title ?? null, intensity: e.mood,
  note: e.description ?? null, recordedAt: e.entryDate, clientId: e.data?.clientId ?? null,
});
const journalOut = (e) => ({
  id: e.id, title: e.title ?? null, text: e.description ?? '', moodId: e.data?.moodId ?? null,
  createdAt: e.data?.clientCreatedAt ?? e.createdAt, updatedAt: e.updatedAt, clientId: e.data?.clientId ?? null,
});

const listQuery = (req) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const days = Math.min(Math.max(Number(req.query.days) || 0, 0), 3650);
  return { limit, since: days ? new Date(Date.now() - days * 86400000) : null };
};

async function findByClientId(userId, entryType, clientId) {
  if (!clientId) return null;
  return HealthDiary.findOne({ where: { userId, entryType, data: { clientId, source: SOURCE } } });
}

async function ownJournal(req) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return HealthDiary.findOne({ where: { id, userId: userIdOf(req), entryType: 'note', tags: { [Op.contains]: [JOURNAL_TAG] } } });
}

/* ─── Moods ─── */

router.post('/moods/log', authUser, async (req, res) => {
  try {
    const userId = userIdOf(req);
    const { moodId, intensity } = req.body || {};
    const score = moodScore(moodId, intensity);
    if (score == null) return bad(res, 'moodId must be one of ' + Object.keys(MOOD_SCALE).join(', ') + ' (or intensity 1–5)');
    const clientId = clientIdOf(req.body?.clientId);
    const existing = await findByClientId(userId, 'mood', clientId);
    if (existing) return res.json({ success: true, duplicate: true, data: moodOut(existing) });

    const note = clean(req.body?.note, 2000);
    const entry = await HealthDiary.create({
      userId, entryType: 'mood', entryDate: dateOr(req.body?.recordedAt, new Date()),
      title: clean(req.body?.label, 120) || null, description: note || null, mood: score,
      data: { source: SOURCE, clientId, moodId: moodId ?? null }, tags: ['mind'], isPrivate: true,
    });
    return res.status(201).json(withSupport({ success: true, data: moodOut(entry) }, note));
  } catch (error) {
    console.error('[mental-health] mood log error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not save the mood' });
  }
});

router.get('/moods', authUser, async (req, res) => {
  try {
    const { limit, since } = listQuery(req);
    const rows = await HealthDiary.findAll({
      where: { userId: userIdOf(req), entryType: 'mood', ...(since ? { entryDate: { [Op.gte]: since } } : {}) },
      order: [['entryDate', 'DESC']], limit,
    });
    return res.json({ success: true, data: rows.map(moodOut) });
  } catch (error) {
    console.error('[mental-health] mood list error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not load moods' });
  }
});

/* ─── Journal ─── */

router.get('/journal', authUser, async (req, res) => {
  try {
    const { limit, since } = listQuery(req);
    const rows = await HealthDiary.findAll({
      where: { userId: userIdOf(req), entryType: 'note', tags: { [Op.contains]: [JOURNAL_TAG] }, ...(since ? { entryDate: { [Op.gte]: since } } : {}) },
      order: [['entryDate', 'DESC']], limit,
    });
    return res.json({ success: true, data: rows.map(journalOut) });
  } catch (error) {
    console.error('[mental-health] journal list error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not load the journal' });
  }
});

router.post('/journal', authUser, async (req, res) => {
  try {
    const userId = userIdOf(req);
    const text = clean(req.body?.text, 20000);
    if (!text) return bad(res, 'text is required');
    const { moodId } = req.body || {};
    if (moodId != null && MOOD_SCALE[moodId] == null) return bad(res, 'Unknown moodId');
    const clientId = clientIdOf(req.body?.clientId);
    const existing = await findByClientId(userId, 'note', clientId);
    if (existing) return res.json({ success: true, duplicate: true, data: journalOut(existing) });

    const title = clean(req.body?.title, 200);
    const createdAt = dateOr(req.body?.createdAt, new Date());
    const entry = await HealthDiary.create({
      userId, entryType: 'note', entryDate: createdAt, title: title || null, description: text,
      mood: moodId != null ? MOOD_SCALE[moodId] : null,
      data: { source: SOURCE, clientId, moodId: moodId ?? null, clientCreatedAt: createdAt.toISOString() },
      tags: [JOURNAL_TAG, 'mind'], isPrivate: true,
    });
    return res.status(201).json(withSupport({ success: true, data: journalOut(entry) }, title, text));
  } catch (error) {
    console.error('[mental-health] journal create error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not save the journal entry' });
  }
});

router.put('/journal/:id', authUser, async (req, res) => {
  try {
    const entry = await ownJournal(req);
    if (!entry) return res.status(404).json({ success: false, message: 'Journal entry not found' });
    const text = clean(req.body?.text, 20000);
    if (!text) return bad(res, 'text is required');
    const { moodId } = req.body || {};
    if (moodId != null && MOOD_SCALE[moodId] == null) return bad(res, 'Unknown moodId');
    const title = clean(req.body?.title, 200);
    await entry.update({
      title: title || null, description: text,
      ...(moodId !== undefined ? { mood: moodId == null ? null : MOOD_SCALE[moodId], data: { ...(entry.data || {}), moodId } } : {}),
    });
    return res.json(withSupport({ success: true, data: journalOut(entry) }, title, text));
  } catch (error) {
    console.error('[mental-health] journal update error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not update the journal entry' });
  }
});

router.delete('/journal/:id', authUser, async (req, res) => {
  try {
    const entry = await ownJournal(req);
    // Already gone counts as done, so a retried delete from the offline queue settles.
    if (!entry) return res.json({ success: true, deleted: false });
    await entry.destroy();
    return res.json({ success: true, deleted: true });
  } catch (error) {
    console.error('[mental-health] journal delete error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not delete the journal entry' });
  }
});

/* ─── Crisis resources: the one verified list (utils/crisis-detection.js) ─── */

router.get('/crisis/resources', authUser, (req, res) => {
  const data = HELPLINES.flatMap((h) => h.numbers.map((number, i) => ({
    id: `${h.id}${i ? `-${i + 1}` : ''}`, label: h.name, number,
    description: [h.hours, h.cost, h.languages].filter(Boolean).join(' · '), operator: h.operator, verifiedOn: h.verifiedOn,
  })));
  return res.json({ success: true, data });
});

export default router;

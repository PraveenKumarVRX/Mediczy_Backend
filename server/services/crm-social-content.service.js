import pool from '../db/pgPool.js';

const PLATFORMS = new Set([
  'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'pinterest',
  'threads', 'bluesky', 'google_business', 'mastodon', 'devto',
]);
const MAX_CAPTION_LENGTH = 5000;
const actorId = (user) => {
  const id = Number(user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function requireActor(user) {
  const id = actorId(user);
  if (!id) throw fail('A valid CRM user is required.', 401);
  return id;
}

function postId(value) {
  const id = String(value ?? '');
  if (!/^[1-9]\d*$/.test(id)) throw fail('Invalid post ID.');
  return id;
}

function parseDate(value, fieldName, { allowNull = false, futureOnly = false } = {}) {
  if ((value == null || value === '') && allowNull) return null;
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) throw fail(`${fieldName} must be a valid date.`);
  if (futureOnly && date.valueOf() <= Date.now()) throw fail(`${fieldName} must be in the future.`);
  return date;
}

function validateContent(input, { futurePlan = true } = {}) {
  const output = {};
  const caption = String(input.caption || '').trim();
  if (!caption || caption.length > MAX_CAPTION_LENGTH) {
    throw fail(`Caption is required and must be ${MAX_CAPTION_LENGTH} characters or fewer.`);
  }
  output.caption = caption;
  const selectedPlatforms = [...new Set(Array.isArray(input.platforms) ? input.platforms.map(String) : [])];
  if (!selectedPlatforms.length || selectedPlatforms.some((platform) => !PLATFORMS.has(platform))) {
    throw fail('Choose at least one supported social platform.');
  }
  output.platforms = selectedPlatforms;
  const overrides = input.platformCaptions ?? {};
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw fail('Platform-specific captions must be an object.');
  }
  const normalized = {};
  for (const [platform, value] of Object.entries(overrides)) {
    if (!selectedPlatforms.includes(platform) || !PLATFORMS.has(platform)) {
      throw fail('Caption overrides must belong to a selected platform.');
    }
    const override = String(value || '').trim();
    if (override.length > MAX_CAPTION_LENGTH) throw fail('Platform captions must be 5000 characters or fewer.');
    if (override) normalized[platform] = override;
  }
  output.platformCaptions = normalized;
  const mediaUrls = input.mediaUrls ?? [];
  if (!Array.isArray(mediaUrls) || mediaUrls.length > 20) {
    throw fail('Provide no more than 20 media URLs.');
  }
  output.mediaUrls = mediaUrls.map((value) => {
    const url = String(value || '').trim();
    let parsed;
    try { parsed = new URL(url); } catch { throw fail('Each media URL must be a valid HTTPS or HTTP URL.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || url.length > 2048) {
      throw fail('Each media URL must be a valid HTTPS or HTTP URL.');
    }
    return url;
  });
  const category = String(input.category || '').trim();
  if (category.length > 80) throw fail('Category must be 80 characters or fewer.');
  output.category = category || null;
  const tags = input.tags ?? [];
  if (!Array.isArray(tags)) throw fail('Tags must be provided as a list.');
  if (tags.length > 20) throw fail('Provide no more than 20 tags.');
  output.tags = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  if (output.tags.some((tag) => tag.length > 40)) throw fail('Each tag must be 40 characters or fewer.');
  output.plannedAt = parseDate(input.plannedAt, 'Planned date', { allowNull: true, futureOnly: futurePlan });
  return output;
}

async function insertEvent(db, { tenantUid, postId: id, action, fromStatus = null, toStatus = null, details = {}, actorUserId }) {
  await db.query(
    `INSERT INTO crm_social_post_events
       (tenant_uid, post_id, action, from_status, to_status, details, actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [tenantUid, id, action, fromStatus, toStatus, JSON.stringify(details), actorUserId],
  );
}

async function transaction(operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function selectPostSql(where = '') {
  return `SELECT id, unique_id AS "uniqueId", tenant_uid AS "tenantUid", caption, platforms,
                 platform_captions AS "platformCaptions", media_urls AS "mediaUrls",
                 category, tags, status, planned_at AS "plannedAt", submitted_at AS "submittedAt",
                 approved_by AS "approvedBy", approved_at AS "approvedAt",
                 rejection_reason AS "rejectionReason", created_by AS "createdBy",
                 updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt"
            FROM crm_social_posts ${where}`;
}

export async function listPosts(tenantUid, { from, to, status, limit = 200 } = {}) {
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), 500);
  const fromDate = from ? parseDate(from, 'from') : null;
  const toDate = to ? parseDate(to, 'to') : null;
  if (fromDate && toDate && fromDate >= toDate) throw fail('The calendar range is invalid.');
  const allowedStatuses = new Set(['draft', 'pending_approval', 'approved', 'rejected']);
  if (status && !allowedStatuses.has(status)) throw fail('Invalid post status.');
  const { rows } = await pool.query(
    `${selectPostSql('WHERE tenant_uid=$1 AND (planned_at IS NULL OR (($2::timestamptz IS NULL OR planned_at >= $2) AND ($3::timestamptz IS NULL OR planned_at < $3))) AND ($4::text IS NULL OR status=$4) ORDER BY planned_at ASC NULLS LAST, updated_at DESC LIMIT $5')}`,
    [tenantUid, fromDate, toDate, status || null, parsedLimit],
  );
  return rows;
}

export async function getPost(tenantUid, rawId) {
  const id = postId(rawId);
  const post = await pool.query(`${selectPostSql('WHERE tenant_uid=$1 AND id=$2')}`, [tenantUid, id]);
  if (!post.rows[0]) return null;
  const [comments, events] = await Promise.all([
    pool.query(
      `SELECT id, body, created_by AS "createdBy", created_at AS "createdAt"
         FROM crm_social_post_comments
        WHERE tenant_uid=$1 AND post_id=$2 ORDER BY created_at, id`,
      [tenantUid, id],
    ),
    pool.query(
      `SELECT id, action, from_status AS "fromStatus", to_status AS "toStatus",
              details, actor_user_id AS "actorUserId", created_at AS "createdAt"
         FROM crm_social_post_events
        WHERE tenant_uid=$1 AND post_id=$2 ORDER BY created_at, id`,
      [tenantUid, id],
    ),
  ]);
  return { ...post.rows[0], comments: comments.rows, events: events.rows };
}

export async function createPost(tenantUid, input, user) {
  const actor = requireActor(user);
  const content = validateContent(input || {});
  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO crm_social_posts
         (tenant_uid, caption, platforms, platform_captions, media_urls, category, tags,
          planned_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9,$9)
       RETURNING id`,
      [tenantUid, content.caption, content.platforms, JSON.stringify(content.platformCaptions),
        JSON.stringify(content.mediaUrls), content.category, JSON.stringify(content.tags),
        content.plannedAt, actor],
    );
    await insertEvent(client, { tenantUid, postId: rows[0].id, action: 'created', toStatus: 'draft', actorUserId: actor });
    return getPostFrom(client, tenantUid, rows[0].id);
  });
}

async function getPostFrom(db, tenantUid, id) {
  const { rows } = await db.query(`${selectPostSql('WHERE tenant_uid=$1 AND id=$2')}`, [tenantUid, id]);
  return rows[0] || null;
}

export async function updatePost(tenantUid, rawId, input, user) {
  const id = postId(rawId);
  const actor = requireActor(user);
  const requestedFields = ['caption', 'platforms', 'platformCaptions', 'mediaUrls', 'category', 'tags', 'plannedAt']
    .filter((key) => Object.hasOwn(input || {}, key));
  if (!requestedFields.length) throw fail('Provide at least one post field to update.');
  const fields = [
    ['caption', 'caption', (value) => value],
    ['platforms', 'platforms', (value) => value],
    ['platformCaptions', 'platform_captions', (value) => JSON.stringify(value)],
    ['mediaUrls', 'media_urls', (value) => JSON.stringify(value)],
    ['category', 'category', (value) => value],
    ['tags', 'tags', (value) => JSON.stringify(value)],
    ['plannedAt', 'planned_at', (value) => value],
  ];
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT status, caption, platforms, platform_captions AS "platformCaptions",
              media_urls AS "mediaUrls", category, tags, planned_at AS "plannedAt"
         FROM crm_social_posts WHERE tenant_uid=$1 AND id=$2 FOR UPDATE`,
      [tenantUid, id],
    );
    if (!current.rows[0]) return null;
    if (!['draft', 'rejected'].includes(current.rows[0].status)) throw fail('Only draft or rejected posts can be edited.', 409);
    const content = validateContent({ ...current.rows[0], ...input }, { futurePlan: requestedFields.includes('plannedAt') && new Date(input.plannedAt).valueOf() !== new Date(current.rows[0].plannedAt).valueOf() });
    const updatedFields = fields.filter(([key]) => requestedFields.includes(key));
    const values = [tenantUid, id];
    const assignments = updatedFields.map(([key, column, serialize]) => {
      values.push(serialize(content[key]));
      return `${column}=$${values.length}${['platformCaptions', 'mediaUrls', 'tags'].includes(key) ? '::jsonb' : ''}`;
    });
    values.push(actor);
    const { rows } = await client.query(
      `UPDATE crm_social_posts SET ${assignments.join(', ')}, updated_by=$${values.length}, updated_at=NOW()
        WHERE tenant_uid=$1 AND id=$2 RETURNING status`,
      values,
    );
    await insertEvent(client, { tenantUid, postId: id, action: 'updated', fromStatus: rows[0].status, toStatus: rows[0].status, actorUserId: actor, details: { fields: updatedFields.map(([key]) => key) } });
    return getPostFrom(client, tenantUid, id);
  });
}

async function transition(tenantUid, rawId, user, { from, to, action, details = {}, patch = {} }) {
  const id = postId(rawId);
  const actor = requireActor(user);
  return transaction(async (client) => {
    const current = await client.query('SELECT status, created_by FROM crm_social_posts WHERE tenant_uid=$1 AND id=$2 FOR UPDATE', [tenantUid, id]);
    if (!current.rows[0]) return null;
    if (!from.includes(current.rows[0].status)) throw fail(`Cannot ${action.replaceAll('_', ' ')} a post in ${current.rows[0].status} status.`, 409);
    if (action === 'approved' && Number(current.rows[0].created_by) === actor) {
      throw fail('A different CRM user must approve this post.', 403);
    }
    const patchEntries = Object.entries(patch);
    const values = [tenantUid, id, to, actor];
    const assignments = ['status=$3', 'updated_by=$4', 'updated_at=NOW()'];
    for (const [column, value] of patchEntries) {
      values.push(value);
      assignments.push(`${column}=$${values.length}`);
    }
    const { rows } = await client.query(
      `UPDATE crm_social_posts SET ${assignments.join(', ')} WHERE tenant_uid=$1 AND id=$2 RETURNING status`,
      values,
    );
    await insertEvent(client, { tenantUid, postId: id, action, fromStatus: current.rows[0].status, toStatus: rows[0].status, details, actorUserId: actor });
    return getPostFrom(client, tenantUid, id);
  });
}

export async function submitPost(tenantUid, id, user) {
  return transition(tenantUid, id, user, {
    from: ['draft', 'rejected'], to: 'pending_approval', action: 'submitted',
    patch: { submitted_at: new Date(), approved_by: null, approved_at: null, rejection_reason: null },
  });
}

export async function approvePost(tenantUid, id, user) {
  const actor = requireActor(user);
  return transition(tenantUid, id, user, {
    from: ['pending_approval'], to: 'approved', action: 'approved',
    patch: { approved_by: actor, approved_at: new Date(), rejection_reason: null },
  });
}

export async function rejectPost(tenantUid, id, input, user) {
  const reason = String(input?.reason || '').trim();
  if (!reason || reason.length > 1000) throw fail('A rejection reason is required (up to 1000 characters).');
  return transition(tenantUid, id, user, {
    from: ['pending_approval'], to: 'rejected', action: 'rejected',
    details: { reason }, patch: { approved_by: null, approved_at: null, rejection_reason: reason },
  });
}

export async function planPost(tenantUid, id, input, user) {
  const plannedAt = parseDate(input?.plannedAt, 'Planned date', { futureOnly: true });
  return transition(tenantUid, id, user, {
    from: ['approved'], to: 'approved', action: 'planned',
    details: { plannedAt: plannedAt.toISOString() }, patch: { planned_at: plannedAt },
  });
}

export async function addPostComment(tenantUid, rawId, input, user) {
  const id = postId(rawId);
  const actor = requireActor(user);
  const body = String(input?.body || '').trim();
  if (!body || body.length > 2000) throw fail('Comment is required and must be 2000 characters or fewer.');
  return transaction(async (client) => {
    const exists = await client.query('SELECT id FROM crm_social_posts WHERE tenant_uid=$1 AND id=$2 FOR UPDATE', [tenantUid, id]);
    if (!exists.rows[0]) return null;
    const { rows } = await client.query(
      `INSERT INTO crm_social_post_comments (tenant_uid, post_id, body, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [tenantUid, id, body, actor],
    );
    await insertEvent(client, { tenantUid, postId: id, action: 'comment_added', actorUserId: actor, details: { commentId: rows[0].id } });
    return getPostFrom(client, tenantUid, id);
  });
}

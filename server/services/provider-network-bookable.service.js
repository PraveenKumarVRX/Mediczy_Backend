/**
 * Makes a lab from the SmartHealth Provider Network bookable for chosen companies
 * (Team QA 2026-11-21, items 1-2).
 *
 * Two lists existed side by side: the Provider Network page publishes to
 * smarthealth_provider_network (the directory), while Team booking searches only
 * labs rows assigned to the company in corporate_network_assignments. A lab added
 * on the Provider Network page therefore never appeared when booking. This bridges
 * the two, one deliberate step per company: the Team picks the companies.
 *
 *   directory row --(match or create)--> labs row --(assign)--> corporate_network_assignments
 *
 * The labs row is linked back with metadata.providerNetworkId, so a second add
 * reuses it. An existing lab with the same name in the same city is reused rather
 * than duplicated. A created lab gets no usable login: its password is random and
 * never shown, and its email is the directory's or an undeliverable placeholder.
 * unique_id is left to the database trigger (entity UID rule 1).
 */
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pgPool.js';

const LAB_TYPES = ['lab', 'diagnostic_centre', 'diagnostic_center'];
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

export class BookableError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Published labs, with the companies each is already bookable for. */
export async function listDirectoryLabs({ search = '', limit = 50 } = {}, db = pool) {
  const s = text(search).slice(0, 80);
  const { rows } = await db.query(
    `SELECT d.id, d.name, d.address, d.city, d.state, d.pincode, d.phone, d.email, d.published_at,
            COALESCE(json_agg(DISTINCT jsonb_build_object('corporateId', c.id, 'name', c."companyName"))
                     FILTER (WHERE c.id IS NOT NULL), '[]') AS bookable_for
       FROM smarthealth_provider_network d
       LEFT JOIN labs l ON l.metadata->>'providerNetworkId' = d.id::text
       LEFT JOIN corporate_network_assignments n ON n.partner_id = l.id AND n.partner_type = 'lab'
       LEFT JOIN corporates c ON c.id = n.corporate_id
      WHERE d.provider_type = ANY($1)
        AND ($2 = '' OR concat_ws(' ', d.name, d.city, d.state, d.address, d.pincode) ILIKE '%' || $2 || '%')
      GROUP BY d.id
      ORDER BY d.published_at DESC NULLS LAST, d.id DESC
      LIMIT $3`,
    [LAB_TYPES, s, Math.min(Math.max(Number(limit) || 50, 1), 200)]
  );
  return rows.map((r) => ({
    id: String(r.id), name: r.name, address: r.address || null, city: r.city || null, state: r.state || null,
    pincode: r.pincode || null, phone: r.phone || null, publishedAt: r.published_at,
    bookableFor: r.bookable_for || [],
  }));
}

async function findOrCreateLab(client, entry) {
  const [linked] = (await client.query(`SELECT id FROM labs WHERE metadata->>'providerNetworkId' = $1 ORDER BY id LIMIT 1`, [String(entry.id)])).rows;
  if (linked) return { id: linked.id, created: false, matchedBy: 'link' };

  // The same lab may already be on the lab master (a bulk upload): same name, same city, and
  // the same branch. A chain has several branches per city (Likitha has three in Hyderabad),
  // so a branch with a different pincode is never reused, and when it is still not clear which
  // branch this is, a new lab is created rather than sending employees to the wrong address.
  const { rows: same } = await client.query(
    `SELECT l.id, COALESCE(l.address->>'pinCode', l.address->>'zipCode', l.address->>'pincode') AS pin
       FROM labs l
      WHERE lower(trim(l.name)) = lower(trim($1)) AND lower(trim(COALESCE(l.address->>'city', ''))) = lower(trim($2))
        AND COALESCE(l.status::text, 'active') = 'active'
      ORDER BY l.id`,
    [entry.name, entry.city]
  );
  const pin = text(entry.pincode);
  const samePin = pin ? same.filter((l) => text(l.pin) === pin) : [];
  const unknownPin = same.filter((l) => !text(l.pin));
  const pick = samePin.length === 1 ? samePin[0]
    : !samePin.length && (pin ? unknownPin : same).length === 1 ? (pin ? unknownPin : same)[0]
      : null;
  if (pick) {
    await client.query(
      `UPDATE labs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('providerNetworkId', $2::text), "updatedAt" = NOW() WHERE id = $1`,
      [pick.id, String(entry.id)]
    );
    return { id: pick.id, created: false, matchedBy: samePin.length ? 'name_city_pincode' : 'name_and_city' };
  }

  const directoryEmail = text(entry.email).toLowerCase();
  const emailFree = directoryEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(directoryEmail)
    && !(await client.query('SELECT 1 FROM labs WHERE lower(email) = $1', [directoryEmail])).rows.length;
  const email = emailFree ? directoryEmail : `provider-network-${entry.id}@no-login.mediqzy.invalid`;
  const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const { rows: [lab] } = await client.query(
    `INSERT INTO labs (name, email, password, "phoneNumber", address, status, metadata, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, 'active', $6::jsonb, NOW(), NOW())
     RETURNING id`,
    [
      entry.name, email, password, text(entry.phone),
      JSON.stringify({ street: text(entry.address), city: text(entry.city), state: text(entry.state), pinCode: text(entry.pincode) }),
      JSON.stringify({ providerNetworkId: String(entry.id), source: 'provider_network', noLogin: true }),
    ]
  );
  return { id: lab.id, created: true, matchedBy: null };
}

/**
 * @param {{ providerId: string|number, corporateIds: number[], actorUserId: number }} input
 * @returns {{ labId:number, created:boolean, matchedBy:string|null, added:object[], alreadyBookable:object[] }}
 */
export async function addDirectoryLabToNetworks({ providerId, corporateIds, actorUserId }, db = pool) {
  const ids = [...new Set((Array.isArray(corporateIds) ? corporateIds : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!ids.length) throw new BookableError(400, 'Choose at least one company');
  if (ids.length > 25) throw new BookableError(400, 'Choose at most 25 companies at a time');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [entry] } = await client.query(
      `SELECT id, provider_type, name, address, city, state, pincode, phone, email FROM smarthealth_provider_network WHERE id = $1 FOR UPDATE`,
      [String(providerId)]
    );
    if (!entry) throw new BookableError(404, 'Lab not found in the Provider Network');
    if (!LAB_TYPES.includes(entry.provider_type)) throw new BookableError(409, 'Only labs can be added to a company network for check-ups');
    if (!text(entry.name) || !text(entry.city)) throw new BookableError(409, 'This entry has no city. Add the city on the Provider Network page first, so employees know where the lab is.');

    const { rows: companies } = await client.query(
      `SELECT id, "companyName" AS name, status FROM corporates WHERE id = ANY($1::int[])`, [ids]
    );
    const missing = ids.filter((id) => !companies.some((c) => c.id === id));
    if (missing.length) throw new BookableError(404, `Company not found: ${missing.join(', ')}`);
    const inactive = companies.filter((c) => String(c.status).toLowerCase() !== 'active');
    if (inactive.length) throw new BookableError(409, `Not an active company: ${inactive.map((c) => c.name).join(', ')}`);

    const lab = await findOrCreateLab(client, entry);
    const added = [];
    const alreadyBookable = [];
    for (const company of companies) {
      // corporate_uid is filled by the uid-reference trigger on this table.
      const { rowCount } = await client.query(
        `INSERT INTO corporate_network_assignments (corporate_id, partner_id, partner_type, employee_ids, assigned_by, assigned_at)
         VALUES ($1, $2, 'lab', '"all"'::jsonb, $3, NOW())
         ON CONFLICT (corporate_id, partner_id, partner_type) DO NOTHING`,
        [company.id, lab.id, actorUserId || null]
      );
      (rowCount ? added : alreadyBookable).push({ corporateId: company.id, name: company.name });
    }
    await client.query('COMMIT');
    return { labId: lab.id, created: lab.created, matchedBy: lab.matchedBy, added, alreadyBookable };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export default { listDirectoryLabs, addDirectoryLabToNetworks };

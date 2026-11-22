#!/usr/bin/env node
/**
 * Sets up Chatwoot as the Team's WhatsApp desk for the My SmartHealth number (Gupshup).
 *
 *   node scripts/ssm-env-loader.mjs scripts/chatwoot-whatsapp-desk-setup.mjs            # dry run: reads only
 *   node scripts/ssm-env-loader.mjs scripts/chatwoot-whatsapp-desk-setup.mjs --apply    # creates what is missing
 *
 * Needs CHATWOOT_API_TOKEN (an administrator's access token, in SSM /mediczy/prod/) and optionally
 * CHATWOOT_ACCOUNT_ID. With --apply it creates, only if missing:
 *   1. an API inbox "WhatsApp <number>" in Chatwoot,
 *   2. an account webhook to this server (message_created, conversation_status_changed),
 *   3. a Chatwoot agent for every active Team user (Chatwoot emails each an invitation), skipping
 *      test logins, and adds them all to the inbox,
 *   4. the bridge rows in crm_chatwoot_accounts / crm_chatwoot_inboxes (tenant 7, My SmartHealth).
 * It never prints the token or the webhook secret. The desk stays off until CHATWOOT_ENABLED=true.
 */
import pool from '../db/pgPool.js';

const APPLY = process.argv.includes('--apply');
const BASE = (process.env.CHATWOOT_URL || 'https://chat.mediqzy.com').replace(/\/$/, '');
const TOKEN = process.env.CHATWOOT_API_TOKEN;
const WEBHOOK_URL = process.env.CHATWOOT_WEBHOOK_TARGET || 'https://app.mediqzy.com/api/chatwoot/webhook';
const TENANT_ID = 7; // tenants.id of "My SmartHealth"
const number = String(process.env.GUPSHUP_SOURCE_NUMBER || '').replace(/\D/g, '');
const local = number.slice(-10);
const INBOX_NAME = `WhatsApp ${local}`;
const TEST_LOGIN = /(^|[.@_-])test|tester|^crm@/i;

if (!TOKEN) { console.error('CHATWOOT_API_TOKEN is not set (put it in SSM /mediczy/prod/CHATWOOT_API_TOKEN).'); process.exit(2); }
if (number.length < 10) { console.error('GUPSHUP_SOURCE_NUMBER is not set.'); process.exit(2); }

async function cw(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, redirect: 'manual',
    headers: { api_access_token: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new Error(`Chatwoot ${method} ${path.replace(/\/accounts\/\d+/, '/accounts/:id')} -> HTTP ${res.status} ${(json?.message || json?.error || '').toString().slice(0, 160)}`);
  return json;
}
const step = (msg) => console.log(`${APPLY ? '' : '[dry run] '}${msg}`);

try {
  const profile = await cw('GET', '/api/v1/profile');
  const accounts = profile.accounts || [];
  const accountId = Number(process.env.CHATWOOT_ACCOUNT_ID) || (accounts.length === 1 ? accounts[0].id : null);
  const role = accounts.find((a) => a.id === accountId)?.role;
  console.log(`token belongs to ${profile.email} (${profile.name}); accounts: ${accounts.map((a) => `${a.id}:${a.name}:${a.role}`).join(', ')}`);
  if (!accountId) throw new Error('Several Chatwoot accounts; set CHATWOOT_ACCOUNT_ID');
  if (role !== 'administrator') throw new Error(`The token's user is "${role}" on account ${accountId}; an administrator token is needed`);
  const A = `/api/v1/accounts/${accountId}`;

  // 1. Inbox
  const inboxes = (await cw('GET', `${A}/inboxes`)).payload || [];
  let inbox = inboxes.find((i) => i.name === INBOX_NAME && i.channel_type === 'Channel::Api');
  if (inbox) step(`inbox exists: #${inbox.id} ${inbox.name}`);
  else if (APPLY) { inbox = await cw('POST', `${A}/inboxes`, { name: INBOX_NAME, channel: { type: 'api', webhook_url: '' } }); step(`inbox CREATED: #${inbox.id} ${INBOX_NAME}`); }
  else step(`would create API inbox "${INBOX_NAME}"`);

  // 2. Account webhook (signed; the bridge verifies X-Chatwoot-Signature)
  const hooks = (await cw('GET', `${A}/webhooks`)).payload?.webhooks || [];
  let hook = hooks.find((h) => h.url === WEBHOOK_URL);
  const subscriptions = ['message_created', 'conversation_status_changed'];
  if (hook) step(`webhook exists: #${hook.id} -> ${WEBHOOK_URL}`);
  else if (APPLY) {
    const created = await cw('POST', `${A}/webhooks`, { webhook: { url: WEBHOOK_URL, subscriptions } });
    hook = created.payload?.webhook || created.payload || created;
    step(`webhook CREATED: #${hook.id} -> ${WEBHOOK_URL}`);
  } else step(`would create webhook -> ${WEBHOOK_URL} (${subscriptions.join(', ')})`);
  if (hook) {
    const hasSecret = Boolean(hook.secret);
    console.log(hasSecret
      ? 'webhook signing secret: present. Store it as SSM /mediczy/prod/CHATWOOT_WEBHOOK_SECRET (copy it from Chatwoot > Settings > Integrations > Webhooks); it is not printed here.'
      : 'webhook signing secret: not returned by this Chatwoot version; check Settings > Integrations > Webhooks.');
  }

  // 3. Agents
  const { rows: team } = await pool.query(`SELECT id, "firstName", "lastName", lower(email) AS email FROM users WHERE role = 'team' AND status = 'active' AND email IS NOT NULL ORDER BY id`);
  const people = team.filter((u) => !TEST_LOGIN.test(u.email));
  const skipped = team.filter((u) => TEST_LOGIN.test(u.email));
  console.log(`active Team users: ${team.length}; agents: ${people.map((u) => u.email).join(', ') || 'none'}; skipped as test logins: ${skipped.map((u) => u.email).join(', ') || 'none'}`);
  const agents = await cw('GET', `${A}/agents`);
  const agentIds = [];
  for (const u of people) {
    let agent = (agents || []).find((a) => String(a.email).toLowerCase() === u.email);
    if (agent) step(`agent exists: ${u.email} (#${agent.id}, ${agent.role})`);
    else if (APPLY) {
      agent = await cw('POST', `${A}/agents`, { name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email, email: u.email, role: 'agent' });
      step(`agent CREATED: ${u.email} (#${agent.id}); Chatwoot has emailed an invitation`);
    } else step(`would create agent ${u.email} (Chatwoot emails an invitation)`);
    if (agent?.id) agentIds.push(agent.id);
  }
  if (inbox?.id && agentIds.length) {
    const members = (await cw('GET', `${A}/inbox_members/${inbox.id}`)).payload || [];
    const missing = agentIds.filter((id) => !members.some((m) => m.id === id));
    if (!missing.length) step('all agents are inbox members');
    else if (APPLY) { await cw('POST', `${A}/inbox_members`, { inbox_id: inbox.id, user_ids: [...members.map((m) => m.id), ...missing] }); step(`added ${missing.length} agent(s) to the inbox`); }
    else step(`would add ${missing.length} agent(s) to the inbox`);
  }

  // 4. Bridge rows
  if (APPLY && inbox?.id) {
    await pool.query(
      `INSERT INTO crm_chatwoot_accounts (tenant_id, account_id, api_token_env, webhook_secret_env, enabled)
       VALUES ($1, $2, 'CHATWOOT_API_TOKEN', 'CHATWOOT_WEBHOOK_SECRET', TRUE)
       ON CONFLICT (tenant_id) DO UPDATE SET account_id = EXCLUDED.account_id, enabled = TRUE`, [TENANT_ID, accountId]);
    await pool.query(
      `INSERT INTO crm_chatwoot_inboxes (tenant_id, inbox_id, channel, channel_address, provider, credentials_prefix, inbound_webhook_url, enabled)
       VALUES ($1, $2, 'whatsapp', $3, 'gupshup', 'GUPSHUP', NULL, TRUE)
       ON CONFLICT (channel, channel_address) DO UPDATE SET inbox_id = EXCLUDED.inbox_id, provider = 'gupshup', enabled = TRUE`,
      [TENANT_ID, inbox.id, `+${number}`]);
    step(`bridge rows saved (tenant ${TENANT_ID}, inbox #${inbox.id}, +${number})`);
  } else step(`would save bridge rows (tenant ${TENANT_ID}, +${number})`);

  console.log(`\nNext: SSM /mediczy/prod/CHATWOOT_WEBHOOK_SECRET and CHATWOOT_ENABLED=true, then reload the server.${APPLY ? '' : ' Nothing was changed.'}`);
} catch (error) {
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

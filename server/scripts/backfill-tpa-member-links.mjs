#!/usr/bin/env node
/**
 * Links existing TPA memberships to the accounts the corporate roster names.
 *
 *   node scripts/ssm-env-loader.mjs scripts/backfill-tpa-member-links.mjs            # report only
 *   node scripts/ssm-env-loader.mjs scripts/backfill-tpa-member-links.mjs --apply    # write the links
 *   ... --tpa=12          only this TPA
 *   ... --corporate=49    only this corporate
 *
 * Reports only by default. Nothing is written without --apply.
 *
 * Only an unambiguous roster match is applied. A membership whose employee
 * code matches two accounts, whose corporate name matches two employers, or
 * which carries no employee code at all is listed and left alone: an unlinked
 * member sees "no card linked yet", which a human can fix, while a wrongly
 * linked member sees someone else's insurance card, which they cannot.
 *
 * Safe to re-run — it only considers memberships with no account linked.
 */
import pool from '../db/pgPool.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { DECISION, autoLink, linkColumns, proposeLinksForTpa } from '../services/tpa-member-link.service.js';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const APPLY = process.argv.includes('--apply');
const onlyTpa = arg('tpa');
const onlyCorporate = arg('corporate');

const main = async () => {
  const columns = await linkColumns();
  if (!columns.memberUser) {
    console.log('tpa_members.user_id does not exist: apply 20261111000100 and 20261111000200 first.');
    return 1;
  }
  if (!columns.memberCorporate) {
    console.log('tpa_members.corporate_id does not exist: apply 20261111000200 first.');
    return 1;
  }

  const { rows: tpaRows } = await pool.query(
    onlyTpa
      ? 'SELECT DISTINCT tpa_id FROM tpa_members WHERE tpa_id = $1 AND user_id IS NULL'
      : 'SELECT DISTINCT tpa_id FROM tpa_members WHERE tpa_id IS NOT NULL AND user_id IS NULL ORDER BY 1',
    onlyTpa ? [Number(onlyTpa)] : []
  );

  if (!tpaRows.length) {
    console.log('No unlinked memberships found.');
    return 0;
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${tpaRows.length} TPA(s) with unlinked memberships\n`);

  const totals = {};
  let appliedTotal = 0;

  for (const { tpa_id: tpaId } of tpaRows) {
    const { summary, proposals } = await proposeLinksForTpa({ tpaId, corporateId: onlyCorporate, limit: 1000 });
    for (const [decision, count] of Object.entries(summary)) totals[decision] = (totals[decision] || 0) + count;

    const linkable = proposals.filter((p) => p.decision === DECISION.ROSTER_MATCH);
    console.log(`TPA ${tpaId}: ${proposals.length} unlinked, ${linkable.length} with an unambiguous roster match`);
    for (const p of proposals) {
      if (p.decision === DECISION.ROSTER_MATCH) {
        console.log(`  ✓ ${p.member.memberId} (${p.member.employeeName}) → account #${p.userId}  [${p.reason}]`);
      } else {
        console.log(`  · ${p.member.memberId} (${p.member.employeeName}) — ${p.decision}: ${p.reason}`);
      }
    }

    if (APPLY && linkable.length) {
      const result = await autoLink({ tpaId, corporateId: onlyCorporate, apply: true, limit: 1000 });
      appliedTotal += result.applied;
      console.log(`  linked ${result.applied}`);
      for (const r of result.results.filter((x) => x.decision === 'failed')) {
        console.log(`  ✗ ${r.memberId} — ${r.reason}`);
      }
    }
    console.log('');
  }

  console.log('Decisions:');
  for (const [decision, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${decision.padEnd(22)} ${count}`);
  }
  console.log(APPLY ? `\nLinked ${appliedTotal} membership(s).` : '\nNothing written. Re-run with --apply to write the links above.');
  return 0;
};

main()
  .then(async (code) => {
    await postgresSequelize.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await postgresSequelize.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(1);
  });

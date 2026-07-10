#!/usr/bin/env node
/**
 * Seed standard promotional coupons (USG, CT, MRI, pharmacy, membership).
 *
 * Usage:
 *   node scripts/admin/seed-promo-coupons.mjs --dry-run
 *   node scripts/admin/seed-promo-coupons.mjs --execute
 */

import { seedPromoCoupons } from '../../services/promo-coupon-seed.service.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    execute: args.includes('--execute')
  };
}

async function main() {
  const { dryRun, execute } = parseArgs(process.argv);

  if (!dryRun && !execute) {
    console.error('Pass --dry-run or --execute');
    process.exit(1);
  }

  const result = await seedPromoCoupons({ execute });
  console.log(JSON.stringify(result, null, 2));

  if (dryRun) {
    console.log('\nDry run only. Re-run with --execute to apply.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

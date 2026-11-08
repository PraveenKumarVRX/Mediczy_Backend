/**
 * F-1 post-change validation — READ-ONLY.
 * Executes the new predicates through the SAME Sequelize model + literal path the
 * route uses, so a malformed literal surfaces here instead of as a 500 after reload.
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import { consultationCapabilitySql } from '../utils/doctorConsultationCapability.js';

const HAS_ADDRESS = `(
  ("clinicAddress" IS NOT NULL AND BTRIM("clinicAddress") <> '')
  OR COALESCE("clinicAddress_json", '{}'::jsonb) <> '{}'::jsonb
)`;

const run = async (label, consultationType, extraWhere = {}) => {
  const lit = consultationCapabilitySql(consultationType, { hasAddressSql: HAS_ADDRESS });
  const where = { status: 'active', ...extraWhere };
  if (lit) {
    where[sequelize.Sequelize.Op.and] = [sequelize.literal(lit)];
  }
  try {
    const { count } = await doctorModel.findAndCountAll({ where, limit: 1 });
    console.log(`  ${label.padEnd(52)} -> ${count}`);
  } catch (e) {
    console.log(`  ${label.padEnd(52)} -> QUERY FAILED: ${e.message}`);
    process.exitCode = 1;
  }
};

console.log('=== new predicates through the real Sequelize path (active) ===');
await run('consultationType=online', 'online');
await run('consultationType=walkIn', 'walkIn');
await run('consultationType=homeVisit', 'homeVisit');
await run('consultationType=in-person (alias)', 'in-person');
await run('consultationType=garbage (no filter expected)', 'telepathy');
await run('no consultationType at all', undefined);

console.log('\n=== verified + active (what /available returns) ===');
await run('online, verified', 'online', { isVerified: true });
await run('walkIn, verified', 'walkIn', { isVerified: true });

console.log('\n=== mental-health specialists (the Phase 3 CTA) ===');
const { Op } = sequelize.Sequelize;
for (const [label, type] of [['online', 'online'], ['walkIn', 'walkIn']]) {
  const lit = consultationCapabilitySql(type, { hasAddressSql: HAS_ADDRESS });
  try {
    const { count } = await doctorModel.findAndCountAll({
      where: {
        status: 'active',
        specialization: { [Op.iRegexp]: '(psychiatr|psycholog)' },
        [Op.and]: [sequelize.literal(lit)],
      },
      limit: 1,
    });
    console.log(`  psychiatrists/psychologists, ${label.padEnd(8)} -> ${count}`);
  } catch (e) {
    console.log(`  psychiatrists/psychologists, ${label} -> QUERY FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('\ndone (read-only).');
await sequelize.close();

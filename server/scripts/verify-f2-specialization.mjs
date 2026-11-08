/** F-2 verification — READ-ONLY. Exact vs opt-in substring specialization match. */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import doctorModel from '../models/doctor.model.intelligent.js';

const { Op } = sequelize.Sequelize;

const likeClause = (raw) => {
  const terms = String(raw).split(',').map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 5);
  return terms.length ? { [Op.or]: terms.map((t) => ({ [Op.iLike]: `%${t}%` })) } : undefined;
};

const run = async (label, where) => {
  try {
    const { count } = await doctorModel.findAndCountAll({ where: { status: 'active', ...where }, limit: 1 });
    console.log(`  ${label.padEnd(58)} -> ${count}`);
    return count;
  } catch (e) {
    console.log(`  ${label.padEnd(58)} -> QUERY FAILED: ${e.message}`);
    process.exitCode = 1;
    return null;
  }
};

console.log('=== exact match (unchanged behaviour) ===');
const exact = await run("specialization='Psychiatrist'", { specialization: 'Psychiatrist' });
await run("specialization='Psychiatry'", { specialization: 'Psychiatry' });
await run("specialization='Cardiology' (unrelated, regression check)", { specialization: 'Cardiology' });

console.log('\n=== opt-in substring match (new) ===');
const fuzzy = await run('specializationLike=psychiatr,psycholog', { specialization: likeClause('psychiatr,psycholog') });
await run('specializationLike=psychiatr', { specialization: likeClause('psychiatr') });

console.log('\n=== guards (route omits the key entirely when no term qualifies) ===');
// Mirrors the route: `if (terms.length) whereClause.specialization = …` — the key
// is never assigned, rather than assigned undefined (which Sequelize rejects).
const buildWhere = (raw) => {
  const c = likeClause(raw);
  return c ? { specialization: c } : {};
};
await run('specializationLike=",,"  (no qualifying term -> no filter)', buildWhere(',,'));
await run('specializationLike="a"   (too short -> no filter)', buildWhere('a'));
await run('specializationLike=""    (empty -> no filter)', buildWhere(''));

console.log('\n=== combined with the F-1 capability filter (the Phase 3 CTA) ===');
for (const [label, sql] of [
  ['online', `("consultationTypes"->'online'->'available' = 'true'::jsonb)`],
  ['walkIn', `("consultationTypes"->'walkIn'->'available' = 'true'::jsonb)`],
]) {
  await run(`psychiatr|psycholog + ${label}`, {
    specialization: likeClause('psychiatr,psycholog'),
    [Op.and]: [sequelize.literal(sql)],
  });
}

console.log(`\nexact 'Psychiatrist' reached ${exact}; substring reached ${fuzzy} `
  + `(${fuzzy - exact} more mental-health doctors now reachable).`);
await sequelize.close();

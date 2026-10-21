/** Idempotent, explicitly requested provider-network assignment; default is read-only. */
import { postgresSequelize as db } from '../../db/postgres-sequelize.js';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
const corporateId=option('--corporate-id');
const provider=option('--provider');
if(!args.includes('--corporate-id')||!/^\d+$/.test(corporateId||'')||!args.includes('--provider')||!provider?.trim())throw new Error('Usage: --corporate-id <id> --provider <name> [--apply]');
try {
  const result=await db.transaction(async transaction=>{
    const query=(sql,replacements)=>db.query(sql,{replacements,transaction,type:db.QueryTypes.SELECT});
    const [corporate]=await query(`SELECT id,"companyName",unique_id FROM corporates WHERE id=:corporateId AND LOWER(status)='active' FOR UPDATE`,{corporateId});
    if(!corporate)throw new Error('Active corporate not found');
    const labs=await query(`SELECT id,name FROM labs WHERE name ILIKE :provider AND LOWER(status)='active' AND "isVerified"=true ORDER BY id`,{provider:`%${provider.trim()}%`});
    if(!labs.length)throw new Error('No active verified provider centres found');
    const [before]=await query(`SELECT COUNT(*)::int AS mapped FROM corporate_network_assignments WHERE corporate_id=:corporateId AND partner_type='lab' AND partner_id IN (:ids)`,{corporateId,ids:labs.map(l=>l.id)});
    if(!args.includes('--apply'))return {mode:'dry-run',corporate,matched:labs.length,alreadyMapped:before.mapped};
    const inserted=await query(`INSERT INTO corporate_network_assignments (corporate_id,corporate_uid,partner_id,partner_type,employee_ids,assigned_at)
      SELECT :corporateId,:corporateUid,l.id,'lab','"all"'::jsonb,NOW() FROM labs l WHERE l.id IN (:ids)
      AND NOT EXISTS (SELECT 1 FROM corporate_network_assignments a WHERE a.corporate_id=:corporateId AND a.partner_id=l.id AND a.partner_type='lab')
      ON CONFLICT DO NOTHING RETURNING partner_id`,{corporateId,corporateUid:corporate.unique_id,ids:labs.map(l=>l.id)});
    const [after]=await query(`SELECT COUNT(DISTINCT partner_id)::int AS mapped FROM corporate_network_assignments WHERE corporate_id=:corporateId AND partner_type='lab' AND partner_id IN (:ids)`,{corporateId,ids:labs.map(l=>l.id)});
    if(after.mapped!==labs.length)throw new Error('Provider mapping verification failed');
    return {mode:'apply',corporate,matched:labs.length,added:inserted.length,mapped:after.mapped};
  });
  console.log(JSON.stringify(result));
} finally {await db.close();}

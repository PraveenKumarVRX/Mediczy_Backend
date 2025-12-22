import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { TPA } from '../models/tpa.model.intelligent.js';

(async () => {
  try {
    await sequelize.authenticate();
    const tpas = await TPA.findAll({ attributes: ['id','email','tpaName','status','created_at'], order: [['id','DESC']], limit: 10 });
    console.log(JSON.stringify(tpas.map(t=>t.toJSON()), null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

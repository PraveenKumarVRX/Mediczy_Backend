import pool from '../../db/pgPool.js';
import bcrypt from 'bcrypt';
const { rows } = await pool.query(`SELECT password FROM users WHERE email = 'admin@mediqzy.com'`);
const hash = rows[0].password;
// Last argv element, not argv[2] - the ssm-env-loader.mjs wrapper this runs
// through shifts positions (argv becomes [node, ssm-env-loader.mjs, this-script, ...args]).
const candidate = process.argv[process.argv.length - 1];
const matches = await bcrypt.compare(candidate, hash);
console.log(`Password "${candidate}" matches stored hash:`, matches);
console.log('Hash prefix (algorithm/cost only):', hash.slice(0, 7));
process.exit(0);

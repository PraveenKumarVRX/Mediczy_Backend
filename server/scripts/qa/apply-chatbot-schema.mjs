import pool from '../../db/pgPool.js';
import { up } from '../../migrations/202611040001-chatbot-completion.migration.js';
try {
  if (!process.argv.includes('--apply') && !process.argv.includes('--dry-run')) throw new Error('Specify --dry-run or --apply explicitly');
  if (process.argv.includes('--apply') && process.argv.includes('--dry-run')) throw new Error('Choose one migration mode');
  await up({dryRun:!process.argv.includes('--apply')});
  console.log(process.argv.includes('--apply') ? 'Chatbot schema applied' : 'Chatbot schema dry-run rolled back');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await pool.end();}

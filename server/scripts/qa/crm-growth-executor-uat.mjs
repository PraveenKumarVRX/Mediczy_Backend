/** Read-only executor smoke test. It claims at most one due row per worker and
 * should return an empty result set in a clean production database. */
import { processDueFlowRuns } from '../../services/crm-flow-builder.service.js';
import { processDueScheduledReplies } from '../../services/crm-social-growth.service.js';

const result = {
  flowRuns: await processDueFlowRuns({ limit: 1 }),
  scheduledReplies: await processDueScheduledReplies({ limit: 1 }),
};
console.log(JSON.stringify({ success: true, ...result }, null, 2));
process.exit(0);

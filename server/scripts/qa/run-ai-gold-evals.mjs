import { runAiGoldEvaluations } from '../../services/ai-gold-evaluation.service.js';

const result = await runAiGoldEvaluations();
console.log(JSON.stringify(result, null, 2));
// The shared pg pool keeps idle sockets open in standalone QA runs.
process.exit(result.passed ? 0 : 1);

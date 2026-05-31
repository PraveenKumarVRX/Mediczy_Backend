import { Injectable, Logger, GatewayTimeoutException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Bridge to the existing Express ai-brain until fully migrated
let _orchestrator: any = null;
async function getOrchestrator() {
  if (!_orchestrator) {
    _orchestrator = await import('../../../server/services/ai-brain/multi-agent-orchestrator.js');
  }
  return _orchestrator;
}

@Injectable()
export class AiBrainService {
  private readonly logger = new Logger(AiBrainService.name);

  constructor(private readonly prisma: PrismaService) {}

  async chat(opts: {
    message:         string;
    userId:          number;
    role:            string;
    orgId:           number;
    isAdmin:         boolean;
    forceAgent?:     string;
    contextMessages: any[];
    conversationId?: number;
  }) {
    const orchestrator = await getOrchestrator();

    // Build a synthetic Express-like req object for the existing orchestrator
    const fakeReq = {
      user: {
        id:              opts.userId,
        role:            opts.role,
        organization_id: opts.orgId,
        isAdmin:         opts.isAdmin,
      },
      headers: {},
    };

    try {
      const result = await orchestrator.process({
        message:         opts.message,
        req:             fakeReq,
        conversationId:  opts.conversationId,
        contextMessages: opts.contextMessages,
        forceAgent:      opts.forceAgent,
      });

      return result;
    } catch (err: any) {
      if (err.code === 'AGENT_TIMEOUT') {
        throw new GatewayTimeoutException('AI response timed out — please try a simpler query');
      }
      throw err;
    }
  }

  async getAvailableAgents(user: any) {
    const orchestrator = await getOrchestrator();
    const fakeReq = { user: { id: user.id, role: user.role, isAdmin: user.isAdmin }, headers: {} };
    try {
      const { resolveIdentity } = await import('../../../server/services/ai-brain/agent-permission-engine.js');
      const identity = await resolveIdentity(fakeReq);
      return orchestrator.listAvailableAgents(identity);
    } catch {
      return [];
    }
  }

  async getUsageStats(orgId: number) {
    const stats = await this.prisma.$queryRaw<any[]>`
      SELECT
        cognitive_tier,
        COUNT(*)                             AS run_count,
        AVG(total_tokens)::int               AS avg_tokens,
        AVG(latency_ms)::int                 AS avg_latency_ms,
        SUM(total_tokens)                    AS total_tokens,
        DATE_TRUNC('day', created_at)        AS date
      FROM ai_agent_runs
      WHERE org_id = ${orgId}
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY cognitive_tier, DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `;
    return stats;
  }
}

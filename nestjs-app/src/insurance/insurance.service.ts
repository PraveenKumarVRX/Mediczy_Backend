import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Policies ────────────────────────────────────────────────────────────────

  async getMyPolicies(userId: number) {
    return this.prisma.insurancePolicy.findMany({
      where: { userId, isActive: true },
      orderBy: { endDate: 'desc' },
    });
  }

  async addPolicy(userId: number, data: {
    insurerName: string; policyNumber: string; coverageType: string;
    sumInsured: number; premium?: number; startDate: string; endDate: string;
  }) {
    return this.prisma.insurancePolicy.create({
      data: { ...data, userId, sumInsured: data.sumInsured, startDate: new Date(data.startDate), endDate: new Date(data.endDate) },
    });
  }

  // ── Claims ──────────────────────────────────────────────────────────────────

  async submitClaim(patientId: number, orgId: number, data: {
    policyId:    number;
    claimType:   string;
    claimAmount: number;
    diagnosisCode?: string;
    documents?: any[];
  }) {
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { id: data.policyId, userId: patientId },
    });
    if (!policy) throw new ForbiddenException('Policy does not belong to this patient');

    const claim = await this.prisma.insuranceClaim.create({
      data: {
        policyId:       data.policyId,
        patientId,
        organizationId: orgId,
        claimType:      data.claimType,
        claimAmount:    data.claimAmount,
        diagnosisCode:  data.diagnosisCode,
        documents:      data.documents || [],
        status:         'submitted',
      },
    });

    await publishEvent(KAFKA_TOPICS.CLAIM_SUBMITTED, {
      claimId: claim.id, patientId, policyId: data.policyId, claimAmount: data.claimAmount,
    }).catch(() => {});

    return claim;
  }

  async getMyClaims(patientId: number) {
    return this.prisma.insuranceClaim.findMany({
      where:   { patientId },
      include: { policy: { select: { insurerName: true, policyNumber: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getClaim(claimId: number, requestingUserId: number, isAdmin: boolean) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`Claim ${claimId} not found`);
    if (!isAdmin && claim.patientId !== requestingUserId) throw new ForbiddenException();
    return claim;
  }

  async updateClaimStatus(claimId: number, status: string, approvedAmount?: number, rejectionReason?: string) {
    const claim = await this.prisma.insuranceClaim.update({
      where: { id: claimId },
      data: {
        status:          status as any,
        approvedAmount:  approvedAmount,
        rejectionReason,
        ...(status === 'settled' ? { settledAt: new Date() } : {}),
      },
    });

    await publishEvent(KAFKA_TOPICS.CLAIM_STATUS_UPDATED, {
      claimId, status, patientId: claim.patientId,
    }).catch(() => {});

    return claim;
  }

  // ── Pre-Authorization ───────────────────────────────────────────────────────

  async checkEligibility(userId: number, hospitalId: number, procedureCode: string) {
    const policies = await this.prisma.insurancePolicy.findMany({
      where: {
        userId,
        isActive: true,
        endDate:  { gte: new Date() },
      },
    });

    if (!policies.length) return { eligible: false, reason: 'No active insurance policy' };

    // Simplified eligibility check — in production, call TPA API
    return {
      eligible:     true,
      policies:     policies.map(p => ({ id: p.id, insurerName: p.insurerName, sumInsured: p.sumInsured })),
      procedureCode,
      estimatedCoverage: '80%',   // placeholder — replace with actual TPA API call
    };
  }
}

/**
 * Pure pricing calculation for a corporate OPD/wellness wallet quote —
 * built to answer requests like SEIT's (2026-09-06): a base wallet amount
 * plus optional employee-selectable higher tiers.
 *
 * Pricing model:
 *   - Wallet funding is a pass-through cost: it's the employer's own
 *     money, funding employees' wallets. The corporate is on the hook for
 *     the base tier for every employee, guaranteed. Any employee who
 *     self-selects a higher tier adds the *difference* on top — and since
 *     that's voluntary, actual uptake isn't known until enrollment, so
 *     this models it as an assumed-uptake % per tier (configurable) and
 *     reports the full range (nobody upgrades <-> everybody upgrades to
 *     the top tier) alongside the expected-case estimate.
 *   - Mediqzy's actual revenue is the admin fee (% of total wallet
 *     funding) plus any flat per-employee category loading (network/
 *     claims-processing overhead for categories like dental/vision that
 *     need provider coordination beyond a plain wallet debit).
 *
 * No pure function here touches the database — kept trivially unit-testable.
 */

export function calculateCorporateQuote({
  employeeCount,
  tierOptions = [],
  assumedUptake = {},
  adminFeePercent = 0,
  categoryLoadingPerEmployee = 0,
}) {
  const count = Number(employeeCount);
  if (!Number.isFinite(count) || count <= 0) throw new Error('employeeCount must be greater than zero');
  if (!Array.isArray(tierOptions) || tierOptions.length === 0) throw new Error('At least one tier (the base wallet amount) is required');

  const sorted = [...tierOptions].sort((a, b) => Number(a.allocatedLimit) - Number(b.allocatedLimit));
  const baseTier = sorted.find((t) => t.isDefault) || sorted[0];
  const topTier = sorted[sorted.length - 1];
  const baseAllocation = round2(Number(baseTier.allocatedLimit));

  const guaranteedWalletFunding = round2(baseAllocation * count);

  const tierBreakdown = sorted
    .filter((t) => t.key !== baseTier.key)
    .map((tier) => {
      const uptakePercent = clampPercent(Number(assumedUptake?.[tier.key] || 0));
      const employeesAtTier = Math.round((count * uptakePercent) / 100);
      const incrementalPerEmployee = round2(Number(tier.allocatedLimit) - baseAllocation);
      const incrementalCost = round2(incrementalPerEmployee * employeesAtTier);
      return {
        tierKey: tier.key,
        label: tier.label,
        allocatedLimit: Number(tier.allocatedLimit),
        uptakePercent,
        employeesAtTier,
        incrementalPerEmployee,
        incrementalCost,
      };
    });

  const incrementalWalletFunding = round2(tierBreakdown.reduce((sum, t) => sum + t.incrementalCost, 0));
  const totalWalletFunding = round2(guaranteedWalletFunding + incrementalWalletFunding);

  const adminFee = round2(totalWalletFunding * (Number(adminFeePercent) / 100));
  const categoryLoadingTotal = round2(Number(categoryLoadingPerEmployee) * count);
  const estimatedTotalAnnualCost = round2(totalWalletFunding + adminFee + categoryLoadingTotal);
  const estimatedPerEmployeeAnnualCost = round2(estimatedTotalAnnualCost / count);

  const minWalletFunding = guaranteedWalletFunding;
  const minTotal = round2(minWalletFunding + round2(minWalletFunding * (Number(adminFeePercent) / 100)) + categoryLoadingTotal);

  const maxWalletFunding = round2(Number(topTier.allocatedLimit) * count);
  const maxTotal = round2(maxWalletFunding + round2(maxWalletFunding * (Number(adminFeePercent) / 100)) + categoryLoadingTotal);

  return {
    employeeCount: count,
    baseTier: { key: baseTier.key, label: baseTier.label, allocatedLimit: baseAllocation },
    topTier: { key: topTier.key, label: topTier.label, allocatedLimit: Number(topTier.allocatedLimit) },
    guaranteedWalletFunding,
    tierBreakdown,
    incrementalWalletFunding,
    totalWalletFunding,
    adminFeePercent: Number(adminFeePercent),
    adminFee,
    categoryLoadingPerEmployee: Number(categoryLoadingPerEmployee),
    categoryLoadingTotal,
    estimatedTotalAnnualCost,
    estimatedPerEmployeeAnnualCost,
    range: { minimum: minTotal, maximum: maxTotal },
  };
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

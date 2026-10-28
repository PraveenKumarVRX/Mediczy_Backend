export function coveragePeriod(coverage: any): string {
  const unit = String(coverage?.onlineConsult?.unit || '').toLowerCase();
  return unit.includes('year') ? 'year' : unit.includes('month') ? 'month' : 'plan term';
}

export function pharmacyBenefit(coverage: any): string {
  const pharmacy = coverage?.pharmacy;
  if (!pharmacy) return 'See plan terms';
  if (Number(pharmacy.limitINR) > 0) return `₹${Number(pharmacy.limitINR).toLocaleString('en-IN')} allowance`;
  if (Number(pharmacy.discountPct) > 0) return `${Number(pharmacy.discountPct)}% discount`;
  return 'Not included';
}

/**
 * Marks legacy /api/billing routes as deprecated; points clients to hospital ledger.
 */
export function legacyBillingDeprecation(req, res, next) {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 01 Jan 2028 00:00:00 GMT');
  res.setHeader('Link', '</api/hospital/billing>; rel="successor-version"');
  res.setHeader('X-Ledger-Canonical', '/api/hospital/billing');
  next();
}

export default legacyBillingDeprecation;

/**
 * Explicit metric semantics shared by dashboards and operational APIs.
 * A missing data source is never represented as numeric zero.
 */
export function metricResult(value, { available = true, source = null, reason = null, unit = null } = {}) {
  const numeric = value === null || value === undefined ? null : Number(value);
  const hasValue = numeric !== null && Number.isFinite(numeric);
  const isAvailable = Boolean(available && hasValue);
  return {
    value: isAvailable ? numeric : null,
    available: isAvailable,
    unavailable: !isAvailable,
    reason: isAvailable ? null : (reason || 'No backing data is available'),
    source,
    unit,
  };
}

export function metricUnavailable(reason = 'No backing data is available', source = null, unit = null) {
  return metricResult(null, { available: false, reason, source, unit });
}

export default { metricResult, metricUnavailable };

/**
 * Uniform route error replies (audit FIN-08 / OPS-07): coded errors keep their status and message; database errors
 * never leak table or constraint names to the client.
 */
// SQLSTATEs that have a caller-meaningful shape; the raw database message (table/constraint names) never reaches the client.
const PG_ERRORS = {
  '23505': [409, 'DUPLICATE', 'That record already exists'],
  '23503': [409, 'REFERENCE_NOT_FOUND', 'A referenced record does not exist'],
  '23514': [422, 'BUSINESS_RULE_VIOLATION', 'The values violate a business rule'],
  '23502': [400, 'REQUIRED_VALUE_MISSING', 'A required value is missing'],
  '22P02': [400, 'INVALID_VALUE', 'A value has the wrong format'],
};

export function sendRouteError(res, err, fallbackStatus = 400) {
  const isPg = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && (err.severity || err.routine);
  if (isPg && PG_ERRORS[err.code]) {
    const [status, code, message] = PG_ERRORS[err.code];
    return res.status(status).json({ success: false, code, message });
  }
  if (isPg || err?.name?.startsWith('Sequelize') || err?.parent || err?.original) {
    console.error('[route] database error:', err.message);
    return res.status(500).json({ success: false, message: 'The request could not be completed' });
  }
  return res.status(err?.status || fallbackStatus).json({ success: false, code: err?.code, message: err?.message || 'Request failed' });
}

export default { sendRouteError };

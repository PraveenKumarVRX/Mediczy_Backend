/**
 * Express 4 does not catch a rejected promise from an async handler: the request just hangs and the error is lost.
 * safeRouter(router, mapError) wraps every handler so a rejection becomes a response.
 *
 * mapError(err) may return { status, body } to answer specially; otherwise database errors get a sensible status and
 * everything else a generic 500 (details are logged, never returned).
 */
export function defaultMapError(err) {
  switch (err?.code) {
    case '23505': return { status: 409, body: { success: false, code: 'DUPLICATE', message: 'A record with that number or code already exists.' } };
    case '23503': return { status: 409, body: { success: false, code: 'BAD_REFERENCE', message: 'A referenced record does not exist or is not available to your hospital.' } };
    case '42501': return { status: 403, body: { success: false, code: 'FORBIDDEN', message: 'That record belongs to another hospital.' } };
    case '23502': case '23514': case '22P02': return { status: 400, body: { success: false, code: 'INVALID', message: 'A submitted value is missing or not valid.' } };
    default: return null;
  }
}

export function safeRouter(router, mapError = () => null) {
  const wrap = (h) => (typeof h !== 'function' || h.length > 3 ? h : (req, res, next) => {
    let out;
    try { out = h(req, res, next); } catch (e) { return respond(e, req, res); }
    return Promise.resolve(out).catch((e) => respond(e, req, res));
  });
  const respond = (err, req, res) => {
    const mapped = mapError(err) || defaultMapError(err) || (err?.status ? { status: err.status, body: { success: false, code: err.code, message: err.message } } : null);
    if (!mapped) console.error('[route]', req.method, req.originalUrl, err);
    if (res.headersSent) return;
    const m = mapped || { status: 500, body: { success: false, message: 'Request failed' } };
    res.status(m.status).json(m.body);
  };
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(wrap));
  }
  return router;
}

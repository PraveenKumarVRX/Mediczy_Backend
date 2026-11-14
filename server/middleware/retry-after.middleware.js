/**
 * Every 429 tells the client how long to wait (audit M21; RFC 9110 §10.2.3).
 *
 * express-rate-limit already sets Retry-After, and the 429s the app can reach
 * set an accurate value themselves. This backstop covers the rest: if a
 * response is about to go out as 429 without the header, it adds a 60-second
 * default. It never overrides a value a route or limiter set.
 */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export function ensureRetryAfter(req, res, next) {
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(statusCode, ...rest) {
    if (Number(statusCode) === 429 && !res.getHeader('Retry-After')) {
      res.setHeader('Retry-After', String(DEFAULT_RETRY_AFTER_SECONDS));
    }
    return writeHead.call(this, statusCode, ...rest);
  };
  next();
}

export default ensureRetryAfter;

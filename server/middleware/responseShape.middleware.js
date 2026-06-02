/**
 * Response-shape linter middleware.
 *
 * Wraps res.json() to detect the anti-pattern:
 *   HTTP 200  +  body.success === false
 *
 * In development: throws so developers see it immediately.
 * In production:  logs a warning with method + path so we can track and fix progressively.
 *
 * Mount BEFORE all routers in app.js:
 *   import responseShapeLinter from './middleware/responseShape.middleware.js';
 *   app.use(responseShapeLinter);
 */

const isProd = process.env.NODE_ENV === 'production';

const responseShapeLinter = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Only flag HTTP 200 with explicit success: false — this is the anti-pattern
    if (res.statusCode === 200 && body && body.success === false) {
      const route = `${req.method} ${req.path}`;
      const msg = `[response-shape] 200+success:false on ${route} — use 4xx for client errors`;

      if (isProd) {
        // Log to server console so it can be found via PM2 logs and fixed
        console.warn(msg);
      } else {
        // In dev, make it loud so it gets noticed immediately
        console.error('\x1b[33m%s\x1b[0m', `⚠️  ${msg}`);
      }
    }
    return originalJson(body);
  };

  next();
};

export default responseShapeLinter;

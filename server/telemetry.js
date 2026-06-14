/**
 * ITEM-08: OpenTelemetry distributed tracing.
 *
 * Instruments: http, express, pg, redis, fetch.
 * Exports traces to OTEL_EXPORTER_OTLP_ENDPOINT when set (e.g. Grafana Tempo,
 * Jaeger, AWS X-Ray ADOT collector). Falls back to no-op when endpoint is absent
 * so the server boots cleanly in dev.
 *
 * Import this module FIRST in server/app.js before any other imports:
 *   import './telemetry.js';
 */

import { NodeSDK }           from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION }
  from '@opentelemetry/semantic-conventions';
import { trace, context }    from '@opentelemetry/api';

const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const SERVICE_NAME  = process.env.OTEL_SERVICE_NAME || 'mediczy-server';
const ENV           = process.env.NODE_ENV || 'development';

let sdk = null;

if (OTLP_ENDPOINT) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:    SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      'deployment.environment': ENV,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${OTLP_ENDPOINT}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
      }),
    ],
  });

  sdk.start();
  console.log(`[telemetry] OpenTelemetry started — exporting to ${OTLP_ENDPOINT}`);

  process.on('SIGTERM', () => sdk.shutdown().catch(console.error));
  process.on('SIGINT',  () => sdk.shutdown().catch(console.error));
} else {
  console.log('[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled');
}

// ── Correlation ID middleware (attach trace/span ID to every request) ──────────
// Mount BEFORE routes in app.js: app.use(correlationMiddleware);
export function correlationMiddleware(req, res, next) {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx  = span.spanContext();
    req.traceId = ctx.traceId;
    req.spanId  = ctx.spanId;
    res.setHeader('X-Trace-Id', ctx.traceId);
  } else {
    // Fallback when tracing is disabled — generate a simple request ID
    req.traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('X-Request-Id', req.traceId);
  }
  next();
}

export { trace, context };
export default sdk;

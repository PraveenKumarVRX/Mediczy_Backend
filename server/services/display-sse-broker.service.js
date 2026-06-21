/**
 * Shared SSE broker for hospital displays, kiosks, and queue events.
 */

const sseClients = new Map();
let _clientSeq = 0;

export function pushToAll(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(({ res }) => {
    try { res.write(payload); } catch (_) {}
  });
}

export function pushToZone(zone, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    if (!zone || client.zone === zone) {
      try { client.res.write(payload); } catch (_) {}
    }
  });
}

export function pushQueueEvent(zone, event, data) {
  pushToZone(zone, event, data);
  pushToAll('queue_updated', { zone, event, ...data });
}

export function registerDisplaySSE(router) {
  router.get('/events', (req, res) => {
    const zone = req.query.zone || null;
    const deviceId = req.query.deviceId || null;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), zone })}\n\n`);

    const clientId = ++_clientSeq;
    sseClients.set(clientId, { res, zone, deviceId });

    const keepalive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 25000);

    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(clientId);
    });
  });
}

export function getSSEStats() {
  return { clients: sseClients.size };
}

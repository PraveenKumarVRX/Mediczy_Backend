"""HMAC-authenticated ASGI boundary. Never accepts a caller-provided role as proof."""
import hashlib
import hmac
import json
import os
import time


def signature(secret, method, path, timestamp, nonce, body):
    canonical = '\n'.join([method.upper(), path, timestamp, nonce, hashlib.sha256(body).hexdigest()])
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


class ServiceAuth:
    def __init__(self, app, secret=None, clock=time.time):
        self.app = app
        self.secret = secret
        self.clock = clock
        self.seen = {}

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or (scope['method'] == 'GET' and scope['path'] in ('/', '/health', '/languages', '/platform-health')):
            return await self.app(scope, receive, send)
        secret = self.secret or os.environ.get('SIB_SERVICE_SECRET') or os.environ.get('JWT_SECRET', '')
        if len(secret) < 32:
            return await self.reject(send, 503, 'Service authentication unavailable')
        headers = dict(scope.get('headers', []))
        timestamp = headers.get(b'x-sib-time', b'').decode(errors='replace')
        nonce = headers.get(b'x-sib-nonce', b'').decode(errors='replace')
        supplied = headers.get(b'x-sib-signature', b'').decode(errors='replace')
        try:
            fresh = abs(self.clock() - int(timestamp)) <= 60
        except ValueError:
            fresh = False
        if not fresh or not 16 <= len(nonce) <= 100 or len(supplied) != 64:
            return await self.reject(send, 401, 'Service authentication required')
        body = b''
        while True:
            event = await receive()
            if event['type'] != 'http.request':
                return await self.reject(send, 400, 'Invalid request')
            body += event.get('body', b'')
            if len(body) > 20 * 1024 * 1024:
                return await self.reject(send, 413, 'Request too large')
            if not event.get('more_body'):
                break
        path = scope.get('raw_path', scope['path'].encode()).decode()
        if scope.get('query_string'):
            path += '?' + scope['query_string'].decode()
        expected = signature(secret, scope['method'], path, timestamp, nonce, body)
        if not hmac.compare_digest(supplied, expected):
            return await self.reject(send, 401, 'Invalid service signature')
        now = self.clock()
        self.seen = {key: expires for key, expires in self.seen.items() if expires > now}
        if nonce in self.seen:
            return await self.reject(send, 409, 'Replayed service request')
        if len(self.seen) >= 10000:
            return await self.reject(send, 503, 'Service request capacity exceeded')
        self.seen[nonce] = now + 120
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': body, 'more_body': False}
            return await receive()
        await self.app(scope, replay, send)

    @staticmethod
    async def reject(send, status, detail):
        payload = json.dumps({'error': detail}).encode()
        await send({'type': 'http.response.start', 'status': status, 'headers': [(b'content-type', b'application/json')]})
        await send({'type': 'http.response.body', 'body': payload})

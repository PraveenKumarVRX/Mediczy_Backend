import asyncio
import json
import os
import socket
import uvicorn
from utils.service_auth import ServiceAuth

async def echo(scope, receive, send):
    body = b''
    while True:
        event = await receive()
        body += event.get('body', b'')
        if not event.get('more_body'):
            break
    await send({'type': 'http.response.start', 'status': 200, 'headers': [(b'content-type', b'application/json')]})
    await send({'type': 'http.response.body', 'body': json.dumps({'payload': json.loads(body) if body else None}).encode()})

sock = socket.socket()
sock.bind(('127.0.0.1', 0))
sock.listen(128)
print(sock.getsockname()[1], flush=True)
config = uvicorn.Config(ServiceAuth(echo, secret=os.environ['SIB_SERVICE_SECRET']), log_level='error', lifespan='off')
asyncio.run(uvicorn.Server(config).serve(sockets=[sock]))

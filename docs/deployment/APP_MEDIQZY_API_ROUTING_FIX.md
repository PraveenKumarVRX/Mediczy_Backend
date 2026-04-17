# app.mediqzy.com API Routing Fix

## Problem

The live portal frontend loads, but all login requests fail because `app.mediqzy.com/api/*` returns the frontend `index.html` instead of backend JSON.

Confirmed symptoms:

- `POST /api/users/login` returns `200 text/html`
- `POST /api/doctors/login` returns `200 text/html`
- `GET /api/health` returns frontend HTML instead of API output

This means the `/api/*` path is routed to the static frontend origin instead of the backend origin.

## Immediate Fix Options

Use one of these approaches:

1. CloudFront behavior split:
   - Keep `/` and static assets on the frontend origin
   - Route `/api/*`, `/socket.io/*`, and optionally `/webhook/*` to the backend origin
2. Nginx reverse proxy:
   - Serve frontend static files
   - Proxy `/api/*` to backend on `localhost:8888`

## Exact CloudFront Settings

### Distribution Layout

- Frontend origin:
  - Type: S3 static website or frontend server
  - Purpose: `/`, `/assets/*`, `/*.html`, static bundle files
- Backend origin:
  - Type: custom origin
  - Example origin domain: backend host or Nginx/API server
  - Example origin protocol policy: HTTPS only or Match Viewer

### Required Behaviors

#### 1. API behavior

- Path pattern: `/api/*`
- Origin: backend origin
- Viewer protocol policy: Redirect HTTP to HTTPS
- Allowed HTTP methods:
  - `GET`
  - `HEAD`
  - `OPTIONS`
  - `PUT`
  - `POST`
  - `PATCH`
  - `DELETE`
- Cached HTTP methods:
  - `GET`
  - `HEAD`
- Cache policy:
  - Use `CachingDisabled` or equivalent custom no-cache policy
- Origin request policy:
  - Forward all viewer headers needed by auth and CORS
  - Minimum required:
    - `Authorization`
    - `Content-Type`
    - `Origin`
    - `Accept`
    - `Host`
    - `X-Forwarded-For`
    - `X-Forwarded-Proto`
    - `X-Tenant-ID`
- Query strings:
  - Forward all
- Cookies:
  - Forward all
- Compress objects automatically: On

#### 2. Socket.IO behavior

- Path pattern: `/socket.io/*`
- Origin: backend origin
- Viewer protocol policy: Redirect HTTP to HTTPS
- Allowed HTTP methods: all
- Cache policy: `CachingDisabled`
- Origin request policy: all viewer headers, all cookies, all query strings

#### 3. Webhook behavior if used through app host

- Path pattern: `/webhook/*`
- Origin: backend or n8n origin as appropriate
- Allowed HTTP methods: all
- Cache policy: `CachingDisabled`

#### 4. Default behavior

- Path pattern: default `*`
- Origin: frontend origin
- SPA fallback can apply here only

### Critical Rule

Do not attach SPA fallback behavior to `/api/*`.

If CloudFront custom error responses currently rewrite `404` or `403` to `/index.html`, that rewrite must apply only to the frontend behavior, not to the API behavior.

## Nginx Fallback Config

If you want to fix this at the origin layer instead of CloudFront, use a server block like this for `app.mediqzy.com`.

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.mediqzy.com;

    ssl_certificate /etc/letsencrypt/live/app.mediqzy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.mediqzy.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /home/ubuntu/Mediczy/client/dist;
    index index.html index.htm;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }

    location /webhook/ {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ~* /assets/index-[^/]+\.js$ {
        try_files $uri =404;
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(html|xml|json)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

This matches the existing proxy pattern already checked into the repo in `nginx/mediczy.conf`.

## Verification Commands

After the change, these must stop returning HTML:

```bash
curl -i https://app.mediqzy.com/api/health
curl -i -X POST https://app.mediqzy.com/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass"}'
curl -i -X POST https://app.mediqzy.com/api/doctors/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass"}'
curl -i -X POST https://app.mediqzy.com/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass"}'
```

Expected result after fix:

- Content-Type should be JSON, not HTML
- Invalid credentials should return `401` or a structured error response
- Health endpoint should return backend health JSON

## Fastest Recovery Path

If CloudFront is active now, fix CloudFront first.

1. Create behavior `/api/*` to backend origin
2. Create behavior `/socket.io/*` to backend origin
3. Disable caching for both
4. Forward cookies, auth headers, and query strings
5. Invalidate:
   - `/api/*`
   - `/socket.io/*`
   - `/index.html`
6. Re-test the login endpoints

If CloudFront cannot be changed immediately, put Nginx in front of the app origin and proxy `/api/*` there.
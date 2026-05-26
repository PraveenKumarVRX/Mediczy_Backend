# ── Stage 1: Build NestJS ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY ../client/package*.json ./
RUN npm ci --ignore-scripts
COPY ../client/ .
RUN VITE_API_URL=https://mediczy.in/api \
    VITE_SOCKET_URL=https://mediczy.in \
    VITE_ENV=production \
    npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=frontend /frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/main"]

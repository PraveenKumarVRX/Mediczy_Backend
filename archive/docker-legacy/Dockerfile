# Multi-stage Dockerfile for Mediczy Healthcare Platform

# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/client

# Accept build arguments for environment variables
ARG VITE_API_URL=https://192.168.1.72:9443/api
ARG VITE_SOCKET_URL=https://192.168.1.72:9443

# Set environment variables for the build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}

# Copy package files first for better caching
COPY client/package*.json ./

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# Copy source code and build
COPY client/ ./
RUN npm run build

# Stage 2: Nginx for serving frontend
FROM nginx:alpine AS frontend

# Copy built frontend
COPY --from=frontend-builder /app/client/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Stage 3: Backend Node.js application
FROM node:18-alpine AS backend

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S mediczy -u 1001

# Copy package files first for better caching
COPY server/package*.json ./

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy server source code (models excluded by .dockerignore)
COPY server/ ./

# Create logs directory
RUN mkdir -p logs uploads && chown -R mediczy:nodejs logs uploads

# Switch to non-root user
USER mediczy

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "index.js"]
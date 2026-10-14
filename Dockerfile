# ==============================================================================
# Multi-Stage Production Dockerfile for AuthGuard Express & React Suite
# Base: Node 22 Alpine (Security hardened, non-root user, minimal image size)
# ==============================================================================

# Stage 1: Build Dependencies and Compile Frontend Assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install build prerequisites
RUN apk add --no-cache libc6-compat

# Install dependencies with lockfile caching
COPY package.json ./
RUN npm install

# Copy application source code
COPY . .

# Build React client bundle
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dumb-init to properly handle PID 1 signal forwarding
RUN apk add --no-cache dumb-init curl

# Create application directory with non-root ownership
RUN mkdir -p /app/.data && chown -R node:node /app

# Copy production node_modules and built static artifacts
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/server.ts ./server.ts
COPY --chown=node:node --from=builder /app/schema.sql ./schema.sql
COPY --chown=node:node --from=builder /app/tsconfig.json ./tsconfig.json

# Switch to unprivileged non-root user
USER node

# Expose HTTP service port
EXPOSE 3000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Execute using dumb-init wrapper
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npx", "tsx", "server.ts"]

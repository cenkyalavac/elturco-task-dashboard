FROM node:20-alpine AS builder
WORKDIR /app

# Install build deps for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install ALL dependencies (need dev deps for build)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend + server
RUN npx vite build
RUN npx esbuild server/index.ts --bundle --platform=node --outfile=dist/server.js --packages=external --format=esm --banner:js="import { createRequire as _cr } from 'module'; import { fileURLToPath as _fu } from 'url'; import _p from 'path'; const require = _cr(import.meta.url); const __filename = _fu(import.meta.url); const __dirname = _p.dirname(__filename);"

# ── Production image ──
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3 && apk del python3 make g++

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Data directory for SQLite (mount Railway volume here)
RUN mkdir -p /data
ENV DB_PATH=/data/data.db
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/server.js"]

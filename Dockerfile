FROM node:20-alpine
WORKDIR /app

# Install build deps for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3

# Copy built files only (no source code in image)
COPY dist/ ./dist/

# Data directory for SQLite persistence (mount Railway volume here)
RUN mkdir -p /data
ENV DB_PATH=/data/data.db

# Production
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/server.js"]

FROM node:20-alpine
WORKDIR /app

# Build deps for native modules
RUN apk add --no-cache python3 make g++

# Install deps + build
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Copy static assets needed at runtime
RUN cp -r client/public/* dist/public/ 2>/dev/null || true

# Cleanup source (keep dist + node_modules)
RUN rm -rf client server shared script *.ts *.config.* postcss.* screenshot-*

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.cjs"]

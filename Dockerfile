FROM node:20-alpine
WORKDIR /app

# Build deps for native modules
RUN apk add --no-cache python3 make g++

# Install deps + build
COPY package*.json ./
RUN npm ci

COPY . .
RUN npx vite build && \
    npx esbuild server/index.ts --bundle --platform=node --outfile=dist/server.js \
      --packages=external --format=esm \
      --banner:js="import{createRequire as _cr}from'module';import{fileURLToPath as _fu}from'url';import _p from'path';const require=_cr(import.meta.url);const __filename=_fu(import.meta.url);const __dirname=_p.dirname(__filename);"

# Cleanup source (keep dist + node_modules)
RUN rm -rf client server shared script *.ts *.config.* postcss.* screenshot-*

# Data dir
RUN mkdir -p /data
ENV DB_PATH=/data/data.db
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/server.js"]

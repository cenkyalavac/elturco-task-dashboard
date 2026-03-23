FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Production
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Data volume for SQLite persistence
VOLUME ["/app"]

CMD ["node", "dist/index.cjs"]

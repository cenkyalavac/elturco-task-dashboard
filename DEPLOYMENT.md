# ElTurco Dispatch — Self-Hosting Guide

## Option 1: Railway (Recommended — Easiest)

### Setup
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `cenkyalavac/elturco-task-dashboard`
4. Railway auto-detects Node.js

### Environment Variables
Set these in Railway dashboard → Variables:
```
NODE_ENV=production
PORT=5000
```

### Build & Start Commands
Railway should auto-detect from `package.json`, but if not:
- Build: `npm run build`
- Start: `node dist/index.cjs`

### Custom Domain
1. Go to Settings → Domains
2. Add your domain (e.g. `dispatch.eltur.co`)
3. Add CNAME record in your DNS: `dispatch.eltur.co` → `<railway-provided-url>`

### Database
SQLite file (`data.db`) persists on Railway's volume storage.
For better persistence, attach a Railway volume:
- Settings → Volumes → Mount path: `/app`

---

## Option 2: Render

### Setup
1. Go to [render.com](https://render.com)
2. New → Web Service → Connect GitHub repo
3. Settings:
   - Runtime: Node
   - Build: `npm install && npm run build`
   - Start: `node dist/index.cjs`
   - Instance: Free tier works

### Disk
Add a Persistent Disk (for SQLite):
- Mount path: `/opt/render/project/src`
- Size: 1 GB (free with paid plan)

### Custom Domain
Settings → Custom Domains → Add `dispatch.eltur.co`

---

## Option 3: VPS (DigitalOcean / Hetzner)

### Setup
```bash
# On your VPS (Ubuntu)
sudo apt update && sudo apt install -y nodejs npm nginx certbot

# Clone repo
git clone https://github.com/cenkyalavac/elturco-task-dashboard.git
cd elturco-task-dashboard
npm install
npm run build

# Run with PM2 (process manager)
npm install -g pm2
pm2 start dist/index.cjs --name dispatch
pm2 save
pm2 startup
```

### Nginx Config
```nginx
server {
    server_name dispatch.eltur.co;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### SSL
```bash
sudo certbot --nginx -d dispatch.eltur.co
```

---

## Option 4: Docker (Any Platform)

### Dockerfile (create in project root)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=5000
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
```

### Build & Run
```bash
docker build -t elturco-dispatch .
docker run -d -p 5000:5000 -v dispatch-data:/app elturco-dispatch
```

---

## Important Notes

### Email Sending
The app uses the Resend API for email delivery. It works in two modes:
- **Self-hosted**: Set `RESEND_API_KEY` env var — emails go via Resend HTTP API directly
- **Perplexity sandbox**: Falls back to `external-tool` CLI automatically (no API key needed)

To set up for production:
1. Sign up at [resend.com](https://resend.com)
2. Get an API key and verify your domain
3. Set the env var: `RESEND_API_KEY=re_xxxxx`

No code changes needed — the `sendEmail()` function auto-detects the environment.

### Freelancer API
The Base44 freelancer API (`https://elts.base44.app/api/...`) is accessed directly via HTTP — works from any host.

### SheetDB
SheetDB API is also accessed via HTTP — works from any host.

### Database
For production, consider migrating from SQLite to PostgreSQL:
- Better concurrent access
- Managed backups (via Railway, Render, or Supabase)
- Change `drizzle.config.ts` and `storage.ts` to use `drizzle-orm/postgres-js`

### Environment Variables for Self-Hosting
```
NODE_ENV=production
PORT=5000
RESEND_API_KEY=re_xxxxx           # From resend.com
SITE_PUBLIC_URL=https://dispatch.eltur.co  # Your domain
```

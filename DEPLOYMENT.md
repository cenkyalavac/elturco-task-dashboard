# ElTurco Dispatch — Deployment Guide

## Railway (Recommended)

### 1. Create Project
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `cenkyalavac/elturco-task-dashboard`
4. Railway auto-detects the Dockerfile

### 2. Add Persistent Volume (CRITICAL for SQLite)
1. In your service, go to **Settings** → **Volumes**
2. Click **Add Volume**
3. Mount path: `/data`
4. This ensures your database persists across deploys

### 3. Environment Variables
Set these in Railway dashboard → **Variables**:
```
NODE_ENV=production
PORT=5000
DB_PATH=/data/data.db
SITE_PUBLIC_URL=https://your-app.up.railway.app
RESEND_API_KEY=re_FMm17BfH_7okFDAPYqRXthvJTxBfA2d3f
SHEETDB_API_KEY=key_hkhvrflszkvo0zifaekx1g7c01gj
```

Optional:
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
BASE44_API=https://elts.base44.app/api/apps/694868412332f081649b2833/entities/Freelancer
BASE44_KEY=bf9b19a625ae4083ba38b8585fb5a78f
```

### 4. Custom Domain (Optional)
1. Settings → Domains → Add Custom Domain
2. Add CNAME record pointing to Railway
3. Update `SITE_PUBLIC_URL` to your custom domain

### 5. Deploy
Railway deploys automatically on every git push to main.

### Health Check
The app exposes `GET /api/health` for monitoring.

---

## Manual / VPS Deployment

### Prerequisites
- Node.js 20+
- npm

### Build
```bash
npm ci
npm run build
```

### Run
```bash
NODE_ENV=production \
RESEND_API_KEY=re_... \
SHEETDB_API_KEY=key_... \
SITE_PUBLIC_URL=https://your-domain.com \
node dist/server.js
```

### With Docker
```bash
docker build -t elturco-dispatch .
docker run -d \
  -p 5000:5000 \
  -v elturco-data:/data \
  -e NODE_ENV=production \
  -e RESEND_API_KEY=re_... \
  -e SHEETDB_API_KEY=key_... \
  -e SITE_PUBLIC_URL=https://your-domain.com \
  elturco-dispatch
```

### PM2 (Process Manager)
```bash
npm install -g pm2
pm2 start dist/server.js --name elturco-dispatch
pm2 save
pm2 startup
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Server port (default: 5000) |
| `DB_PATH` | No | SQLite database path (default: `data.db`) |
| `SITE_PUBLIC_URL` | Yes | Public URL for email links |
| `RESEND_API_KEY` | Yes | Resend.com API key for emails |
| `SHEETDB_API_KEY` | No | SheetDB global API key |
| `BASE44_API` | No | ELTS Freelancer API URL |
| `BASE44_KEY` | No | ELTS API key |
| `SLACK_WEBHOOK_URL` | No | Slack notifications webhook |

## PM Accounts
Default accounts are created on first run:
- `cenk@eltur.co` / `elturco2026` (PM)
- `perplexity@eltur.co` / `elturco2026` (Admin)

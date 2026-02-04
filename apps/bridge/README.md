# Bridge Server

Express + WebSocket server that sits between the Chat Pilot web UI and Claude Code CLI on the VM.

## Quick Start

```bash
# Dev (no auth required)
npm run dev

# Production
npm run build
BRIDGE_API_KEY=your-secret-key node dist/index.js
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BRIDGE_PORT` | No | `3001` | HTTP/WS port |
| `BRIDGE_API_KEY` | Prod only | `''` (disabled) | Bearer token for API auth. Empty = auth disabled. |
| `CORS_ORIGINS` | No | `''` (allow all) | Comma-separated allowed origins (e.g. `https://app.b-intelligence.com.au,http://localhost:5173`) |
| `IPC_DIR` | No | OS temp dir | Base directory for session IPC files |
| `CLAUDE_PATH` | No | `claude` | Path to Claude CLI binary |

## Authentication

All endpoints (HTTP + WebSocket) are protected by Bearer token auth when `BRIDGE_API_KEY` is set.

- **HTTP**: `Authorization: Bearer <key>` header on every request
- **WebSocket**: `?token=<key>` query param on connect URL
- **`/health`**: Always public (no auth needed) — used for uptime monitoring

When `BRIDGE_API_KEY` is empty (local dev), auth is completely disabled.

### Web Client Config

The web client reads `VITE_BRIDGE_API_KEY` from its `.env` and sends it automatically via the `fetchWithAuth` helper and WebSocket query param. Both values must match.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (always public) |
| GET | `/sessions` | List Claude Code sessions |
| GET | `/sessions/:id` | Get session transcript |
| POST | `/sessions/:id/label` | Set session label |
| POST | `/sessions/:id/message` | Send message to session |
| POST | `/sessions` | Create new session |
| GET | `/web-chats` | List web chats |
| POST | `/web-chats` | Create web chat |
| GET | `/web-chats/:id` | Get web chat |
| POST | `/web-chats/:id/message` | Send message |
| DELETE | `/web-chats/:id` | Stop web chat |
| POST | `/web-chats/cleanup` | Cleanup stopped chats |
| GET | `/web-chats/:id/approvals` | Pending approval requests |
| POST | `/web-chats/:id/approve` | Allow/deny approval |
| GET | `/web-chats/:id/transcript` | Get chat transcript |
| GET | `/files/read?path=` | Read file contents (path-restricted) |
| WS | `/ws` | Real-time events (transcript, status, approvals) |

## Deployment

**All deploys are manual.** No CI/CD pipeline. SSH into the VM and git pull.

See `apps/chat-pilot/deploy/README.md` for full SSH + deploy instructions.

### Quick Deploy

```bash
# SSH into VM (via IAP tunnel)
gcloud compute ssh b-intelligence-brain --zone=us-central1-a --tunnel-through-iap

# Pull, build, restart
cd ~/b-intelligent-protocol-live
git stash   # if dist/ has local changes
git pull origin main
cd apps/chat-pilot/apps/bridge
npm install
npx tsc
pm2 restart bridge
```

### One-liner

```bash
gcloud compute ssh b-intelligence-brain --zone=us-central1-a --tunnel-through-iap -- \
  'source ~/.nvm/nvm.sh; export PATH="$HOME/.local/share/pnpm:$PATH"; cd ~/b-intelligent-protocol-live && git stash; git pull origin main && cd apps/chat-pilot/apps/bridge && npm install && npx tsc && pm2 restart bridge'
```

### Setting the API Key on the VM

The API key is set via PM2 environment. After first deploy with auth:

```bash
# On the VM — restart bridge with the env var
BRIDGE_API_KEY=your-secret-key pm2 restart bridge --update-env
```

Check PM2 config for the current env setup: `pm2 describe bridge`.

## Architecture

```
Cloud Run (HTTPS)                          GCP VM (HTTP :3001)
+----------------------------------+      +----------------------------+
| Web Client (nginx + static SPA)  |      | Bridge Server (Express)    |
|                                  |      |   ├─ /sessions/*           |
|  /api/*  ──proxy_pass──────────────────>|   ├─ /web-chats/*          |
|  /ws     ──proxy_pass (upgrade)────────>|   ├─ /files/read           |
|  /*      ──SPA (index.html)      |      |   └─ /ws (WebSocket)       |
+----------------------------------+      +----------------------------+
                                                     │
                                              Claude Code CLI
                                              IPC files / sessions
```

The web client's nginx proxies all API and WebSocket requests to the bridge VM.
This avoids mixed content (HTTPS→HTTP) — browsers block HTTP requests from HTTPS pages.

## Troubleshooting

```bash
# Check bridge logs
pm2 logs bridge --lines 100

# Test auth locally
BRIDGE_API_KEY=test npm start
curl http://localhost:3001/health                                    # 200 (public)
curl http://localhost:3001/web-chats                                 # 401
curl -H "Authorization: Bearer test" http://localhost:3001/web-chats # 200
```

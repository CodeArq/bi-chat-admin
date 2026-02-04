# Chat-Pilot Deployment Guide

## VM Details

| Field | Value |
|-------|-------|
| **VM Name** | `b-intelligence-brain` |
| **Zone** | `us-central1-a` |
| **GCP Project** | `b-intelligence-brain` |
| **Machine Type** | `e2-small` |
| **External IP** | `34.69.185.71` |
| **SSH User** | `ryan_liquidhq_com_au` |
| **SSH Method** | Google IAP tunnel (no direct SSH on port 22) |

### Services Running (via PM2)

| Service | Port | Path on VM |
|---------|------|------------|
| Bridge Server | 3001 | `~/b-intelligent-protocol-live/apps/chat-pilot/apps/bridge` |
| Notion MCP | 3057 | `~/b-intelligent-protocol-live/apps/notion-mcp` |

### Environment Variables (Bridge)

| Variable | Description |
|----------|-------------|
| `BRIDGE_API_KEY` | Bearer token for API auth. **Required in production.** Empty = auth disabled. |
| `CORS_ORIGINS` | Comma-separated allowed origins. Empty = allow all. |
| `BRIDGE_PORT` | Default `3001` |

See `apps/chat-pilot/apps/bridge/README.md` for full env var reference.

---

## SSH into the VM (Terminal)

```bash
gcloud compute ssh b-intelligence-brain --zone=us-central1-a
```

That's it. GCP handles auth via IAP tunnel automatically.

### Useful commands once inside

```bash
# Check services
pm2 list
pm2 logs bridge
pm2 logs bridge --lines 50

# Restart services
pm2 restart bridge
pm2 restart all

# Check what's running
pm2 describe bridge
```

---

## Connect VS Code (Remote SSH)

VS Code can connect to GCP VMs via the **Remote - SSH** extension + **Cloud Code** extension.

### Option A: Cloud Code Extension (Recommended)

1. Install the **Cloud Code** extension in VS Code
2. Open Command Palette (`Cmd+Shift+P`)
3. Type: `Cloud Code: Open with Cloud Shell Terminal` or use the Cloud Code sidebar
4. Select `b-intelligence-brain` VM

### Option B: Manual SSH Config

1. Install the **Remote - SSH** extension in VS Code

2. Run this in your local terminal to create a tunnel config:

```bash
gcloud compute ssh b-intelligence-brain --zone=us-central1-a --dry-run
```

3. Add this to `~/.ssh/config`:

```
Host b-intelligence-brain
  HostName compute.5631566254085356008
  User ryan_liquidhq_com_au
  IdentityFile ~/.ssh/google_compute_engine
  CheckHostIP no
  HostKeyAlias compute.5631566254085356008
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/google_compute_known_hosts
  ProxyCommand /Users/ryanb/.config/gcloud/virtenv/bin/python3 /opt/homebrew/Caskroom/gcloud-cli/553.0.0/google-cloud-sdk/lib/gcloud.py compute start-iap-tunnel b-intelligence-brain %p --listen-on-stdin --project=b-intelligence-brain --zone=us-central1-a --verbosity=warning
  ProxyUseFdpass no
```

4. In VS Code: `Cmd+Shift+P` -> `Remote-SSH: Connect to Host` -> select `b-intelligence-brain`

5. Once connected, open folder: `~/b-intelligent-protocol-live`

---

## Manual Deploy (Current Method)

When you push code to `main` and need it on the VM:

```bash
# 1. SSH in (via IAP tunnel)
gcloud compute ssh b-intelligence-brain --zone=us-central1-a --tunnel-through-iap

# 2. Pull latest code
cd ~/b-intelligent-protocol-live
git stash   # if dist/ has local changes
git pull origin main

# 3. Install deps + build + restart
cd apps/chat-pilot/apps/bridge
npm install
npx tsc
pm2 restart bridge
```

### One-liner version

```bash
gcloud compute ssh b-intelligence-brain --zone=us-central1-a --tunnel-through-iap -- 'source ~/.nvm/nvm.sh; export PATH="$HOME/.local/share/pnpm:$PATH"; cd ~/b-intelligent-protocol-live && git stash; git pull origin main && cd apps/chat-pilot/apps/bridge && npm install && npx tsc && pm2 restart bridge'
```

---

## API Key Authentication

The bridge requires a `BRIDGE_API_KEY` in production. All HTTP endpoints (except `/health`) and WebSocket connections are protected.

### First-time setup (on the VM)

```bash
# SSH in
gcloud compute ssh b-intelligence-brain --zone=us-central1-a

# Restart bridge with the API key
BRIDGE_API_KEY=your-secret-key pm2 restart bridge --update-env

# Verify it's set
pm2 describe bridge   # check env section
```

### Web client must match

The web client `.env` needs the same key:
```
VITE_BRIDGE_API_KEY=your-secret-key
```

Then rebuild + redeploy the web client (Cloud Run).

### Testing auth

```bash
# Health — always public
curl http://34.69.185.71:3001/health

# Without key — 401
curl http://34.69.185.71:3001/web-chats

# With key — 200
curl -H "Authorization: Bearer your-secret-key" http://34.69.185.71:3001/web-chats
```

---

## Architecture

```
Cloud Run (Serverless)              GCP VM (b-intelligence-brain)
+------------------------+         +-----------------------------------+
| Chat-Pilot Web UI      |  HTTP   | Bridge Server (:3001)             |
| React app              | ------> | Notion MCP    (:3057)             |
| Scale to zero           |  WS    | Claude Code CLI                   |
| ~$0-5/mo               |         | Agents & Skills                   |
+------------------------+         | Business Docs                     |
                                   +-----------------------------------+
                                              |
                                              | API
                                              v
                                   +-----------------------------------+
                                   | Notion (Source of Truth)           |
                                   +-----------------------------------+
```

---

## CI/CD

**Current method: Manual deploys via git pull.** No automated CI/CD pipeline.

SSH into the VM (browser or terminal), pull from git, build, and restart PM2. See "Manual Deploy" section above.

**Future improvement:** Replace `appleboy/ssh-action` in `.github/workflows/deploy-brain.yml` with `google-github-actions/ssh-compute` which supports IAP tunnel natively. Requires a GCP service account key stored as a GitHub secret.

---

## Troubleshooting

### Bridge not responding
```bash
pm2 logs bridge --lines 100
pm2 restart bridge
```

### Claude not working on VM
```bash
which claude
claude --version
claude login  # Re-authenticate if needed
```

### Can't SSH in
```bash
# Make sure gcloud is authenticated
gcloud auth login
gcloud config set project b-intelligence-brain
```

### Check firewall
```bash
gcloud compute firewall-rules list
# Port 3001 and 3057 should be open (b-intelligence-ports rule)
```

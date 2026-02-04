#!/bin/bash
# =============================================================================
# B-Intelligence Brain + Bridge VM Setup Script
# Run this ONCE on a fresh GCP Ubuntu 22.04 VM
#
# This VM runs:
#   - Bridge server (connects web UI to Claude)
#   - Notion MCP server
#   - Claude Code instances
#   - The full B-Intelligence agent system
#
# The Web UI runs separately on Cloud Run.
# =============================================================================

set -e  # Exit on error

echo "=========================================="
echo "B-Intelligence Brain + Bridge VM Setup"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

# -----------------------------------------------------------------------------
# 1. System updates
# -----------------------------------------------------------------------------
log "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# -----------------------------------------------------------------------------
# 2. Install Node.js via nvm
# -----------------------------------------------------------------------------
log "Installing nvm and Node.js 20..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm immediately
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20
nvm alias default 20

# -----------------------------------------------------------------------------
# 3. Install pnpm and pm2
# -----------------------------------------------------------------------------
log "Installing pnpm and pm2..."
npm install -g pnpm pm2

# -----------------------------------------------------------------------------
# 4. Install Claude CLI
# -----------------------------------------------------------------------------
log "Installing Claude CLI..."
npm install -g @anthropic-ai/claude-code

warn "You'll need to run 'claude login' manually to authenticate"

# -----------------------------------------------------------------------------
# 5. Clone repository (if not exists)
# -----------------------------------------------------------------------------
REPO_DIR="$HOME/b-Intelligent-Protocol-v2-LIVE"

if [ ! -d "$REPO_DIR" ]; then
    log "Cloning repository..."
    git clone https://github.com/CodeArq/b-intelligent-protocol-live.git "$REPO_DIR"
else
    log "Repository already exists, pulling latest..."
    cd "$REPO_DIR" && git pull
fi

# -----------------------------------------------------------------------------
# 6. Install dependencies
# -----------------------------------------------------------------------------
log "Installing project dependencies..."
cd "$REPO_DIR/apps/chat-pilot"
pnpm install

# -----------------------------------------------------------------------------
# 7. Create environment files
# -----------------------------------------------------------------------------
log "Creating environment files..."

# Get external IP
EXTERNAL_IP=$(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" 2>/dev/null || echo "YOUR_VM_IP")

# Bridge .env
cat > apps/bridge/.env << EOF
BRIDGE_PORT=3001
CLAUDE_PATH=$HOME/.nvm/versions/node/v20.19.5/bin/claude
IPC_DIR=/tmp/b-intelligent
EOF

# Web .env (for build)
cat > apps/web/.env << EOF
VITE_API_URL=http://${EXTERNAL_IP}:3001
VITE_WS_URL=ws://${EXTERNAL_IP}:3001/ws
EOF

log "Environment files created with IP: $EXTERNAL_IP"

# -----------------------------------------------------------------------------
# 8. Build the bridge server
# -----------------------------------------------------------------------------
log "Building bridge server..."
pnpm --filter bridge build

# -----------------------------------------------------------------------------
# 9. Start Notion MCP server
# -----------------------------------------------------------------------------
log "Starting Notion MCP server..."
cd "$REPO_DIR/apps/notion-mcp"
pnpm install
pnpm build

# -----------------------------------------------------------------------------
# 10. Setup PM2 ecosystem
# -----------------------------------------------------------------------------
log "Creating PM2 ecosystem config..."
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: 'bridge',
      cwd: './apps/chat-pilot/apps/bridge',
      script: 'node',
      args: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        BRIDGE_PORT: 3001,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'notion-mcp',
      cwd: './apps/notion-mcp',
      script: 'node',
      args: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3057,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
}
EOF

# -----------------------------------------------------------------------------
# 11. Start services with PM2
# -----------------------------------------------------------------------------
log "Starting services with PM2..."
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# -----------------------------------------------------------------------------
# 12. Create deploy script for CI/CD
# -----------------------------------------------------------------------------
log "Creating deploy script..."
cat > deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
# Called by GitHub Actions on push to main
set -e

cd ~/b-Intelligent-Protocol-v2-LIVE

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
cd apps/chat-pilot && pnpm install
cd ../notion-mcp && pnpm install

echo "Building..."
cd ~/b-Intelligent-Protocol-v2-LIVE/apps/chat-pilot
pnpm --filter bridge build

cd ~/b-Intelligent-Protocol-v2-LIVE/apps/notion-mcp
pnpm build

echo "Restarting services..."
pm2 restart all

echo "Deploy complete!"
DEPLOY_SCRIPT
chmod +x deploy.sh

# -----------------------------------------------------------------------------
# Done!
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Run 'claude login' to authenticate Claude CLI"
echo "2. Configure your firewall: sudo ufw allow 3001,3057/tcp"
echo "3. Update Cloud Run web app with bridge URL: http://$EXTERNAL_IP:3001"
echo ""
echo "Services running:"
pm2 list
echo ""

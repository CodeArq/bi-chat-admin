module.exports = {
  apps: [{
    name: "bridge",
    script: "dist/index.js",
    cwd: "/home/ryan_liquidhq_com_au/b-intelligent-protocol-live/apps/chat-pilot/apps/bridge",
    env: {
      NODE_ENV: "production",
      BRIDGE_PORT: "3001",
      CLAUDE_PATH: "/usr/local/bin/claude",
      PATH: "/home/ryan_liquidhq_com_au/.nvm/versions/node/v20.20.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      NVM_DIR: "/home/ryan_liquidhq_com_au/.nvm",
      HOME: "/home/ryan_liquidhq_com_au"
    },
    max_memory_restart: "500M",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "/home/ryan_liquidhq_com_au/logs/bridge-error.log",
    out_file: "/home/ryan_liquidhq_com_au/logs/bridge-out.log",
    merge_logs: true
  }]
};

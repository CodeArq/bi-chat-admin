import { join } from 'path'
import { tmpdir } from 'os'

export const config = {
  // Server config
  port: parseInt(process.env.BRIDGE_PORT || '3001', 10),

  // Claude CLI path - resolved via CLAUDE_PATH env var or shell lookup
  claudePath: process.env.CLAUDE_PATH || 'claude',

  // Base IPC directory
  ipcDir: process.env.IPC_DIR || join(tmpdir(), 'b-intelligent'),

  // Allowed file read prefixes (comma-separated, for diff viewer whole-file view)
  allowedFilePrefixes: (process.env.ALLOWED_FILE_PREFIXES || '/Users/ryanb/Developer/,/home/,/tmp/').split(',').filter(Boolean),

  // API key for authentication (empty = auth disabled for local dev)
  apiKey: process.env.BRIDGE_API_KEY || '',

  // Allowed CORS origins (comma-separated)
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),

  // Sessions registry directory
  get sessionsDir() {
    return join(this.ipcDir, 'sessions')
  },

  // Session-specific paths
  getSessionDir(sessionId: string): string {
    return join(this.ipcDir, sessionId)
  },
}

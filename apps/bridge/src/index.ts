import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from './config.js'
import { requireApiKey, validateWsToken } from './middleware/auth.js'
import { sessionsRouter } from './routes/sessions.js'
import { webChatsRouter } from './routes/webChats.js'
import { processManager } from './services/processManager.js'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

// Track connected clients
const clients = new Set<WebSocket>()

// Middleware
app.use(cors({
  origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))
app.use(requireApiKey)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ipc_dir: config.ipcDir })
})

// Mount routes
app.use('/sessions', sessionsRouter)
app.use('/web-chats', webChatsRouter)

// File read endpoint (for diff viewer whole-file view)
app.get('/files/read', async (req, res) => {
  const filePath = req.query.path as string
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter required' })
  }

  // Basic security: only allow reading from known safe directories
  const allowedPrefixes = [
    ...config.allowedFilePrefixes,
    config.ipcDir,
  ]
  const isAllowed = allowedPrefixes.some(prefix => filePath.startsWith(prefix))
  if (!isAllowed) {
    return res.status(403).json({ error: 'Path not allowed' })
  }

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    res.json({ content, path: filePath })
  } catch (err) {
    console.error('[Server] File read error:', err)
    res.status(500).json({ error: 'Failed to read file' })
  }
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  if (!validateWsToken(req.url)) {
    console.log('[WS] Rejected - invalid token')
    ws.close(4401, 'Unauthorized')
    return
  }

  console.log('[WS] Client connected')
  clients.add(ws)

  ws.on('close', () => {
    console.log('[WS] Client disconnected')
    clients.delete(ws)
  })

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err)
    clients.delete(ws)
  })

  // Send initial state
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
  }))
})

// Broadcast to all connected clients
function broadcast(event: object) {
  const message = JSON.stringify(event)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

// Wire up process manager events to WebSocket
processManager.on('transcript_entry', (entry) => {
  broadcast({
    type: 'transcript_entry',
    data: entry,
    timestamp: new Date().toISOString(),
  })
})

processManager.on('chat_status', (data) => {
  broadcast({
    type: 'chat_status',
    data,
    timestamp: new Date().toISOString(),
  })
})

processManager.on('approval_request', (data) => {
  console.log(`[WS] Broadcasting approval request: ${data.request.tool_name}`)
  broadcast({
    type: 'approval_request',
    data,
    timestamp: new Date().toISOString(),
  })
})

// Start server
async function start() {
  server.listen(config.port, () => {
    console.log(`
+======================================================+
|           B-INTELLIGENT BRIDGE SERVER                |
+======================================================+
|  Status:    RUNNING                                  |
|  Port:      ${String(config.port).padEnd(41)}|
|  IPC Dir:   ${config.ipcDir.slice(0, 40).padEnd(41)}|
|  WebSocket: ws://localhost:${config.port}/ws${' '.repeat(24)}|
+======================================================+
|  Session Endpoints (JSONL transcripts):              |
|    GET    /sessions              - List sessions     |
|    GET    /sessions/:id          - Get transcript    |
|    POST   /sessions/:id/label   - Set label         |
|    POST   /sessions/:id/message - Send message       |
|    POST   /sessions              - Create session    |
+------------------------------------------------------+
|  Web Chat Endpoints (streaming + approvals):         |
|    GET    /web-chats             - List web chats    |
|    POST   /web-chats             - Create web chat   |
|    GET    /web-chats/:id         - Get web chat      |
|    POST   /web-chats/:id/message - Send message      |
|    DELETE /web-chats/:id         - Stop web chat     |
|    POST   /web-chats/cleanup     - Cleanup stopped   |
|    GET    /web-chats/:id/approvals - Pending         |
|    POST   /web-chats/:id/approve - Allow/Deny        |
|    GET    /web-chats/:id/transcript - Transcript     |
+======================================================+
    `)
  })
}

start().catch(err => {
  console.error('[Server] Failed to start:', err)
  process.exit(1)
})

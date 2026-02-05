/**
 * WebSocket client factory — creates a client connected to a specific bridge URL.
 * Includes auto-reconnect with exponential backoff.
 */

type WSEventHandler = (event: { type: string; data: unknown }) => void

const RECONNECT_BASE_DELAY = 1000  // 1 second
const RECONNECT_MAX_DELAY = 30000  // 30 seconds
const RECONNECT_MAX_ATTEMPTS = 10

export class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers = new Set<WSEventHandler>()
  private connectionPromise: Promise<void> | null = null
  private _isConnected = false
  private wsUrl: string
  private apiKey: string
  private shouldReconnect = true
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(wsUrl: string, apiKey: string) {
    this.wsUrl = wsUrl
    this.apiKey = apiKey
  }

  get isConnected() {
    return this._isConnected
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.shouldReconnect = true

    this.connectionPromise = new Promise((resolve, reject) => {
      const url = this.apiKey ? `${this.wsUrl}?token=${this.apiKey}` : this.wsUrl
      console.log('[WSClient] Creating connection to', this.wsUrl)

      const ws = new WebSocket(url)

      ws.onopen = () => {
        console.log('[WSClient] Connected')
        this._isConnected = true
        this.reconnectAttempts = 0  // Reset on successful connection
        this.connectionPromise = null
        resolve()
      }

      ws.onclose = () => {
        console.log('[WSClient] Disconnected')
        this._isConnected = false
        this.ws = null
        this.connectionPromise = null
        this.scheduleReconnect()
      }

      ws.onerror = (err) => {
        console.error('[WSClient] Error:', err)
        this._isConnected = false
        this.connectionPromise = null
        // Only reject on first connect, not on reconnect attempts
        if (this.reconnectAttempts === 0) {
          reject(err)
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handlers.forEach(handler => handler(data))
        } catch {
          // Ignore parse errors
        }
      }

      this.ws = ws
    })

    return this.connectionPromise
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
        console.log('[WSClient] Max reconnect attempts reached')
      }
      return
    }

    // Exponential backoff: 1s, 2s, 4s, 8s... up to max
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    )

    this.reconnectAttempts++
    console.log(`[WSClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(() => {
        // Error already logged in onerror handler
      })
    }, delay)
  }

  subscribe(handler: WSEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this._isConnected = false
      this.connectionPromise = null
    }
  }
}

/**
 * WebSocket client factory — creates a client connected to a specific bridge URL.
 * Replaces the old singleton that used hardcoded env vars.
 */

type WSEventHandler = (event: { type: string; data: unknown }) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers = new Set<WSEventHandler>()
  private connectionPromise: Promise<void> | null = null
  private _isConnected = false
  private wsUrl: string
  private apiKey: string

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

    this.connectionPromise = new Promise((resolve, reject) => {
      const url = this.apiKey ? `${this.wsUrl}?token=${this.apiKey}` : this.wsUrl
      console.log('[WSClient] Creating connection to', this.wsUrl)

      const ws = new WebSocket(url)

      ws.onopen = () => {
        console.log('[WSClient] Connected')
        this._isConnected = true
        this.connectionPromise = null
        resolve()
      }

      ws.onclose = () => {
        console.log('[WSClient] Disconnected')
        this._isConnected = false
        this.ws = null
        this.connectionPromise = null
      }

      ws.onerror = (err) => {
        console.error('[WSClient] Error:', err)
        this._isConnected = false
        this.connectionPromise = null
        reject(err)
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

  subscribe(handler: WSEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this._isConnected = false
      this.connectionPromise = null
    }
  }
}

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth, type ClientConfig } from './AuthContext'

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>

interface BridgeContextValue {
  clientConfig: ClientConfig | null
  /** Base URL for bridge API (e.g. "https://bridge.b-intelligence.com.au") */
  bridgeUrl: string | null
  /** WebSocket URL (e.g. "wss://bridge.b-intelligence.com.au/ws") */
  wsUrl: string | null
  /** Fetch wrapper with bridge auth header */
  fetchWithAuth: FetchFn
  /** Bridge API key for WS token param */
  apiKey: string | null
}

const BridgeContext = createContext<BridgeContextValue | null>(null)

function createFetchWithAuth(bridgeUrl: string, apiKey: string): FetchFn {
  return (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    if (apiKey) {
      headers.set('Authorization', `Bearer ${apiKey}`)
    }
    // If url starts with /, prepend bridgeUrl
    const fullUrl = url.startsWith('/') ? `${bridgeUrl}${url}` : url
    return fetch(fullUrl, { ...options, headers })
  }
}

function noopFetch(): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }))
}

export function BridgeProvider({ children }: { children: ReactNode }) {
  const { clientConfig } = useAuth()

  const value = useMemo<BridgeContextValue>(() => {
    if (!clientConfig) {
      return {
        clientConfig: null,
        bridgeUrl: null,
        wsUrl: null,
        fetchWithAuth: noopFetch,
        apiKey: null,
      }
    }

    const bridgeUrl = clientConfig.bridge_url.replace(/\/$/, '')
    const wsProtocol = bridgeUrl.startsWith('https') ? 'wss' : 'ws'
    const wsHost = bridgeUrl.replace(/^https?:\/\//, '')
    const wsUrl = `${wsProtocol}://${wsHost}/ws`

    return {
      clientConfig,
      bridgeUrl,
      wsUrl,
      fetchWithAuth: createFetchWithAuth(bridgeUrl, clientConfig.bridge_api_key),
      apiKey: clientConfig.bridge_api_key,
    }
  }, [clientConfig])

  return (
    <BridgeContext.Provider value={value}>
      {children}
    </BridgeContext.Provider>
  )
}

export function useBridge() {
  const context = useContext(BridgeContext)
  if (!context) {
    throw new Error('useBridge must be used within a BridgeProvider')
  }
  return context
}

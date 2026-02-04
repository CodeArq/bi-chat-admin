import { useEffect, useRef, useState } from 'react'
import { WebSocketClient } from '../lib/wsClient'
import { useBridge } from '../context/BridgeContext'
import type { WebChatMessage, ApprovalRequest, ProcessState } from '../types'

interface ChatStatusEvent {
  chat_id: string
  status: string
  process_state?: ProcessState
  error?: string
}

interface UseWebSocketOptions {
  onTranscriptEntry?: (entry: WebChatMessage) => void
  onChatStatus?: (data: ChatStatusEvent) => void
  onApprovalRequest?: (data: { chat_id: string; request: ApprovalRequest }) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { wsUrl, apiKey } = useBridge()
  const [isConnected, setIsConnected] = useState(false)
  const optionsRef = useRef(options)
  const clientRef = useRef<WebSocketClient | null>(null)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    // Need bridge config to connect (apiKey can be empty for local dev)
    if (!wsUrl) {
      setIsConnected(false)
      return
    }

    // Disconnect previous client if bridge changed
    if (clientRef.current) {
      clientRef.current.disconnect()
    }

    const client = new WebSocketClient(wsUrl, apiKey || '')
    clientRef.current = client

    client.connect().then(() => {
      setIsConnected(true)
    }).catch(() => {
      setIsConnected(false)
    })

    const unsubscribe = client.subscribe((event: { type: string; data: unknown }) => {
      if (event.type === 'transcript_entry') {
        optionsRef.current.onTranscriptEntry?.(event.data as WebChatMessage)
      } else if (event.type === 'chat_status') {
        optionsRef.current.onChatStatus?.(event.data as ChatStatusEvent)
      } else if (event.type === 'approval_request') {
        console.log('[WS] Approval request received:', event.data)
        optionsRef.current.onApprovalRequest?.(event.data as { chat_id: string; request: ApprovalRequest })
      } else if (event.type === 'connected') {
        setIsConnected(true)
      }
    })

    return () => {
      unsubscribe()
      client.disconnect()
      clientRef.current = null
    }
  }, [wsUrl, apiKey])

  return { isConnected }
}

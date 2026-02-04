import { useState, useEffect, useCallback } from 'react'
import type { WebChat, WebChatMessage, ApprovalRequest, ApprovalResponse, PermissionMode, Attachment } from '../types'
import { useBridge } from '../context/BridgeContext'

interface UseWebChatsReturn {
  chats: WebChat[]
  loading: boolean
  error: string | null
  createChat: (cwd: string, name?: string, sessionId?: string, permissionMode?: PermissionMode) => Promise<WebChat | null>
  sendMessage: (chatId: string, content: string, attachments?: Attachment[]) => Promise<boolean>
  stopChat: (chatId: string) => Promise<boolean>
  fetchTranscript: (chatId: string) => Promise<WebChatMessage[]>
  refresh: () => Promise<void>
  respondToApproval: (chatId: string, response: ApprovalResponse) => Promise<boolean>
  getPendingApprovals: (chatId: string) => Promise<ApprovalRequest[]>
  setAutoApprove: (chatId: string, enabled: boolean) => Promise<boolean>
}

export function useWebChats(): UseWebChatsReturn {
  const { fetchWithAuth } = useBridge()
  const [chats, setChats] = useState<WebChat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchChats = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/web-chats')

      if (!response.ok) {
        throw new Error(`Failed to fetch web chats: ${response.status}`)
      }

      const data = await response.json()
      setChats(data.chats || [])
      setError(null)
    } catch (err: any) {
      console.error('[useWebChats] Error:', err)
      setError(err.message)
    }
  }, [fetchWithAuth])

  const createChat = useCallback(async (cwd: string, name?: string, sessionId?: string, permissionMode?: PermissionMode): Promise<WebChat | null> => {
    try {
      const response = await fetchWithAuth('/web-chats', {
        method: 'POST',
        body: JSON.stringify({ cwd, name, session_id: sessionId, permission_mode: permissionMode || 'assisted' }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create web chat: ${response.status}`)
      }

      const chat = await response.json()
      setChats((prev) => [...prev, chat])
      return chat
    } catch (err: any) {
      console.error('[useWebChats] Create error:', err)
      setError(err.message)
      return null
    }
  }, [fetchWithAuth])

  const sendMessage = useCallback(async (chatId: string, content: string, attachments?: Attachment[]): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/web-chats/${chatId}/message`, {
        method: 'POST',
        body: JSON.stringify({ content, attachments }),
      })

      return response.ok
    } catch (err: any) {
      console.error('[useWebChats] Send error:', err)
      return false
    }
  }, [fetchWithAuth])

  const stopChat = useCallback(async (chatId: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/web-chats/${chatId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, status: 'stopped' as const } : c)))
      }

      return response.ok
    } catch (err: any) {
      console.error('[useWebChats] Stop error:', err)
      return false
    }
  }, [fetchWithAuth])

  const fetchTranscript = useCallback(async (chatId: string): Promise<WebChatMessage[]> => {
    try {
      const response = await fetchWithAuth(`/web-chats/${chatId}/transcript`)

      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.status}`)
      }

      const data = await response.json()
      return (data.entries || []).map((entry: any) => ({
        ...entry,
        chat_id: chatId,
      }))
    } catch (err: any) {
      console.error('[useWebChats] Fetch transcript error:', err)
      return []
    }
  }, [fetchWithAuth])

  // Initial fetch
  useEffect(() => {
    setLoading(true)
    fetchChats().finally(() => setLoading(false))
  }, [fetchChats])

  // Poll for status updates (3s for responsive dashboard)
  useEffect(() => {
    const interval = setInterval(fetchChats, 3000)
    return () => clearInterval(interval)
  }, [fetchChats])

  // Respond to approval request
  const respondToApproval = useCallback(async (chatId: string, approvalResponse: ApprovalResponse): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/web-chats/${chatId}/approve`, {
        method: 'POST',
        body: JSON.stringify(approvalResponse),
      })

      return response.ok
    } catch (err: any) {
      console.error('[useWebChats] Approval response error:', err)
      return false
    }
  }, [fetchWithAuth])

  // Get pending approvals for a chat
  const getPendingApprovals = useCallback(async (chatId: string): Promise<ApprovalRequest[]> => {
    try {
      const response = await fetchWithAuth(`/web-chats/${chatId}/approvals`)

      if (!response.ok) {
        throw new Error(`Failed to fetch approvals: ${response.status}`)
      }

      const data = await response.json()
      return data.approvals || []
    } catch (err: any) {
      console.error('[useWebChats] Fetch approvals error:', err)
      return []
    }
  }, [fetchWithAuth])

  // Toggle auto-approve for a chat
  const setAutoApprove = useCallback(async (chatId: string, enabled: boolean): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/web-chats/${chatId}/auto-approve`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      })
      return response.ok
    } catch (err: any) {
      console.error('[useWebChats] Auto-approve error:', err)
      return false
    }
  }, [fetchWithAuth])

  return {
    chats,
    loading,
    error,
    createChat,
    sendMessage,
    stopChat,
    fetchTranscript,
    refresh: fetchChats,
    respondToApproval,
    getPendingApprovals,
    setAutoApprove,
  }
}

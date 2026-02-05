import { useState, useEffect, useCallback } from 'react'
import { useBridge } from '../context/BridgeContext'

export interface ProcessInfo {
  pid: number
  cpu: number
  memoryMB: number
  runtime: string
}

export interface SessionStats {
  messageCount: number
  toolCount: number
  agentCount: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  estimatedCost: number
}

export interface UnifiedSession {
  sessionId: string
  label?: string
  cwd: string
  projectFolder: string
  lastModified: string
  sizeBytes: number
  processInfo?: ProcessInfo
  username?: string  // Linux user who owns this session
  stats?: SessionStats  // Quick stats from JSONL scan
}

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  message_count: number
  estimated_cost_usd: number
}

export interface SessionTranscript {
  sessionId: string
  label?: string
  cwd: string
  entries: any[]
  entryCount: number
  usage?: SessionUsage
  typeCounts?: Record<string, number>
  toolCounts?: Record<string, number>
}

export function useUnifiedSessions() {
  const { fetchWithAuth } = useBridge()
  const [sessions, setSessions] = useState<UnifiedSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async (cwd?: string, isBackgroundRefresh = false) => {
    try {
      // Only show loading on initial fetch, not background refreshes
      if (!isBackgroundRefresh) setLoading(true)

      let url = '/sessions'
      if (cwd) url += '?cwd=' + encodeURIComponent(cwd)

      const response = await fetchWithAuth(url)
      if (!response.ok) throw new Error('Failed to fetch sessions')

      const data = await response.json()
      setSessions(data.sessions || [])
      setError(null)
    } catch (err: any) {
      console.error('[useUnifiedSessions] Error:', err)
      setError(err.message)
    } finally {
      if (!isBackgroundRefresh) setLoading(false)
    }
  }, [fetchWithAuth])

  const fetchTranscript = useCallback(async (sessionId: string, cwd?: string): Promise<SessionTranscript | null> => {
    try {
      let url = '/sessions/' + sessionId
      if (cwd) url += '?cwd=' + encodeURIComponent(cwd)

      const response = await fetchWithAuth(url)
      if (!response.ok) throw new Error('Failed to fetch transcript')

      return await response.json()
    } catch (err: any) {
      console.error('[useUnifiedSessions] Transcript error:', err)
      return null
    }
  }, [fetchWithAuth])

  const setLabel = useCallback(async (sessionId: string, label: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth('/sessions/' + sessionId + '/label', {
        method: 'POST',
        body: JSON.stringify({ label }),
      })

      if (response.ok) {
        setSessions(prev => prev.map(s =>
          s.sessionId === sessionId ? { ...s, label } : s
        ))
        return true
      }
      return false
    } catch (err: any) {
      console.error('[useUnifiedSessions] Label error:', err)
      return false
    }
  }, [fetchWithAuth])

  const sendMessage = useCallback(async (sessionId: string, content: string, cwd?: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth('/sessions/' + sessionId + '/message', {
        method: 'POST',
        body: JSON.stringify({ content, cwd }),
      })
      return response.ok
    } catch (err: any) {
      console.error('[useUnifiedSessions] Send error:', err)
      return false
    }
  }, [fetchWithAuth])

  const createSession = useCallback(async (cwd: string, message?: string, label?: string): Promise<string | null> => {
    try {
      const response = await fetchWithAuth('/sessions', {
        method: 'POST',
        body: JSON.stringify({ cwd, message, label }),
      })

      if (!response.ok) throw new Error('Failed to create session')

      const data = await response.json()
      await fetchSessions()
      return data.sessionId
    } catch (err: any) {
      console.error('[useUnifiedSessions] Create error:', err)
      return null
    }
  }, [fetchWithAuth, fetchSessions])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    // Background refresh - don't show loading indicator
    const interval = setInterval(() => fetchSessions(undefined, true), 10000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    fetchTranscript,
    setLabel,
    sendMessage,
    createSession,
  }
}

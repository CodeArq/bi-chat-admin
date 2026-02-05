import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { useBridge } from './context/BridgeContext'
import { useUnifiedSessions, UnifiedSession, SessionUsage } from './hooks/useUnifiedSessions'
import { useWebSocket } from './hooks/useWebSocket'
import { useWebChats } from './hooks/useWebChats'
import { Header } from './components/Header'
import { TranscriptView } from './components/TranscriptView'
import { ViewModeToggle } from './components/ViewModeToggle'
import { MessageInput } from './components/MessageInput'
import { LoginPage } from './components/LoginPage'
import type { ViewMode, TranscriptEntry, TranscriptEntryType, ApprovalRequest, ProcessState, PermissionMode, Attachment } from './types'

interface FolderInfo {
  name: string
  path: string
  modifiedAt: string
}

type ActiveView =
  | { type: 'dashboard' }
  | { type: 'session'; sessionId: string; cwd: string; isAgent?: boolean; parentSessionId?: string }

function App() {
  const { user, clientConfig, loading: authLoading, signOut } = useAuth()

  // Auth gate: loading screen
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">[*]</div>
        <div className="loading-text">RESTORING SESSION...</div>
      </div>
    )
  }

  // Auth gate: login page
  if (!user) {
    return <LoginPage />
  }

  // Waiting for client config to load
  if (!clientConfig) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">[*]</div>
        <div className="loading-text">LOADING CONFIG...</div>
      </div>
    )
  }

  return <AuthenticatedApp clientName={clientConfig.name} defaultCwd={clientConfig.default_cwd} onSignOut={signOut} />
}

function AuthenticatedApp({ clientName, defaultCwd, onSignOut }: { clientName: string; defaultCwd: string | null; onSignOut: () => void }) {
  const { fetchWithAuth } = useBridge()
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'dashboard' })
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('detailed')
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [sessionLabel, setSessionLabel] = useState<string | undefined>()
  const [sessionUsage, setSessionUsage] = useState<SessionUsage | undefined>()
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [newLabelValue, setNewLabelValue] = useState('')
  const [typeFilter, setTypeFilter] = useState<TranscriptEntryType | 'all'>('all')
  const [toolFilter, setToolFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandAllTrigger, setExpandAllTrigger] = useState<number>(0)
  const [collapseAllTrigger, setCollapseAllTrigger] = useState<number>(0)
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [toolCounts, setToolCounts] = useState<Record<string, number>>({})
  // V2 approval mode
  const [isV2Mode, setIsV2Mode] = useState(false)
  const [v2ChatId, setV2ChatId] = useState<string | null>(null)
  const [respondedApprovals, setRespondedApprovals] = useState<Map<string, { behavior: 'allow' | 'deny'; selectedAnswer?: string }>>(new Map())
  // V2 process state tracking
  const [processState, setProcessState] = useState<ProcessState | undefined>(undefined)
  // Track process states for all chats (for dashboard display)
  const [chatStates, setChatStates] = useState<Map<string, ProcessState>>(new Map())
  // Error notification
  const [errorNotification, setErrorNotification] = useState<string | null>(null)
  // New session modal
  const [showNewSessionModal, setShowNewSessionModal] = useState(false)
  const [modalStep, setModalStep] = useState<'folder' | 'mode'>('folder')
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [foldersLoading, setFoldersLoading] = useState(false)
  // Auto-approve toggle
  const [autoApprove, setAutoApprove] = useState(false)

  // Fetch folders when modal opens
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true)
    try {
      const response = await fetchWithAuth('/folders')
      if (response.ok) {
        const data = await response.json()
        setFolders(data.folders || [])
      }
    } catch (err) {
      console.error('[App] Failed to fetch folders:', err)
    } finally {
      setFoldersLoading(false)
    }
  }, [fetchWithAuth])

  // Open new session modal
  const openNewSessionModal = useCallback(() => {
    setShowNewSessionModal(true)
    setModalStep('folder')
    setSelectedFolder(null)
    fetchFolders()
  }, [fetchFolders])

  const {
    sessions,
    loading,
    error,
    fetchTranscript,
    fetchSessions,
    setLabel,
  } = useUnifiedSessions()

  // Web chats hook for streaming + approval support
  const {
    chats: webChats,
    createChat: createWebChat,
    sendMessage: sendWebMessage,
    respondToApproval,
    stopChat: stopWebChat,
    getPendingApprovals,
    refresh: refreshWebChats,
    setAutoApprove: setAutoApproveApi,
  } = useWebChats()

  // Handle URL parameters for direct session/agent links
  useEffect(() => {
    if (initialLoadDone) return

    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session')
    const cwd = params.get('cwd')
    const isAgent = params.get('agent') === 'true'
    const parentSessionId = params.get('parent')

    if (sessionId && cwd) {
      // Load the session from URL
      fetchTranscript(sessionId, cwd).then((transcript) => {
        if (transcript) {
          setTranscriptEntries(transcript.entries)
          setSessionLabel(transcript.label)
          setSessionUsage(transcript.usage)
          setTypeCounts(transcript.typeCounts || {})
          setToolCounts(transcript.toolCounts || {})
        }
        setActiveView({
          type: 'session',
          sessionId,
          cwd,
          isAgent,
          parentSessionId: parentSessionId || undefined
        })
        setInitialLoadDone(true)
      })
    } else {
      setInitialLoadDone(true)
    }
  }, [initialLoadDone, fetchTranscript])

  // WebSocket for real-time updates — only accept entries for the active web chat
  const handleTranscriptEntry = useCallback((entry: any) => {
    if (activeView.type === 'session' && v2ChatId && entry.chat_id === v2ChatId) {
      setTranscriptEntries(prev => [...prev, entry])
    }
  }, [activeView, v2ChatId])

  // Handle incoming approval requests via WebSocket
  const handleApprovalRequest = useCallback((data: { chat_id: string; request: ApprovalRequest }) => {
    console.log('[App] Approval request received:', data)
    if (v2ChatId && data.chat_id === v2ChatId) {
      // Add as transcript entry (it will also come through handleTranscriptEntry)
      // Just log for now - the transcript entry will handle display
    }
  }, [v2ChatId])

  // Handle chat status updates (including process state)
  const handleChatStatus = useCallback((data: { chat_id: string; status: string; process_state?: ProcessState; error?: string }) => {
    console.log('[App] Chat status:', data)
    if (data.process_state) {
      // Track state for all chats (dashboard display)
      setChatStates(prev => new Map(prev).set(data.chat_id, data.process_state!))
      // Also set active session state
      if (v2ChatId && data.chat_id === v2ChatId) {
        setProcessState(data.process_state)
      }
    }
  }, [v2ChatId])

  const { isConnected } = useWebSocket({
    onTranscriptEntry: handleTranscriptEntry,
    onApprovalRequest: handleApprovalRequest,
    onChatStatus: handleChatStatus,
  })

  // Approval handlers
  const handleApprove = useCallback(async (requestId: string, updatedInput?: Record<string, unknown>) => {
    if (!v2ChatId) return
    console.log('[App] Approving:', requestId, updatedInput ? 'with updatedInput' : '')
    const success = await respondToApproval(v2ChatId, {
      request_id: requestId,
      behavior: 'allow',
      updated_input: updatedInput,
    })
    if (success) {
      // Extract selected answer from updatedInput for AskUserQuestion
      const selectedAnswer = updatedInput?.answers ? (updatedInput.answers as Record<string, string>)['0'] : undefined
      setRespondedApprovals(prev => new Map(prev).set(requestId, { behavior: 'allow', selectedAnswer }))
    }
  }, [v2ChatId, respondToApproval])

  const handleAutoApproveToggle = useCallback(async (enabled: boolean) => {
    if (!v2ChatId) {
      console.warn('[App] Cannot toggle auto-approve: no v2ChatId')
      return
    }
    // Optimistic update so the toggle responds instantly
    setAutoApprove(enabled)
    console.log('[App] Auto-approve toggle:', enabled, 'for chat:', v2ChatId)
    const success = await setAutoApproveApi(v2ChatId, enabled)
    if (!success) {
      // Revert on failure
      console.error('[App] Auto-approve API call failed, reverting')
      setAutoApprove(!enabled)
      setErrorNotification('Failed to toggle auto-approve — bridge may be unavailable.')
      setTimeout(() => setErrorNotification(null), 4000)
    }
  }, [v2ChatId, setAutoApproveApi])

  const handleDeny = useCallback(async (requestId: string, message?: string) => {
    if (!v2ChatId) return
    console.log('[App] Denying:', requestId, message)
    const success = await respondToApproval(v2ChatId, {
      request_id: requestId,
      behavior: 'deny',
      message,
    })
    if (success) {
      setRespondedApprovals(prev => new Map(prev).set(requestId, { behavior: 'deny' }))
    }
  }, [v2ChatId, respondToApproval])

  // Navigation
  const handleBack = () => {
    setActiveView({ type: 'dashboard' })
    setTranscriptEntries([])
    setSessionLabel(undefined)
    setSessionUsage(undefined)
    setTypeCounts({})
    setToolCounts({})
    setTypeFilter('all')
    setToolFilter('all')
    setSearchQuery('')
    // Reset V2 mode
    setIsV2Mode(false)
    setV2ChatId(null)
    setRespondedApprovals(new Map())
    setProcessState(undefined)
    setAutoApprove(false)
    // Immediately refresh dashboard data
    fetchSessions()
    refreshWebChats()
  }

  const handleSelectSession = async (session: UnifiedSession) => {
    const transcript = await fetchTranscript(session.sessionId, session.cwd)
    if (transcript) {
      setTranscriptEntries(transcript.entries)
      setSessionLabel(transcript.label)
      setSessionUsage(transcript.usage)
      setTypeCounts(transcript.typeCounts || {})
      setToolCounts(transcript.toolCounts || {})
    }

    // Check if this session is an active web chat — restore V2 mode if so
    const webChat = webChats.find(c => c.session_id === session.sessionId && c.status === 'running')
    if (webChat) {
      setIsV2Mode(true)
      setV2ChatId(webChat.id)
      setRespondedApprovals(new Map())
      setProcessState(chatStates.get(webChat.id))

      // Fetch any pending approvals and inject them into the transcript
      const pendingApprovals = await getPendingApprovals(webChat.id)
      if (pendingApprovals.length > 0) {
        const approvalEntries: TranscriptEntry[] = pendingApprovals.map(approval => ({
          id: `approval-${approval.request_id}`,
          type: 'approval_prompt' as TranscriptEntryType,
          content: {
            type: 'approval_prompt',
            request_id: approval.request_id,
            tool_name: approval.tool_name,
            tool_use_id: approval.tool_use_id,
            input: approval.input,
            input_preview: JSON.stringify(approval.input).slice(0, 100),
          },
          timestamp: approval.timestamp,
        }))
        setTranscriptEntries(prev => [...prev, ...approvalEntries])
      }
    }

    setActiveView({ type: 'session', sessionId: session.sessionId, cwd: session.cwd })
  }

  const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
    if (activeView.type !== 'session') return

    // Add user message to UI immediately
    const userEntry: TranscriptEntry = {
      id: Date.now().toString(),
      type: 'user',
      timestamp: new Date().toISOString(),
      content: { type: 'user', text: content + (attachments?.length ? ` [${attachments.length} image(s) attached]` : '') }
    }
    setTranscriptEntries(prev => [...prev, userEntry])

    // Streaming mode uses WebSocket for real-time updates
    if (isV2Mode && v2ChatId) {
      console.log('[App] Sending streaming message:', content, attachments?.length ? `with ${attachments.length} attachment(s)` : '')
      const success = await sendWebMessage(v2ChatId, content, attachments)
      if (!success) {
        setErrorNotification('Failed to send message — chat may still be processing. Try again.')
        setTimeout(() => setErrorNotification(null), 5000)
      }
      // WebSocket will handle real-time updates
      return
    }

    // Auto-upgrade: create a web chat with the existing session_id to resume it
    console.log('[App] Upgrading terminal session to web chat:', activeView.sessionId)
    const chat = await createWebChat(activeView.cwd, sessionLabel || activeView.sessionId.slice(0, 8), activeView.sessionId)
    if (chat) {
      setIsV2Mode(true)
      setV2ChatId(chat.id)
      setRespondedApprovals(new Map())
      setProcessState(undefined)

      // Now send the message via the new web chat
      console.log('[App] Sending message via upgraded web chat:', chat.id)
      const success = await sendWebMessage(chat.id, content, attachments)
      if (!success) {
        setErrorNotification('Failed to send message — could not resume session. Try again.')
        setTimeout(() => setErrorNotification(null), 5000)
      }
    } else {
      setErrorNotification('Failed to resume session — bridge may be unavailable.')
      setTimeout(() => setErrorNotification(null), 5000)
    }
  }

  // Create new web session (streaming with approval support)
  const handleCreateSession = async (permissionMode: PermissionMode) => {
    setShowNewSessionModal(false)
    // Use selected folder, then client's default_cwd, then fallback
    const cwd = selectedFolder || defaultCwd || import.meta.env.VITE_DEFAULT_CWD || '/tmp'
    const folderName = selectedFolder ? selectedFolder.split('/').pop() : 'New Session'
    const chat = await createWebChat(cwd, folderName || 'New Session', undefined, permissionMode)
    if (chat) {
      setIsV2Mode(true)
      setV2ChatId(chat.id)
      setTranscriptEntries([])
      setSessionLabel(chat.name)
      setRespondedApprovals(new Map())
      setActiveView({ type: 'session', sessionId: chat.id, cwd })
    }
    // Reset modal state
    setModalStep('folder')
    setSelectedFolder(null)
  }

  const handleSetLabel = async (sessionId: string, label: string) => {
    await setLabel(sessionId, label)
    setEditingLabel(null)
    setNewLabelValue('')
  }

  // Format time ago
  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
    return Math.floor(seconds / 86400) + 'd ago'
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Format token count (K/M notation)
  const formatTokens = (count: number) => {
    if (count < 1000) return count.toString()
    if (count < 1000000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return (count / 1000000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + 'M'
  }

  // Session View
  if (activeView.type === 'session') {
    const isAgentView = activeView.isAgent
    const sessionDisplayName = isAgentView
      ? `Agent: ${activeView.sessionId.slice(0, 8)}`
      : (sessionLabel || activeView.sessionId.slice(0, 8))

    return (
      <div className="app">
        <Header
          status={isConnected ? 'connected' : 'disconnected'}
          processState={isV2Mode ? processState : undefined}
          sessionName={sessionDisplayName}
          sessionId={activeView.sessionId.slice(0, 8)}
          onBack={handleBack}
          isReadOnly={isAgentView}
          isAgent={isAgentView}
          sessionType={isV2Mode ? 'web' : 'terminal'}
          autoApprove={autoApprove}
          onAutoApproveToggle={isV2Mode ? handleAutoApproveToggle : undefined}
        />

        <div className="view-controls">
          <ViewModeToggle
            mode={viewMode}
            onChange={setViewMode}
            typeFilter={typeFilter}
            onTypeFilterChange={(filter) => {
              setTypeFilter(filter)
              if (filter !== 'tool_use') setToolFilter('all')
            }}
            toolFilter={toolFilter}
            onToolFilterChange={setToolFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onExpandAll={() => setExpandAllTrigger(t => t + 1)}
            onCollapseAll={() => setCollapseAllTrigger(t => t + 1)}
            typeCounts={typeCounts}
            toolCounts={toolCounts}
          />
        </div>

        {sessionUsage && (
          <div className="session-usage-summary">
            <div className="usage-stat messages">
              <span className="label">msgs:</span>
              <span className="value">{sessionUsage.message_count}</span>
            </div>
            <div className="usage-stat">
              <span className="label">in:</span>
              <span className="value">{formatTokens(sessionUsage.input_tokens)}</span>
            </div>
            <div className="usage-stat">
              <span className="label">out:</span>
              <span className="value">{formatTokens(sessionUsage.output_tokens)}</span>
            </div>
            <div className="usage-stat">
              <span className="label">cache:</span>
              <span className="value">{formatTokens(sessionUsage.cache_read_tokens)}</span>
            </div>
            <div className="usage-stat cost">
              <span className="label">est:</span>
              <span className="value">${sessionUsage.estimated_cost_usd.toFixed(2)}</span>
            </div>
          </div>
        )}

        <TranscriptView
          entries={transcriptEntries}
          viewMode={viewMode}
          chatId={activeView.sessionId}
          cwd={activeView.cwd}
          typeFilter={typeFilter}
          toolFilter={toolFilter}
          searchQuery={searchQuery}
          expandAllTrigger={expandAllTrigger}
          collapseAllTrigger={collapseAllTrigger}
          onApprove={isV2Mode ? handleApprove : undefined}
          onDeny={isV2Mode ? handleDeny : undefined}
          respondedApprovals={respondedApprovals}
          isProcessing={isV2Mode && processState === 'processing'}
        />

        {errorNotification && (
          <div className="error-notification" onClick={() => setErrorNotification(null)}>
            <span className="error-icon">!</span>
            <span>{errorNotification}</span>
            <span className="error-dismiss">x</span>
          </div>
        )}

        {!isAgentView && (
          <MessageInput
            onSend={handleSendMessage}
            status={isConnected ? 'connected' : 'disconnected'}
            placeholder={isV2Mode ? "Continue this conversation..." : "Type to resume this session..."}
          />
        )}
      </div>
    )
  }

  // Dashboard - All Sessions
  return (
    <div className="app dashboard">
      <header className="header dashboard-header">
        <div className="header-left">
          <span className="terminal-prompt">&gt;</span>
          <h1>CHAT PILOT</h1>
          <span className="client-badge">{clientName}</span>
        </div>
        <div className="header-right">
          <span className={`ws-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '●' : '○'}
          </span>
          <span className="version">v3.0.0</span>
          <button className="sign-out-btn" onClick={onSignOut} title="Sign out">
            LOGOUT
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="session-list">
          <div className="session-list-header">
            <span>ALL SESSIONS ({sessions.length})</span>
            <button className="create-session-btn" onClick={openNewSessionModal}>
              + New Session
            </button>
          </div>

          {loading && <div className="session-loading">Loading sessions...</div>}
          {error && <div className="session-error">Error: {error}</div>}

          {!loading && sessions.length === 0 && (
            <div className="session-empty">
              <div className="empty-message">No sessions found</div>
              <div className="empty-hint">Start a Claude session in terminal or click + New Session</div>
            </div>
          )}

          <div className="sessions-table">
            {sessions.map((session) => {
              // Prefer running chat over stopped one (multiple chats can share a session_id)
              const chat = webChats.find(c => c.session_id === session.sessionId && c.status === 'running')
                || webChats.find(c => c.session_id === session.sessionId)
              const state = chat ? (chatStates.get(chat.id) || chat.process_state) : undefined
              const isRunning = chat?.status === 'running'
              const isWeb = !!chat

              return (
                <div
                  key={session.sessionId}
                  className={`session-row ${isWeb ? 'web-session' : ''} ${isRunning ? 'is-running' : ''}`}
                  onClick={() => handleSelectSession(session)}
                >
                  <div className="session-row-main">
                    <div className="session-badges">
                      <span className={`session-source-badge ${isWeb ? 'web' : 'terminal'}`}>
                        {isWeb ? 'WEB' : 'TERM'}
                      </span>
                      {isWeb && isRunning && (
                        <span className={`session-state-badge ${state || 'idle'}`}>
                          {state === 'processing' ? 'WORKING' :
                           state === 'awaiting_approval' ? 'APPROVAL' :
                           state === 'error' ? 'ERROR' :
                           state === 'finished' ? 'DONE' : 'IDLE'}
                        </span>
                      )}
                      {isWeb && !isRunning && (
                        <span className="session-state-badge stopped">STOPPED</span>
                      )}
                    </div>
                    <div className="session-label-cell">
                      {editingLabel === session.sessionId ? (
                        <input
                          type="text"
                          className="label-input"
                          value={newLabelValue}
                          onChange={(e) => setNewLabelValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSetLabel(session.sessionId, newLabelValue)
                            } else if (e.key === 'Escape') {
                              setEditingLabel(null)
                            }
                          }}
                          onBlur={() => handleSetLabel(session.sessionId, newLabelValue)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          placeholder="Enter label..."
                        />
                      ) : (
                        <span
                          className={`session-label ${session.label ? 'has-label' : 'no-label'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingLabel(session.sessionId)
                            setNewLabelValue(session.label || '')
                          }}
                        >
                          {session.label || session.sessionId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="session-project">
                      {session.cwd.split('/').slice(-2).join('/')}
                    </div>
                    {session.processInfo ? (
                      <div className="session-process-stats">
                        <span className="process-stat cpu">{session.processInfo.cpu.toFixed(1)}%</span>
                        <span className="process-stat mem">{session.processInfo.memoryMB} MB</span>
                        <span className="process-stat runtime">{session.processInfo.runtime}</span>
                      </div>
                    ) : (
                      <div className="session-meta-right">
                        <span className="session-time">{timeAgo(session.lastModified)}</span>
                        <span className="session-size">{formatSize(session.sizeBytes)}</span>
                      </div>
                    )}
                    <div className="session-actions">
                      {isWeb && isRunning && (
                        <button
                          className="kill-button"
                          title="Stop this session"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await stopWebChat(chat!.id)
                            refreshWebChats()
                          }}
                        >
                          KILL
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {showNewSessionModal && (
        <div className="modal-overlay" onClick={() => setShowNewSessionModal(false)}>
          <div className="new-session-modal" onClick={(e) => e.stopPropagation()}>
            {modalStep === 'folder' ? (
              <>
                <div className="new-session-modal-header">
                  <span className="modal-prompt">&gt;</span>
                  <span className="modal-title">SELECT FOLDER</span>
                </div>
                <div className="folder-list">
                  {foldersLoading ? (
                    <div className="folders-loading">Loading folders...</div>
                  ) : folders.length === 0 ? (
                    <div className="folders-empty">No folders found on Desktop</div>
                  ) : (
                    folders.map((folder) => (
                      <button
                        key={folder.path}
                        className={`folder-item ${selectedFolder === folder.path ? 'selected' : ''}`}
                        onClick={() => setSelectedFolder(folder.path)}
                      >
                        <span className="folder-icon">📁</span>
                        <span className="folder-name">{folder.name}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="modal-actions">
                  <button
                    className="modal-next-btn"
                    disabled={!selectedFolder}
                    onClick={() => setModalStep('mode')}
                  >
                    NEXT →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="new-session-modal-header">
                  <span className="modal-prompt">&gt;</span>
                  <span className="modal-title">SELECT MODE</span>
                  <span className="selected-folder-badge">{selectedFolder?.split('/').pop()}</span>
                </div>
                <div className="new-session-modal-options">
                  <button
                    className="session-mode-btn assisted"
                    onClick={() => handleCreateSession('assisted')}
                  >
                    <div className="mode-icon">ASSISTED</div>
                    <div className="mode-description">Human-in-the-loop — approve tool usage</div>
                  </button>
                  <button
                    className="session-mode-btn full-ai"
                    onClick={() => handleCreateSession('full_ai')}
                  >
                    <div className="mode-icon">FULL AI</div>
                    <div className="mode-description">Autonomous — skip all permission prompts</div>
                  </button>
                </div>
                <button className="modal-back-btn" onClick={() => setModalStep('folder')}>
                  ← BACK
                </button>
              </>
            )}
            <button className="modal-dismiss" onClick={() => setShowNewSessionModal(false)}>
              ESC
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

import { useEffect, useRef } from 'react'
import type { TranscriptEntry, ViewMode, TranscriptEntryType } from '../types'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolBlock } from './ToolBlock'
import { MessageBlock } from './MessageBlock'
import { LogEventRow } from './LogEventRow'
import { AgentSpawnBlock } from './AgentSpawnBlock'
import { CompactionSummaryBlock } from './CompactionSummaryBlock'
import { ApprovalPromptBlock } from './ApprovalPromptBlock'

interface TranscriptViewProps {
  entries: TranscriptEntry[]
  viewMode: ViewMode
  loading?: boolean
  chatId?: string // For agent spawn blocks
  cwd?: string // Working directory for agent log links
  typeFilter?: TranscriptEntryType | 'all'
  toolFilter?: string
  searchQuery?: string
  expandAllTrigger?: number
  collapseAllTrigger?: number
  // Approval handlers
  onApprove?: (requestId: string, updatedInput?: Record<string, unknown>) => void
  onDeny?: (requestId: string, message?: string) => void
  respondedApprovals?: Map<string, { behavior: 'allow' | 'deny'; selectedAnswer?: string }>
  // Processing state for typing indicator
  isProcessing?: boolean
}

export function TranscriptView({
  entries,
  viewMode,
  loading,
  chatId,
  cwd = '',
  typeFilter = 'all',
  toolFilter = 'all',
  searchQuery = '',
  expandAllTrigger = 0,
  collapseAllTrigger = 0,
  onApprove,
  onDeny,
  respondedApprovals = new Map(),
  isProcessing = false,
}: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [entries])

  // Filter entries based on view mode and type filter
  // Simple mode: Only user/assistant messages
  // Detailed mode: Everything (messages + log events + agent spawns + tools)
  let visibleEntries = viewMode === 'simple'
    ? entries.filter((e) => e.type === 'user' || e.type === 'assistant')
    : entries

  // Apply type filter in detailed mode
  if (viewMode === 'detailed' && typeFilter !== 'all') {
    visibleEntries = visibleEntries.filter((e) => e.type === typeFilter)
  }

  // Apply tool filter when tool_use is selected
  if (typeFilter === 'tool_use' && toolFilter !== 'all') {
    visibleEntries = visibleEntries.filter((e) => {
      if (e.content.type === 'tool_use') {
        return e.content.tool_name === toolFilter
      }
      return true
    })
  }

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase()
    visibleEntries = visibleEntries.filter((e) => {
      // Search in different content types
      if (e.content.type === 'user' || e.content.type === 'assistant' || e.content.type === 'thinking') {
        return e.content.text.toLowerCase().includes(query)
      }
      if (e.content.type === 'tool_use') {
        return e.content.tool_name.toLowerCase().includes(query) ||
          JSON.stringify(e.content.input).toLowerCase().includes(query)
      }
      if (e.content.type === 'tool_result') {
        return e.content.output.toLowerCase().includes(query)
      }
      if (e.content.type === 'agent_spawn') {
        return e.content.agent_type.toLowerCase().includes(query) ||
          e.content.description.toLowerCase().includes(query)
      }
      if (e.content.type === 'compaction_summary') {
        return e.content.preview.toLowerCase().includes(query) ||
          e.content.full_text.toLowerCase().includes(query)
      }
      return false
    })
  }

  if (loading) {
    return (
      <div className="transcript-view transcript-loading">
        <span className="loading-text">Loading transcript...</span>
      </div>
    )
  }

  if (visibleEntries.length === 0) {
    return (
      <div className="transcript-view transcript-empty">
        <span className="empty-text">No messages yet</span>
      </div>
    )
  }

  // Debug: log entry types
  console.log('[TranscriptView] Entry types:', visibleEntries.map(e => e.type))

  return (
    <div className="transcript-view" ref={containerRef}>
      {visibleEntries.map((entry) => {
        switch (entry.type) {
          case 'user':
            return (
              <MessageBlock
                key={entry.id}
                type="user"
                content={entry.content.type === 'user' ? entry.content.text : ''}
                timestamp={entry.timestamp}
              />
            )

          case 'assistant':
            return (
              <MessageBlock
                key={entry.id}
                type="assistant"
                content={entry.content.type === 'assistant' ? entry.content.text : ''}
                timestamp={entry.timestamp}
              />
            )

          case 'thinking':
            return (
              <ThinkingBlock
                key={entry.id}
                content={entry.content.type === 'thinking' ? entry.content.text : ''}
                timestamp={entry.timestamp}
                expandAllTrigger={expandAllTrigger}
                collapseAllTrigger={collapseAllTrigger}
              />
            )

          case 'tool_use':
            console.log('[TranscriptView] Rendering tool_use:', entry.content)
            if (entry.content.type !== 'tool_use') return null
            return (
              <ToolBlock
                key={entry.id}
                type="use"
                toolName={entry.content.tool_name}
                toolId={entry.content.tool_id}
                input={entry.content.input}
                timestamp={entry.timestamp}
                expandAllTrigger={expandAllTrigger}
                collapseAllTrigger={collapseAllTrigger}
              />
            )

          case 'tool_result':
            if (entry.content.type !== 'tool_result') return null
            return (
              <ToolBlock
                key={entry.id}
                type="result"
                toolId={entry.content.tool_id}
                output={entry.content.output}
                isError={entry.content.is_error}
                timestamp={entry.timestamp}
                expandAllTrigger={expandAllTrigger}
                collapseAllTrigger={collapseAllTrigger}
              />
            )

          case 'system':
            return (
              <div key={entry.id} className="system-block">
                <span className="system-label">SYSTEM</span>
                <span className="system-text">
                  {entry.content.type === 'system' ? entry.content.text : ''}
                </span>
              </div>
            )

          case 'log_event':
          case 'token_usage':
            // Compact log events in detailed mode
            return <LogEventRow key={entry.id} entry={entry} />

          case 'agent_spawn':
            // Expandable agent spawn block
            return (
              <AgentSpawnBlock
                key={entry.id}
                entry={entry}
                chatId={chatId || ''}
                cwd={cwd}
                expandAllTrigger={expandAllTrigger}
                collapseAllTrigger={collapseAllTrigger}
              />
            )

          case 'agent_result':
            // Agent results are shown as part of the agent spawn block
            // Could also show inline in detailed mode
            if (entry.content.type !== 'agent_result') return null
            return (
              <div key={entry.id} className="agent-result-block">
                <span className="agent-result-label">AGENT RESULT</span>
                <span className="agent-result-text">
                  {entry.content.result.slice(0, 200)}
                  {entry.content.result.length > 200 ? '...' : ''}
                </span>
              </div>
            )

          case 'compaction_summary':
            if (entry.content.type !== 'compaction_summary') return null
            return (
              <CompactionSummaryBlock
                key={entry.id}
                preview={entry.content.preview}
                fullText={entry.content.full_text}
                timestamp={entry.timestamp}
                expandAllTrigger={expandAllTrigger}
                collapseAllTrigger={collapseAllTrigger}
              />
            )

          case 'approval_prompt':
            if (entry.content.type !== 'approval_prompt') return null
            const approvalData = respondedApprovals.get(entry.content.request_id)
            const isResponded = !!approvalData
            return (
              <ApprovalPromptBlock
                key={entry.id}
                requestId={entry.content.request_id}
                toolName={entry.content.tool_name}
                toolUseId={entry.content.tool_use_id}
                input={entry.content.input}
                inputPreview={entry.content.input_preview}
                timestamp={entry.timestamp}
                onApprove={onApprove || (() => {})}
                onDeny={onDeny || (() => {})}
                isResponded={isResponded}
                response={approvalData?.behavior}
                selectedAnswer={approvalData?.selectedAnswer}
              />
            )

          default:
            return null
        }
      })}

      {/* Typing indicator when Claude is processing */}
      {isProcessing && (
        <div className="message-block message-assistant typing-indicator">
          <div className="message-header">
            <span className="message-icon">🤖</span>
            <span className="message-role">Claude</span>
          </div>
          <div className="message-content typing-dots">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        </div>
      )}
    </div>
  )
}

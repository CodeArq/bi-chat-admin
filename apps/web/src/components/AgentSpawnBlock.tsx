import { useState, useEffect } from 'react'
import type { TranscriptEntry } from '../types'

interface AgentSpawnBlockProps {
  entry: TranscriptEntry
  chatId: string
  cwd: string
  expandAllTrigger?: number
  collapseAllTrigger?: number
}

/**
 * Expandable agent spawn block
 * Shows agent type with status and result when completed
 */
export function AgentSpawnBlock({
  entry,
  chatId,
  cwd,
  expandAllTrigger = 0,
  collapseAllTrigger = 0,
}: AgentSpawnBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (expandAllTrigger > 0) setIsExpanded(true)
  }, [expandAllTrigger])

  useEffect(() => {
    if (collapseAllTrigger > 0) setIsExpanded(false)
  }, [collapseAllTrigger])

  if (entry.content.type !== 'agent_spawn') return null

  const { agent_type, agent_id, description, prompt_preview, status, result_preview } = entry.content
  const isCompleted = status === 'completed'
  const isRunning = !status || status === 'running'

  const timestamp = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  const handleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className={`agent-spawn-block ${isCompleted ? 'completed' : ''} ${isRunning ? 'running' : ''}`}>
      <div className="agent-spawn-header" onClick={handleExpand}>
        <span className="agent-spawn-timestamp">{timestamp}</span>
        <span className={`agent-spawn-badge ${isCompleted ? 'completed' : ''}`}>
          {isCompleted ? '[done]' : '[task]'}
        </span>
        <span className="agent-spawn-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="agent-spawn-label">{isCompleted ? 'AGENT COMPLETED:' : 'AGENT SPAWNED:'}</span>
        <span className="agent-spawn-type">{agent_type}</span>
        {description && <span className="agent-spawn-desc">({description})</span>}
        {agent_id && <span className="agent-spawn-id">ID: {agent_id}</span>}
      </div>

      {isExpanded && (
        <div className="agent-spawn-content">
          {/* Full prompt - not truncated */}
          {prompt_preview && (
            <div className="agent-prompt-full">
              <span className="prompt-label">Prompt:</span>
              <pre className="prompt-text">{prompt_preview}</pre>
            </div>
          )}

          {/* Show result preview for completed agents */}
          {isCompleted && result_preview && (
            <div className="agent-result-preview">
              <span className="result-label">Result:</span>
              <pre className="result-text">{result_preview}</pre>
            </div>
          )}

          {/* View Full Log button - opens agent session in new tab */}
          {agent_id && (
            <div className="agent-actions">
              <a
                className="view-full-log-btn"
                href={`?session=${agent_id}&cwd=${encodeURIComponent(cwd)}&agent=true&parent=${chatId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                View Full Agent Log →
              </a>
            </div>
          )}

          {isRunning && !agent_id && (
            <div className="agent-pending">Agent still running - ID not yet available</div>
          )}
        </div>
      )}
    </div>
  )
}

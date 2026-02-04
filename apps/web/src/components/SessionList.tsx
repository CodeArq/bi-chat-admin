import type { Session } from '../types'

interface SessionListProps {
  sessions: Session[]
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
  loading: boolean
  error: string | null
}

export function SessionList({
  sessions,
  selectedSessionId,
  onSelectSession,
  loading,
  error,
}: SessionListProps) {
  if (loading) {
    return (
      <div className="session-list">
        <div className="session-list-header">
          <span className="terminal-prompt">&gt;</span> SESSIONS
        </div>
        <div className="session-loading">
          <span className="blink">Scanning for Claude sessions...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="session-list">
        <div className="session-list-header">
          <span className="terminal-prompt">&gt;</span> SESSIONS
        </div>
        <div className="session-error">
          ERROR: {error}
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="session-list">
        <div className="session-list-header">
          <span className="terminal-prompt">&gt;</span> SESSIONS
        </div>
        <div className="session-empty">
          <div className="empty-message">No active Claude sessions detected.</div>
          <div className="empty-hint">
            Start a Claude Code session and it will appear here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="session-list">
      <div className="session-list-header">
        <span className="terminal-prompt">&gt;</span> SESSIONS ({sessions.length})
      </div>
      <div className="session-grid">
        {sessions.map((session) => (
          <SessionCard
            key={session.session_id}
            session={session}
            isSelected={session.session_id === selectedSessionId}
            onClick={() => onSelectSession(session.session_id)}
          />
        ))}
      </div>
    </div>
  )
}

interface SessionCardProps {
  session: Session
  isSelected: boolean
  onClick: () => void
}

function SessionCard({ session, isSelected, onClick }: SessionCardProps) {
  const statusIndicator = session.status === 'active' ? '●' : '○'
  const statusClass = session.status === 'active' ? 'status-active' : 'status-idle'

  return (
    <button
      className={`session-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="session-card-header">
        <span className={`session-status ${statusClass}`}>{statusIndicator}</span>
        <span className="session-name">{session.project_name}</span>
      </div>
      <div className="session-card-body">
        <div className="session-id">{session.short_id}</div>
        <div className="session-meta">
          <span className="session-stat">{session.message_count} msgs</span>
          <span className="session-stat">{session.tool_count} tools</span>
        </div>
        <div className="session-activity">{session.time_since_activity}</div>
      </div>
    </button>
  )
}

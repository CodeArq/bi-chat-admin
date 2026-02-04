import type { ConnectionStatus, ProcessState } from '../types'

interface HeaderProps {
  status: ConnectionStatus | 'running' | 'stopped' | 'error' | 'starting' | 'idle'
  processState?: ProcessState  // Real-time activity state for V2 sessions
  onClear?: () => void
  sessionName?: string
  sessionId?: string
  onBack?: () => void
  isReadOnly?: boolean
  isAgent?: boolean
  sessionType?: 'terminal' | 'web'
  autoApprove?: boolean
  onAutoApproveToggle?: (enabled: boolean) => void
}

export function Header({ status, processState, onClear, sessionName, sessionId, onBack, isReadOnly, isAgent, sessionType, autoApprove, onAutoApproveToggle }: HeaderProps) {
  const statusText: Record<string, string> = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    thinking: 'Claude is thinking...',
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
    starting: 'Starting...',
    idle: 'Idle',
  }

  // Process state labels for V2 sessions
  const processStateText: Record<string, string> = {
    idle: 'Ready',
    processing: 'Processing...',
    awaiting_approval: 'Awaiting Approval',
    finished: 'Finished',
    error: 'Error',
  }

  // Determine display text - prioritize process state for V2 sessions
  const displayText = processState ? processStateText[processState] : statusText[status] || status

  // Determine CSS class for the status dot
  let statusClass = 'disconnected'
  if (processState) {
    if (processState === 'processing') statusClass = 'processing'
    else if (processState === 'awaiting_approval') statusClass = 'awaiting-approval'
    else if (processState === 'idle' || processState === 'finished') statusClass = 'connected'
    else if (processState === 'error') statusClass = 'disconnected'
  } else {
    statusClass = ['connected', 'running'].includes(status) ? 'connected' : 'disconnected'
  }

  return (
    <header className="header">
      <div className="header-left">
        {onBack && (
          <button className="back-button" onClick={onBack} title="Back to dashboard">
            &lt;
          </button>
        )}
        <div className="header-title">
          {isAgent && <span className="agent-log-badge">AGENT LOG</span>}
          {sessionType && !isAgent && (
            <span className={`session-type-badge ${sessionType}`}>
              {sessionType === 'web' ? 'WEB CHAT' : 'TERMINAL'}
            </span>
          )}
          {sessionName ? (
            <>
              <span className="session-label">{sessionName}</span>
              <span className="session-id-label">[{sessionId}]</span>
            </>
          ) : (
            'B-Intelligent Chat'
          )}
        </div>
      </div>
      <div className="header-right">
        {onAutoApproveToggle && (
          <button
            className={`auto-approve-toggle ${autoApprove ? 'active' : ''}`}
            onClick={() => onAutoApproveToggle(!autoApprove)}
            title={autoApprove ? 'Auto-approve is ON — all tool use will be auto-allowed' : 'Auto-approve is OFF — you approve each tool use'}
          >
            <span className="toggle-label">AUTO</span>
            <span className={`toggle-switch ${autoApprove ? 'on' : 'off'}`}>
              <span className="toggle-knob" />
            </span>
          </button>
        )}
        <div className="status-indicator">
          <span className={`status-dot ${statusClass}`} />
          <span>{displayText}</span>
        </div>
        {onClear && !isReadOnly && (
          <button className="clear-button" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </header>
  )
}

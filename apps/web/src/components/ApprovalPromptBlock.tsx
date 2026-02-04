import { useState } from 'react'
import { DiffViewer } from './DiffViewer'

interface QuestionOption {
  label: string
  description?: string
}

interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

interface ApprovalPromptBlockProps {
  requestId: string
  toolName: string
  toolUseId?: string
  input: Record<string, unknown>
  inputPreview: string
  timestamp: string
  onApprove: (requestId: string, updatedInput?: Record<string, unknown>) => void
  onDeny: (requestId: string, message?: string) => void
  isResponded?: boolean
  response?: 'allow' | 'deny'
  selectedAnswer?: string
}

export function ApprovalPromptBlock({
  requestId,
  toolName,
  input,
  inputPreview,
  timestamp,
  onApprove,
  onDeny,
  isResponded = false,
  response,
  selectedAnswer,
}: ApprovalPromptBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [denyMessage, setDenyMessage] = useState('')
  const [showDenyInput, setShowDenyInput] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)

  // Check if this is an AskUserQuestion tool
  const isAskUserQuestion = toolName === 'AskUserQuestion'
  const questions = isAskUserQuestion ? (input.questions as Question[] | undefined) : undefined
  const firstQuestion = questions?.[0]

  // Check if this is an Edit tool (for diff view)
  const isEditTool = toolName === 'Edit'
  const editInput = isEditTool ? input as { file_path?: string; old_string?: string; new_string?: string } : null

  const handleApprove = () => {
    onApprove(requestId)
  }

  const handleSelectOption = (optionLabel: string) => {
    // For AskUserQuestion, send the selected answer in updatedInput
    const updatedInput = {
      ...input,
      answers: { '0': optionLabel }
    }
    onApprove(requestId, updatedInput)
  }

  const handleDeny = () => {
    if (showDenyInput) {
      onDeny(requestId, denyMessage || undefined)
      setShowDenyInput(false)
    } else {
      setShowDenyInput(true)
    }
  }

  const handleDenyCancel = () => {
    setShowDenyInput(false)
    setDenyMessage('')
  }

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Tool icon — monospace terminal characters
  const getToolIcon = () => {
    switch (toolName) {
      case 'Write':
        return '>'
      case 'Edit':
        return '~'
      case 'Bash':
        return '$'
      case 'Read':
        return '<'
      case 'WebFetch':
      case 'WebSearch':
        return '@'
      case 'AskUserQuestion':
        return '?'
      default:
        return '#'
    }
  }

  // Render diff for Edit tool
  const renderDiff = () => {
    if (!editInput?.old_string || !editInput?.new_string) {
      return null
    }

    return (
      <div className="diff-container">
        <DiffViewer
          filePath={editInput.file_path || 'unknown'}
          oldString={editInput.old_string}
          newString={editInput.new_string}
        />
        <button
          className="diff-expand-btn"
          onClick={() => setShowDiffModal(true)}
          title="Open in full screen"
        >
          ⛶ Expand
        </button>

        {/* Modal */}
        {showDiffModal && (
          <DiffViewer
            filePath={editInput.file_path || 'unknown'}
            oldString={editInput.old_string}
            newString={editInput.new_string}
            isModal={true}
            onClose={() => setShowDiffModal(false)}
          />
        )}
      </div>
    )
  }

  // Render question options for AskUserQuestion
  const renderQuestionOptions = () => {
    if (!firstQuestion) return null

    return (
      <div className="question-container">
        <div className="question-text">{firstQuestion.question}</div>
        <div className="question-options">
          {firstQuestion.options.map((option, index) => (
            <button
              key={index}
              className="question-option-btn"
              onClick={() => handleSelectOption(option.label)}
            >
              <span className="option-label">{option.label}</span>
              {option.description && (
                <span className="option-description">{option.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Get the header label
  const getHeaderLabel = () => {
    if (isAskUserQuestion) return 'USER INPUT REQUIRED'
    return 'APPROVAL REQUIRED'
  }

  return (
    <div className={`approval-prompt-block ${isAskUserQuestion ? 'question-mode' : ''} ${isResponded ? `responded ${response}` : 'pending'}`}>
      <div className="approval-header">
        <div className="approval-icon">{getToolIcon()}</div>
        <div className="approval-info">
          <span className={`approval-label ${isAskUserQuestion ? 'question' : ''}`}>
            {getHeaderLabel()}
          </span>
          <span className="approval-tool">{toolName}</span>
        </div>
        <span className="approval-time">{formatTime(timestamp)}</span>
      </div>

      {/* AskUserQuestion - show question and options */}
      {isAskUserQuestion && !isResponded && renderQuestionOptions()}

      {/* Edit tool - show diff view */}
      {isEditTool && !isResponded && renderDiff()}

      {/* Regular tools - show JSON preview */}
      {!isAskUserQuestion && !isEditTool && (
        <div className="approval-preview" onClick={() => setExpanded(!expanded)}>
          <pre className="approval-input-preview">
            {expanded ? JSON.stringify(input, null, 2) : inputPreview.slice(0, 200)}
            {!expanded && inputPreview.length > 200 && '...'}
          </pre>
          <button className="expand-btn">
            {expanded ? '▼ Less' : '▶ More'}
          </button>
        </div>
      )}

      {/* Edit tool - also show expand option for full JSON */}
      {isEditTool && !isResponded && (
        <div className="approval-preview compact" onClick={() => setExpanded(!expanded)}>
          <button className="expand-btn">
            {expanded ? '▼ Hide JSON' : '▶ Show JSON'}
          </button>
          {expanded && (
            <pre className="approval-input-preview">
              {JSON.stringify(input, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Actions - only show Allow/Deny for non-question tools */}
      {!isResponded && !isAskUserQuestion ? (
        <div className="approval-actions">
          {showDenyInput ? (
            <div className="deny-input-container">
              <input
                type="text"
                className="deny-message-input"
                placeholder="Reason for denial (optional)"
                value={denyMessage}
                onChange={(e) => setDenyMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDeny()
                  if (e.key === 'Escape') handleDenyCancel()
                }}
                autoFocus
              />
              <button className="deny-confirm-btn" onClick={handleDeny}>
                Deny
              </button>
              <button className="deny-cancel-btn" onClick={handleDenyCancel}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button className="approve-btn" onClick={handleApprove}>
                ✓ Allow
              </button>
              <button className="deny-btn" onClick={handleDeny}>
                ✕ Deny
              </button>
            </>
          )}
        </div>
      ) : isResponded ? (
        <div className={`approval-response ${response}`}>
          {isAskUserQuestion && selectedAnswer
            ? `Selected: ${selectedAnswer}`
            : response === 'allow' ? '✓ Approved' : '✕ Denied'
          }
        </div>
      ) : null}
    </div>
  )
}

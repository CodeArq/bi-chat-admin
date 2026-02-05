import { useState, useEffect } from 'react'
import { DiffViewer } from './DiffViewer'

interface ToolUseProps {
  type: 'use'
  toolName: string
  toolId: string
  input: Record<string, unknown>
  timestamp?: string
  expandAllTrigger?: number
  collapseAllTrigger?: number
}

interface ToolResultProps {
  type: 'result'
  toolId: string
  output: string
  isError?: boolean
  timestamp?: string
  expandAllTrigger?: number
  collapseAllTrigger?: number
}

type ToolBlockProps = ToolUseProps | ToolResultProps

// Map tool names to icons
const toolIcons: Record<string, string> = {
  Read: '📖',
  Write: '✏️',
  Edit: '📝',
  Bash: '💻',
  Glob: '🔍',
  Grep: '🔎',
  Task: '🤖',
  WebFetch: '🌐',
  WebSearch: '🔎',
  AskUserQuestion: '❓',
}

function getToolIcon(toolName: string): string {
  // Check for exact match first
  if (toolIcons[toolName]) return toolIcons[toolName]

  // Check for partial match (e.g., mcp__notion__create_task)
  for (const [key, icon] of Object.entries(toolIcons)) {
    if (toolName.toLowerCase().includes(key.toLowerCase())) {
      return icon
    }
  }

  return '🔧'
}

function formatToolName(name: string): string {
  // Handle MCP tools: mcp__notion__create_task -> notion.create_task
  if (name.startsWith('mcp__')) {
    return name.replace('mcp__', '').replace('__', '.')
  }
  return name
}

export function ToolBlock(props: ToolBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { expandAllTrigger = 0, collapseAllTrigger = 0 } = props

  useEffect(() => {
    if (expandAllTrigger > 0) setIsExpanded(true)
  }, [expandAllTrigger])

  useEffect(() => {
    if (collapseAllTrigger > 0) setIsExpanded(false)
  }, [collapseAllTrigger])

  if (props.type === 'use') {
    const { toolName, input } = props
    const icon = getToolIcon(toolName)
    const displayName = formatToolName(toolName)

    // Check if this is a Write or Edit tool that should show diff view
    const isWriteTool = toolName === 'Write'
    const isEditTool = toolName === 'Edit'
    const showDiff = isWriteTool || isEditTool

    // Extract file info for diff tools
    const filePath = (input as any)?.file_path || ''
    const content = (input as any)?.content || ''
    const oldString = (input as any)?.old_string || ''
    const newString = (input as any)?.new_string || ''

    // Get a summary of the input - ensure all values are strings
    const inputSummary = Object.entries(input || {})
      .slice(0, 2)
      .map(([key, value]) => {
        let strValue: string
        if (typeof value === 'string') {
          strValue = value
        } else if (value === null || value === undefined) {
          strValue = String(value)
        } else {
          strValue = JSON.stringify(value)
        }
        const truncated = strValue.length > 50 ? strValue.slice(0, 50) + '...' : strValue
        return `${key}: ${truncated}`
      })
      .join(', ')

    return (
      <div className={`tool-block tool-use ${isExpanded ? 'expanded' : 'collapsed'} ${showDiff ? 'has-diff' : ''}`}>
        <div className="tool-header" onClick={() => setIsExpanded(!isExpanded)}>
          <span className="tool-icon">{icon}</span>
          <span className="tool-label-prefix">Tool Use:</span>
          <span className="tool-name">{displayName}</span>
          {showDiff && <span className="file-path-badge">{filePath.split('/').slice(-2).join('/')}</span>}
          <span className="tool-toggle">{isExpanded ? '▼' : '▶'}</span>
        </div>
        {!isExpanded && inputSummary && (
          <div className="tool-summary">{inputSummary}</div>
        )}
        {isExpanded && (
          <div className="tool-content">
            {showDiff ? (
              <div className="tool-diff-view">
                {isWriteTool ? (
                  // Write tool: show new file content
                  <DiffViewer
                    filePath={filePath}
                    oldString=""
                    newString={content}
                  />
                ) : (
                  // Edit tool: show old vs new
                  <DiffViewer
                    filePath={filePath}
                    oldString={oldString}
                    newString={newString}
                  />
                )}
              </div>
            ) : (
              <pre>{JSON.stringify(input, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    )
  }

  // Tool result
  const { output: rawOutput, isError } = props

  // Ensure output is a string (might be an object in some cases)
  const output = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput, null, 2)

  // Truncate long outputs
  const maxPreviewLength = 200
  const shouldTruncate = output.length > maxPreviewLength
  const preview = shouldTruncate ? output.slice(0, maxPreviewLength) + '...' : output

  return (
    <div className={`tool-block tool-result ${isError ? 'error' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="tool-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="tool-icon">{isError ? '❌' : '✅'}</span>
        <span className="tool-label">Result</span>
        {shouldTruncate && (
          <span className="tool-toggle">{isExpanded ? '▼' : '▶'}</span>
        )}
      </div>
      <div className="tool-content">
        <pre>{isExpanded ? output : preview}</pre>
      </div>
    </div>
  )
}

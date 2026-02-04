import { useState, useEffect } from 'react'

interface ThinkingBlockProps {
  content: string
  timestamp?: string
  expandAllTrigger?: number
  collapseAllTrigger?: number
}

export function ThinkingBlock({
  content: rawContent,
  expandAllTrigger = 0,
  collapseAllTrigger = 0,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (expandAllTrigger > 0) setIsExpanded(true)
  }, [expandAllTrigger])

  useEffect(() => {
    if (collapseAllTrigger > 0) setIsExpanded(false)
  }, [collapseAllTrigger])

  // Ensure content is a string
  const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2)

  // Truncate for collapsed view
  const previewLength = 150
  const shouldTruncate = content.length > previewLength
  const preview = shouldTruncate ? content.slice(0, previewLength) + '...' : content

  return (
    <div className={`thinking-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="thinking-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="thinking-icon">🤔</span>
        <span className="thinking-label">Thinking</span>
        <span className="thinking-toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      <div className="thinking-content">
        {isExpanded ? content : preview}
      </div>
    </div>
  )
}

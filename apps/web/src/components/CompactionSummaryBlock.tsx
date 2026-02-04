import { useState, useEffect } from 'react'

interface CompactionSummaryBlockProps {
  preview: string
  fullText: string
  timestamp?: string
  expandAllTrigger?: number
  collapseAllTrigger?: number
}

export function CompactionSummaryBlock({
  preview,
  fullText,
  timestamp,
  expandAllTrigger = 0,
  collapseAllTrigger = 0,
}: CompactionSummaryBlockProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (expandAllTrigger > 0) setExpanded(true)
  }, [expandAllTrigger])

  useEffect(() => {
    if (collapseAllTrigger > 0) setExpanded(false)
  }, [collapseAllTrigger])

  return (
    <div className="compaction-summary-block">
      <div className="compaction-header" onClick={() => setExpanded(!expanded)}>
        <span className="compaction-icon">📋</span>
        <span className="compaction-label">COMPACTION SUMMARY</span>
        <span className="compaction-toggle">{expanded ? '▼' : '▶'}</span>
        {timestamp && <span className="compaction-time">{new Date(timestamp).toLocaleTimeString()}</span>}
      </div>
      <div className={`compaction-content ${expanded ? 'expanded' : ''}`}>
        {expanded ? (
          <pre className="compaction-full">{fullText}</pre>
        ) : (
          <div className="compaction-preview">{preview}</div>
        )}
      </div>
    </div>
  )
}

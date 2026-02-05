import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface JsonViewerProps {
  data: unknown
  maxPreviewLines?: number
}

export function JsonViewer({ data, maxPreviewLines = 10 }: JsonViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Convert to formatted JSON string
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const lines = jsonString.split('\n')
  const needsTruncation = lines.length > maxPreviewLines

  const displayContent = isExpanded || !needsTruncation
    ? jsonString
    : lines.slice(0, maxPreviewLines).join('\n') + '\n...'

  // Custom theme matching terminal aesthetic
  const customStyle = {
    ...vscDarkPlus,
    'pre[class*="language-"]': {
      ...vscDarkPlus['pre[class*="language-"]'],
      background: '#0d0d0d',
      margin: 0,
      padding: '12px',
      fontSize: '12px',
      lineHeight: '1.5',
      borderRadius: '4px',
    },
    'code[class*="language-"]': {
      ...vscDarkPlus['code[class*="language-"]'],
      background: 'transparent',
    }
  }

  return (
    <div className="json-viewer">
      <SyntaxHighlighter
        language="json"
        style={customStyle}
        customStyle={{
          background: '#0d0d0d',
          margin: 0,
          borderRadius: needsTruncation ? '4px 4px 0 0' : '4px',
        }}
      >
        {displayContent}
      </SyntaxHighlighter>
      {needsTruncation && (
        <button
          className="json-expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? '▲ Collapse' : `▼ Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  )
}

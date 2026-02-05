import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MessageBlockProps {
  type: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export function MessageBlock({ type, content: rawContent }: MessageBlockProps) {
  // Ensure content is a string
  const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2)

  return (
    <div className={`message-block message-${type}`}>
      <div className="message-header">
        <span className="message-icon">{type === 'user' ? '👤' : '🤖'}</span>
        <span className="message-role">{type === 'user' ? 'You' : 'Claude'}</span>
      </div>
      <div className="message-content markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom table rendering
            table: ({ children }) => (
              <div className="table-wrapper">
                <table>{children}</table>
              </div>
            ),
            // Code blocks
            code: ({ className, children, ...props }) => {
              const isInline = !className
              return isInline ? (
                <code className="inline-code" {...props}>{children}</code>
              ) : (
                <pre className="code-block">
                  <code className={className} {...props}>{children}</code>
                </pre>
              )
            },
            // Links open in new tab
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

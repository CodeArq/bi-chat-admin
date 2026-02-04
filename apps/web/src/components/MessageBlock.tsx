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
      <div className="message-content">
        {content.split('\n').map((line, i) => (
          <span key={i}>
            {line}
            {i < content.split('\n').length - 1 && <br />}
          </span>
        ))}
      </div>
    </div>
  )
}

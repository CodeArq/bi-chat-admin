import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Message, ConnectionStatus } from '../types'

interface MessageListProps {
  messages: Message[]
  status: ConnectionStatus
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function MessageList({ messages, status }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-container" ref={containerRef}>
        <div className="empty-state">
          <div className="empty-state-icon">{'>'}_</div>
          <div className="empty-state-text">No messages yet</div>
          <div className="empty-state-hint">
            Type a message below to start chatting with Claude
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-container" ref={containerRef}>
      {messages.map((message) => (
        <div key={message.id} className={`message ${message.type}`}>
          <div className="message-content">
            {message.type === 'assistant' ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
              message.content
            )}
          </div>
          <div className="message-timestamp">
            {formatTimestamp(message.timestamp)}
          </div>
        </div>
      ))}

      {status === 'thinking' && (
        <div className="message assistant">
          <div className="typing-indicator">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  )
}

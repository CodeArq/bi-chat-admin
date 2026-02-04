import type { TranscriptEntry } from '../types'

interface LogEventRowProps {
  entry: TranscriptEntry
}

/**
 * Compact log event row for detailed view
 * Shows: timestamp | event_type | message
 */
export function LogEventRow({ entry }: LogEventRowProps) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  // Get event type and message based on content type
  let eventType = ''
  let message = ''
  let colorClass = ''

  switch (entry.content.type) {
    case 'log_event':
      eventType = entry.content.event_type
      message = entry.content.message
      // Color by event type
      if (eventType === 'user-prompt') colorClass = 'log-user'
      else if (eventType === 'stop') colorClass = 'log-stop'
      else if (eventType === 'task') colorClass = 'log-task'
      else colorClass = 'log-default'
      break

    case 'token_usage':
      eventType = 'usage'
      const inTok = entry.content.input_tokens || 0
      const outTok = entry.content.output_tokens || 0
      const cacheRead = entry.content.cache_read_tokens || 0
      const cacheCreate = entry.content.cache_creation_tokens || 0

      // Build detailed usage string
      const parts = []
      if (inTok > 0) parts.push(`in:${inTok.toLocaleString()}`)
      if (outTok > 0) parts.push(`out:${outTok.toLocaleString()}`)
      if (cacheRead > 0) parts.push(`cache↓${cacheRead.toLocaleString()}`)
      if (cacheCreate > 0) parts.push(`cache↑${cacheCreate.toLocaleString()}`)

      message = parts.length > 0 ? parts.join(' | ') : `${entry.content.total_tokens} tokens`
      colorClass = 'log-usage'
      break

    case 'thinking':
      eventType = 'thinking'
      message = entry.content.text.slice(0, 100) + (entry.content.text.length > 100 ? '...' : '')
      colorClass = 'log-thinking'
      break

    default:
      return null
  }

  return (
    <div className={`log-event-row ${colorClass}`}>
      <span className="log-timestamp">{timestamp}</span>
      <span className="log-type">[{eventType}]</span>
      <span className="log-message">{message}</span>
    </div>
  )
}

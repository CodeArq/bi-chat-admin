import { useState, useCallback, KeyboardEvent, ChangeEvent, useRef, useEffect } from 'react'
import type { ConnectionStatus, Attachment } from '../types'

interface MessageInputProps {
  onSend: (content: string, attachments?: Attachment[]) => void
  status: ConnectionStatus | 'running'
  placeholder?: string
}

export function MessageInput({ onSend, status, placeholder }: MessageInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevDisabledRef = useRef(false)

  const isDisabled = status === 'thinking' || status === 'disconnected'

  const defaultPlaceholder = isDisabled
    ? status === 'thinking'
      ? 'Waiting for response...'
      : 'Connecting to bridge...'
    : 'Type a message... (Shift+Enter for newline)'

  const handleSubmit = useCallback(() => {
    if ((input.trim() || attachments.length > 0) && !isDisabled) {
      onSend(input, attachments.length > 0 ? attachments : undefined)
      setInput('')
      setAttachments([])

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [input, attachments, isDisabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)

    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [])

  // Focus input when component mounts
  useEffect(() => {
    // Small delay to ensure mobile browsers allow focus after view transition
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Re-focus when input becomes enabled (e.g., after processing completes)
  useEffect(() => {
    if (prevDisabledRef.current && !isDisabled) {
      textareaRef.current?.focus()
    }
    prevDisabledRef.current = isDisabled
  }, [isDisabled])

  // Handle clicking the input wrapper area to focus textarea (mobile tap support)
  const handleWrapperClick = useCallback(() => {
    if (!isDisabled) {
      textareaRef.current?.focus()
    }
  }, [isDisabled])

  // File attachment helpers
  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setAttachments(prev => [...prev, {
        name: file.name,
        media_type: file.type,
        data: base64,
      }])
    }
    reader.readAsDataURL(file)
  }, [])

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(processFile)
    // Reset so the same file can be selected again
    e.target.value = ''
  }, [processFile])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) processFile(file)
      }
    }
  }, [processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files) return
    Array.from(files).forEach(processFile)
  }, [processFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div
      className="input-area"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {attachments.length > 0 && (
        <div className="attachment-previews">
          {attachments.map((att, i) => (
            <div key={i} className="attachment-preview">
              <img
                src={`data:${att.media_type};base64,${att.data}`}
                alt={att.name}
                className="attachment-thumb"
              />
              <span className="attachment-name">{att.name}</span>
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(i)}
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="input-row">
        <div className="input-wrapper" onClick={handleWrapperClick}>
          <span className="input-prefix">{'>'}</span>
          <textarea
            ref={textareaRef}
            className="message-input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder || defaultPlaceholder}
            disabled={isDisabled}
            rows={1}
            autoFocus
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          title="Attach screenshot"
        >
          +
        </button>
        <button
          className="send-button"
          onClick={handleSubmit}
          disabled={isDisabled || (!input.trim() && attachments.length === 0)}
        >
          Send
        </button>
      </div>
    </div>
  )
}

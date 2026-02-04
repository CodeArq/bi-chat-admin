import { useState } from 'react'
import type { WebChat } from '../types'

interface WebChatsSectionProps {
  chats: WebChat[]
  onCreateChat: (cwd: string, name?: string) => Promise<WebChat | null>
  onSelectChat: (chatId: string) => void
  onStopChat: (chatId: string) => Promise<boolean>
}

// Default working directory for new chats
const DEFAULT_CWD = '/Users/ryanb/Developer/b-Intelligent/b-Intelligent-Protocol-v2-LIVE'

export function WebChatsSection({ chats, onCreateChat, onSelectChat, onStopChat }: WebChatsSectionProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newChatCwd, setNewChatCwd] = useState(DEFAULT_CWD)
  const [newChatName, setNewChatName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newChatCwd.trim()) return

    setCreating(true)
    const chat = await onCreateChat(newChatCwd.trim(), newChatName.trim() || undefined)
    setCreating(false)

    if (chat) {
      setShowCreateModal(false)
      setNewChatCwd(DEFAULT_CWD)
      setNewChatName('')
    }
  }

  const runningChats = chats.filter((c) => c.status === 'running' || c.status === 'starting')
  const stoppedChats = chats.filter((c) => c.status === 'stopped' || c.status === 'error')

  return (
    <div className="web-chats-section">
      <div className="section-header">
        <h2>&gt; WEB CHATS ({runningChats.length})</h2>
      </div>

      <div className="web-chats-grid">
        {runningChats.map((chat) => (
          <div
            key={chat.id}
            className={`web-chat-card ${chat.status}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="chat-status-indicator" />
            <div className="chat-name">{chat.name}</div>
            <div className="chat-id">{chat.id}</div>
            <div className="chat-cwd" title={chat.cwd}>
              {chat.cwd.length > 30 ? '...' + chat.cwd.slice(-30) : chat.cwd}
            </div>
            <div className="chat-meta">
              <span className={`status-badge ${chat.status}`}>{chat.status}</span>
            </div>
            <button
              className="stop-btn"
              onClick={(e) => {
                e.stopPropagation()
                onStopChat(chat.id)
              }}
            >
              Stop
            </button>
          </div>
        ))}

        <div className="web-chat-card create-card" onClick={() => setShowCreateModal(true)}>
          <div className="create-icon">+</div>
          <div className="create-label">Start New Chat</div>
        </div>
      </div>

      {stoppedChats.length > 0 && (
        <div className="stopped-chats">
          <div className="stopped-header">Stopped ({stoppedChats.length})</div>
          <div className="stopped-list">
            {stoppedChats.map((chat) => (
              <span key={chat.id} className={`stopped-chat ${chat.status}`}>
                {chat.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Start New Web Chat</h3>
            <div className="form-group">
              <label>Working Directory</label>
              <input
                type="text"
                value={newChatCwd}
                onChange={(e) => setNewChatCwd(e.target.value)}
                placeholder="/path/to/project"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Name (optional)</label>
              <input
                type="text"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="My Chat"
              />
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleCreate}
                disabled={!newChatCwd.trim() || creating}
              >
                {creating ? 'Starting...' : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

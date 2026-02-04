export interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: string
  in_reply_to?: string
  status?: 'pending' | 'delivered'
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'thinking'

export interface ChatState {
  messages: Message[]
  status: ConnectionStatus
  error: string | null
}

// Multi-session support (P-7)
export interface Session {
  session_id: string
  short_id: string
  cwd: string
  project_name: string
  transcript_path?: string
  registered_at: string
  last_activity: string
  status: 'active' | 'idle'
  message_count: number
  tool_count: number
  time_since_activity?: string
}

export interface SessionsState {
  sessions: Session[]
  selectedSessionId: string | null
  loading: boolean
  error: string | null
}

// ============================================================================
// Transcript Types
// ============================================================================

export type TranscriptEntryType =
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'system'
  | 'log_event'
  | 'agent_spawn'
  | 'agent_result'
  | 'token_usage'
  | 'compaction_summary'
  | 'approval_prompt'

export interface TranscriptEntry {
  id: string
  type: TranscriptEntryType
  timestamp: string
  content: TranscriptContent
}

export type TranscriptContent =
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; tool_name: string; tool_id: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_id: string; output: string; is_error?: boolean }
  | { type: 'thinking'; text: string }
  | { type: 'system'; text: string }
  | { type: 'log_event'; event_type: string; message: string }
  | { type: 'agent_spawn'; agent_type: string; agent_id?: string; description: string; prompt_preview?: string; status?: string; result_preview?: string; tool_use_id?: string }
  | { type: 'agent_result'; agent_id: string; agent_type: string; result: string }
  | { type: 'token_usage'; input_tokens: number; output_tokens: number; cache_read_tokens?: number; cache_creation_tokens?: number; total_tokens: number }
  | { type: 'compaction_summary'; preview: string; full_text: string }
  | { type: 'approval_prompt'; request_id: string; tool_name: string; tool_use_id?: string; input: Record<string, unknown>; input_preview: string }

// Session usage totals
export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  message_count: number
  estimated_cost_usd: number
}

export type ViewMode = 'simple' | 'detailed'

export type PermissionMode = 'assisted' | 'full_ai'

// File attachment (screenshot/image)
export interface Attachment {
  name: string
  media_type: string
  data: string  // base64
}

// ============================================================================
// Web Chat Types (spawned Claude subprocesses)
// ============================================================================

export type WebChatStatus = 'starting' | 'running' | 'idle' | 'stopped' | 'error'

// Process state for real-time activity tracking
export type ProcessState = 'idle' | 'processing' | 'awaiting_approval' | 'finished' | 'error'

export interface WebChat {
  id: string
  name: string
  cwd: string
  status: WebChatStatus
  created_at: string
  last_activity: string
  pid?: number
  session_id?: string
  process_state?: ProcessState
}

export interface WebChatMessage {
  id: string
  chat_id: string
  type: TranscriptEntryType
  content: TranscriptContent
  timestamp: string
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type WSEventType =
  | 'connected'
  | 'transcript_entry'
  | 'chat_status'
  | 'session_update'
  | 'approval_request'
  | 'error'

export interface WSEvent {
  type: WSEventType
  data?: unknown
  timestamp: string
}

// ============================================================================
// Approval Types (V2 streaming mode)
// ============================================================================

export interface ApprovalRequest {
  request_id: string
  chat_id: string
  tool_name: string
  tool_use_id?: string
  input: Record<string, unknown>
  suggestions?: unknown[]
  timestamp: string
}

export interface ApprovalResponse {
  request_id: string
  behavior: 'allow' | 'deny'
  updated_input?: Record<string, unknown>
  message?: string
}

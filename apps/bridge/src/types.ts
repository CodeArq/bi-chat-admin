/**
 * Session Registration - Multi-Session Support (P-7)
 * Stored in /tmp/b-intelligent/sessions/{short_id}.json
 */
export interface SessionRegistration {
  // Identity
  session_id: string          // Full UUID from Claude
  short_id: string            // First 8 chars (for filenames and display)

  // Context
  cwd: string                 // Working directory
  project_name: string        // Derived from cwd (basename)
  transcript_path?: string    // Path to Claude transcript

  // Lifecycle
  registered_at: string       // ISO timestamp - first activity
  last_activity: string       // ISO timestamp - most recent hook
  status: SessionStatus       // active = recent, idle = no activity

  // Stats
  message_count: number       // User messages sent
  tool_count: number          // Tools used
}

export type SessionStatus = 'active' | 'idle'

/**
 * Session info returned by API (includes computed fields)
 */
export interface SessionInfo extends SessionRegistration {
  time_since_activity?: string  // Human-readable "2m ago"
}

/**
 * Request body for session registration
 */
export interface RegisterSessionRequest {
  session_id: string
  cwd: string
  transcript_path?: string
}

/**
 * Request body for session update
 */
export interface UpdateSessionRequest {
  last_activity?: string
  message_count?: number
  tool_count?: number
  status?: SessionStatus
}

// ============================================================================
// Transcript Types - For reading Claude's .jsonl transcripts
// ============================================================================

export type TranscriptEntryType =
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'system'
  | 'log_event'       // Hook progress, system events
  | 'agent_spawn'     // Task tool spawning an agent
  | 'agent_result'    // Agent completion with result
  | 'token_usage'     // Usage stats
  | 'approval_prompt' // Tool approval request

export interface TranscriptEntry {
  id: string
  type: TranscriptEntryType
  timestamp: string
  content: TranscriptContent
}

export type TranscriptContent =
  | UserContent
  | AssistantContent
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent
  | SystemContent
  | LogEventContent
  | AgentSpawnContent
  | AgentResultContent
  | TokenUsageContent
  | ApprovalPromptContent

export interface UserContent {
  type: 'user'
  text: string
}

export interface AssistantContent {
  type: 'assistant'
  text: string
}

export interface ToolUseContent {
  type: 'tool_use'
  tool_name: string
  tool_id: string
  input: Record<string, unknown>
}

export interface ToolResultContent {
  type: 'tool_result'
  tool_id: string
  output: string
  is_error?: boolean
}

export interface ThinkingContent {
  type: 'thinking'
  text: string
}

export interface SystemContent {
  type: 'system'
  text: string
}

export interface LogEventContent {
  type: 'log_event'
  event_type: string        // 'user-prompt', 'stop', 'task', etc.
  message: string
}

export interface AgentSpawnContent {
  type: 'agent_spawn'
  agent_type: string        // 'project-manager', 'business-architect', etc.
  agent_id?: string         // Populated when result comes back
  description: string
  prompt_preview?: string   // First 200 chars of prompt
}

export interface AgentResultContent {
  type: 'agent_result'
  agent_id: string
  agent_type: string
  result: string            // The agent's response
}

export interface TokenUsageContent {
  type: 'token_usage'
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_creation_tokens?: number
  total_tokens: number
}

// ============================================================================
// Web Chat Types - For spawned Claude subprocesses
// ============================================================================

export type WebChatStatus = 'starting' | 'running' | 'idle' | 'stopped' | 'error'

export interface WebChat {
  id: string
  name: string
  cwd: string
  status: WebChatStatus
  created_at: string
  last_activity: string
  pid?: number
  session_id?: string
}

export type PermissionMode = 'assisted' | 'full_ai'

// File attachment (screenshot/image)
export interface Attachment {
  name: string
  media_type: string
  data: string  // base64
}

export interface CreateWebChatRequest {
  name?: string
  cwd: string
  system_prompt?: string
  session_id?: string  // Resume an existing session instead of creating a new one
  permission_mode?: PermissionMode
}

export interface WebChatMessage {
  id: string
  chat_id: string
  type: TranscriptEntryType
  content: TranscriptContent
  timestamp: string
}

// ============================================================================
// Approval Types - For DIY approval flow via CLI
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

export interface ApprovalPromptContent {
  type: 'approval_prompt'
  request_id: string
  tool_name: string
  tool_use_id?: string
  input: Record<string, unknown>
  input_preview: string  // Formatted preview for display
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type WSEventType =
  | 'transcript_entry'
  | 'chat_status'
  | 'session_update'
  | 'approval_request'  // New: approval needed
  | 'error'

export interface WSEvent {
  type: WSEventType
  session_id?: string
  chat_id?: string
  data: unknown
  timestamp: string
}

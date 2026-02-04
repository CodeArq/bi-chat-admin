/**
 * Process Manager - Streaming Mode with Approval Support
 *
 * Uses streaming JSON I/O to manage Claude subprocess lifecycle:
 * 1. --output-format stream-json and --input-format stream-json
 * 2. --permission-prompt-tool stdio for approval flow
 * 3. Keeps stdin open for sending messages AND approval responses
 * 4. Reads stdout for all events (including control_request)
 *
 * Control Response Format (from SDK source analysis):
 * {
 *   type: "control_response",
 *   response: {
 *     subtype: "success",
 *     request_id: "...",
 *     response: { behavior: "allow", updatedInput: {...} }
 *   }
 * }
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createInterface, type Interface } from 'node:readline'
import { config } from '../config.js'
import type {
  WebChat,
  TranscriptEntryType,
  ApprovalRequest,
  ApprovalResponse,
  PermissionMode,
  Attachment,
} from '../types.js'

// Process state for tracking Claude activity
export type ProcessState = 'idle' | 'processing' | 'awaiting_approval' | 'finished' | 'error'

interface ManagedChat {
  chat: WebChat
  sessionId: string
  systemPrompt?: string
  permissionMode: PermissionMode
  isProcessing: boolean
  processState: ProcessState
  messageCount: number
  currentProcess?: ChildProcess
  stdoutRL?: Interface
  pendingApprovals: Map<string, ApprovalRequest>
  autoApprove: boolean
}

class ProcessManager extends EventEmitter {
  private chats: Map<string, ManagedChat> = new Map()

  /**
   * Create a new web chat, or resume an existing session
   * If existingSessionId is provided, resumes that session (uses --resume on first message)
   */
  async createChat(cwd: string, name?: string, systemPrompt?: string, existingSessionId?: string, permissionMode: PermissionMode = 'assisted'): Promise<WebChat> {
    const id = randomUUID().slice(0, 8)
    const sessionId = existingSessionId || randomUUID()
    const isResume = !!existingSessionId
    const chatName = name || `Chat ${id}`

    const chat: WebChat = {
      id,
      name: chatName,
      cwd,
      status: 'running',
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      session_id: sessionId,
    }

    const managed: ManagedChat = {
      chat,
      sessionId,
      systemPrompt,
      permissionMode,
      isProcessing: false,
      processState: 'idle',
      // If resuming an existing session, set messageCount to 1
      // so sendMessage() uses --resume instead of --session-id
      messageCount: isResume ? 1 : 0,
      pendingApprovals: new Map(),
      autoApprove: false,
    }

    this.chats.set(id, managed)
    this.emit('chat_status', { chat_id: id, status: 'running' })

    console.log(`[WebChat ${id}] Created with session ${sessionId}${isResume ? ' (resuming existing)' : ''} [${permissionMode}]`)
    return chat
  }

  /**
   * Send a message to a web chat (streaming mode)
   */
  async sendMessage(chatId: string, message: string, attachments?: Attachment[]): Promise<boolean> {
    const managed = this.chats.get(chatId)
    if (!managed) {
      console.error(`[WebChat ${chatId}] Not found`)
      return false
    }

    // Reset stale processing flag if the process has already exited
    if (managed.isProcessing && (!managed.currentProcess || managed.currentProcess.killed || managed.currentProcess.exitCode !== null)) {
      console.log(`[WebChat ${chatId}] Resetting stale isProcessing flag (process already exited)`)
      managed.isProcessing = false
      managed.processState = 'idle'
    }

    if (managed.isProcessing) {
      console.error(`[WebChat ${chatId}] Already processing a message`)
      return false
    }

    managed.isProcessing = true
    managed.processState = 'processing'
    managed.chat.last_activity = new Date().toISOString()
    this.emit('chat_status', { chat_id: chatId, status: 'running', process_state: 'processing' })

    // Note: User message is added by the web UI immediately (optimistic update)
    // Don't emit here to avoid duplicates

    // Build streaming mode args
    // NOTE: --print and --verbose are REQUIRED for stream-json to work
    const args: string[] = [
      '-p',  // Print mode (required for stream-json)
      '--verbose',  // Required when using stream-json with --print
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--max-turns', '50',
    ]

    // Permission mode: full_ai skips all approvals, assisted uses stdio approval flow
    if (managed.permissionMode === 'full_ai') {
      args.push('--dangerously-skip-permissions')
    } else {
      args.push('--permission-mode', 'default')
      args.push('--permission-prompt-tool', 'stdio')  // Critical for approval flow
    }

    if (managed.messageCount === 0) {
      args.push('--session-id', managed.sessionId)
      if (managed.systemPrompt) {
        args.push('--append-system-prompt', managed.systemPrompt)
      }
    } else {
      args.push('--resume', managed.sessionId)
    }

    managed.messageCount++

    console.log(`[WebChat ${chatId}] Spawning streaming mode: ${config.claudePath} ${args.join(' ')}`)

    const proc = spawn(config.claudePath, args, {
      cwd: managed.chat.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    managed.currentProcess = proc
    managed.chat.pid = proc.pid

    // Parse stdout as JSONL
    const rl = createInterface({ input: proc.stdout! })
    managed.stdoutRL = rl

    rl.on('line', (line) => {
      this.handleStreamLine(line, managed, chatId)
    })

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (text && !text.includes('Debugger')) {
        console.error(`[WebChat ${chatId}] stderr:`, text.slice(0, 200))
      }
    })

    // Handle process exit
    proc.on('exit', (code) => {
      console.log(`[WebChat ${chatId}] Process exited with code ${code}`)
      managed.isProcessing = false
      managed.processState = 'finished'
      managed.currentProcess = undefined
      managed.stdoutRL?.close()
      this.emit('chat_status', { chat_id: chatId, status: 'ready', process_state: 'finished' })
    })

    proc.on('error', (err) => {
      console.error(`[WebChat ${chatId}] Process error:`, err)
      managed.isProcessing = false
      managed.processState = 'error'
      managed.currentProcess = undefined
      this.emit('chat_status', { chat_id: chatId, status: 'error', process_state: 'error', error: err.message })
    })

    // Send initial user message after short delay (wait for init)
    setTimeout(() => {
      // Build content: if attachments, use content blocks; otherwise plain string
      let content: unknown = message
      if (attachments && attachments.length > 0) {
        const blocks: unknown[] = []
        for (const att of attachments) {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: att.media_type,
              data: att.data,
            },
          })
        }
        if (message) {
          blocks.push({ type: 'text', text: message })
        }
        content = blocks
      }

      const userMsg = {
        type: 'user',
        message: {
          role: 'user',
          content,
        },
      }
      console.log(`[WebChat ${chatId}] Sending user message via stdin${attachments?.length ? ` with ${attachments.length} attachment(s)` : ''}`)
      proc.stdin!.write(JSON.stringify(userMsg) + '\n')
    }, 1000)

    return true
  }

  /**
   * Handle a line from stdout (streaming JSON)
   */
  private handleStreamLine(line: string, managed: ManagedChat, chatId: string) {
    try {
      const msg = JSON.parse(line)
      const timestamp = new Date().toISOString()

      // System init
      if (msg.type === 'system' && msg.subtype === 'init') {
        console.log(`[WebChat ${chatId}] System init received`)
        return
      }

      // Control request (APPROVAL NEEDED)
      if (msg.type === 'control_request') {
        this.handleControlRequest(msg, managed, chatId)
        return
      }

      // Assistant message
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            console.log(`[WebChat ${chatId}] Assistant: ${block.text.slice(0, 50)}...`)
            this.emit('transcript_entry', {
              id: randomUUID().slice(0, 8),
              chat_id: chatId,
              type: 'assistant' as TranscriptEntryType,
              content: { type: 'assistant', text: block.text },
              timestamp,
            })
          } else if (block.type === 'tool_use') {
            console.log(`[WebChat ${chatId}] Tool: ${block.name}`)
            this.emit('transcript_entry', {
              id: randomUUID().slice(0, 8),
              chat_id: chatId,
              type: 'tool_use' as TranscriptEntryType,
              content: {
                type: 'tool_use',
                tool_name: block.name,
                tool_id: block.id,
                input: block.input,
              },
              timestamp,
            })
          }
        }
      }

      // User message (tool result)
      if (msg.type === 'user' && msg.message?.content) {
        const content = msg.message.content[0]
        if (content?.type === 'tool_result') {
          const preview = String(content.content || '').slice(0, 100)
          console.log(`[WebChat ${chatId}] Tool result: ${content.is_error ? 'ERROR' : 'OK'}`)
          this.emit('transcript_entry', {
            id: randomUUID().slice(0, 8),
            chat_id: chatId,
            type: 'tool_result' as TranscriptEntryType,
            content: {
              type: 'tool_result',
              tool_id: content.tool_use_id || '',
              output: preview,
              is_error: content.is_error,
            },
            timestamp,
          })
        }
      }

      // Result (completion)
      if (msg.type === 'result') {
        console.log(`[WebChat ${chatId}] Result: ${msg.subtype}`)
        managed.isProcessing = false
        managed.processState = 'idle'
        this.emit('chat_status', { chat_id: chatId, status: 'ready', process_state: 'idle' })
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  /**
   * Handle control_request (approval prompt)
   */
  private handleControlRequest(msg: any, managed: ManagedChat, chatId: string) {
    if (msg.request?.subtype !== 'can_use_tool') {
      console.log(`[WebChat ${chatId}] Unknown control request: ${msg.request?.subtype}`)
      return
    }

    const request: ApprovalRequest = {
      request_id: msg.request_id,
      chat_id: chatId,
      tool_name: msg.request.tool_name,
      tool_use_id: msg.request.tool_use_id,
      input: msg.request.input,
      suggestions: msg.request.permission_suggestions,
      timestamp: new Date().toISOString(),
    }

    // Auto-approve: immediately allow without user interaction
    if (managed.autoApprove) {
      console.log(`[WebChat ${chatId}] AUTO-APPROVE: ${request.tool_name}`)
      // Store first so respondToApproval can find it
      managed.pendingApprovals.set(msg.request_id, request)
      this.respondToApproval(chatId, {
        request_id: msg.request_id,
        behavior: 'allow',
      })
      // Emit a log entry so the UI sees what was auto-approved
      this.emit('transcript_entry', {
        id: randomUUID().slice(0, 8),
        chat_id: chatId,
        type: 'log_event' as TranscriptEntryType,
        content: {
          type: 'log_event',
          event_type: 'auto_approval',
          message: `AUTO-APPROVED: ${request.tool_name}`,
        },
        timestamp: request.timestamp,
      })
      return
    }

    // Store pending approval
    managed.pendingApprovals.set(msg.request_id, request)
    managed.processState = 'awaiting_approval'

    console.log(`[WebChat ${chatId}] APPROVAL NEEDED: ${request.tool_name}`)

    // Emit status change to awaiting_approval
    this.emit('chat_status', { chat_id: chatId, status: 'running', process_state: 'awaiting_approval' })

    // Format input preview
    let inputPreview = JSON.stringify(request.input, null, 2)
    if (inputPreview.length > 500) {
      inputPreview = inputPreview.slice(0, 500) + '...'
    }

    // Emit approval request event
    this.emit('approval_request', {
      chat_id: chatId,
      request,
    })

    // Also emit as transcript entry for UI
    this.emit('transcript_entry', {
      id: randomUUID().slice(0, 8),
      chat_id: chatId,
      type: 'approval_prompt' as TranscriptEntryType,
      content: {
        type: 'approval_prompt',
        request_id: msg.request_id,
        tool_name: request.tool_name,
        tool_use_id: request.tool_use_id,
        input: request.input,
        input_preview: inputPreview,
      },
      timestamp: request.timestamp,
    })
  }

  /**
   * Respond to an approval request
   */
  respondToApproval(chatId: string, response: ApprovalResponse): boolean {
    const managed = this.chats.get(chatId)
    if (!managed) {
      console.error(`[WebChat ${chatId}] Not found`)
      return false
    }

    const request = managed.pendingApprovals.get(response.request_id)
    if (!request) {
      console.error(`[WebChat ${chatId}] No pending approval: ${response.request_id}`)
      return false
    }

    if (!managed.currentProcess?.stdin) {
      console.error(`[WebChat ${chatId}] No stdin available`)
      return false
    }

    // Build control_response in CORRECT format (from SDK analysis)
    const controlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: response.request_id,
        response: response.behavior === 'allow'
          ? {
              behavior: 'allow',
              updatedInput: response.updated_input || request.input,
              toolUseID: request.tool_use_id,
            }
          : {
              behavior: 'deny',
              message: response.message || 'User denied this action',
            },
      },
    }

    const responseStr = JSON.stringify(controlResponse)
    console.log(`[WebChat ${chatId}] Sending approval response: ${response.behavior}`)

    managed.currentProcess.stdin.write(responseStr + '\n')
    managed.pendingApprovals.delete(response.request_id)

    // Switch back to processing state after approval response
    managed.processState = 'processing'
    this.emit('chat_status', { chat_id: chatId, status: 'running', process_state: 'processing' })

    // Emit log event
    this.emit('transcript_entry', {
      id: randomUUID().slice(0, 8),
      chat_id: chatId,
      type: 'log_event' as TranscriptEntryType,
      content: {
        type: 'log_event',
        event_type: 'approval_response',
        message: `${response.behavior === 'allow' ? '✅' : '❌'} ${request.tool_name}: ${response.behavior}`,
      },
      timestamp: new Date().toISOString(),
    })

    return true
  }

  /**
   * Set auto-approve mode for a chat
   */
  setAutoApprove(chatId: string, enabled: boolean): boolean {
    const managed = this.chats.get(chatId)
    if (!managed) return false
    managed.autoApprove = enabled
    console.log(`[WebChat ${chatId}] Auto-approve: ${enabled ? 'ON' : 'OFF'}`)

    // If enabling and there are pending approvals, approve them all now
    if (enabled && managed.pendingApprovals.size > 0) {
      for (const [requestId] of managed.pendingApprovals) {
        this.respondToApproval(chatId, { request_id: requestId, behavior: 'allow' })
      }
    }

    return true
  }

  /**
   * Get auto-approve state for a chat
   */
  getAutoApprove(chatId: string): boolean {
    const managed = this.chats.get(chatId)
    if (!managed) return false
    return managed.autoApprove
  }

  /**
   * Get pending approvals for a chat
   */
  getPendingApprovals(chatId: string): ApprovalRequest[] {
    const managed = this.chats.get(chatId)
    if (!managed) return []
    return Array.from(managed.pendingApprovals.values())
  }

  /**
   * Stop a web chat
   */
  async stopChat(chatId: string): Promise<boolean> {
    const managed = this.chats.get(chatId)
    if (!managed) return false

    if (managed.currentProcess && !managed.currentProcess.killed) {
      managed.currentProcess.kill('SIGTERM')
    }

    managed.stdoutRL?.close()
    managed.chat.status = 'stopped'
    this.emit('chat_status', { chat_id: chatId, status: 'stopped' })

    return true
  }

  /**
   * Get all web chats
   */
  getAllChats(): (WebChat & { process_state?: string })[] {
    return Array.from(this.chats.values()).map((m) => ({
      ...m.chat,
      process_state: m.processState,
    }))
  }

  /**
   * Get a specific web chat
   */
  getChat(chatId: string): WebChat | null {
    return this.chats.get(chatId)?.chat || null
  }

  /**
   * Get session info for a chat
   */
  getSessionInfo(chatId: string): { sessionId: string } | null {
    const managed = this.chats.get(chatId)
    if (!managed) return null
    return { sessionId: managed.sessionId }
  }

  /**
   * Get the current process state for a chat
   */
  getProcessState(chatId: string): ProcessState | null {
    const managed = this.chats.get(chatId)
    if (!managed) return null
    return managed.processState
  }

  /**
   * Get PID → sessionId mapping for all running chats.
   * Used by sessions route to look up process stats via ps.
   */
  getActivePidMap(): Map<number, string> {
    const map = new Map<number, string>()
    for (const [, managed] of this.chats) {
      if (managed.chat.status === 'running' && managed.chat.pid) {
        map.set(managed.chat.pid, managed.sessionId)
      }
    }
    return map
  }

  /**
   * Clean up stopped chats
   */
  cleanup(): number {
    let cleaned = 0
    for (const [id, managed] of this.chats) {
      if (managed.chat.status === 'stopped' || managed.chat.status === 'error') {
        managed.stdoutRL?.close()
        this.chats.delete(id)
        cleaned++
      }
    }
    return cleaned
  }
}

export const processManager = new ProcessManager()

/**
 * Web Chats Routes - Manage spawned Claude subprocesses
 *
 * All chats use streaming mode with approval support:
 * - POST /web-chats/:chatId/approve - Respond to approval request
 * - GET /web-chats/:chatId/approvals - Get pending approvals
 */

import { Router } from 'express'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { processManager } from '../services/processManager.js'
import type { CreateWebChatRequest, TranscriptEntry, ApprovalResponse } from '../types.js'
import { randomUUID } from 'node:crypto'

export const webChatsRouter = Router()

/**
 * GET /web-chats
 * List all web chats
 */
webChatsRouter.get('/', (_req, res) => {
  const chats = processManager.getAllChats()
  res.json({
    chats,
    count: chats.length,
  })
})

/**
 * GET /web-chats/:chatId
 * Get a specific web chat
 */
webChatsRouter.get('/:chatId', (req, res) => {
  const { chatId } = req.params
  const chat = processManager.getChat(chatId)

  if (!chat) {
    return res.status(404).json({ error: 'Web chat not found' })
  }

  res.json(chat)
})

/**
 * POST /web-chats
 * Create a new web chat (streaming mode with approval support)
 */
webChatsRouter.post('/', async (req, res) => {
  try {
    const body = req.body as CreateWebChatRequest

    if (!body.cwd) {
      return res.status(400).json({ error: 'cwd is required' })
    }

    const chat = await processManager.createChat(body.cwd, body.name, body.system_prompt, body.session_id, body.permission_mode || 'assisted')
    res.status(201).json({ ...chat, mode: 'streaming' })
  } catch (err: any) {
    console.error('[API] Error creating web chat:', err)
    res.status(500).json({ error: 'Failed to create web chat', message: err.message })
  }
})

/**
 * POST /web-chats/:chatId/message
 * Send a message to a web chat (streaming mode)
 */
webChatsRouter.post('/:chatId/message', async (req, res) => {
  try {
    const { chatId } = req.params
    const { content, attachments } = req.body

    if ((!content || typeof content !== 'string') && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'content or attachments required' })
    }

    const chat = processManager.getChat(chatId)
    if (!chat) {
      return res.status(404).json({ error: 'Web chat not found' })
    }

    const success = await processManager.sendMessage(chatId, content || '', attachments)

    if (!success) {
      return res.status(409).json({ error: 'Chat is still processing the previous message' })
    }

    res.json({ status: 'sent', mode: 'streaming' })
  } catch (err: any) {
    console.error('[API] Error sending message:', err)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

/**
 * DELETE /web-chats/:chatId
 * Stop a web chat
 */
webChatsRouter.delete('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params
    const success = await processManager.stopChat(chatId)

    if (!success) {
      return res.status(404).json({ error: 'Web chat not found' })
    }

    res.json({ status: 'stopped' })
  } catch (err: any) {
    console.error('[API] Error stopping web chat:', err)
    res.status(500).json({ error: 'Failed to stop web chat' })
  }
})

/**
 * POST /web-chats/cleanup
 * Clean up stopped chats
 */
webChatsRouter.post('/cleanup', (_req, res) => {
  const cleaned = processManager.cleanup()
  res.json({ cleaned })
})

/**
 * POST /web-chats/:chatId/auto-approve
 * Toggle auto-approve mode for a chat
 */
webChatsRouter.post('/:chatId/auto-approve', (req, res) => {
  try {
    const { chatId } = req.params
    const { enabled } = req.body

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' })
    }

    const success = processManager.setAutoApprove(chatId, enabled)
    if (!success) {
      return res.status(404).json({ error: 'Web chat not found' })
    }

    res.json({ status: 'ok', auto_approve: enabled })
  } catch (err: any) {
    console.error('[API] Error setting auto-approve:', err)
    res.status(500).json({ error: 'Failed to set auto-approve' })
  }
})

/**
 * GET /web-chats/:chatId/auto-approve
 * Get auto-approve state for a chat
 */
webChatsRouter.get('/:chatId/auto-approve', (req, res) => {
  const { chatId } = req.params
  const enabled = processManager.getAutoApprove(chatId)
  res.json({ chat_id: chatId, auto_approve: enabled })
})

/**
 * GET /web-chats/:chatId/approvals
 * Get pending approval requests for a chat
 */
webChatsRouter.get('/:chatId/approvals', (req, res) => {
  const { chatId } = req.params
  const approvals = processManager.getPendingApprovals(chatId)
  res.json({
    chat_id: chatId,
    approvals,
    count: approvals.length,
  })
})

/**
 * POST /web-chats/:chatId/approve
 * Respond to an approval request (allow or deny)
 */
webChatsRouter.post('/:chatId/approve', (req, res) => {
  try {
    const { chatId } = req.params
    const body = req.body as ApprovalResponse

    if (!body.request_id) {
      return res.status(400).json({ error: 'request_id is required' })
    }

    if (!body.behavior || !['allow', 'deny'].includes(body.behavior)) {
      return res.status(400).json({ error: 'behavior must be "allow" or "deny"' })
    }

    const success = processManager.respondToApproval(chatId, body)

    if (!success) {
      return res.status(404).json({ error: 'Approval request not found or chat not running' })
    }

    res.json({
      status: 'responded',
      behavior: body.behavior,
      request_id: body.request_id,
    })
  } catch (err: any) {
    console.error('[API] Error responding to approval:', err)
    res.status(500).json({ error: 'Failed to respond to approval' })
  }
})

/**
 * GET /web-chats/:chatId/transcript
 * Get the full transcript for a web chat (loads from JSONL file)
 */
webChatsRouter.get('/:chatId/transcript', async (req, res) => {
  try {
    const { chatId } = req.params

    // Get session info for this chat
    const sessionInfo = processManager.getSessionInfo(chatId)

    if (!sessionInfo) {
      return res.status(404).json({ error: 'Web chat not found' })
    }

    // Build path to JSONL file from session info
    const { cwd } = processManager.getChat(chatId) || {}
    if (!cwd) {
      return res.status(404).json({ error: 'Web chat cwd not found' })
    }

    const projectFolder = '-' + cwd.replace(/\//g, '-').slice(1)
    const jsonlPath = join(homedir(), '.claude', 'projects', projectFolder, `${sessionInfo.sessionId}.jsonl`)

    // Read and parse the chat's JSONL transcript
    let content: string
    try {
      content = await readFile(jsonlPath, 'utf-8')
    } catch {
      // File doesn't exist yet - return empty transcript
      return res.json({ chat_id: chatId, entries: [], entry_count: 0 })
    }

    const lines = content.split('\n').filter(l => l.trim())
    const entries: TranscriptEntry[] = []

    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        const timestamp = event.timestamp || new Date().toISOString()

        // Parse user messages
        if (event.type === 'user' && event.message?.content) {
          const text = typeof event.message.content === 'string'
            ? event.message.content
            : event.message.content[0]?.text || ''

          // Skip tool_result messages
          if (typeof event.message.content !== 'string' && event.message.content[0]?.type === 'tool_result') {
            continue
          }

          if (text) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'user',
              timestamp,
              content: { type: 'user', text }
            })
          }
        }

        // Parse assistant messages
        if (event.type === 'assistant' && event.message?.content) {
          // Extract text content
          const textContent = event.message.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n')

          if (textContent) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'assistant',
              timestamp,
              content: { type: 'assistant', text: textContent }
            })
          }

          // Extract tool uses
          const toolUses = event.message.content.filter((c: { type: string }) => c.type === 'tool_use')
          for (const tool of toolUses) {
            if (tool.name === 'Task') {
              // Agent spawn
              entries.push({
                id: randomUUID().slice(0, 8),
                type: 'agent_spawn',
                timestamp,
                content: {
                  type: 'agent_spawn',
                  agent_type: tool.input?.subagent_type || 'unknown',
                  description: tool.input?.description || '',
                  prompt_preview: tool.input?.prompt?.slice(0, 200)
                }
              })
            } else {
              // Regular tool use
              entries.push({
                id: randomUUID().slice(0, 8),
                type: 'tool_use',
                timestamp,
                content: {
                  type: 'tool_use',
                  tool_name: tool.name,
                  tool_id: tool.id || randomUUID().slice(0, 8),
                  input: tool.input
                }
              })
            }
          }

          // Extract token usage
          if (event.message.usage) {
            const usage = event.message.usage
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'token_usage',
              timestamp,
              content: {
                type: 'token_usage',
                input_tokens: usage.input_tokens || 0,
                output_tokens: usage.output_tokens || 0,
                cache_read_tokens: usage.cache_read_input_tokens || 0,
                cache_creation_tokens: usage.cache_creation_input_tokens || 0,
                total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
              }
            })
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    res.json({
      chat_id: chatId,
      entries,
      entry_count: entries.length
    })
  } catch (err: any) {
    console.error('[API] Error reading chat transcript:', err)
    res.status(500).json({ error: 'Failed to read transcript', message: err.message })
  }
})

/**
 * GET /web-chats/:chatId/agents/:agentId/transcript
 * Get the transcript for a spawned agent
 */
webChatsRouter.get('/:chatId/agents/:agentId/transcript', async (req, res) => {
  try {
    const { chatId, agentId } = req.params

    // Get session info and cwd for this chat
    const sessionInfo = processManager.getSessionInfo(chatId)
    if (!sessionInfo) {
      return res.status(404).json({ error: 'Web chat not found' })
    }

    const chat = processManager.getChat(chatId)
    if (!chat) {
      return res.status(404).json({ error: 'Web chat not found' })
    }

    // Build path to agent's JSONL file
    const projectFolder = '-' + chat.cwd.replace(/\//g, '-').slice(1)
    const basePath = join(homedir(), '.claude', 'projects', projectFolder, `${sessionInfo.sessionId}`)
    const agentJsonlPath = join(basePath, 'subagents', `agent-${agentId}.jsonl`)

    // Read and parse the agent's transcript
    let content: string
    try {
      content = await readFile(agentJsonlPath, 'utf-8')
    } catch {
      return res.status(404).json({ error: 'Agent transcript not found', path: agentJsonlPath })
    }

    const lines = content.split('\n').filter(l => l.trim())
    const entries: TranscriptEntry[] = []

    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        const timestamp = event.timestamp || new Date().toISOString()

        // Parse user messages
        if (event.type === 'user' && event.message?.content) {
          const text = typeof event.message.content === 'string'
            ? event.message.content
            : event.message.content[0]?.text || ''

          if (text && !text.includes('tool_result')) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'user',
              timestamp,
              content: { type: 'user', text: text.slice(0, 1000) }
            })
          }
        }

        // Parse assistant messages
        if (event.type === 'assistant' && event.message?.content) {
          const textContent = event.message.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n')

          if (textContent) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'assistant',
              timestamp,
              content: { type: 'assistant', text: textContent }
            })
          }

          // Parse tool uses
          const toolUses = event.message.content.filter((c: { type: string }) => c.type === 'tool_use')
          for (const tool of toolUses) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'tool_use',
              timestamp,
              content: {
                type: 'tool_use',
                tool_name: tool.name,
                tool_id: tool.id || '',
                input: tool.input
              }
            })
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    res.json({
      agent_id: agentId,
      chat_id: chatId,
      entries,
      entry_count: entries.length
    })
  } catch (err: any) {
    console.error('[API] Error reading agent transcript:', err)
    res.status(500).json({ error: 'Failed to read agent transcript', message: err.message })
  }
})

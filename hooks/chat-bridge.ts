#!/usr/bin/env npx tsx
/**
 * Chat Bridge Hook for Claude Code - Multi-Session (P-7)
 *
 * This hook enables Claude Code sessions to communicate with the chat-pilot web UI.
 * Each Claude session registers with the bridge and gets its own message namespace.
 *
 * Flow:
 * 1. On Stop: Registers session (or updates activity) + Posts response
 * 2. Can be called manually to check for pending messages
 *
 * Usage:
 *   # As a Stop hook - automatically sends response to web UI
 *   # Configure in .claude/settings.json under "Stop" hooks
 *
 *   # To check for pending messages manually:
 *   CLAUDE_SESSION_ID=your-session-id npx tsx hooks/chat-bridge.ts --check-pending
 *
 *   # To manually register a session:
 *   CLAUDE_SESSION_ID=your-session-id npx tsx hooks/chat-bridge.ts --register
 */

import { existsSync, readFileSync } from "node:fs"
import { basename } from "node:path"

const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3001"
const SESSION_ID = process.env.CLAUDE_SESSION_ID
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd()

/**
 * Quick health check - returns false if server is unreachable
 * Uses short timeout to fail fast
 */
async function isServerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 500) // 500ms timeout

    const response = await fetch(`${BRIDGE_URL}/health`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

interface StopInput {
  session_id: string
  transcript_path?: string
  stop_hook_active?: boolean
}

interface SessionRegistration {
  session_id: string
  cwd: string
  project_name?: string
}

/**
 * Get a short ID from the full session ID
 */
function getShortId(sessionId: string): string {
  return sessionId.slice(0, 8)
}

/**
 * Register or update a session with the bridge
 */
async function registerSession(sessionId: string): Promise<boolean> {
  try {
    const registration: SessionRegistration = {
      session_id: sessionId,
      cwd: PROJECT_DIR,
      project_name: basename(PROJECT_DIR),
    }

    const response = await fetch(`${BRIDGE_URL}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registration),
    })

    if (response.status === 201) {
      console.log(`[ChatBridge] Session registered: ${getShortId(sessionId)}`)
      return true
    } else if (response.status === 200) {
      // Session already exists, touch to update activity
      await fetch(`${BRIDGE_URL}/sessions/${sessionId}/touch`, { method: "POST" })
      return true
    }

    console.error(`[ChatBridge] Failed to register session: ${response.status}`)
    return false
  } catch (err) {
    console.error("[ChatBridge] Failed to register session:", err)
    return false
  }
}

/**
 * Extract the last assistant message from Claude's transcript
 */
function getLastAssistantMessage(transcriptPath: string): string | null {
  if (!existsSync(transcriptPath)) {
    return null
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8")
    const lines = content.trim().split("\n")

    // Read from end, find last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (!line) continue

      try {
        const entry = JSON.parse(line)
        if (entry.type === "assistant" && entry.message?.content) {
          const textBlocks = entry.message.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
          return textBlocks.join("\n")
        }
      } catch {
        continue
      }
    }
  } catch {
    return null
  }

  return null
}

/**
 * Post a response to the bridge server for a specific session
 */
async function postResponse(
  sessionId: string,
  content: string,
  inReplyTo?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, in_reply_to: inReplyTo }),
    })
    return response.ok
  } catch (err) {
    console.error("[ChatBridge] Failed to post response:", err)
    return false
  }
}

/**
 * Check for pending messages from the web UI for a specific session
 */
async function checkPendingMessages(sessionId: string): Promise<void> {
  try {
    const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/pending`)
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[ChatBridge] Session ${getShortId(sessionId)} not registered yet`)
        return
      }
      console.error("[ChatBridge] Failed to get pending messages")
      return
    }

    const data = await response.json()
    const messages = data.messages || []

    if (messages.length === 0) {
      console.log(`[ChatBridge] No pending messages for session ${getShortId(sessionId)}`)
      return
    }

    console.log(`[ChatBridge] ${messages.length} pending message(s):`)
    for (const msg of messages) {
      console.log(`\n--- Message ${msg.id} ---`)
      console.log(msg.content)
      console.log("---")
    }
  } catch (err) {
    console.error("[ChatBridge] Error checking messages:", err)
  }
}

/**
 * Get the last pending message ID for a session
 */
async function getLastPendingMessageId(sessionId: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/pending`)
    if (!response.ok) return undefined

    const data = await response.json()
    const messages = data.messages || []
    if (messages.length > 0) {
      return messages[messages.length - 1].id
    }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Main handler for Stop hook
 */
async function handleStopHook(): Promise<void> {
  // Read stdin for hook input
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const input: StopInput = JSON.parse(Buffer.concat(chunks).toString())

  const sessionId = input.session_id || SESSION_ID
  if (!sessionId) {
    // No session ID - exit silently
    return
  }

  // Quick check if server is running - exit silently if not
  if (!(await isServerRunning())) {
    return
  }

  // Register/update session
  await registerSession(sessionId)

  // Extract and post Claude's response
  if (input.transcript_path) {
    const assistantMessage = getLastAssistantMessage(input.transcript_path)
    if (assistantMessage) {
      // Get the last pending message ID to link as "in_reply_to"
      const lastPendingId = await getLastPendingMessageId(sessionId)

      // Post to bridge
      const success = await postResponse(sessionId, assistantMessage, lastPendingId)
      if (success) {
        console.log(`[ChatBridge] Response posted for session ${getShortId(sessionId)}`)
      } else {
        console.error("[ChatBridge] Failed to post response")
      }
    }
  }
}

// Entry point
async function main() {
  const args = process.argv.slice(2)

  if (args.includes("--check-pending")) {
    if (!SESSION_ID) {
      console.error("Error: CLAUDE_SESSION_ID environment variable is required")
      process.exit(1)
    }
    await checkPendingMessages(SESSION_ID)
  } else if (args.includes("--register")) {
    if (!SESSION_ID) {
      console.error("Error: CLAUDE_SESSION_ID environment variable is required")
      process.exit(1)
    }
    const success = await registerSession(SESSION_ID)
    process.exit(success ? 0 : 1)
  } else if (args.includes("--help")) {
    console.log(`
Chat Bridge Hook for Claude Code - Multi-Session

Usage:
  npx tsx chat-bridge.ts                  # Run as Stop hook (reads from stdin)
  npx tsx chat-bridge.ts --check-pending  # Check for pending messages
  npx tsx chat-bridge.ts --register       # Manually register session
  npx tsx chat-bridge.ts --help           # Show this help

Environment:
  BRIDGE_URL         Bridge server URL (default: http://localhost:3001)
  CLAUDE_SESSION_ID  Session ID (auto-set by Claude Code hooks)
  CLAUDE_PROJECT_DIR Project directory (auto-set by Claude Code hooks)
`)
  } else {
    // Default: run as Stop hook
    await handleStopHook()
  }
}

main().catch((err) => {
  console.error("[ChatBridge] Error:", err)
  process.exit(1)
})

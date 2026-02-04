/**
 * Sessions Routes - Unified session management
 *
 * Sessions are Claude conversations stored as JSONL files.
 * Any session can be viewed or continued from the web UI.
 */

import { Router } from 'express'
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawn, execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import { processManager } from '../services/processManager.js'

export const sessionsRouter = Router()

const LABELS_FILE = join(homedir(), '.chat-pilot', 'session-labels.json')

interface SessionLabel {
  label: string
  updatedAt: string
}

interface SessionInfo {
  sessionId: string
  label?: string
  cwd: string
  projectFolder: string
  jsonlPath: string
  lastModified: string
  sizeBytes: number
}

async function loadLabels(): Promise<Record<string, SessionLabel>> {
  try {
    const content = await readFile(LABELS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

async function saveLabels(labels: Record<string, SessionLabel>): Promise<void> {
  const dir = join(homedir(), '.chat-pilot')
  try {
    await readdir(dir)
  } catch {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(LABELS_FILE, JSON.stringify(labels, null, 2))
}

/**
 * Extract cwd from the first JSONL entry that has a cwd field.
 * Falls back to a naive folder-name decode if the file can't be read.
 */
async function extractCwdFromJsonl(folderPath: string, folder: string): Promise<string> {
  try {
    const files = await readdir(folderPath)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))
    if (jsonlFiles.length === 0) return naiveFolderDecode(folder)

    // Try each file until we find one with a cwd field
    for (const file of jsonlFiles) {
      try {
        const content = await readFile(join(folderPath, file), 'utf-8')
        for (const line of content.split('\n').slice(0, 10)) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.cwd) return event.cwd
          } catch { /* skip malformed lines */ }
        }
      } catch { /* try next file */ }
    }
  } catch { /* fall through */ }
  return naiveFolderDecode(folder)
}

function naiveFolderDecode(folder: string): string {
  // Best-effort: replace leading - with /, then remaining - with /
  return '/' + folder.slice(1).replace(/-/g, '/')
}

/**
 * Find the project folder that contains a given session ID.
 * Scans all project folders rather than trying to encode the cwd.
 */
async function findSessionFolder(sessionId: string): Promise<string | null> {
  const projectsDir = join(homedir(), '.claude', 'projects')
  try {
    const folders = await readdir(projectsDir)
    for (const folder of folders) {
      const jsonlPath = join(projectsDir, folder, sessionId + '.jsonl')
      try {
        await stat(jsonlPath)
        return jsonlPath
      } catch { /* not in this folder */ }
    }
  } catch { /* projects dir doesn't exist */ }
  return null
}

interface ProcessStats {
  pid: number
  cpu: number
  memoryMB: number
  runtime: string
}

/**
 * Get process stats for active web chats by querying ps with known PIDs.
 * Claude strips its own argv, so we can't scan by args — instead we use
 * the processManager's PID→sessionId map and query ps by PID directly.
 */
function getActiveProcessStats(): Map<string, ProcessStats> {
  const result = new Map<string, ProcessStats>()
  const pidToSession = processManager.getActivePidMap()

  if (pidToSession.size === 0) return result

  try {
    const pids = [...pidToSession.keys()].join(',')
    const output = execSync(`ps -p ${pids} -o pid=,pcpu=,rss=,etime=`, {
      encoding: 'utf-8',
      timeout: 5000
    })

    for (const line of output.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const match = trimmed.match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)$/)
      if (!match) continue

      const [, pidStr, cpuStr, rssStr, etime] = match
      const pid = parseInt(pidStr)
      const sessionId = pidToSession.get(pid)

      if (sessionId) {
        result.set(sessionId, {
          pid,
          cpu: parseFloat(cpuStr),
          memoryMB: Math.round(parseInt(rssStr) / 1024 * 10) / 10,
          runtime: etime.trim()
        })
      }
    }
  } catch {
    // ps command failed — return empty map
  }

  return result
}

sessionsRouter.get('/', async (req, res) => {
  try {
    const { cwd } = req.query
    const projectsDir = join(homedir(), '.claude', 'projects')
    const labels = await loadLabels()
    const sessions: SessionInfo[] = []

    let projectFolders: string[]
    try {
      projectFolders = await readdir(projectsDir)
    } catch {
      return res.json({ sessions: [], count: 0 })
    }

    if (cwd) {
      // Don't try to encode — just filter folders that contain sessions with matching cwd
      // For now, skip folder pre-filtering (cwd is extracted per-folder from .jsonl anyway)
    }

    for (const folder of projectFolders) {
      const folderPath = join(projectsDir, folder)
      try {
        const folderStat = await stat(folderPath)
        if (!folderStat.isDirectory()) continue

        const files = await readdir(folderPath)
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

        // Resolve cwd once per folder — read from first .jsonl entry
        const cwd = await extractCwdFromJsonl(folderPath, folder)

        for (const file of jsonlFiles) {
          const sessionId = file.replace('.jsonl', '')
          const jsonlPath = join(folderPath, file)
          try {
            const fileStat = await stat(jsonlPath)
            sessions.push({
              sessionId,
              label: labels[sessionId]?.label,
              cwd,
              projectFolder: folder,
              jsonlPath,
              lastModified: fileStat.mtime.toISOString(),
              sizeBytes: fileStat.size,
            })
          } catch { }
        }
      } catch { }
    }

    sessions.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    )

    // Enrich sessions with active process stats (CPU, memory, runtime)
    const activeProcesses = getActiveProcessStats()
    const enrichedSessions = sessions.map(s => {
      const processInfo = activeProcesses.get(s.sessionId)
      return processInfo ? { ...s, processInfo } : s
    })

    res.json({ sessions: enrichedSessions, count: enrichedSessions.length })
  } catch (err: any) {
    console.error('[Sessions] Error:', err)
    res.status(500).json({ error: 'Failed to list sessions', message: err.message })
  }
})

sessionsRouter.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    const { cwd } = req.query

    // Find the session file by scanning project folders (avoids encoding bugs)
    const jsonlPath = await findSessionFolder(sessionId)
    if (!jsonlPath) {
      return res.status(404).json({ error: 'Session not found', sessionId })
    }

    const workingDir = (cwd as string) || ''

    let content: string
    try {
      content = await readFile(jsonlPath, 'utf-8')
    } catch {
      return res.status(404).json({ error: 'Session not found', path: jsonlPath })
    }

    const labels = await loadLabels()
    const fileStat = await stat(jsonlPath)
    const lines = content.split('\n').filter(l => l.trim())
    const entries: any[] = []

    // Track session-level usage totals
    const sessionUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      message_count: 0
    }

    // Track counts by entry type and tool names
    const typeCounts: Record<string, number> = {}
    const toolCounts: Record<string, number> = {}

    // Track Task tool IDs to link spawns with results
    // Map: tool_use_id -> index in entries array
    const taskToolIdToEntryIndex: Record<string, number> = {}

    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        const timestamp = event.timestamp || new Date().toISOString()

        if (event.type === 'user' && event.message?.content) {
          // Check for compaction summary
          if (event.isCompactSummary) {
            const text = typeof event.message.content === 'string'
              ? event.message.content
              : event.message.content[0]?.text || ''

            // Extract just the summary title from "Analysis:" section
            const analysisMatch = text.match(/Analysis:\n([\s\S]*?)(?=\n\nSummary:|$)/)
            const summaryPreview = analysisMatch
              ? analysisMatch[1].slice(0, 500) + '...'
              : text.slice(0, 500) + '...'

            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'compaction_summary',
              timestamp,
              content: {
                type: 'compaction_summary',
                preview: summaryPreview,
                full_text: text
              }
            })
            typeCounts['compaction_summary'] = (typeCounts['compaction_summary'] || 0) + 1
            continue
          }

          // Handle tool_result entries (responses to tool calls)
          if (typeof event.message.content !== 'string') {
            const toolResult = event.message.content.find((c: any) => c.type === 'tool_result')
            if (toolResult) {
              const toolUseId = toolResult.tool_use_id

              // Check if this is a Task tool result (agent completion)
              if (event.toolUseResult?.agentId) {
                const agentEntryIndex = taskToolIdToEntryIndex[toolUseId]
                if (agentEntryIndex !== undefined && entries[agentEntryIndex]) {
                  // Update the agent_spawn entry with completion data
                  const agentEntry = entries[agentEntryIndex]
                  if (agentEntry.content.type === 'agent_spawn') {
                    agentEntry.content.agent_id = event.toolUseResult.agentId
                    agentEntry.content.status = event.toolUseResult.status || 'completed'
                    // Extract result text from content array
                    const resultTexts = event.toolUseResult.content
                      ?.filter((c: any) => c.type === 'text')
                      ?.map((c: any) => c.text)
                      ?.join('\n') || ''
                    agentEntry.content.result_preview = resultTexts.slice(0, 500)
                  }
                }
                // Don't create a separate tool_result entry for Task results
                continue
              }

              entries.push({
                id: randomUUID().slice(0, 8),
                type: 'tool_result',
                timestamp,
                content: {
                  type: 'tool_result',
                  tool_id: toolUseId,
                  output: toolResult.content || '',
                  is_error: toolResult.is_error || false
                }
              })
              typeCounts['tool_result'] = (typeCounts['tool_result'] || 0) + 1
              continue
            }
          }

          if (event.isMeta) continue

          const text = typeof event.message.content === 'string'
            ? event.message.content
            : event.message.content[0]?.text || ''

          if (text && !text.startsWith('#')) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'user',
              timestamp,
              content: { type: 'user', text }
            })
            typeCounts['user'] = (typeCounts['user'] || 0) + 1
          }
        }

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
            typeCounts['assistant'] = (typeCounts['assistant'] || 0) + 1
          }

          const thinkingContent = event.message.content
            .filter((c: { type: string }) => c.type === 'thinking')
            .map((c: { thinking: string }) => c.thinking)
            .join('\n')

          if (thinkingContent) {
            entries.push({
              id: randomUUID().slice(0, 8),
              type: 'thinking',
              timestamp,
              content: { type: 'thinking', text: thinkingContent }
            })
            typeCounts['thinking'] = (typeCounts['thinking'] || 0) + 1
          }

          const toolUses = event.message.content.filter((c: { type: string }) => c.type === 'tool_use')
          for (const tool of toolUses) {
            if (tool.name === 'Task') {
              const entryIndex = entries.length
              entries.push({
                id: randomUUID().slice(0, 8),
                type: 'agent_spawn',
                timestamp,
                content: {
                  type: 'agent_spawn',
                  agent_type: tool.input?.subagent_type || 'unknown',
                  description: tool.input?.description || '',
                  prompt_preview: tool.input?.prompt, // Full prompt text
                  tool_use_id: tool.id, // Store for linking with result
                  agent_id: undefined,
                  status: 'running',
                  result_preview: undefined
                }
              })
              // Track this tool ID for later matching with result
              if (tool.id) {
                taskToolIdToEntryIndex[tool.id] = entryIndex
              }
              typeCounts['agent_spawn'] = (typeCounts['agent_spawn'] || 0) + 1
            } else {
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
              typeCounts['tool_use'] = (typeCounts['tool_use'] || 0) + 1
              // Track individual tool names
              toolCounts[tool.name] = (toolCounts[tool.name] || 0) + 1
            }
          }

          // Aggregate usage totals (don't emit per-message)
          if (event.message.usage) {
            const usage = event.message.usage
            sessionUsage.input_tokens += usage.input_tokens || 0
            sessionUsage.output_tokens += usage.output_tokens || 0
            sessionUsage.cache_read_tokens += usage.cache_read_input_tokens || 0
            sessionUsage.cache_creation_tokens += usage.cache_creation_input_tokens || 0
            sessionUsage.message_count++
          }
        }
      } catch { }
    }

    // Calculate estimated cost (Claude pricing rough estimates)
    // Sonnet: $3/MTok input, $15/MTok output, cache read 90% off, cache write 25% more
    const inputCost = (sessionUsage.input_tokens / 1_000_000) * 3
    const outputCost = (sessionUsage.output_tokens / 1_000_000) * 15
    const cacheReadCost = (sessionUsage.cache_read_tokens / 1_000_000) * 0.30  // 90% off
    const cacheWriteCost = (sessionUsage.cache_creation_tokens / 1_000_000) * 3.75  // 25% more
    const estimatedCost = inputCost + outputCost + cacheReadCost + cacheWriteCost

    res.json({
      sessionId,
      label: labels[sessionId]?.label,
      cwd: workingDir,
      jsonlPath,
      lastModified: fileStat.mtime.toISOString(),
      entries,
      entryCount: entries.length,
      usage: {
        ...sessionUsage,
        estimated_cost_usd: Math.round(estimatedCost * 100) / 100
      },
      typeCounts,
      toolCounts
    })
  } catch (err: any) {
    console.error('[Sessions] Error:', err)
    res.status(500).json({ error: 'Failed to read session', message: err.message })
  }
})

sessionsRouter.post('/:sessionId/label', async (req, res) => {
  try {
    const { sessionId } = req.params
    const { label } = req.body
    const labels = await loadLabels()

    if (label) {
      labels[sessionId] = { label, updatedAt: new Date().toISOString() }
    } else {
      delete labels[sessionId]
    }

    await saveLabels(labels)
    res.json({ success: true, sessionId, label })
  } catch (err: any) {
    console.error('[Sessions] Error:', err)
    res.status(500).json({ error: 'Failed to set label', message: err.message })
  }
})

sessionsRouter.post('/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params
    const { content, cwd } = req.body

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' })
    }

    const workingDir = cwd || '/Users/ryanb/Developer/b-Intelligent/b-Intelligent-Protocol-v2-LIVE'
    const args = ['--resume', sessionId, content]
    console.log('[Sessions] Resuming ' + sessionId)

    const proc = spawn(config.claudePath, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    proc.stdin?.end()

    res.json({ status: 'sent', sessionId })
  } catch (err: any) {
    console.error('[Sessions] Error:', err)
    res.status(500).json({ error: 'Failed to send message', message: err.message })
  }
})

sessionsRouter.post('/', async (req, res) => {
  try {
    const { cwd, message, label } = req.body

    if (!cwd) {
      return res.status(400).json({ error: 'cwd is required' })
    }

    const sessionId = randomUUID()

    if (label) {
      const labels = await loadLabels()
      labels[sessionId] = { label, updatedAt: new Date().toISOString() }
      await saveLabels(labels)
    }

    if (message) {
      const args = ['--session-id', sessionId, message]
      console.log('[Sessions] Creating ' + sessionId)

      const proc = spawn(config.claudePath, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
      proc.stdin?.end()
    }

    res.status(201).json({ sessionId, cwd, label, status: message ? 'started' : 'created' })
  } catch (err: any) {
    console.error('[Sessions] Error:', err)
    res.status(500).json({ error: 'Failed to create session', message: err.message })
  }
})

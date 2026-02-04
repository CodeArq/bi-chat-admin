# Chat Pilot Hooks - Multi-Session (P-7)

Claude Code hooks for integrating with the multi-session chat bridge.

## Overview

```
Web Chat UI <-- Bridge Server <-- [These Hooks] <-- Claude Code Sessions
                     |
                     +-- Session Registry (tracks all sessions)
```

## Setup

Add to your `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx \"$CLAUDE_PROJECT_DIR/apps/chat-pilot/hooks/chat-bridge.ts\""
          }
        ]
      }
    ]
  }
}
```

## How It Works

1. **Session Registration**: When the Stop hook fires, it registers the Claude session with the bridge server
2. **Response Posting**: The hook extracts Claude's response and posts it to the session's outbox
3. **Activity Tracking**: Each hook execution updates the session's last activity timestamp

## Manual Commands

```bash
# Check for pending messages from web UI
CLAUDE_SESSION_ID=your-session-id npx tsx chat-bridge.ts --check-pending

# Manually register a session
CLAUDE_SESSION_ID=your-session-id npx tsx chat-bridge.ts --register
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BRIDGE_URL` | Bridge server URL | `http://localhost:3001` |
| `CLAUDE_SESSION_ID` | Session ID (auto-set by Claude hooks) | - |
| `CLAUDE_PROJECT_DIR` | Project directory (auto-set by Claude hooks) | cwd |

## Session Flow

```
1. User opens Claude Code session
   |
   v
2. User sends message in web UI
   |
   v
3. Bridge stores in session's inbox
   |
   v
4. Claude responds (in terminal)
   |
   v
5. Stop hook fires -> chat-bridge.ts
   |
   +-- Registers session (or updates activity)
   +-- Posts response to session's outbox
   |
   v
6. Web UI shows response
```

## Multi-Session Architecture

Each Claude session gets:
- Unique session ID (from `$CLAUDE_SESSION_ID`)
- Own IPC namespace: `/tmp/b-intelligent/{session_id}/inbox|outbox/`
- Session registration in: `/tmp/b-intelligent/sessions/{short_id}.json`

The web dashboard shows all registered sessions and lets you click to chat with a specific one.

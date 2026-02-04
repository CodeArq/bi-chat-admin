# Chat Pilot - Web UI

Terminal-themed web chat interface for communicating with Claude Code via the bridge server.

## Quick Start

```bash
# From this directory
npm install
npm run dev
```

Opens at http://localhost:3000

## Features

- Terminal aesthetic (green on black, monospace font)
- Real-time message updates (polls bridge every 1s)
- Markdown rendering for Claude responses
- Status indicator (connected/disconnected/thinking)
- Auto-scroll to latest message
- Responsive design

## Requirements

The bridge server must be running at port 3001 for the UI to function.
See `../bridge/README.md` for bridge setup.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
```

## Configuration

The API endpoint is proxied via Vite config:
- UI runs on port 3000
- API requests to `/api/*` are proxied to `localhost:3001`

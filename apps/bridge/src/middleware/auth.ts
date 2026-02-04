import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // /health is always public
  if (req.path === '/health') {
    return next()
  }

  // If no API key configured, auth is disabled (local dev)
  if (!config.apiKey) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)
  if (token !== config.apiKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  next()
}

/** Validate WebSocket connection token from query param */
export function validateWsToken(url: string | undefined): boolean {
  if (!config.apiKey) return true // Auth disabled

  if (!url) return false

  try {
    const params = new URL(url, 'http://localhost').searchParams
    return params.get('token') === config.apiKey
  } catch {
    return false
  }
}

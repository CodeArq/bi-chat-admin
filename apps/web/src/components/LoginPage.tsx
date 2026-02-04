import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { signIn, loading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!email || !password) {
      setLocalError('Email and password required')
      return
    }
    const { error } = await signIn(email, password)
    if (error) {
      setLocalError(error)
    }
  }

  const displayError = localError || error

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-ascii">
{`  _____ _   _   _  _____   ____  ___ _     ___ _____
 / ____| | | | / \\|_   _| |  _ \\|_ _| |   / _ \\_   _|
| |    | |_| |/ _ \\ | |   | |_) || || |  | | | || |
| |    |  _  / ___ \\| |   |  __/ | || |__| |_| || |
 \\____|_| |_/_/   \\_\\_|   |_|   |___|____\\___/ |_|`}
          </div>
          <div className="login-subtitle">B-INTELLIGENCE TERMINAL</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">&gt; USER:</label>
            <input
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              autoFocus
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label">&gt; PASS:</label>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {displayError && (
            <div className="login-error">
              <span className="error-prefix">[ERROR]</span> {displayError}
            </div>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading ? 'AUTHENTICATING...' : 'LOGIN'}
          </button>
        </form>

        <div className="login-footer">
          <span className="login-version">v3.0.0</span>
          <span className="login-status">SECURE CONNECTION</span>
        </div>
      </div>
    </div>
  )
}

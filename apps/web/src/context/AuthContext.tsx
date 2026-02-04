import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface ClientConfig {
  id: string
  slug: string
  name: string
  bridge_url: string
  bridge_api_key: string
  portal_enabled: boolean
  chat_enabled: boolean
  default_cwd: string | null
}

interface AuthState {
  session: Session | null
  user: User | null
  clientConfig: ClientConfig | null
  loading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchClientConfig(userId: string): Promise<ClientConfig | null> {
  console.log('[Auth] Fetching client config for:', userId)
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        client_id,
        role,
        clients (
          id,
          slug,
          name,
          bridge_url,
          bridge_api_key,
          portal_enabled,
          chat_enabled,
          default_cwd
        )
      `)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      console.error('[Auth] Failed to fetch client config:', error)
      return null
    }

    const client = data.clients as any
    console.log('[Auth] Client config loaded:', client.name)
    return {
      id: client.id,
      slug: client.slug,
      name: client.name,
      bridge_url: client.bridge_url,
      bridge_api_key: client.bridge_api_key,
      portal_enabled: client.portal_enabled,
      chat_enabled: client.chat_enabled,
      default_cwd: client.default_cwd,
    }
  } catch (err) {
    console.error('[Auth] fetchClientConfig threw:', err)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    clientConfig: null,
    loading: true,
    error: null,
  })
  const initDone = useRef(false)

  // Initialize auth — use onAuthStateChange as the single source of truth
  useEffect(() => {
    // onAuthStateChange fires immediately with current state, so we don't need getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] onAuthStateChange:', event, !!session)

        if (session?.user) {
          // Immediately show the app is authenticated (stop loading)
          // Fetch client config in background
          setState(prev => ({
            ...prev,
            session,
            user: session.user,
            loading: false,
          }))

          // Load client config without blocking the UI
          fetchClientConfig(session.user.id).then(clientConfig => {
            setState(prev => ({
              ...prev,
              clientConfig,
              error: clientConfig ? null : 'No client assigned to your account',
            }))
          })
        } else {
          setState({
            session: null,
            user: null,
            clientConfig: null,
            loading: false,
            error: null,
          })
        }

        initDone.current = true
      }
    )

    // Safety: if onAuthStateChange never fires (shouldn't happen, but just in case)
    const timeout = setTimeout(() => {
      if (!initDone.current) {
        console.warn('[Auth] No auth event after 3s, forcing login screen')
        setState(prev => ({ ...prev, loading: false }))
      }
    }, 3000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message }))
      return { error: error.message }
    }
    // onAuthStateChange will handle the rest
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setState({
      session: null,
      user: null,
      clientConfig: null,
      loading: false,
      error: null,
    })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

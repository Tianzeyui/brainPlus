import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

/** 将渲染进程的 Supabase 会话同步到主进程（Cordis host 工具走 RLS 需要） */
function syncSessionToMain(session: Session | null) {
  const ea = (window as any).electronAPI
  if (!ea?.supabase) return
  try {
    if (session?.access_token) {
      ea.supabase.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).catch(() => {})
    } else {
      ea.supabase.clearSession().catch(() => {})
    }
  } catch { /* 非 Electron 环境忽略 */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configReady, setConfigReady] = useState(false)

  // 等待配置就绪（磁盘加载是异步的）
  useEffect(() => {
    let cancelled = false
    // 轮询直到配置加载完成
    const check = () => {
      if (cancelled) return
      const ready = isSupabaseConfigured()
      if (ready) { setConfigReady(true); return }
      setTimeout(check, 200)
    }
    check()
    return () => { cancelled = true }
  }, [])

  // 初始化 session 并监听认证变化
  useEffect(() => {
    if (!configReady) {
      setLoading(false)
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      syncSessionToMain(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setSession(session)
      setUser(session?.user ?? null)
      setError(null)
      syncSessionToMain(session)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [configReady])

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null)
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error('请先配置 Supabase 连接信息')
    }
    const { data, error: err } = await supabase.auth.signUp({ email, password })
    if (err) {
      setError(err.message)
      throw err
    }
    // 如果注册后立即返回了 session（邮箱确认关闭的情况），手动更新状态
    if (data.session) {
      setSession(data.session)
      setUser(data.session.user)
      syncSessionToMain(data.session)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error('请先配置 Supabase 连接信息')
    }
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (err) {
      setError(err.message)
      throw err
    }
    // 登录成功后立即更新状态，确保 UI 立即响应
    if (data.session) {
      setSession(data.session)
      setUser(data.session.user)
      syncSessionToMain(data.session)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    const supabase = getSupabaseClient()
    if (!supabase) {
      // 清除本地状态
      setUser(null)
      setSession(null)
      return
    }
    const { error: err } = await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    syncSessionToMain(null)
    if (err) setError(err.message)
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading, error, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

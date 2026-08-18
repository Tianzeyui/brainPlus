/**
 * Main process Supabase client
 * 复用 renderer 的 Supabase 配置（通过 IPC 或环境变量）
 *
 * 会话由渲染进程登录后经 IPC 同步（supabase:setSession / clearSession），
 * 使主进程（Cordis host 半端）的 AI 工具在 RLS 下也能读到当前用户数据。
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
// Electron 主进程 Node 20 无原生 WebSocket，realtime 需要 ws 包作为 transport
import ws from 'ws'

let client: SupabaseClient | null = null
let cachedSession: { access_token: string; refresh_token: string } | null = null

function loadConfig(): { url: string; anonKey: string } | null {
  // 配置由 configStore 写入 userData/config/ 子目录
  const candidates = [
    path.join(app.getPath('userData'), 'config', 'supabase.json'),
    path.join(app.getPath('userData'), 'supabase.json'), // 旧路径兜底
  ]
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (cfg && cfg.url && cfg.anonKey) return cfg
      }
    } catch {}
  }
  // fallback: 环境变量
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }
  }
  return null
}

/** 重建 client（Supabase 配置变更时调用） */
export function resetSupabaseClient(): void {
  if (client) {
    try { client.auth.signOut() } catch {}
  }
  client = null
  cachedSession = null
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client
  const config = loadConfig()
  console.log('[supabaseClient] loadConfig:', config ? `url=${config.url.slice(0, 30)}...` : 'null')
  if (!config || !config.url) return null
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
    realtime: { transport: ws as any },
  })
  // 恢复已同步的会话（配置重载后会话仍在内存中）
  if (cachedSession) {
    client.auth.setSession(cachedSession).catch((e) => {
      console.warn('[supabaseClient] 恢复会话失败:', e.message)
    })
  }
  return client
}

/** 渲染进程登录后同步会话到主进程（setSession 会自动 refresh token） */
export async function setSupabaseSession(session: { access_token: string; refresh_token: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const sb = getSupabaseClient()
    if (!sb) return { success: false, error: 'Supabase 未配置' }
    if (!session?.access_token) return { success: false, error: '无效会话' }
    cachedSession = { access_token: session.access_token, refresh_token: session.refresh_token || '' }
    const { error } = await sb.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token || '',
    })
    if (error) throw error
    const { data } = await sb.auth.getUser()
    console.log('[supabaseClient] 会话已同步:', data.user?.email || data.user?.id || 'unknown')
    return { success: true }
  } catch (e: any) {
    console.warn('[supabaseClient] setSession 失败:', e?.message || e)
    return { success: false, error: e?.message || String(e) }
  }
}

/** 渲染进程退出登录时清除主进程会话 */
export async function clearSupabaseSession(): Promise<{ success: boolean }> {
  cachedSession = null
  try { await client?.auth.signOut() } catch {}
  return { success: true }
}

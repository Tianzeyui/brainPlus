/**
 * 配置持久化 IPC handler
 */
import { ipcMain } from 'electron'
import {
  getSupabase,
  saveSupabase,
  clearSupabase,
  getCloudinary,
  saveCloudinary,
  clearCloudinary,
  getAIModels,
  saveAIModels,
} from '../main/configStore.js'
import {
  setSupabaseSession,
  clearSupabaseSession,
  resetSupabaseClient,
} from '../main/supabaseClient.js'

export function registerConfigIpc(): void {
  ipcMain.handle('config:getSupabase', () => getSupabase())
  ipcMain.handle('config:saveSupabase', (_e, c: any) => { saveSupabase(c); resetSupabaseClient(); return true })
  ipcMain.handle('config:clearSupabase', () => { clearSupabase(); resetSupabaseClient(); return true })

  // 渲染进程登录后同步会话到主进程（Cordis host 工具走 RLS 需要 auth.uid()）
  ipcMain.handle('supabase:setSession', (_e, session: any) => setSupabaseSession(session))
  ipcMain.handle('supabase:clearSession', () => clearSupabaseSession())

  ipcMain.handle('config:getCloudinary', () => getCloudinary())
  ipcMain.handle('config:saveCloudinary', (_e, c: any) => saveCloudinary(c))
  ipcMain.handle('config:clearCloudinary', () => { clearCloudinary(); return true })

  ipcMain.handle('config:getAIModels', () => getAIModels())
  ipcMain.handle('config:saveAIModels', (_e, models: any[]) => saveAIModels(models))
}

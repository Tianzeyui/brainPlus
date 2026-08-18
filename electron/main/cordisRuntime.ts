/**
 * Cordis 运行时 — Stardust 插件系统新范式（对齐 DSH）
 *
 * 架构：
 *   - rootCtx: cordis Context（插件运行时）
 *   - 宿主服务: 通过 ctx.provide 挂载（sidecar/fs/sandbox/mcp/ai 等）
 *   - 工具服务: dsh-tools ToolRegistry（插件 ctx.tools.register 注册）
 *   - 静态插件: require(lib/index.js) → ctx.plugin(plugin)（零 esbuild）
 *
 * 插件形态（对齐 DSH/Cordis）：
 *   export const name / inject / provide
 *   export function apply(ctx) {
 *     ctx.tools.register(defineTool({...}))   // 注册 AI 工具
 *     ctx.provide('myService', impl)          // 注册服务
 *     ctx.effect(() => cleanup)               // 生命周期清理
 *   }
 */
import { Context } from '@deepseek-ai/cordis'
import ToolRegistry, { defineTool } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'node:module'
import { getSidecar } from './sidecarManager.js'
import { getSupabaseClient } from './supabaseClient.js'

// ESM 环境下的 require（加载 CJS 模块）
const req = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let rootCtx: Context | null = null

/** 获取 rootCtx（未初始化时抛错） */
export function getCordisCtx(): Context {
  if (!rootCtx) throw new Error('Cordis 运行时未初始化')
  return rootCtx
}

/** 初始化 Cordis 运行时（app ready 后调用） */
export function initCordisRuntime(): Context {
  const ctx = new Context()
  rootCtx = ctx

  // ---- DSH 服务：systemPrompt + tools ----
  new SystemPrompt(ctx, { includeHarnessIdentity: true, persona: '' })
  new ToolRegistry(ctx, { mode: 'native' })

  // 宿主注入 defineTool（插件无需 require dsh-tools，对齐 DSH 沙箱的 harness 助手）
  ctx.provide('defineTool', defineTool)

  // ---- 宿主服务：sidecar（统一能力入口） ----
  ctx.provide('sidecar', {
    call: (method: string, params?: Record<string, unknown>, timeout?: number) =>
      getSidecar().call(method, params || {}, timeout),
  })

  // ---- 宿主服务：fs（走 sidecar fs.*） ----
  ctx.provide('fs', {
    readFile: (p: string) => getSidecar().call('fs.readFile', { path: p }),
    writeFile: (p: string, content: string) => getSidecar().call('fs.writeFile', { path: p, content }),
    listDir: (p?: string) => getSidecar().call('fs.listDir', { path: p || '.' }),
    exists: (p: string) => getSidecar().call('fs.exists', { path: p }),
  })

  // ---- 宿主服务：sandbox ----
  ctx.provide('sandbox', {
    executeJS: (code: string, packages?: string[]) => getSidecar().call('sandbox.executeJS', { code, packages }),
    executePython: (code: string, packages?: string[]) => getSidecar().call('sandbox.executePython', { code, packages }),
  })

  // ---- 宿主服务：mcp ----
  ctx.provide('mcp', {
    call: (method: string, params?: Record<string, unknown>, timeout?: number) =>
      getSidecar().call(`mcp.${method}`, params || {}, timeout),
  })

  // ---- 宿主服务：supabase（延迟获取，插件工具调用时连接） ----
  ctx.provide('supabase', {
    from: (table: string) => {
      const client = getSupabaseClient()
      if (!client) throw new Error('Supabase 未配置')
      return client.from(table)
    },
    client: () => getSupabaseClient(),
  })

  // cordis logger 默认只进 buffer，加 console 输出便于 dev 观察
  try {
    ctx.logger.exporter({
      colors: 0,
      export: (message: any) => {
        const args = (message.args || []).map((a: any) => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')
        console.log('[cordis:log] ' + (message.name || '') + ' ' + args)
      },
    })
  } catch {}

  console.log('[cordis] 运行时已初始化 (Cordis v' + ctx.root.version + ')')

  // 自动加载已安装的新范式插件（主进程管理，不依赖渲染进程 localStorage）
  autoLoadInstalledPlugins().catch((e) => {
    console.warn('[cordis] 自动加载插件失败:', (e as Error).message)
  })

  return ctx
}

/** 扫描 appData/plugins 并自动加载新范式插件（有 lib/index.js） */
async function autoLoadInstalledPlugins(): Promise<void> {
  try {
    const { app } = await import('electron')
    const pluginsDir = path.join(app.getPath('userData'), 'plugins')
    if (!fs.existsSync(pluginsDir)) return
    const dirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(pluginsDir, d.name))
    for (const dir of dirs) {
      const libPath = path.join(dir, 'lib', 'index.js')
      if (fs.existsSync(libPath)) {
        await loadCordisPlugin(dir)
      }
    }
    console.log(`[cordis] 自动加载完成，已注册工具: ${listCordisTools().join(', ') || '(无)'}`)
  } catch (e) {
    console.warn('[cordis] 扫描插件目录失败:', (e as Error).message)
  }
}

/** 加载一个静态 Cordis 插件（lib/index.js，零 esbuild） */
const loadedPluginIds = new Set<string>()
const loadedPluginEntries = new Map<string, any>()

export async function loadCordisPlugin(pluginDir: string, force = false): Promise<{ success: boolean; error?: string; id?: string; already?: boolean }> {
  try {
    const ctx = getCordisCtx()
    const libPath = path.join(pluginDir, 'lib', 'index.js')
    if (!fs.existsSync(libPath)) {
      return { success: false, error: `未找到插件入口: ${libPath}` }
    }
    // 动态 require（CJS 插件模块）
    // 用宿主 createRequire 加载：插件内的 require('@deepseek-ai/...') 从宿主 node_modules 解析
    // 清除 require 缓存：重装/升级后磁盘代码已更新，必须强制重新求值
    try {
      const resolved = req.resolve(libPath)
      delete req.cache[resolved]
    } catch {}
    const pluginModule = req(libPath)
    const plugin = pluginModule.default || pluginModule
    // 支持两种形态：{ name, apply } 对象 或 函数
    const apply = typeof plugin === 'function' ? plugin : plugin?.apply
    if (typeof apply !== 'function') {
      return { success: false, error: '插件必须导出 apply(ctx) 函数' }
    }
    const id = plugin.name || path.basename(pluginDir)
    // 幂等：同一插件不重复加载（避免工具重复注册）；force 时先卸载再加载
    if (loadedPluginIds.has(id)) {
      if (!force) return { success: true, id, already: true }
      await unloadCordisPlugin(id)
    }
    const entry = typeof plugin === 'function' ? plugin : { name: plugin.name, inject: plugin.inject, provide: plugin.provide, apply }
    await ctx.plugin(entry)
    loadedPluginIds.add(id)
    loadedPluginEntries.set(id, entry)
    console.log(`[cordis] 插件已加载: ${id}`)
    return { success: true, id }
  } catch (e: any) {
    console.error('[cordis] 插件加载失败:', e?.stack || e?.message || e)
    return { success: false, error: e?.message || String(e) }
  }
}

/** 卸载一个 Cordis 插件（移除其工具/服务） */
export async function unloadCordisPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = getCordisCtx()
    const entry = loadedPluginEntries.get(pluginId)
    if (!entry) return { success: false, error: `插件 ${pluginId} 未加载` }
    ctx.registry.delete(entry)
    loadedPluginIds.delete(pluginId)
    loadedPluginEntries.delete(pluginId)
    console.log(`[cordis] 插件已卸载: ${pluginId}`)
    return { success: true }
  } catch (e: any) {
    console.error('[cordis] 插件卸载失败:', e?.message)
    return { success: false, error: e?.message || String(e) }
  }
}

/** 列出已注册的工具（供 IPC/调试） */
export function listCordisTools(): string[] {
  try {
    const ctx = getCordisCtx()
    const view = ctx.tools.view(ctx)
    return [...view.knownNames]
  } catch {
    return []
  }
}

/** 列出已注册工具的模型面 schema（name/description/parameters），供渲染进程注入 AI 工具集 */
export function listCordisToolSchemas(): Array<{ name: string; description: string; parameters: unknown }> {
  try {
    const ctx = getCordisCtx()
    return ctx.tools.schemas() as Array<{ name: string; description: string; parameters: unknown }>
  } catch {
    return []
  }
}

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
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import path from 'path'
import fs from 'fs'
import { getSidecar } from './sidecarManager.js'

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

  // cordis logger 默认只进 buffer，加 console 输出便于 dev 观察
  try {
    ctx.logger.exporter({
      colors: 0,
      export: (message: any) => console.log('[cordis:log] ' + String(message.format || message)),
    })
  } catch {}

  console.log('[cordis] 运行时已初始化 (Cordis v' + ctx.root.version + ')')
  return ctx
}

/** 加载一个静态 Cordis 插件（lib/index.js，零 esbuild） */
export async function loadCordisPlugin(pluginDir: string): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const ctx = getCordisCtx()
    const libPath = path.join(pluginDir, 'lib', 'index.js')
    if (!fs.existsSync(libPath)) {
      return { success: false, error: `未找到插件入口: ${libPath}` }
    }
    // 动态 require（CJS 插件模块）
    const pluginModule = require(libPath)
    const plugin = pluginModule.default || pluginModule
    // 支持两种形态：{ name, apply } 对象 或 函数
    const apply = typeof plugin === 'function' ? plugin : plugin?.apply
    if (typeof apply !== 'function') {
      return { success: false, error: '插件必须导出 apply(ctx) 函数' }
    }
    const entry = typeof plugin === 'function' ? plugin : { name: plugin.name, inject: plugin.inject, provide: plugin.provide, apply }
    await ctx.plugin(entry)
    const id = plugin.name || path.basename(pluginDir)
    ctx.logger.info('[cordis] 插件已加载: ' + id)
    return { success: true, id }
  } catch (e: any) {
    console.error('[cordis] 插件加载失败:', e?.stack || e?.message || e)
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

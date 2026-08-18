/**
 * Cordis Client 半端加载器（渲染进程）
 *
 * 新范式插件页面挂载：
 *   1. 读取插件 lib/client.js（预编译，无 esbuild）
 *   2. 执行 registerClient(ctx)
 *   3. ctx.registerNav / ctx.registerRoute 挂载到插件系统
 *
 * registerRoute(id, pageId)：pageId 引用宿主内置页面（hostPageRegistry）
 */
import { pluginSystem } from './pluginSystem'

/** 宿主内置页面注册表：pageId → 组件 */
const hostPageRegistry = new Map<string, () => Promise<any>>()

/** 宿主注册内置页面（如 DiaryPage/InspirationPage） */
export function registerHostPage(pageId: string, loader: () => Promise<any>) {
  hostPageRegistry.set(pageId, loader)
}

/** 加载插件的 client 半端 */
export async function loadPluginClient(pluginDir: string, pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 通过主进程读 lib/client.js（渲染进程无 fs）
    const api = (window as any).electronAPI
    if (!api?.cordis) return { success: false, error: 'Cordis API 不可用' }

    // 读取 client 半端源码
    const result = await api.plugin.load(pluginDir)
    if (!result?.success) return { success: false, error: result?.error }

    // 主进程读取 lib/client.js 内容
    const clientCode = await api.cordis.loadClientCode(pluginDir)
    if (!clientCode?.success || !clientCode.code) {
      return { success: false, error: '未找到 lib/client.js' }
    }

    // 执行 client 半端（CJS 求值，与旧 evaluatePluginModule 同机制）
    const module = { exports: {} as any }
    const require = (name: string) => {
      if (name === '@deepseek-ai/cordis' || name === 'react') return {}
      throw new Error(`[client] 插件依赖 "${name}" 不可用`)
    }
    const fn = new Function('require', 'module', 'exports', clientCode.code)
    fn(require, module, module.exports)

    const clientModule = module.exports.default || module.exports
    const registerClient = typeof clientModule === 'function' ? clientModule : clientModule?.registerClient
    if (typeof registerClient !== 'function') {
      return { success: false, error: 'client 半端必须导出 registerClient(ctx)' }
    }

    // 执行 registerClient，挂载页面
    const clientCtx = {
      registerNav: (item: any) => pluginSystem.registerNav(item),
      registerRoute: (id: string, pageId: string) => {
        const loader = hostPageRegistry.get(pageId)
        if (!loader) {
          console.warn(`[CordisClient] 宿主页面 "${pageId}" 未注册`)
          return
        }
        pluginSystem.registerRoute(id, loader)
      },
    }
    registerClient(clientCtx)
    return { success: true }
  } catch (e: any) {
    console.error('[CordisClient] 加载失败:', e?.stack || e?.message || e)
    return { success: false, error: e?.message || String(e) }
  }
}

/** 获取宿主内置页面注册表（供 DynamicRoute 使用） */
export function getHostPage(pageId: string): (() => Promise<any>) | undefined {
  return hostPageRegistry.get(pageId)
}

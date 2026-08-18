/**
 * Cordis Client 半端加载器（渲染进程）
 *
 * 新范式插件页面挂载：
 *   1. 读取插件 lib/client.js（预编译，无 esbuild）
 *   2. 执行 registerClient(ctx)
 *   3. ctx.registerNav / ctx.registerRoute 挂载到插件系统
 *
 * registerRoute 支持：
 *   - loader 函数（插件自带 React 组件，宿主提供 React）
 *   - 字符串 pageId（挂载宿主内置页面 hostPageRegistry）
 */
import React from 'react'
import * as Lucide from 'lucide-react'
import { pluginSystem } from './pluginSystem'

/** 宿主内置页面注册表：pageId → 组件 */
const hostPageRegistry = new Map<string, () => Promise<any>>()

/** 宿主注册内置页面（如 DiaryPage/InspirationPage） */
export function registerHostPage(pageId: string, loader: () => Promise<any>) {
  hostPageRegistry.set(pageId, loader)
}

/** 初始化宿主内置页面（应用启动时调用） */
export function initHostPages() {
  registerHostPage('DiaryPage', () => import('@/components/diary/DiaryPage').then(m => ({ default: m.DiaryPage })))
  registerHostPage('InspirationPage', () => import('@/components/inspiration/InspirationPage').then(m => ({ default: m.InspirationPage })))
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

    // 执行 client 半端（CJS 求值，宿主提供 React 等模块）
    const module = { exports: {} as any }
    // 宿主模块（对齐旧 hostModules）：渲染进程提供 React/lucide 等
    const hostModules: Record<string, any> = {
      'react': React,
      'react/jsx-runtime': (React as any).jsxRuntime || React,
      'react-dom': null,
      'lucide-react': Lucide,
    }
    const require = (name: string) => {
      if (name in hostModules) return hostModules[name]
      if (name === '@deepseek-ai/cordis') return {}
      if (name.startsWith('@/')) return null
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
      registerRoute: (id: string, pageOrLoader: any) => {
        // 支持两种形式：
        //   1. 字符串 pageId → 挂载宿主内置页面（hostPageRegistry）
        //   2. loader 函数 → 插件自带组件（求值后的 React 组件）
        if (typeof pageOrLoader === 'function') {
          pluginSystem.registerRoute(id, pageOrLoader)
          return
        }
        const loader = hostPageRegistry.get(pageOrLoader)
        if (!loader) {
          console.warn(`[CordisClient] 宿主页面 "${pageOrLoader}" 未注册`)
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

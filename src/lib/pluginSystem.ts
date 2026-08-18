/**
 * PluginSystem — 插件管理中心
 * 统一管理插件的注册/导航/路由/启用停用/工具注入
 *
 * 插件使用 React/TSX 模式：index.tsx / index.jsx 导出 register 函数
 */
import { jsonSchema } from './api'
import type { Plugin, PluginContext, PluginAPI, PluginManifest, NavItemDef } from './pluginTypes'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'
import { uploadToCloudinary, isCloudinaryConfigured, isAnySandboxEnabled, getAIModels } from './config'

// 提供给插件 CJS require() 的宿主模块
import * as React from 'react'
import * as LucideReact from 'lucide-react'
import { cn } from './utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getNotificationAPI } from '@/contexts/NotificationContext'

/** 插件 require() 可访问的宿主模块表 */
const hostModules: Record<string, any> = {
  'react': React,
  'react-dom': null,   // 插件页面通过 ctx.registerRoute 返回组件，不需要 ReactDOM
  'react/jsx-runtime': (React as any).jsxRuntime || React,
  'lucide-react': LucideReact,
  '@/lib/utils': { cn },
  '@/components/ui/button': { Button },
  '@/components/ui/input': { Input },
  '@/components/ui/badge': { Badge },
  '@/components/ui/card': { Card, CardHeader, CardContent },
  '@/components/ui/label': { Label },
  '@/components/ui/switch': { Switch },
}

const ENABLED_KEY = 'stardust_plugins_enabled'
const INSTALLED_KEY = 'stardust_plugins_installed'

function getEnabledSet(): Set<string> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveEnabledSet(set: Set<string>) {
  localStorage.setItem(ENABLED_KEY, JSON.stringify([...set]))
}

/** CJS 模块求值：将编译后的 JS 代码作为 CommonJS 模块执行 */
function evaluatePluginModule(code: string): any {
  const module = { exports: {} as any }
  const require = (name: string) => {
    if (name in hostModules) return hostModules[name]
    // 处理 manifest.json require（esbuild 编译后可能还留着）
    if (name.startsWith('./') || name.endsWith('.json')) return null
    throw new Error(`[PluginSystem] 插件依赖 "${name}" 不可用。可用模块: ${Object.keys(hostModules).join(', ')}`)
  }
  const fn = new Function('require', 'module', 'exports', code)
  fn(require, module, module.exports)
  return module.exports
}

class PluginSystemImpl {
  private version = 0
  private listeners: Array<() => void> = []

  getVersion(): number { return this.version }
  private bump() { this.version++; this.listeners.forEach(fn => fn()) }
  onChange(fn: () => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn) } }
  private plugins: Map<string, { plugin: Plugin; core: boolean; pluginDir?: string; paradigm?: 'cordis' }> = new Map()
  private navItems: NavItemDef[] = []
  private routes: Map<string, () => Promise<any>> = new Map()
  private toolRegistrations: Array<(tools: Record<string, any>) => void> = []

  /** 注册核心系统功能（始终启用，不在插件列表） */
  registerCore(plugin: Plugin) {
    this.plugins.set(plugin.manifest.id, { plugin, core: true })
    try {
      plugin.register(this.createContext())
    } catch (e: any) {
      console.error(`[PluginSystem] 核心插件 "${plugin.manifest.id}" 注册失败:`, e.message)
    }
  }

  /** 注册可停用插件 */
  register(plugin: Plugin, pluginDir?: string) {
    this.plugins.set(plugin.manifest.id, { plugin, core: false, pluginDir })
    const enabledSet = getEnabledSet()
    if (!enabledSet.has(plugin.manifest.id) && plugin.manifest.enabled !== false) {
      enabledSet.add(plugin.manifest.id)
      saveEnabledSet(enabledSet)
    }
    if (enabledSet.has(plugin.manifest.id)) {
      try {
        plugin.register(this.createContext(pluginDir))
        this.bump()
      } catch (e: any) {
        console.error(`[PluginSystem] 插件 "${plugin.manifest.id}" 注册失败:`, e.message)
      }
    }
  }

  private buildPluginAPI(pluginDir?: string): PluginAPI {
    const ea = (window as any).electronAPI

    // 沙箱化 fs：有 pluginDir 时限制在该目录内，核心插件（无 pluginDir）不受限
    const sandboxPath = (p: string) => {
      if (!pluginDir) return p  // 核心插件不受限
      const resolved = p.startsWith('/') ? p : `${pluginDir}/${p}`
      // 防止 ../ 越界
      if (!resolved.startsWith(pluginDir)) throw new Error(`路径越界: ${p}`)
      return resolved
    }

    const fsApi = {
      readFile: async (filePath: string) => {
        const p = sandboxPath(filePath)
        const res = await ea?.fs?.readFile(p)
        if (!res?.success) throw new Error(res?.error || '读取失败')
        return res.content
      },
      writeFile: async (filePath: string, content: string) => {
        const p = sandboxPath(filePath)
        const res = await ea?.fs?.writeFile(p, content)
        if (!res?.success) throw new Error(res?.error || '写入失败')
      },
      readFileBase64: async (filePath: string) => {
        const p = sandboxPath(filePath)
        const res = await ea?.fs?.readFileBase64(p)
        if (!res?.success) throw new Error(res?.error || '读取失败')
        return res.content
      },
      exists: async (filePath: string) => {
        const p = sandboxPath(filePath)
        return ea?.fs?.exists(p) ?? false
      },
      listDir: async (dirPath?: string) => {
        const p = sandboxPath(dirPath || '.')
        const res = await ea?.fs?.listDir(p)
        if (!res?.success) throw new Error(res?.error || '读取目录失败')
        return res.files || []
      },
      stat: async (filePath: string) => {
        const p = sandboxPath(filePath)
        const res = await ea?.fs?.stat(p)
        if (!res?.success) throw new Error(res?.error || 'stat 失败')
        return res.stat!
      },
      mkdir: async (dirPath: string) => {
        const p = sandboxPath(dirPath)
        const res = await ea?.fs?.mkdir(p)
        if (!res?.success) throw new Error(res?.error || '创建目录失败')
      },
      unlink: async (filePath: string) => {
        const p = sandboxPath(filePath)
        const res = await ea?.fs?.unlink(p)
        if (!res?.success) throw new Error(res?.error || '删除失败')
      },
      writeFileUnsafe: pluginDir ? undefined : (async (filePath: string, content: string) => {
        // 仅供核心插件使用，可以写任意路径
        const res = await ea?.fs?.writeFile(filePath, content)
        if (!res?.success) throw new Error(res?.error || '写入失败')
      }),
    }

    return {
      supabase: {
        getClient: () => getSupabaseClient(),
        isConfigured: () => isSupabaseConfigured(),
      },
      cloudinary: {
        upload: (file: File) => uploadToCloudinary(file),
        isConfigured: () => isCloudinaryConfigured(),
      },
      sandbox: {
        executeJS: (code: string, packages?: string[]) => ea?.sandbox?.executeJS(code, packages) ?? Promise.reject(new Error('sandbox 不可用')),
        executePython: (code: string, packages?: string[]) => ea?.sandbox?.executePython(code, packages) ?? Promise.reject(new Error('sandbox 不可用')),
      },
      fs: fsApi,
      dialog: {
        openFile: async (opts) => {
          if (!ea?.dialog) throw new Error('dialog 不可用')
          const res = await ea.dialog.openFile(opts)
          if (!res.success) throw new Error(res.error || '用户取消选择')
          return res.files || []
        },
      },
      file: {
        convert: async (filePath: string) => {
          if (!ea?.file) throw new Error('file 不可用')
          const res = await ea.file.convert(filePath)
          if (!res.success) throw new Error(res.error || '转换失败')
          return res.content || ''
        },
      },
      storage: {
        get: (key: string) => localStorage.getItem(`stardust_plugin_${key}`),
        set: (key: string, value: string) => { localStorage.setItem(`stardust_plugin_${key}`, value) },
      },
      http: {
        fetch: async (url, opts) => {
          if (!ea?.http) throw new Error('http 不可用')
          const res = await ea.http.fetch(url, opts)
          if (!res.success) throw new Error(res.error || '请求失败')
          return res.data || ''
        },
      },
      ui: {
        toast: (message: string, type?: string) => {
          import('@/hooks/useToast').then(m => m.toast({ title: message, variant: type === 'error' ? 'destructive' : 'default' }))
        },
      },
      notify: (opts) => {
        const api = getNotificationAPI()
        if (!api) return ''
        return api.notify({ type: opts.type || 'info', title: opts.title, message: opts.message })
      },
      confirm: (opts) => {
        const api = getNotificationAPI()
        if (!api) return Promise.reject(new Error('通知系统不可用'))
        return api.confirm({ title: opts.title, message: opts.message, actions: opts.actions })
      },
      graph: {
        query: async (cypher: string) => {
          if (!ea?.graph) throw new Error('图数据库不可用')
          const pluginId = pluginDir?.split('/').pop() || 'unknown'
          return ea.graph.query(cypher, pluginId)
        },
      },
      workspace: {
        getPaths: async () => {
          if (!ea?.workspace) return { root: '~/Stardust/workspace', output: '~/Stardust/workspace/.stardust/output' }
          return ea.workspace.getPaths()
        },
        openFile: async (filePath: string) => {
          await ea?.workspace?.openFile(filePath)
        },
        listOutputs: async () => {
          return ea?.workspace?.listOutputs() ?? []
        },
      },
      plugin: {
        getDir: () => pluginDir || '',
      },
      ai: {
        openModel: (url: string, iconUrl?: string) => ea?.ai?.openModel(url, iconUrl) ?? Promise.resolve(),
        chat: async (opts) => {
          // 懒加载避免循环依赖
          const { getEnabledModel } = await import('./config')
          const model = getEnabledModel()
          if (!model) throw new Error('未启用任何 AI 模型，请先在设置中配置')
          const { generateText } = await import('./api')
          const system = opts.system
          const prompt = opts.messages.map(m => `${m.role}: ${m.content}`).join('\n')
          const result = await generateText({
            config: {
              provider: (model.name || model.id).toLowerCase(),
              modelId: model.selectedModel || 'gpt-4o',
              apiKey: model.apiKey || 'dummy',
              baseUrl: model.baseUrl || undefined,
            },
            prompt,
            systemPrompt: system,
            maxOutputTokens: opts.maxTokens,
          })
          return result.text
        },
        getModelName: async () => {
          const models = getAIModels()
          const enabled = models.find((m: any) => m.enabled && m.apiKey)
          return enabled ? `${enabled.displayName} / ${enabled.selectedModel}` : null
        },
      },
    }
  }

  private createContext(pluginDir?: string): PluginContext {
    const api = this.buildPluginAPI(pluginDir)
    return {
      registerNav: (item) => { this.navItems.push(item) },
      registerRoute: (id, loader) => { this.routes.set(id, loader) },
      onToolRegister: (fn) => { this.toolRegistrations.push(fn) },
      api,
    }
  }

  /** 获取已安装路径列表 */
  getInstalledPaths(): string[] {
    try { return JSON.parse(localStorage.getItem(INSTALLED_KEY) || '[]') } catch { return [] }
  }
  private saveInstalledPaths(paths: string[]) { localStorage.setItem(INSTALLED_KEY, JSON.stringify(paths)) }

  /** 从文件夹安装插件（复制到 appData 后与原路径无关） */
  async install(dirPath: string): Promise<{ success: boolean; error?: string }> {
    const api = (window as any).electronAPI?.plugin
    if (!api) return { success: false, error: '仅 Electron 环境支持插件安装' }
    // 先检查 id 是否已安装
    const loadResult = await api.load(dirPath).catch(() => null)
    if (loadResult?.success && this.plugins.has(loadResult.manifest.id)) {
      return { success: false, error: `插件 "${loadResult.manifest.id}" 已安装` }
    }
    // 复制到 appData + 安装依赖 + 返回新路径
    const result = await api.install(dirPath)
    if (!result.success) return result
    return this.loadAndRegister(result.pluginDir!)
  }

  /** 从社区仓库安装插件（通过 jsDelivr CDN） */
  async installFromGithub(pluginId: string, fileList: string[]): Promise<{ success: boolean; error?: string }> {
    const api = (window as any).electronAPI?.plugin
    if (!api) return { success: false, error: '仅 Electron 环境支持插件安装' }
    if (this.plugins.has(pluginId)) return { success: false, error: `插件 "${pluginId}" 已安装` }
    const result = await api.installFromGithub(pluginId, fileList, pluginId)
    if (!result.success) return result
    const pluginDir = result.pluginDir!
    // 读取 manifest（判断范式）
    const loadRes = await api.load(pluginDir).catch(() => null)
    // 新范式优先
    if (loadRes?.success && await this.tryLoadCordis(pluginDir, loadRes.manifest)) {
      return { success: true }
    }
    return this.loadAndRegister(pluginDir)
  }

  /** 新范式优先加载（有 lib/index.js 走 Cordis；返回 true 表示已用新范式处理） */
  private async tryLoadCordis(dirPath: string, manifest: any): Promise<boolean> {
    const cordis = (window as any).electronAPI?.cordis
    if (!cordis) return false
    try {
      const loaded = await cordis.loadPlugin(dirPath)
      if (!loaded?.success) return false
      // 加载 client 半端（挂载页面）
      const { loadPluginClient } = await import('./cordisClient')
      await loadPluginClient(dirPath, loaded.id || manifest.id)
      // 加入启用集合（否则 getAllPlugins 显示为关闭状态）
      const enabledSet = getEnabledSet()
      if (!enabledSet.has(manifest.id)) {
        enabledSet.add(manifest.id)
        saveEnabledSet(enabledSet)
      }
      // 注册到插件列表（便于 UI 显示/卸载），标记 paradigm=cordis（主进程管理，不参与 reloadAll）
      this.plugins.set(manifest.id, {
        plugin: {
          manifest: { id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description || '', icon: manifest.icon || 'Package', navOrder: manifest.navOrder || 90, enabled: true, systemHeader: manifest.systemHeader },
          register: () => {},
        },
        core: false,
        pluginDir: dirPath,
        paradigm: 'cordis' as any,
      })
      const paths = this.getInstalledPaths()
      if (!paths.includes(dirPath)) { paths.push(dirPath); this.saveInstalledPaths(paths) }
      this.bump()
      return true
    } catch (e) {
      console.warn('[PluginSystem] Cordis 加载失败，回退旧范式:', (e as Error).message)
      return false
    }
  }

  /** 启动时恢复已安装插件（跳过路径检查，但按 id 去重） */
  async restoreInstalled(dirPath: string): Promise<void> {
    const api = (window as any).electronAPI?.plugin
    if (!api) return
    const result = await api.load(dirPath).catch(() => null)
    if (!result?.success) return
    if (this.plugins.has(result.manifest.id)) return

    // 新范式优先
    if (await this.tryLoadCordis(dirPath, result.manifest)) return

    // 旧范式：运行时 esbuild 编译（兼容存量插件）
    await this.loadAndRegister(dirPath).catch(() => {})
  }

  /** 加载并注册插件 */
  private async loadAndRegister(dirPath: string): Promise<{ success: boolean; error?: string }> {
    const api = (window as any).electronAPI?.plugin
    if (!api) return { success: false, error: '仅 Electron 环境支持插件安装' }

    const result = await api.load(dirPath)
    if (!result.success) return result

    const m = result.manifest

    // 依赖检查
    if (m.requires?.plugins) {
      for (const dep of m.requires.plugins) {
        if (!this.plugins.has(dep)) {
          console.warn(`[Plugin] "${m.id}" 依赖 "${dep}" 但未安装，跳过`)
          return { success: false, error: `依赖未满足: ${dep}` }
        }
      }
    }

    // 权限校验
    const perms = m.permissions || []
    const denied: string[] = []
    for (const p of perms) {
      if (p === 'files' && (window as any).electronAPI?.fs) continue
      else if (p === 'ai') continue
      else if (p === 'sandbox' && (window as any).electronAPI?.sandbox && isAnySandboxEnabled()) continue
      else if (p === 'workspace' && (window as any).electronAPI?.workspace) continue
      else if (p === 'supabase' && isSupabaseConfigured()) continue
      else if (p === 'cloudinary' && isCloudinaryConfigured()) continue
      else if (p === 'graph' && (window as any).electronAPI?.graph) continue
      else denied.push(p)
    }
    if (denied.length > 0) console.warn(`[Plugin] "${m.id}" 权限未满足: ${denied.join(', ')}`)

    // === React/TSX 模式：编译并加载 index.tsx / index.jsx ===
    try {
      if (!api.compile) {
        console.log(`[PluginSystem] "${m.id}" plugin:compile handler 不可用（主进程未重启？），跳过 React 模式`)
      }
      const compileResult = await api.compile?.(dirPath)
      if (compileResult && !compileResult.success) {
        console.warn(`[PluginSystem] "${m.id}" TSX 编译失败: ${compileResult.error} (路径: ${dirPath})`)
        // toast 显示 dirPath 便于排查（打包版 renderer console 不可见）
        import('@/hooks/useToast').then(toastMod => toastMod.toast({ title: `插件「${m.name}」编译失败`, description: `${compileResult.error}\n路径: ${dirPath}`, variant: 'destructive' }))
      }
      if (compileResult?.success && compileResult.code) {
        const exports = evaluatePluginModule(compileResult.code)
        // 支持两种导出格式：{ register } 或 默认导出为 register 函数
        const registerFn = typeof exports === 'function' ? exports : exports?.register
        if (typeof registerFn === 'function') {
          const pluginId = m.id
          const plugin: Plugin = {
            manifest: { id: m.id, name: m.name, version: m.version, description: m.description || '', icon: m.icon || 'Package', navOrder: m.navOrder || 90, enabled: true, systemHeader: m.systemHeader },
            register(ctx) {
              try {
                registerFn(ctx)
              } catch (e: any) {
                console.error(`[PluginSystem] React 插件 "${pluginId}" register 失败:`, e.message)
              }
            },
          }
          this.register(plugin, result.pluginDir)
          // 保存路径
          const paths = this.getInstalledPaths()
          if (!paths.includes(dirPath)) { paths.push(dirPath); this.saveInstalledPaths(paths) }
          console.log(`[PluginSystem] React 插件 "${m.id}" 加载成功`)
          return { success: true }
        }
      }
    } catch (e: any) {
      console.error(`[PluginSystem] "${m.id}" TSX 编译/加载失败:`, e.message)
      return { success: false, error: `插件编译失败: ${e.message}` }
    }

    // 没有 index.tsx/index.jsx，无法加载
    return { success: false, error: '未找到 index.tsx 或 index.jsx 入口文件' }
  }

  /** 卸载插件 */
  uninstall(id: string) {
    const entry = this.plugins.get(id)
    if (!entry || entry.core) return
    this.plugins.delete(id)
    const enabledSet = getEnabledSet()
    enabledSet.delete(id)
    saveEnabledSet(enabledSet)
    const paths = this.getInstalledPaths()
    this.saveInstalledPaths(paths.filter(p => !p.includes(id)))
    // 主进程删除 appData 中的插件目录
    ;(window as any).electronAPI?.plugin?.uninstall?.(id).catch(() => {})
    this.reloadAll()
    this.bump()
  }

  /** 启用/停用插件 */
  setEnabled(id: string, enabled: boolean) {
    const entry = this.plugins.get(id)
    if (!entry || entry.core) return
    const enabledSet = getEnabledSet()
    if (enabled) enabledSet.add(id)
    else enabledSet.delete(id)
    saveEnabledSet(enabledSet)
    // Cordis 插件：主进程卸载/加载 + 渲染进程导航显隐
    if ((entry as any).paradigm === 'cordis') {
      const cordis = (window as any).electronAPI?.cordis
      if (enabled) {
        // 重新加载（工具 + 导航）
        if (entry.pluginDir && cordis) {
          cordis.loadPlugin(entry.pluginDir).then(() => {
            import('./cordisClient').then(async ({ loadPluginClient }) => {
              await loadPluginClient(entry.pluginDir!, id).catch(() => {})
              // 导航恢复后再次 bump，确保 Sidebar 感知（loadPluginClient 是异步的）
              this.bump()
            })
          })
        }
      } else {
        // 卸载工具 + 移除导航
        if (cordis) cordis.unloadPlugin(id).catch(() => {})
        this.removePluginNav(id)
      }
      this.bump()
      return
    }
    this.reloadAll()
    this.bump()
  }

  /** 移除插件的导航项（停用 Cordis 插件时） */
  removePluginNav(id: string) {
    this.navItems = this.navItems.filter(n => n.id !== id)
    this.routes.delete(id)
  }

  isEnabled(id: string): boolean { return getEnabledSet().has(id) }

  getAllPlugins(): Array<{ manifest: PluginManifest; enabled: boolean }> {
    const enabledSet = getEnabledSet()
    return [...this.plugins.values()]
      .filter(p => !p.core)
      .map(p => ({ manifest: p.plugin.manifest, enabled: enabledSet.has(p.plugin.manifest.id) }))
  }

  getPluginTools(): Record<string, any> {
    const raw: Record<string, any> = {}
    for (const registration of this.toolRegistrations) {
      try { registration(raw) } catch (e: any) { console.error('[PluginSystem] 工具注册回调失败:', e.message) }
    }
    // 统一加 plugin__ 前缀，使其匹配 CORE_TOOL_PREFIXES 中的 plugin__ 白名单
    const tools: Record<string, any> = {}
    for (const key of Object.keys(raw)) {
      const prefixedKey = key.startsWith('plugin__') ? key : `plugin__${key}`
      tools[prefixedKey] = raw[key]
      // 自动包装 inputSchema（插件使用普通 JSON schema，需转换为 AI SDK 格式）
      if (tools[prefixedKey].inputSchema && tools[prefixedKey].inputSchema.type === 'object') {
        tools[prefixedKey].inputSchema = jsonSchema(tools[prefixedKey].inputSchema)
      }
    }
    return tools
  }

  getNavItems(): NavItemDef[] {
    const seen = new Set<string>()
    return this.navItems.filter(item => seen.has(item.id) ? false : (seen.add(item.id), true))
      .sort((a, b) => a.order - b.order)
  }

  /** 公共：注册导航项（Cordis client 半端用） */
  registerNav(item: NavItemDef) {
    this.navItems.push(item)
  }

  /** 公共：注册路由（Cordis client 半端用） */
  registerRoute(id: string, loader: () => Promise<any>) {
    this.routes.set(id, loader)
  }

  /** 判断导航项是否为第三方插件（非核心内建功能） */
  isPlugin(id: string): boolean {
    const entry = this.plugins.get(id)
    return !!entry && !entry.core
  }

  getRoute(id: string): (() => Promise<any>) | undefined {
    return this.routes.get(id)
  }

  private reloadAll() {
    // Cordis 插件的导航/路由由 client 半端维护，记录插件路径以便重挂载
    const cordisDirs: string[] = []
    for (const [, entry] of this.plugins) {
      if ((entry as any).paradigm === 'cordis' && entry.pluginDir) cordisDirs.push(entry.pluginDir)
    }
    this.navItems = []
    this.routes = new Map()
    this.toolRegistrations = []
    for (const [, entry] of this.plugins) {
      if ((entry as any).paradigm === 'cordis') continue // Cordis 插件不重复注册（导航由 client 半端重挂载）
      if (entry.core || getEnabledSet().has(entry.plugin.manifest.id)) {
        try { entry.plugin.register(this.createContext(entry.pluginDir)) }
        catch (e: any) { console.error(`[PluginSystem] reloadAll: "${entry.plugin.manifest.id}" 注册失败:`, e.message) }
      }
    }
    // 重新挂载 Cordis 插件的 client 半端（恢复导航）
    for (const dir of cordisDirs) {
      const entry = [...this.plugins.values()].find(p => p.pluginDir === dir)
      if (entry) {
        import('./cordisClient').then(({ loadPluginClient }) => {
          loadPluginClient(dir, entry.plugin.manifest.id).catch(() => {})
        })
      }
    }
  }
}

export const pluginSystem = new PluginSystemImpl()

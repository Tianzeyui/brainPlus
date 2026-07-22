export interface MCPServerConfig {
  id: string
  name: string
  description: string
  url: string
  type: 'sse' | 'stdio' | 'streamableHttp'
  command: string
  args: string[]
  enabled: boolean
  headers?: Record<string, string>
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
}

export interface MCPToolResult {
  success: boolean
  content?: Array<{ type: string; text?: string; data?: string }>
  error?: string
}

export interface MCPResource {
  name: string
  uri: string
  description?: string
  mimeType?: string
}

export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
}

export interface ElectronAPI {
  platform: string
  window: {
    openNav: (navId: string, label: string) => Promise<void>
  }
  ai: {
    openModel: (url: string, iconUrl?: string) => Promise<void>
  }
  onShowAbout: (cb: () => void) => () => void
  dialog: {
    openDirectory: () => Promise<{ success: boolean; path?: string; error?: string }>
    openFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
      Promise<{ success: boolean; files?: string[]; error?: string }>
  }
  file: {
    checkType: (filePath: string) => Promise<{ isImage: boolean; isConvertible: boolean }>
    convert: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    onConvertProgress: (cb: (data: { filePath: string; message: string }) => void) => () => void
    /** Electron 32+ File.path 替代方案 */
    getPathForFile: (file: File) => string
  }
  workspace: {
    getPaths: () => Promise<{ root: string; output: string; stardustDir?: string; isCustom?: boolean }>
    info: () => Promise<{ root: string; output: string; stardustDir: string; isCustom: boolean }>
    setRoot: (newRoot: string) => Promise<boolean>
    pickRoot: () => Promise<string | null>
    resetRoot: () => Promise<{ root: string; output: string; stardustDir: string; isCustom: boolean }>
    listOutputs: () => Promise<Array<{ name: string; path: string; size: number }>>
    openFile: (filePath: string) => Promise<void>
    deleteFile: (filePath: string) => Promise<boolean>
    clearOutputs: () => Promise<number>
  }
  shell: {
    openInExplorer: (targetPath: string) => Promise<void>
    openInTerminal: (targetPath: string) => Promise<void>
  }
  sandbox: {
    executeJS: (code: string, packages?: string[]) => Promise<{ success: boolean; result?: string; error?: string }>
    executePython: (code: string, packages?: string[]) => Promise<{ success: boolean; result?: string; error?: string }>
  }
  fs: {
    readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    readFileBase64: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    exists: (filePath: string) => Promise<boolean>
    listDir: (dirPath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
    stat: (filePath: string) => Promise<{ success: boolean; stat?: { isFile: boolean; isDirectory: boolean; size: number; mtime: string }; error?: string }>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
    mkdir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
    rename: (source: string, dest: string) => Promise<{ success: boolean; error?: string }>
    copyDir: (src: string, dest: string) => Promise<{ success: boolean; error?: string }>
    grep: (dirPath: string, pattern: string, fileGlob?: string) => Promise<{ success: boolean; output?: string; error?: string }>
    find: (dirPath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
    unlink: (filePath: string) => Promise<{ success: boolean; error?: string }>
  }
  config: {
    getSupabase: () => Promise<{ url: string; anonKey: string }>
    saveSupabase: (c: { url: string; anonKey: string }) => Promise<void>
    clearSupabase: () => Promise<boolean>
    getCloudinary: () => Promise<{ cloudName: string; uploadPreset: string }>
    saveCloudinary: (c: { cloudName: string; uploadPreset: string }) => Promise<void>
    clearCloudinary: () => Promise<boolean>
    getAIModels: () => Promise<any[]>
    saveAIModels: (models: any[]) => Promise<void>
  }
  model: {
    getStatus: () => Promise<Array<{ id: string; name: string; size: string; installed: boolean; enabled: boolean; progress?: number }>>
    toggleEnabled: (id: string, enabled: boolean) => Promise<boolean>
    download: (id: string, useMirror?: boolean) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean }>
    isInstalled: (id: string) => Promise<boolean>
    openDir: () => Promise<boolean>
    load: (id: string) => Promise<{ success: boolean; error?: string }>
    unload: () => Promise<boolean>
    chat: (id: string, messages: Array<{ role: string; content: string }>) => void
    onChatChunk: (cb: (data: { text: string }) => void) => () => void
    onChatDone: (cb: () => void) => () => void
    onChatError: (cb: (data: { error: string }) => void) => () => void
    subscribe: () => void
    onProgress: (cb: (data: { id: string; loaded: number; total: number }) => void) => () => void
    onDone: (cb: (data: { id: string; success: boolean; error: string }) => void) => () => void
  }
  conv: {
    list: () => Promise<Array<{ id: string; title: string; messageCount: number; updatedAt: string }>>
    get: (id: string) => Promise<{ id: string; title: string; messages: any[]; modelName?: string; createdAt: string; updatedAt: string } | null>
    save: (conv: any) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    create: (title?: string, modelName?: string) => Promise<{ id: string; title: string; messages: any[]; createdAt: string; updatedAt: string }>
  }
  skills: {
    writeFiles: (skillId: string, files: Record<string, string>) => Promise<{ success: boolean; error?: string }>
    readFile: (skillId: string, filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    deleteFiles: (skillId: string) => Promise<{ success: boolean; error?: string }>
  }
  mcp: {
    getServers: () => Promise<MCPServerConfig[]>
    addServer: (config: MCPServerConfig) => Promise<{ success: boolean }>
    removeServer: (serverId: string) => Promise<{ success: boolean }>
    updateServer: (serverId: string, patch: Partial<MCPServerConfig>) => Promise<{ success: boolean }>

    connect: (serverId: string) => Promise<{ success: boolean; error?: string }>
    disconnect: (serverId: string) => Promise<{ success: boolean }>

    listTools: (serverId: string) => Promise<MCPTool[]>
    getAllTools: () => Promise<{ tools: MCPTool[]; errors: Array<{ serverName: string; error: string }> }>
    callTool: (serverId: string, toolName: string, args: any) => Promise<MCPToolResult>

    listResources: (serverId: string) => Promise<MCPResource[]>
    getAllResources: () => Promise<{ resources: MCPResource[]; errors: Array<{ serverName: string; error: string }> }>
    readResource: (serverId: string, uri: string) => Promise<{ success: boolean; content?: any; error?: string }>

    listPrompts: (serverId: string) => Promise<MCPPrompt[]>
    getAllPrompts: () => Promise<{ prompts: MCPPrompt[]; errors: Array<{ serverName: string; error: string }> }>
    getPrompt: (serverId: string, promptName: string, args: any) => Promise<any>
  }
  on: (channel: string, cb: (...args: any[]) => void) => () => void
  off: (channel: string, cb: (...args: any[]) => void) => void
  plugin: {
    load: (dirPath: string) => Promise<{ success: boolean; error?: string; manifest?: any; pluginDir?: string }>
    install: (dirPath: string) => Promise<{ success: boolean; error?: string; manifest?: any; pluginDir?: string }>
    installDeps: (dirPath: string) => Promise<{ success: boolean; error?: string }>
    compile: (dirPath: string) => Promise<{ success: boolean; error?: string; code?: string }>
    uninstall: (pluginId: string) => Promise<{ success: boolean; error?: string }>
    installFromGithub: (pluginId: string, fileList: string[], manifestId?: string) =>
      Promise<{ success: boolean; error?: string; manifest?: any; pluginDir?: string }>
    onGithubProgress: (cb: (data: { pluginId: string; file: string; current: number; total: number }) => void) => () => void
    cloneRepo: (url: string) => Promise<{ success: boolean; error?: string; repoDir?: string; plugins?: any[] }>
    pullRepo: (repoDir: string) => Promise<{ success: boolean; error?: string; plugins?: any[] }>
  }
  git: {
    exec: (cwd: string, args: string[], timeoutSec?: number) =>
      Promise<{ success: boolean; output?: string; stderr?: string; exitCode?: number; error?: string }>
  }
  gh: {
    exec: (cwd: string, args: string[], timeoutSec?: number) =>
      Promise<{ success: boolean; output?: string; stderr?: string; exitCode?: number; error?: string }>
  }
  search: {
    fetch: (url: string, timeout: number) => Promise<{ success: boolean; error?: string; data?: string }>
  }
  http: {
    fetch: (url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) =>
      Promise<{ success: boolean; error?: string; data?: string; status?: number }>
  }
  terminal?: {
    execute: (id: string, command: string, cwd: string, timeout?: number, env?: Record<string, string>) =>
      Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>
    spawn: (id: string, command: string, cwd: string, timeout?: number, env?: Record<string, string>) =>
      Promise<{ success: boolean; pid?: number; error?: string }>
    check: (id: string) => Promise<{ found: boolean; done?: boolean; pid?: number; stdout?: string; stderr?: string; exitCode?: number }>
    kill: (id: string) => Promise<{ success: boolean; error?: string }>
    interrupt: (id: string) => Promise<{ success: boolean; error?: string }>
    ptySpawn?: (id: string, command: string, cwd: string) => Promise<{ success: boolean; pid?: number; error?: string }>
    ptyWrite?: (id: string, data: string) => Promise<{ success: boolean; error?: string }>
    ptyResize?: (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>
    onOutput?: (cb: (data: { id: string; stdout: string; stderr: string; done: boolean; exitCode?: number }) => void) => () => void
    onPtyOutput?: (cb: (data: { id: string; data: string; done?: boolean; exitCode?: number }) => void) => () => void
  }
  perm?: {
    check: (workspaceRoot: string, type: string, value: string) => Promise<boolean>
    grant: (workspaceRoot: string, type: string, pattern: string) => Promise<void>
  }
  sidecar?: {
    call: (method: string, params?: any, timeout?: number) => Promise<any>
    onEvent: (eventName: string, cb: (params: any) => void) => () => void
  }
}

declare global {
  /** Vite define — 构建时注入，不受用户系统时间影响 */
  var __APP_VERSION__: string
  var __BUILD_YEAR__: number
  interface Window {
    electronAPI?: ElectronAPI
  }
}

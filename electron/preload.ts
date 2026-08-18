const { contextBridge, ipcRenderer, webUtils } = require('electron')

const ipcListeners = new Map<string, Set<(...args: any[]) => void>>()

contextBridge.exposeInMainWorld('electronAPI', {
  on: (channel: string, cb: (...args: any[]) => void) => {
    if (!ipcListeners.has(channel)) {
      ipcListeners.set(channel, new Set())
      ipcRenderer.on(channel, (_e, ...args) => {
        ipcListeners.get(channel)?.forEach(fn => fn(...args))
      })
    }
    ipcListeners.get(channel)!.add(cb)
    return () => ipcListeners.get(channel)?.delete(cb)
  },
  off: (channel: string, cb: (...args: any[]) => void) => {
    ipcListeners.get(channel)?.delete(cb)
  },
  platform: process.platform,

  window: {
    openNav: (navId: string, label: string) => ipcRenderer.invoke('window:openNav', navId, label),
  },

  ai: {
    openModel: (url: string, iconUrl?: string) => ipcRenderer.invoke('ai:openModel', url, iconUrl),
  },

  onShowAbout: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('showAbout', listener)
    return () => ipcRenderer.removeListener('showAbout', listener)
  },

  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('dialog:openFile', opts),
  },

  file: {
    checkType: (filePath: string) => ipcRenderer.invoke('file:checkType', filePath),
    convert: (filePath: string) => ipcRenderer.invoke('file:convert', filePath),
    /** Electron 32+ 中 File.path 已废弃，用 webUtils 获取路径 */
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    onConvertProgress: (cb: (data: { filePath: string; message: string }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('file:convertProgress', handler)
      return () => ipcRenderer.removeListener('file:convertProgress', handler)
    },
  },

  workspace: {
    getPaths: () => ipcRenderer.invoke('workspace:getPaths'),
    info: () => ipcRenderer.invoke('workspace:info'),
    setRoot: (newRoot: string) => ipcRenderer.invoke('workspace:setRoot', newRoot),
    pickRoot: () => ipcRenderer.invoke('workspace:pickRoot'),
    resetRoot: () => ipcRenderer.invoke('workspace:resetRoot'),
    listOutputs: () => ipcRenderer.invoke('workspace:listOutputs'),
    openFile: (filePath: string) => ipcRenderer.invoke('workspace:openFile', filePath),
    deleteFile: (filePath: string) => ipcRenderer.invoke('workspace:deleteFile', filePath),
    clearOutputs: () => ipcRenderer.invoke('workspace:clearOutputs'),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openInExplorer: (targetPath: string) => ipcRenderer.invoke('shell:openInExplorer', targetPath),
    openInTerminal: (targetPath: string) => ipcRenderer.invoke('shell:openInTerminal', targetPath),
  },

  sandbox: {
    executeJS: (code: string, packages?: string[], outputDir?: string) => ipcRenderer.invoke('sandbox:executeJS', code, packages, outputDir),
    executePython: (code: string, packages?: string[], outputDir?: string) => ipcRenderer.invoke('sandbox:executePython', code, packages, outputDir),
  },

  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    readFileBase64: (filePath: string) => ipcRenderer.invoke('fs:readFileBase64', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
    listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
    rename: (source: string, dest: string) => ipcRenderer.invoke('fs:rename', source, dest),
    copyDir: (src: string, dest: string) => ipcRenderer.invoke('fs:copyDir', src, dest),
    grep: (dirPath: string, pattern: string, fileGlob?: string) => ipcRenderer.invoke('fs:grep', dirPath, pattern, fileGlob),
    find: (dirPath: string) => ipcRenderer.invoke('fs:find', dirPath),
    unlink: (filePath: string) => ipcRenderer.invoke('fs:unlink', filePath),
  },

  model: {
    getStatus: () => ipcRenderer.invoke('model:getStatus'),
    download: (id: string, useMirror?: boolean) => ipcRenderer.invoke('model:download', id, useMirror),
    delete: (id: string) => ipcRenderer.invoke('model:delete', id),
    isInstalled: (id: string) => ipcRenderer.invoke('model:isInstalled', id),
    openDir: () => ipcRenderer.invoke('model:openDir'),
    toggleEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('model:toggleEnabled', id, enabled),
    load: (id: string) => ipcRenderer.invoke('model:load', id),
    unload: () => ipcRenderer.invoke('model:unload'),
    chat: (id: string, messages: Array<{ role: string; content: string }>) => {
      ipcRenderer.send('model:chat', id, messages)
    },
    onChatChunk: (cb: (data: { text: string }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('model:chatChunk', handler)
      return () => ipcRenderer.removeListener('model:chatChunk', handler)
    },
    onChatDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('model:chatDone', handler)
      return () => ipcRenderer.removeListener('model:chatDone', handler)
    },
    onChatError: (cb: (data: { error: string }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('model:chatError', handler)
      return () => ipcRenderer.removeListener('model:chatError', handler)
    },
    subscribe: () => ipcRenderer.send('model:subscribe'),
    onProgress: (cb: (data: { id: string; loaded: number; total: number }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('model:downloadProgress', handler)
      return () => ipcRenderer.removeListener('model:downloadProgress', handler)
    },
    onDone: (cb: (data: { id: string; success: boolean; error: string }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('model:downloadDone', handler)
      return () => ipcRenderer.removeListener('model:downloadDone', handler)
    },
  },

  config: {
    getSupabase: () => ipcRenderer.invoke('config:getSupabase'),
    saveSupabase: (c: any) => ipcRenderer.invoke('config:saveSupabase', c),
    clearSupabase: () => ipcRenderer.invoke('config:clearSupabase'),
    getCloudinary: () => ipcRenderer.invoke('config:getCloudinary'),
    saveCloudinary: (c: any) => ipcRenderer.invoke('config:saveCloudinary', c),
    clearCloudinary: () => ipcRenderer.invoke('config:clearCloudinary'),
    getAIModels: () => ipcRenderer.invoke('config:getAIModels'),
    saveAIModels: (models: any[]) => ipcRenderer.invoke('config:saveAIModels', models),
  },

  conv: {
    list: (projectId?: string | null) => ipcRenderer.invoke('conv:list', projectId),
    get: (id: string) => ipcRenderer.invoke('conv:get', id),
    save: (conv: any) => ipcRenderer.invoke('conv:save', conv),
    delete: (id: string) => ipcRenderer.invoke('conv:delete', id),
    create: (title?: string, modelName?: string, projectId?: string | null, projectName?: string) => ipcRenderer.invoke('conv:create', title, modelName, projectId, projectName),
  },

  graph: {
    configure: (uri: string, username: string, password: string) =>
      ipcRenderer.invoke('graph:configure', uri, username, password),
    getConfig: () => ipcRenderer.invoke('graph:getConfig'),
    testConnection: () => ipcRenderer.invoke('graph:testConnection'),
    query: (cypher: string, pluginId: string) =>
      ipcRenderer.invoke('graph:query', cypher, pluginId),
  },

  skills: {
    writeFiles: (skillId: string, files: Record<string, string>) =>
      ipcRenderer.invoke('skills:writeFiles', skillId, files),
    readFile: (skillId: string, filePath: string) =>
      ipcRenderer.invoke('skills:readFile', skillId, filePath),
    deleteFiles: (skillId: string) =>
      ipcRenderer.invoke('skills:deleteFiles', skillId),
    cloneFromUrl: (url: string) =>
      ipcRenderer.invoke('skill:cloneFromUrl', url),
    cleanupTemp: (dirPath: string) =>
      ipcRenderer.invoke('skill:cleanupTemp', dirPath),
  },

  mcp: {
    getServers: () => ipcRenderer.invoke('mcp:getServers'),
    addServer: (config: any) => ipcRenderer.invoke('mcp:addServer', config),
    removeServer: (serverId: string) => ipcRenderer.invoke('mcp:removeServer', serverId),
    updateServer: (serverId: string, patch: any) => ipcRenderer.invoke('mcp:updateServer', serverId, patch),

    connect: (serverId: string) => ipcRenderer.invoke('mcp:connect', serverId),
    disconnect: (serverId: string) => ipcRenderer.invoke('mcp:disconnect', serverId),

    listTools: (serverId: string) => ipcRenderer.invoke('mcp:listTools', serverId),
    getAllTools: () => ipcRenderer.invoke('mcp:getAllTools'),
    callTool: (serverId: string, toolName: string, args: any) =>
      ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),

    listResources: (serverId: string) => ipcRenderer.invoke('mcp:listResources', serverId),
    getAllResources: () => ipcRenderer.invoke('mcp:getAllResources'),
    readResource: (serverId: string, uri: string) =>
      ipcRenderer.invoke('mcp:readResource', serverId, uri),

    listPrompts: (serverId: string) => ipcRenderer.invoke('mcp:listPrompts', serverId),
    getAllPrompts: () => ipcRenderer.invoke('mcp:getAllPrompts'),
    getPrompt: (serverId: string, promptName: string, args: any) =>
      ipcRenderer.invoke('mcp:getPrompt', serverId, promptName, args),
  },

  plugin: {
    load: (dirPath: string) => ipcRenderer.invoke('plugin:load', dirPath),
    install: (dirPath: string) => ipcRenderer.invoke('plugin:install', dirPath),
    installDeps: (dirPath: string) => ipcRenderer.invoke('plugin:installDeps', dirPath),
    compile: (dirPath: string) => ipcRenderer.invoke('plugin:compile', dirPath),
    uninstall: (pluginId: string) => ipcRenderer.invoke('plugin:uninstall', pluginId),
    installFromGithub: (pluginId: string, fileList: string[], manifestId?: string) =>
      ipcRenderer.invoke('plugin:installFromGithub', pluginId, fileList, manifestId),
    onGithubProgress: (cb: (data: { pluginId: string; file: string; current: number; total: number }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
    },
    cloneRepo: (url: string) => ipcRenderer.invoke('plugin:cloneRepo', url),
    pullRepo: (repoDir: string) => ipcRenderer.invoke('plugin:pullRepo', repoDir),
  },

  // Cordis 新范式
  cordis: {
    loadPlugin: (pluginDir: string) => ipcRenderer.invoke('cordis:loadPlugin', pluginDir),
    unloadPlugin: (pluginId: string) => ipcRenderer.invoke('cordis:unloadPlugin', pluginId),
    loadClientCode: (pluginDir: string) => ipcRenderer.invoke('cordis:loadClientCode', pluginDir),
    listTools: () => ipcRenderer.invoke('cordis:listTools'),
    callTool: (toolName: string, args: Record<string, unknown>) => ipcRenderer.invoke('cordis:callTool', toolName, args),
  },

  search: {
    fetch: (url: string, timeout: number) => ipcRenderer.invoke('search:fetch', url, timeout),
    duckduckgo: (query: string) => ipcRenderer.invoke('search:ddg', query),
    bing: (query: string, count: number) => ipcRenderer.invoke('search:bing', query, count),
    google: (query: string, apiKey: string, cx: string) => ipcRenderer.invoke('search:google', query, apiKey, cx),
    brave: (query: string, apiKey: string) => ipcRenderer.invoke('search:brave', query, apiKey),
  },

  http: {
    fetch: (url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) =>
      ipcRenderer.invoke('http:fetch', url, opts),
  },

  gh: {
    exec: (cwd: string, args: string[], timeoutSec?: number) =>
      ipcRenderer.invoke('gh:exec', cwd, args, timeoutSec),
  },

  terminal: {
    execute: (id: string, command: string, cwd: string, timeout?: number, env?: Record<string, string>) =>
      ipcRenderer.invoke('terminal:execute', id, command, cwd, timeout, env),
    spawn: (id: string, command: string, cwd: string, timeout?: number, env?: Record<string, string>) =>
      ipcRenderer.invoke('terminal:spawn', id, command, cwd, timeout, env),
    check: (id: string) => ipcRenderer.invoke('terminal:check', id),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    interrupt: (id: string) => ipcRenderer.invoke('terminal:interrupt', id),
    onOutput: (cb: (data: { id: string; stdout: string; stderr: string; done: boolean; exitCode?: number }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('terminal:output', handler)
      return () => { ipcRenderer.removeListener('terminal:output', handler) }
    },
    ptySpawn: (id: string, command: string, cwd: string) =>
      ipcRenderer.invoke('terminal:ptySpawn', id, command, cwd),
    ptyWrite: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:ptyWrite', id, data),
    ptyResize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:ptyResize', id, cols, rows),
    onPtyOutput: (cb: (data: { id: string; data: string; done?: boolean; exitCode?: number }) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('terminal:ptyOutput', handler)
      return () => { ipcRenderer.removeListener('terminal:ptyOutput', handler) }
    },
  },

  perm: {
    check: (workspaceRoot: string, type: string, value: string) => ipcRenderer.invoke('perm:check', workspaceRoot, type, value),
    grant: (workspaceRoot: string, type: string, pattern: string) => ipcRenderer.invoke('perm:grant', workspaceRoot, type, pattern),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb: (status: any) => void) => {
      const handler = (_event: any, status: any) => cb(status)
      ipcRenderer.on('updater:status', handler)
      return () => { ipcRenderer.removeListener('updater:status', handler) }
    },
  },

	  sidecar: {
	    call: (method: string, params?: any, timeout?: number) =>
	      ipcRenderer.invoke('sidecar:call', method, params, timeout),
	    onEvent: (eventName: string, cb: (params: any) => void) => {
	      const handler = (_event: any, data: any) => {
	        if (data.event === eventName) cb(data.params)
	      }
	      ipcRenderer.on('sidecar:event', handler)
	      return () => ipcRenderer.removeListener('sidecar:event', handler)
	    },
	  },
})

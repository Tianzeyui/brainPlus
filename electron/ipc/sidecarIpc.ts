/**
 * Sidecar IPC 转发层
 *
 * 所有通过 JSON-RPC 转发到 Rust Sidecar 的 IPC handler。
 * 使用 ipcForwarder 的工具函数统一注册，消除样板代码。
 */
import { ipcMain } from 'electron'
import { getSidecar } from '../main/sidecarManager.js'
import {
  forwardToSidecar,
  forwardStreamToSidecar,
  forwardMany,
  mapPath,
  mapPathContent,
  mapCwdArgs,
  mapGrep,
} from '../main/ipcForwarder.js'

export function registerSidecarIpc(): void {
  // ==================== File Convert → Rust Sidecar ====================
  forwardToSidecar('file:checkType', 'file.checkType', (args) => ({ path: args[0] }))
  forwardToSidecar('file:convert', 'file.convert', (args) => ({ path: args[0] }))

  // ==================== File System → Rust Sidecar ====================
  // 单 path 参数必须用 mapPath，forwardMany 的默认 forwardArgs 生成的是 { arg0: ... }，Rust 端要 { path: ... }
  forwardToSidecar('fs:readFile', 'fs.readFile', mapPath)
  forwardToSidecar('fs:readFileBase64', 'fs.readFileBase64', mapPath)
  forwardToSidecar('fs:exists', 'fs.exists', mapPath)
  forwardToSidecar('fs:listDir', 'fs.listDir', mapPath)
  forwardToSidecar('fs:stat', 'fs.stat', mapPath)
  forwardToSidecar('fs:mkdir', 'fs.mkdir', mapPath)
  forwardToSidecar('fs:unlink', 'fs.unlink', mapPath)
  forwardToSidecar('fs:rename', 'fs.rename', (args) => ({ source: args[0], dest: args[1] }))
  forwardToSidecar('fs:writeFile', 'fs.writeFile', mapPathContent)
  forwardToSidecar('fs:copyDir', 'fs.copyDir', (args) => ({ src: args[0], dest: args[1] }))

  // 流式转发
  forwardStreamToSidecar(
    'fs:find',
    ['event.fs.findResult', 'event.fs.findBatch', 'event.fs.findComplete'],
    'fs.find', mapPath,
    (r) => ({ success: true, files: r._events?.map((e: any) => e.path).filter(Boolean) ?? [], count: r.count }),
  )
  forwardStreamToSidecar(
    'fs:grep',
    ['event.fs.grepResult', 'event.fs.grepBatch', 'event.fs.grepComplete'],
    'fs.grep', mapGrep,
    (r) => {
      const lines = r._events
        ?.filter((e: any) => e.event === 'event.fs.grepResult')
        ?.map((e: any) => `${e.file}:${e.line}:${e.text}`) ?? []
      console.log('[sidecarIpc] grep result:', { results: lines.length, count: r.count })
      return { success: true, output: lines.slice(0, 200).join('\n') || '(无匹配)', count: r.count }
    },
  )

  // ==================== GitHub CLI → Rust Sidecar ====================
  ipcMain.handle('gh:exec', async (_event, cwd: string, args: string[], timeoutSec?: number) => {
    try {
      const effectiveTimeout = ((timeoutSec || 30) + 2) * 1000
      const result = await getSidecar().call('gh.exec', { cwd, args }, effectiveTimeout)
      return result
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })


  // ==================== Terminal → Rust Sidecar ====================
  // terminal:execute 需要动态超时，不能使用 forwardToSidecar 的默认 30s
  ipcMain.handle('terminal:execute', async (_event, id: string, command: string, cwd: string, timeout?: number, env?: Record<string, string>) => {
    try {
      const effectiveTimeout = ((timeout || 120) + 1) * 1000 // 命令超时 + 1s（Rust 侧 kill+wait 开销）
      const result = await getSidecar().call('terminal.exec', { id, command, cwd, timeout, env }, effectiveTimeout)
      return result
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
  // terminal:spawn 应瞬间返回（仅 spawn 进程），但也用动态超时防止边缘情况
  ipcMain.handle('terminal:spawn', async (_event, id: string, command: string, cwd: string, timeout?: number, env?: Record<string, string>) => {
    try {
      const result = await getSidecar().call('terminal.spawn', { id, command, cwd, timeout, env }, 10000)
      return result
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
  forwardToSidecar('terminal:kill', 'terminal.kill', (args) => ({ id: args[0] }))
  forwardToSidecar('terminal:interrupt', 'terminal.interrupt', (args) => ({ id: args[0] }))
  forwardToSidecar('terminal:check', 'terminal.check', (args) => ({ id: args[0] }))
  // PTY
  forwardToSidecar('terminal:ptySpawn', 'terminal.ptySpawn',
    (args) => ({ id: args[0], command: args[1], cwd: args[2] }),
  )
  forwardToSidecar('terminal:ptyWrite', 'terminal.ptyWrite',
    (args) => ({ id: args[0], data: args[1] }),
  )
  forwardToSidecar('terminal:ptyResize', 'terminal.ptyResize',
    (args) => ({ id: args[0], cols: args[1], rows: args[2] }),
  )

  // ==================== Search & HTTP → Rust Sidecar ====================
  forwardToSidecar('search:google', 'search.google',
    (args) => ({ query: args[0], apiKey: args[1], cx: args[2] }),
  )
  forwardToSidecar('search:brave', 'search.brave',
    (args) => ({ query: args[0], apiKey: args[1] }),
  )
  forwardToSidecar('search:ddg', 'search.ddg',
    (args) => ({ query: args[0] }),
  )
  forwardToSidecar('search:bing', 'search.bing',
    (args) => ({ query: args[0], count: args[1] }),
  )
  forwardToSidecar('search:fetch', 'search.fetch',
    (args) => ({ url: args[0], timeout: args[1] }),
  )
  forwardToSidecar('http:fetch', 'http.fetch',
    (args) => ({ url: args[0], method: args[1]?.method, headers: args[1]?.headers, body: args[1]?.body, timeout: args[1]?.timeout }),
  )

  // ==================== Graph → Rust Sidecar ====================
  forwardToSidecar('graph:configure', 'graph.configure',
    (args) => ({ uri: args[0], username: args[1], password: args[2] }),
  )
  forwardToSidecar('graph:getConfig', 'graph.getConfig')
  forwardToSidecar('graph:testConnection', 'graph.testConnection')
  forwardToSidecar('graph:query', 'graph.query',
    (args) => ({ cypher: args[0] }),
  )
  forwardToSidecar('graph:close', 'graph.close')

  // ==================== Local Model → Rust Sidecar ====================
  forwardToSidecar('model:getStatus', 'model.getStatus')
  forwardToSidecar('model:isInstalled', 'model.isInstalled', (args) => ({ id: args[0] }))
  forwardToSidecar('model:delete', 'model.delete', (args) => ({ id: args[0] }))
  forwardToSidecar('model:toggleEnabled', 'model.toggleEnabled', (args) => ({ id: args[0], enabled: args[1] }))
  forwardToSidecar('model:openDir', 'model.openDir')
  forwardToSidecar('model:load', 'model.load', (args) => ({ id: args[0] }))
  forwardToSidecar('model:download', 'model.download', (args) => ({ id: args[0] }))
  forwardToSidecar('model:unload', 'model.unload')
  forwardToSidecar('model:chat', 'model.chat',
    (args) => ({ id: args[0], messages: args[1] }),
  )

  // ==================== Sidecar bridge IPC ====================
  ipcMain.handle('sidecar:call', async (_event, method: string, params?: any, timeout?: number) => {
    try { return await getSidecar().call(method, params || {}, timeout) }
    catch (e: any) { return { success: false, error: e.message } }
  })

  // ==================== MCP → Rust Sidecar ====================
  forwardMany([
    'mcp:getServers', 'mcp:addServer', 'mcp:removeServer',
    'mcp:connect', 'mcp:disconnect', 'mcp:listTools', 'mcp:callTool',
    'mcp:getAllTools', 'mcp:getAllResources', 'mcp:getAllPrompts',
    'mcp:updateServer', 'mcp:listResources', 'mcp:readResource',
    'mcp:listPrompts', 'mcp:getPrompt',
  ])

  // ==================== Sandbox → Rust Sidecar ====================
  forwardToSidecar('sandbox:executeJS', 'sandbox.executeJS',
    (args) => ({ code: args[0], packages: args[1], outputDir: args[2] }),
  )
  forwardToSidecar('sandbox:executePython', 'sandbox.executePython',
    (args) => ({ code: args[0], packages: args[1], outputDir: args[2] }),
  )
}

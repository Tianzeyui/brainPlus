/**
 * IPC 自动转发层
 *
 * 消除 electron/main.ts 中的模板代码：
 *   ipcMain.handle('fs:readFile', ...) → sidecar.call('fs.readFile', ...)
 *
 * 用法：
 *   forwardToSidecar('fs:readFile')           // channel → method 名自动转换 fs:readFile → fs.readFile
 *   forwardStreamToSidecar('fs:find', ['event.fs.findResult', 'event.fs.findComplete'])
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getSidecar } from './sidecarManager.js'

type ParamMapper = (args: any[]) => Record<string, unknown>

type ResultTransform = (result: any) => any

/**
 * 将 IPC handler 转发到 Rust Sidecar（普通调用）
 */
export function forwardToSidecar(
  channel: string,
  method?: string,
  mapParams?: ParamMapper,
  transform?: ResultTransform,
): void {
  const sidecarMethod = method || channel.replace(':', '.')

  ipcMain.handle(channel, async (_event, ...args: any[]) => {
    try {
      const params = mapParams ? mapParams(args) : forwardArgs(args)
      const result = await getSidecar().call(sidecarMethod, params)
      return transform ? transform(result) : result
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}

/**
 * 将 IPC handler 转发到 Rust Sidecar（流式调用，收集事件）
 */
export function forwardStreamToSidecar(
  channel: string,
  eventNames: string[],
  method?: string,
  mapParams?: ParamMapper,
  transform?: ResultTransform,
): void {
  const sidecarMethod = method || channel.replace(':', '.')

  ipcMain.handle(channel, async (_event, ...args: any[]) => {
    try {
      const params = mapParams ? mapParams(args) : forwardArgs(args)
      const result = await getSidecar().callAndCollect(sidecarMethod, params, eventNames)
      return transform ? transform(result) : result
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}

/**
 * 默认参数映射：所有 IPC 参数数值放入 params 对象
 * 键名为 arg0, arg1, arg2 ...
 */
function forwardArgs(args: any[]): Record<string, unknown> {
  if (args.length === 0) return {}
  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return args[0]
  }
  const params: Record<string, unknown> = {}
  for (let i = 0; i < args.length; i++) {
    params[`arg${i}`] = args[i]
  }
  return params
}

// ====== 便捷：按 channel 名约定注册 ======

/**
 * 按约定批量转发一组 IPC channel
 * 约定：channel 名去掉 ':' 前缀就是 sidecar method
 *   如 'fs:readFile' → method='fs.readFile'
 */
export function forwardMany(channels: string[]): void {
  for (const channel of channels) {
    forwardToSidecar(channel)
  }
}

// ====== 通用参数映射器 ======

/** (path) → { path } */
export const mapPath: ParamMapper = (args) => ({ path: args[0] })

/** (path, content) → { path, content } */
export const mapPathContent: ParamMapper = (args) => ({ path: args[0], content: args[1] })

/** (cwd, args) → { cwd, args } */
export const mapCwdArgs: ParamMapper = (args) => ({ cwd: args[0], args: args[1] })

/** (path, pattern, fileGlob) → { path, pattern, fileGlob } */
export const mapGrep: ParamMapper = (args) => ({
  path: args[0],
  pattern: args[1],
  fileGlob: args[2],
})

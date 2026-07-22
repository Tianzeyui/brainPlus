/**
 * Rust Sidecar 进程管理器
 *
 * 负责：
 * 1. 启动/停止 Rust binary 子进程
 * 2. stdin/stdout JSON-RPC 通信
 * 3. Promise bridge（请求→响应映射）
 * 4. 流式事件分发
 * 5. 崩溃自动重启
 *
 * 协议：每行一个 JSON（newline-delimited JSON）
 * - 响应：{ jsonrpc: "2.0", id: N, result/error }
 * - 事件：{ jsonrpc: "2.0", method: "event.xxx", params }
 */

import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface RpcCall {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timer: NodeJS.Timeout
  /** 可选：收集到的流式事件 */
  collectEvents?: string[]
  collected?: any[]
}

export interface SidecarEvents {
  ready: []
  error: [message: string]
  exit: [code: number | null, signal: string | null]
  restarting: []
}

export class SidecarManager extends EventEmitter {
  private child: ChildProcess | null = null
  private pendingCalls = new Map<number, RpcCall>()
  private nextId = 1
  private buffer = ''
  private binaryPath: string
  private restartAttempts = 0
  private maxRestarts = 10
  private restartDelay = 1000
  private started = false
  private shutdownRequested = false

  /** 事件监听器（流式事件 / 通知） */
  private eventListeners = new Map<string, Set<(params: any) => void>>()

  constructor(binaryPath?: string) {
    super()
    this.binaryPath = binaryPath || SidecarManager.resolveBinaryPath()
  }

  /** 解析 Rust binary 路径 */
  static resolveBinaryPath(): string {
    const isDev = !app.isPackaged

    if (isDev) {
      // 开发模式：从源码目录找编译产物
      // app.getAppPath() 在不同环境返回不同路径，多候选覆盖
      const appPath = app.getAppPath()
      const candidates = [
        // 开发模式优先用 debug（编译快），release 仅用于打包
        path.join(appPath, 'stardust-engine', 'target', 'debug', 'stardust-engine'),
        path.join(appPath, '..', 'stardust-engine', 'target', 'debug', 'stardust-engine'),
        path.join(appPath, 'stardust-engine', 'target', 'release', 'stardust-engine'),
        path.join(appPath, '..', 'stardust-engine', 'target', 'release', 'stardust-engine'),
      ]

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          console.log('[sidecar] 找到 binary:', p)
          return p
        }
      }

      throw new Error(
        `找不到 Rust Sidecar binary。检查路径:\n` +
        `  ${candidates.slice(0, 2).join('\n  ')}\n` +
        `请先编译: cd stardust-engine && cargo build --release`
      )
    } else {
      // 生产模式：打包在 app.asar.unpacked 或 Resources 目录
      const platform = process.platform
      const binaryName = platform === 'win32' ? 'stardust-engine.exe' : 'stardust-engine'

      const candidates = [
        path.join(process.resourcesPath, 'sidecar', binaryName),
        path.join(app.getAppPath(), '..', 'sidecar', binaryName),
      ]

      for (const p of candidates) {
        if (fs.existsSync(p)) return p
      }

      throw new Error(`找不到 Rust Sidecar binary: ${candidates.join(', ')}`)
    }
  }

  /** 启动 Rust Sidecar */
  start(): Promise<void> {
    if (this.started) return Promise.resolve()

    return new Promise((resolve, reject) => {
      try {
        console.log(`[sidecar] 启动: ${this.binaryPath}`)
        this.shutdownRequested = false

        this.child = spawn(this.binaryPath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            RUST_LOG: process.env.RUST_LOG || 'info',
          },
        })

        // stdout：JSON-RPC 响应和事件
        this.child.stdout!.on('data', (data: Buffer) => {
          this.buffer += data.toString()
          this.processBuffer()
        })

        // stderr：tracing 日志
        this.child.stderr!.on('data', (data: Buffer) => {
          const lines = data.toString().trim().split('\n')
          for (const line of lines) {
            if (!line) continue
            // 尝试解析 JSON 格式的 tracing 日志
            // Rust sidecar stdout 日志（仅保留 error/warn 级别）
            try {
              const log = JSON.parse(line)
              if (log.level === 'ERROR' || log.level === 'WARN') {
                console.log(`[sidecar:rust] ${log.level}: ${log.fields?.message || log.message || line}`)
              }
            } catch {
              // 非 JSON 行不打印，减少噪音
            }
          }
        })

        // 进程退出
        this.child.on('exit', (code, signal) => {
          console.log(`[sidecar] 进程退出: code=${code}, signal=${signal}`)
          this.started = false

          // 拒绝所有待处理的请求
          for (const [id, call] of this.pendingCalls) {
            clearTimeout(call.timer)
            call.reject(new Error(`Sidecar 进程退出 (exit code: ${code})`))
          }
          this.pendingCalls.clear()

          this.emit('exit', code, signal)

          // 自动重启
          if (!this.shutdownRequested && this.restartAttempts < this.maxRestarts) {
            this.restartAttempts++
            const delay = this.restartDelay * Math.min(this.restartAttempts, 5)
            console.log(`[sidecar] ${delay}ms 后自动重启 (#${this.restartAttempts})`)
            this.emit('restarting')
            setTimeout(() => this.start().catch(() => {}), delay)
          }
        })

        // 进程错误
        this.child.on('error', (err) => {
          console.error(`[sidecar] 进程错误: ${err.message}`)
          this.emit('error', err.message)
          if (!this.started) reject(err)
        })

        // 等待 ready 事件
        const readyTimeout = setTimeout(() => {
          if (!this.started) {
            reject(new Error('Sidecar 启动超时（10 秒）'))
          }
        }, 10000)

        this.once('ready', () => {
          clearTimeout(readyTimeout)
          this.started = true
          this.restartAttempts = 0
          console.log('[sidecar] 就绪')
          resolve()
        })
      } catch (e: any) {
        reject(new Error(`启动 Sidecar 失败: ${e.message}`))
      }
    })
  }

  /** 处理 stdout 缓冲区 */
  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    // 最后一行可能不完整，保留到下次
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const msg = JSON.parse(line)

        // event.ready 特殊处理
        if (msg.method === 'event.ready') {
          this.emit('ready')
          continue
        }

        // 事件通知（无 id，有 method）
        if (msg.id == null && msg.method) {
          this.dispatchEvent(msg.method, msg.params || {})
          continue
        }

        // JSON-RPC 响应（有 id）
        if (msg.id != null) {
          const call = this.pendingCalls.get(msg.id)
          if (!call) {
            console.warn(`[sidecar] 收到未知 id 的响应: ${msg.id}`)
            continue
          }

          clearTimeout(call.timer)
          this.pendingCalls.delete(msg.id)

          if (msg.error) {
            call.reject(new Error(`[${msg.error.code}] ${msg.error.message}`))
          } else {
            call.resolve(msg.result)
          }
        }
      } catch (e) {
        console.warn(`[sidecar] 解析 JSON 行失败: ${line.slice(0, 100)}`, e)
      }
    }
  }

  /** 分发流式事件 */
  private dispatchEvent(method: string, params: any): void {
    // 全局事件
    this.emit('event', { method, params })

    // 特定事件监听器
    const listeners = this.eventListeners.get(method)
    if (listeners) {
      for (const fn of listeners) {
        try { fn(params) } catch (e) { console.warn(`[sidecar] 事件处理异常 ${method}:`, e) }
      }
    }
  }

  /**
   * JSON-RPC 调用（Promise 风格）
   *
   * @param method  方法名，如 "fs.readFile"
   * @param params  参数对象
   * @param timeout 超时 ms，默认 30 秒
   */
  call(method: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<any> {
    if (!this.started || !this.child) {
      return Promise.reject(new Error('Sidecar 未启动'))
    }

    const id = this.nextId++

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id)
        reject(new Error(`Sidecar 调用超时: ${method} (${timeout}ms)`))
      }, timeout)

      this.pendingCalls.set(id, { resolve, reject, timer })

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })

      try {
        this.child!.stdin!.write(request + '\n')
        // IPC 调用去噪：只在调试时打印
      } catch (e: any) {
        clearTimeout(timer)
        this.pendingCalls.delete(id)
        reject(new Error(`写入 stdin 失败: ${e.message}`))
      }
    })
  }

  /**
   * JSON-RPC 调用 + 收集流式事件。
   * 用于 fs.find / fs.grep 等有中间事件的接口。
   */
  callAndCollect(
    method: string,
    params: Record<string, unknown> = {},
    collectEventNames: string[],
    timeout = 60000,
  ): Promise<any> {
    if (!this.started || !this.child) {
      return Promise.reject(new Error('Sidecar 未启动'))
    }

    const id = this.nextId++
    const collected: any[] = []
    const unsubscribers: Array<() => void> = []

    for (const eventName of collectEventNames) {
      const unsub = this.onEvent(eventName, (p) => {
        if (p.requestId === id) collected.push({ event: eventName, ...p })
      })
      unsubscribers.push(unsub)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        for (const unsub of unsubscribers) unsub()
        this.pendingCalls.delete(id)
        reject(new Error(`Sidecar 调用超时: ${method} (${timeout}ms)`))
      }, timeout)

      this.pendingCalls.set(id, {
        resolve: (result: any) => {
          clearTimeout(timer)
          for (const unsub of unsubscribers) unsub()
          resolve({ ...result, _events: collected })
        },
        reject,
        timer,
      })

      try {
        this.child!.stdin!.write(JSON.stringify({
          jsonrpc: '2.0', id, method, params,
        }) + '\n')
        // IPC 调用去噪：只在调试时打印
      } catch (e: any) {
        clearTimeout(timer)
        for (const unsub of unsubscribers) unsub()
        this.pendingCalls.delete(id)
        reject(new Error(`写入 stdin 失败: ${e.message}`))
      }
    })
  }

  /**
   * 注册流式事件监听器
   *
   * @param eventName  事件名，如 "event.fs.findResult"
   * @param listener   回调函数
   * @returns 取消监听函数
   */
  onEvent(eventName: string, listener: (params: any) => void): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set())
    }
    this.eventListeners.get(eventName)!.add(listener)

    return () => {
      this.eventListeners.get(eventName)?.delete(listener)
    }
  }

  /** 检查是否运行中 */
  isRunning(): boolean {
    return this.started && this.child?.pid != null && !this.child.killed
  }

  /** 停止 Sidecar */
  async stop(): Promise<void> {
    if (!this.child) return

    this.shutdownRequested = true

    try {
      // 尝试优雅关闭
      await this.call('shutdown', {}, 3000)
    } catch {
      // 超时或失败 → 强杀
    }

    // 清理
    clearAllTimeouts(this.pendingCalls)
    this.pendingCalls.clear()

    if (!this.child.killed) {
      this.child.kill('SIGTERM')
      // 给 2 秒优雅退出
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.child?.killed) this.child?.kill('SIGKILL')
          resolve()
        }, 2000)
        this.child!.once('exit', () => { clearTimeout(timer); resolve() })
      })
    }

    this.started = false
    this.child = null
    console.log('[sidecar] 已停止')
  }
}

function clearAllTimeouts(map: Map<number, RpcCall>): void {
  for (const call of map.values()) {
    clearTimeout(call.timer)
  }
}

/** 全局单例 */
let _instance: SidecarManager | null = null

export function getSidecar(): SidecarManager {
  if (!_instance) {
    _instance = new SidecarManager()
  }
  return _instance
}

export function initSidecar(binaryPath?: string): SidecarManager {
  if (_instance) {
    console.warn('[sidecar] 已初始化，返回现有实例')
    return _instance
  }
  _instance = new SidecarManager(binaryPath)
  return _instance
}

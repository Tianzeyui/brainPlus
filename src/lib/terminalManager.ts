/**
 * 终端进程管理器
 *
 * 功能：
 * - 进程生命周期追踪（创建/更新/删除）
 * - 权限确认回调管理
 * - 流式输出事件监听（spawn 异步进程）
 * - Session 级 cwd 记忆
 * - 强制终止（SIGKILL）和优雅中断（SIGINT）
 */
import type { TerminalStatus } from '@/types/chat'

const processes = new Map<string, TerminalStatus>()
const resolvers = new Map<string, (confirmed: boolean, persist?: boolean) => void>()
let _uiHandler: ((event: any) => void) | null = null

// ====== Session 级 cwd 记忆 ======

let _sessionCwd: string | null = null

/** 获取当前 session 的默认 cwd */
export function getSessionCwd(): string | null {
  return _sessionCwd
}

/** 设置 session 级默认 cwd（每次 run_terminal 调用后自动更新） */
export function setSessionCwd(cwd: string): void {
  _sessionCwd = cwd
}

/** 清除 session cwd 记忆 */
export function clearSessionCwd(): void {
  _sessionCwd = null
}

// ====== 命令历史 ======

const _cmdHistory: Array<{ command: string; cwd: string; timestamp: number }> = []
const MAX_HISTORY = 50

export function addToHistory(command: string, cwd: string): void {
  _cmdHistory.push({ command, cwd, timestamp: Date.now() })
  if (_cmdHistory.length > MAX_HISTORY) _cmdHistory.shift()
}

export function getCommandHistory(limit = 20): Array<{ command: string; cwd: string; timestamp: number }> {
  return _cmdHistory.slice(-limit)
}

// ====== 流式输出事件监听（spawn 异步进程） ======

let _streamUnsubscriber: (() => void) | null = null

/** 初始化流式输出监听（应用启动时调用一次） */
export function initStreamListener(): void {
  if (_streamUnsubscriber) return
  const api = (window as any).electronAPI?.terminal

  // 普通 spawn 输出事件
  const unsub1 = api?.onOutput?.((data: {
    id: string; stdout: string; stderr: string; done: boolean; exitCode?: number
  }) => {
    const t = processes.get(data.id)
    if (!t) return
    if (data.stdout) t.stdout += data.stdout
    if (data.stderr) t.stderr += data.stderr
    if (data.done) {
      t.status = (data.exitCode === 0) ? 'done' : 'error'
      t.exitCode = data.exitCode
      t.endTime = Date.now()
    } else if (t.status !== 'running') {
      t.status = 'running'
    }
    notifyUI({ type: 'terminal_updated', terminal: { ...t } })
  })

  // PTY 输出事件（stream=true 现在用 PTY）
  const unsub2 = api?.onPtyOutput?.((data: {
    id: string; data: string; done?: boolean; exitCode?: number
  }) => {
    const t = processes.get(data.id)
    if (!t) return
    if (data.data) t.stdout += data.data
    if (data.done) {
      t.status = (data.exitCode === 0) ? 'done' : 'error'
      t.exitCode = data.exitCode
      t.endTime = Date.now()
    } else if (t.status !== 'running') {
      t.status = 'running'
    }
    notifyUI({ type: 'terminal_updated', terminal: { ...t } })
  })

  _streamUnsubscriber = () => { unsub1?.(); unsub2?.() }
}

/** 清理流式输出监听 */
export function destroyStreamListener(): void {
  _streamUnsubscriber?.()
  _streamUnsubscriber = null
}

// ====== UI 通知 ======

export function setTerminalUIHandler(handler: ((event: any) => void) | null) {
  _uiHandler = handler
}

function notifyUI(event: any) {
  _uiHandler?.(event)
}

// ====== CRUD ======

export function createTerminal(id: string, command: string, cwd?: string, isAsync?: boolean): TerminalStatus {
  const status: TerminalStatus = {
    id,
    command,
    cwd,
    status: 'pending_confirm',
    async: isAsync,
    stdout: '',
    stderr: '',
    startTime: Date.now(),
  }
  processes.set(id, status)
  return status
}

export function getTerminal(id: string): TerminalStatus | undefined {
  return processes.get(id)
}

export function updateTerminal(id: string, patch: Partial<TerminalStatus>): void {
  const t = processes.get(id)
  if (t) Object.assign(t, patch)
}

// ====== 权限确认 ======

export function setResolver(id: string, resolve: (confirmed: boolean, persist?: boolean) => void): void {
  console.log(`[terminal] setResolver(${id}), total=${resolvers.size + 1}`)
  resolvers.set(id, resolve)
}

export function confirm(id: string, persist?: boolean): void {
  const resolve = resolvers.get(id)
  if (resolve) {
    resolve(true, persist)
    resolvers.delete(id)
  } else {
    // HMR 场景：resolver 已丢失，直接标记为允许并继续
    const t = processes.get(id)
    if (t && t.status === 'pending_confirm') {
      updateTerminal(id, { status: 'running' })
      notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
    }
  }
}

export function reject(id: string): void {
  console.log(`[terminal] reject(${id}), resolvers.size=${resolvers.size}, processes.size=${processes.size}`)
  const resolve = resolvers.get(id)
  if (resolve) {
    console.log(`[terminal] reject: 找到 resolver，调用 resolve(false)`)
    resolve(false)
    resolvers.delete(id)
  } else {
    console.log(`[terminal] reject: 未找到 resolver (HMR 丢失?)，回退到直接更新状态`)
    const t = processes.get(id)
    if (t) console.log(`[terminal] reject: terminal status=${t.status}`)
    if (t && t.status === 'pending_confirm') {
      updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
      notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
      console.log(`[terminal] reject: terminal 已标记为 cancelled`)
    }
  }
}

export function rejectAll(): void {
  for (const [id, resolve] of resolvers) {
    resolve(false)
    const t = processes.get(id)
    if (t) notifyUI({ type: 'terminal_updated', terminal: { ...t } })
  }
  resolvers.clear()
}

// ====== 进程控制 ======

/** 强制终止所有进程 */
export async function killAll(): Promise<void> {
  rejectAll()
  const api = (window as any).electronAPI?.terminal
  if (!api?.kill) {
    console.warn('[terminal] kill API not available')
    return
  }
  for (const [id, t] of processes) {
    if (t.status === 'running' || t.status === 'pending_confirm') {
      updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
      notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
      console.log(`[terminal] killing ${id}: ${t.command}`)
      api.kill(id).catch((e: any) => console.warn(`[terminal] kill failed for ${id}:`, e))
    }
  }
}

/** 强制终止单个进程（SIGKILL） */
export async function killTerminal(id: string): Promise<void> {
  reject(id)
  const t = processes.get(id)
  if (t) {
    updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
    notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
  }
  const api = (window as any).electronAPI?.terminal
  if (api?.kill) {
    console.log(`[terminal] killTerminal ${id}`)
    api.kill(id).catch((e: any) => console.warn(`[terminal] killTerminal failed:`, e))
  }
}

/** 优雅中断进程（SIGINT，等价 Ctrl+C） */
export async function interruptTerminal(id: string): Promise<void> {
  const t = processes.get(id)
  if (!t || t.status !== 'running') return

  const api = (window as any).electronAPI?.terminal
  if (api?.interrupt) {
    console.log(`[terminal] interruptTerminal ${id}`)
    try {
      await api.interrupt(id)
      notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
    } catch (e: any) {
      console.warn(`[terminal] interruptTerminal failed, falling back to kill:`, e)
      await killTerminal(id)
    }
  } else {
    await killTerminal(id)
  }
}

// ====== 清理 ======

export function removeTerminal(id: string): void {
  processes.delete(id)
  resolvers.delete(id)
}

export function getRunningCount(): number {
  let count = 0
  for (const t of processes.values()) {
    if (t.status === 'running') count++
  }
  return count
}

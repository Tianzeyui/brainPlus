/**
 * 终端工具：run_terminal + check_terminal + run_terminal_input
 *
 * === 工具说明 ===
 * run_terminal       — 执行 shell 命令（同步/流式），支持超时、环境变量、分页读取
 * check_terminal     — 查询终端状态和累计输出
 * run_terminal_input — 向运行中的交互式终端发送输入
 *
 * === 优化记录 ===
 * 1. 输出分页：offset/max_chars 参数，截断时提示剩余字符数
 * 2. EADDRINUSE 容错：检测常见错误模式，给出修复建议
 * 3. 流式输出：stream=true 使用 spawn 异步执行，UI 实时更新
 * 4. 后台进程：检测 & 后台进程，输出 PID 信息
 * 5. 并发标签：检测多个后台任务时提示拆分建议
 * 6. cwd 记忆：session 级默认 cwd，免重复填写
 * 7. 超时扩展：默认 120s，最大 1800s（30min），超时提示更友好
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import { getTerminalEnabled } from '@/lib/config'
import { createTerminal, updateTerminal, getTerminal, setResolver, getSessionCwd, setSessionCwd, addToHistory, getCommandHistory } from '@/lib/terminalManager'
import { getTerminalUIHandler } from '@/lib/chatService'

let _termWorkspaceRoot = ''
export function setTermWorkspaceRoot(root: string) { if (root) _termWorkspaceRoot = root }

function notifyUI(event: any) {
  getTerminalUIHandler()?.(event)
}

// ====== 常量 ======

const MAX_STDOUT = 8000
const MAX_STDERR = 4000
const DEFAULT_TIMEOUT = 120
const MAX_TIMEOUT = 1800   // 30 分钟

// ====== 错误模式匹配 ======

interface ErrorPattern {
  pattern: RegExp
  suggestion: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /EADDRINUSE|address already in use|端口.*(被占用|已使用)/i,
    suggestion: '端口已被占用。尝试：\n  • 查找占用进程: lsof -ti :PORT\n  • 终止进程: lsof -ti :PORT | xargs kill\n  • 或使用其他端口',
  },
  {
    pattern: /EACCES|permission denied|Permission denied/i,
    suggestion: '权限不足。尝试：\n  • 检查文件权限: ls -la\n  • 使用 chmod 修改权限\n  • 确认是否有 sudo 权限',
  },
  {
    pattern: /ENOENT|no such file|not found|command not found/i,
    suggestion: '文件或命令未找到。检查：\n  • 路径是否正确\n  • 是否已安装对应工具\n  • 当前工作目录是否正确',
  },
  {
    pattern: /ECONNREFUSED|connection refused/i,
    suggestion: '连接被拒绝。检查：\n  • 目标服务是否已启动\n  • 端口号是否正确\n  • 防火墙设置',
  },
  {
    pattern: /ENOSPC|no space left/i,
    suggestion: '磁盘空间不足。尝试：\n  • 清理临时文件: rm -rf /tmp/*\n  • 检查磁盘: df -h\n  • 清理 node_modules 等缓存',
  },
]

function matchErrorPatterns(stderr: string, stdout: string): string | null {
  const combined = stderr + ' ' + stdout
  for (const ep of ERROR_PATTERNS) {
    if (ep.pattern.test(combined)) {
      return `\n[!] 检测到: ${ep.suggestion}`
    }
  }
  return null
}

// ====== 后台进程检测 ======

function detectBackgroundJobs(command: string): { count: number; hasWait: boolean } {
  // 检测 & 后台进程（排除 && 逻辑与、>& 重定向、&> 等）
  const bgMatches = command.match(/(?<!&)(?<!>)\s&(?:\s|$)/g)
  const hasWait = /\bwait\b/.test(command)
  return {
    count: bgMatches ? bgMatches.length : 0,
    hasWait,
  }
}

// ====== 输出处理 ======

function paginateOutput(
  stdout: string,
  stderr: string,
  offset?: number,
  maxChars?: number,
): { stdoutOut: string; stderrOut: string; totalStdout: number; totalStderr: number; notice: string } {
  const totalStdout = stdout.length
  const totalStderr = stderr.length
  const effectiveMax = Math.min(maxChars || MAX_STDOUT, 50000)
  const start = offset || 0

  let stdoutOut = stdout.slice(start, start + effectiveMax)
  let stderrOut = stderr.slice(start, start + Math.floor(effectiveMax / 2))
  let notice = ''

  // stdout 截断提示
  if (start > 0 && totalStdout > 0) {
    notice += `[从第 ${start} 字符开始，`
  }
  if (start + effectiveMax < totalStdout) {
    const remaining = totalStdout - (start + effectiveMax)
    if (notice) {
      notice += `剩余 ${remaining} 字符未显示。使用 offset=${start + effectiveMax} 继续读取]\n`
    } else {
      notice = `[输出被截断，共 ${totalStdout} 字符，显示 ${start}-${start + effectiveMax}。剩余 ${remaining} 字符。使用 offset=${start + effectiveMax} 或 max_chars=${effectiveMax * 2} 继续读取]\n`
    }
  } else if (notice) {
    notice += `已显示全部内容]\n`
  }

  // stderr 截断提示
  if (stderrOut.length < totalStderr) {
    stderrOut += `\n[stderr 共 ${totalStderr} 字符，已截断。使用 offset 参数读取更多]`
  }

  return { stdoutOut, stderrOut, totalStdout, totalStderr, notice }
}

// ====== ANSI 清洗 ======

/** 移除 ANSI escape code，保留可读文本 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // CSI 序列
    .replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '') // OSC 序列
    .replace(/\x1b\[[0-9;]*[mGK]|\x1b\].*?\x07|\x1b\].*?\x1b\\/g, '') // 常见 escape
    .replace(/\x1b[\[\(]([0-9;]*)[a-zA-Z]/g, '') // 扩展覆盖
    .replace(/\r\n/g, '\n')                  // CRLF → LF
    .replace(/\r/g, '\n')                    // CR → LF
}

// ====== 进度条检测 ======

interface ProgressInfo {
  percent?: number
  current?: number
  total?: number
  message?: string
}

function detectProgress(stdout: string, stderr: string): ProgressInfo | null {
  const combined = stdout + '\n' + stderr
  // [====>  ] 50% 或 [####  ] 30%
  const barMatch = combined.match(/\[[#=>\s]*\]\s*(\d+)%/)
  if (barMatch) return { percent: parseInt(barMatch[1]) }
  // Downloading... XX%
  const dlMatch = combined.match(/(?:download|install|build|compile|fetch).*?(\d+)%/i)
  if (dlMatch) return { percent: parseInt(dlMatch[1]), message: dlMatch[0].trim() }
  // XX/YY tasks/runs/tests
  const cntMatch = combined.match(/(\d+)\s*\/\s*(\d+)\s*(?:tasks?|runs?|tests?|items?|steps?)/i)
  if (cntMatch) return { current: parseInt(cntMatch[1]), total: parseInt(cntMatch[2]) }
  return null
}

// ====== 辅助函数 ======

function clampTimeout(t?: number): number {
  if (t == null || t <= 0) return DEFAULT_TIMEOUT
  return Math.min(Math.max(1, Math.round(t)), MAX_TIMEOUT)
}

// ====== 工具注册 ======

export function registerTerminalTool(tools: ToolMap) {
  if (!getTerminalEnabled()) return

  // ==================== run_terminal ====================
  tools['run_terminal'] = {
    description:
      'Execute a shell command and return the output.\n' +
      'Use for: package installs (npm/pip), build commands, test runners, git operations, linters, formatters, CLI tools.\n' +
      'NOT for file reading/editing/searching — use workspace_* tools for those.\n' +
      '\n' +
      'Key features:\n' +
      `- Default timeout: ${DEFAULT_TIMEOUT}s, max ${MAX_TIMEOUT}s (30 min). Increase for slow commands.\n` +
      '- stream=true: For long-running servers (dev servers, watchers, tail -f). Returns terminal ID immediately, use check_terminal to monitor.\n' +
      '- offset/max_chars: Paginate large output. If truncated, note the remaining chars and re-read with offset.\n' +
      '- env: Set extra environment variables, e.g. {"NODE_ENV": "production"}.\n' +
      '- cwd: Working directory. If omitted, uses the session default (last used cwd or project root).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory. Default: last used cwd or project root' },
        timeout: {
          type: 'number',
          description: `Timeout in seconds. Default ${DEFAULT_TIMEOUT}s, max ${MAX_TIMEOUT}s. Increase for slow commands like npm install, cargo build.`,
        },
        env: {
          type: 'object',
          description: 'Extra environment variables, e.g. {"NODE_ENV": "production", "DEBUG": "1"}',
        },
        stream: {
          type: 'boolean',
          description: 'If true, run asynchronously (spawn) and return immediately with terminal ID. Use check_terminal to monitor progress. Good for: dev servers, watchers, tail -f.',
        },
        offset: {
          type: 'number',
          description: 'Start reading output from this character position. Use when previous output was truncated. Default: 0.',
        },
        max_chars: {
          type: 'number',
          description: `Max characters to return from stdout. Default: ${MAX_STDOUT}, max: 50000. Increase if output was truncated.`,
        },
      },
      required: ['command'],
    }),
    execute: async ({ command, cwd, timeout, env, stream, offset, max_chars }: {
      command: string
      cwd?: string
      timeout?: number
      env?: Record<string, string>
      stream?: boolean
      offset?: number
      max_chars?: number
    }) => {
      const id = 'term_' + Math.random().toString(36).slice(2, 8)

      // cwd 记忆：优先用传入 > session 默认 > 项目根
      const workDir = cwd || getSessionCwd() || _termWorkspaceRoot || '.'
      // 记住本次 cwd（流式模式也记住，方便后续命令复用）
      setSessionCwd(workDir)

      const effectiveTimeout = clampTimeout(timeout)
      const effectiveStream = stream === true

      // 后台进程检测
      const bgJobs = detectBackgroundJobs(command)
      let bgNotice = ''
      if (bgJobs.count > 0) {
        bgNotice = `\n[!] 检测到 ${bgJobs.count} 个后台进程 (&)。`
        if (bgJobs.count > 1 && bgJobs.hasWait) {
          bgNotice += ` 输出可能交错，建议拆分为多个独立 run_terminal 调用以获得清晰的输出标签。`
        } else {
          bgNotice += ` 后台进程的 stdout/stderr 可能与前台输出混合。`
        }
      }

      const term = createTerminal(id, command, workDir, effectiveStream)
      term.timeout = effectiveTimeout

      const permApi = (window as any).electronAPI?.perm
      const cmdPattern = command.split(/\s+/)[0] || command

      // 权限检查
      let alreadyAllowed = false
      try {
        if (permApi) alreadyAllowed = await permApi.check(_termWorkspaceRoot, 'terminal', cmdPattern)
      } catch { /* ignore */ }

      let confirmed = alreadyAllowed
      notifyUI({ type: 'terminal_created', terminal: { ...term } })

      if (!alreadyAllowed) {
        confirmed = await new Promise<boolean>((resolve) => {
          setResolver(id, async (ok, persist) => {
            if (persist) {
              try { await permApi?.grant(_termWorkspaceRoot, 'terminal', cmdPattern) } catch { /* ignore */ }
            }
            resolve(ok)
          })
          notifyUI({ type: 'terminal_confirm', terminal: { ...term } })
        })
        if (!confirmed) {
          updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          return `命令已被用户取消。`
        }
      }

      const api = (window as any).electronAPI?.terminal
      if (!api) {
        updateTerminal(id, {
          status: 'error',
          stderr: '终端 API 不可用——Sidecar 引擎可能未启动或已崩溃。请重启应用。',
          endTime: Date.now(),
        })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
        return '终端命令仅在桌面版本可用。如已在桌面端，请检查 Sidecar 引擎状态。'
      }

      // ====== 流式模式：使用 ptySpawn（PTY，支持 stdin） ======
      if (effectiveStream) {
        updateTerminal(id, { status: 'running' })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })

        try {
          // 用 ptySpawn（PTY）而非 spawn（pipe），这样 stdin 可用
          const spawnResult = await api.ptySpawn(id, command, workDir)
          if (!spawnResult.success) {
            updateTerminal(id, {
              status: 'error',
              stderr: spawnResult.error || 'PTY 启动失败',
              endTime: Date.now(),
            })
            notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
            return `流式命令启动失败: ${spawnResult.error || '未知错误'}`
          }

          // 记录历史
          addToHistory(command, workDir)

          return [
            `流式命令已启动（PTY 模式）${bgNotice}`,
            `终端 ID: ${id}`,
            `PID: ${spawnResult.pid || 'unknown'}`,
            `使用 check_terminal(terminal_id="${id}") 查看进度和输出。`,
            `使用 run_terminal_input(terminal_id="${id}", input="...") 发送输入。`,
          ].join('\n')
        } catch (e: any) {
          updateTerminal(id, {
            status: 'error',
            stderr: e.message || 'PTY 启动异常',
            endTime: Date.now(),
          })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          return `流式命令启动异常: ${e.message}`
        }
      }

      // ====== 同步模式：使用 execute ======
      updateTerminal(id, { status: 'running' })
      notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })

      try {
        const result = await api.execute(id, command, workDir, effectiveTimeout, env)
        const wasCancelled = getTerminal(id)?.status === 'cancelled'

        // 超时检测（IPC 超时报错在 error 字段，Rust 超时在 stderr）
        const isTimeout = result.stderr?.includes('超时') || result.stderr?.includes('timeout')
          || result.error?.includes('超时') || result.error?.includes('Sidecar 调用超时')
        if (!result.success && isTimeout) {
          updateTerminal(id, {
            status: 'error',
            stdout: result.stdout || '',
            stderr: `命令执行超时 (${effectiveTimeout}s)`,
            exitCode: -1,
            endTime: Date.now(),
          })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          return `命令执行超时 (${effectiveTimeout}s)。建议：\n1. 增大 timeout 参数重试（最大 ${MAX_TIMEOUT}s）\n2. 拆分命令为多个小步骤\n3. 使用 stream=true 异步执行长命令\n4. 检查命令是否有死循环或等待输入`
        }

        // EADDRINUSE 等错误模式检测
        const errorSuggestion = matchErrorPatterns(result.stderr || '', result.stdout || '')

        // 分页处理
        const { stdoutOut, stderrOut, notice } = paginateOutput(
          result.stdout || '', result.stderr || '', offset, max_chars,
        )

        updateTerminal(id, {
          status: wasCancelled ? 'cancelled' : result.success ? 'done' : 'error',
          stdout: result.stdout || '',
          stderr: result.stderr || result.error || '',
          exitCode: result.exitCode ?? (result.success ? 0 : -1),
          endTime: Date.now(),
        })

        if (wasCancelled) return '用户已取消该命令。'
      } catch (e: any) {
        const errMsg = e?.message || String(e)
        updateTerminal(id, {
          status: 'error',
          stderr: errMsg,
          exitCode: -1,
          endTime: Date.now(),
        })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })

        if (errMsg.includes('超时') || errMsg.includes('timeout')) {
          return `命令执行超时 (${effectiveTimeout}s)。建议增大 timeout 参数重试（最大 ${MAX_TIMEOUT}s）。`
        }
        return `命令执行异常: ${errMsg}`
      }

      notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
      const t = getTerminal(id)!

      // 记录命令历史
      addToHistory(command, workDir)

      // 分页处理（在已保存的完整输出上操作）
      const { stdoutOut, stderrOut, notice } = paginateOutput(t.stdout, t.stderr, offset, max_chars)
      const errorSuggestion = matchErrorPatterns(t.stderr, t.stdout)
      const progress = !t.status || t.status === 'done' ? null : detectProgress(t.stdout, t.stderr)

      const timingInfo = t.endTime && t.startTime
        ? ` (耗时 ${Math.round((t.endTime - t.startTime) / 1000)}s)`
        : ''

      // 后台进程 PID 提示
      let pidInfo = ''
      if (bgJobs.count > 0) {
        pidInfo = bgNotice
      }

      let result = notice
        + `命令执行${t.status === 'done' ? '完成' : '失败'}${timingInfo} (exit ${t.exitCode ?? '?'})`
        + pidInfo
      if (progress) result += `\n[progress] ${progress.percent ? `${progress.percent}%` : `${progress.current}/${progress.total}`}${progress.message ? ` - ${progress.message}` : ''}`
      if (stdoutOut) result += `\nstdout:\n${stdoutOut}`
      if (stderrOut) result += `\nstderr:\n${stderrOut}`
      if (!stdoutOut && !stderrOut) result += '\n(无输出)'
      if (errorSuggestion) result += errorSuggestion
      return result
    },
  }

  // ==================== check_terminal ====================
  tools['check_terminal'] = {
    description:
      'View output of a running or completed terminal command by its ID.\n' +
      'Use this to monitor long-running commands started with run_terminal (stream=true).\n' +
      'Returns the command status (running/done/error), exit code, PID, and accumulated output.\n' +
      'Also supports offset and max_chars for paginated reading of large outputs.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        terminal_id: { type: 'string', description: 'Terminal command ID from run_terminal output' },
        offset: { type: 'number', description: 'Start reading from this character position. Default: 0.' },
        max_chars: { type: 'number', description: `Max characters to return. Default: ${MAX_STDOUT}.` },
      },
      required: ['terminal_id'],
    }),
    execute: async ({ terminal_id, offset, max_chars }: {
      terminal_id: string
      offset?: number
      max_chars?: number
    }) => {
      const api = (window as any).electronAPI?.terminal
      const local = getTerminal(terminal_id)

      // 1) 流式进程：优先从 Rust sidecar 拉取累计输出
      if (local?.async || local?.status === 'running') {
        if (api) {
          try {
            const r = await api.check(terminal_id)
            if (r.found) {
              // 同步 Rust 输出到本地（保留 ANSI 供 UI 渲染）
              if (r.stdout) local.stdout = r.stdout
              if (r.stderr) local.stderr = r.stderr
              if (r.done) {
                local.status = (r.exitCode === 0) ? 'done' : 'error'
                local.exitCode = r.exitCode
                local.endTime = Date.now()
              }
              const statusLabel = r.done ? '[OK] 已完成' : '[...] 执行中'
              // AI 展示用：去 ANSI
              const cleanStdout = stripAnsi(r.stdout || '')
              const cleanStderr = stripAnsi(r.stderr || '')
              const { stdoutOut, stderrOut, notice } = paginateOutput(cleanStdout, cleanStderr, offset, max_chars)
              let msg = `${notice}终端 ${terminal_id}: ${statusLabel} (exit ${r.exitCode ?? '?'})${r.pid ? ` [PID: ${r.pid}]` : ''}`
              const stdoutLen = cleanStdout.length
              const stderrLen = cleanStderr.length
              if (stdoutOut) msg += `\nstdout (${stdoutLen} chars):\n${stdoutOut}`
              if (stderrOut) msg += `\nstderr (${stderrLen} chars):\n${stderrOut}`
              if (!stdoutOut && !stderrOut) msg += '\n(暂无输出)'
              // 如果进程已结束，清理本地记录
              if (r.done) {
                updateTerminal(terminal_id, { status: local.status, exitCode: r.exitCode, stdout: r.stdout || '', stderr: r.stderr || '', endTime: Date.now() })
                notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(terminal_id)! } })
              }
              return msg
            }
            // Rust 侧未找到（进程可能已结束并被清理），回退到本地
          } catch {
            // Rust 查询失败，回退到本地
          }
        }
      }

      // 2) 查本地 terminalManager
      if (local) {
        const statusLabel =
          local.status === 'running' ? '[...] 执行中' :
          local.status === 'done' ? '[OK] 已完成' :
          local.status === 'error' ? '[ERR] 失败' :
          local.status === 'cancelled' ? '[X] 已取消' :
          local.status
        const { stdoutOut, stderrOut, notice } = paginateOutput(local.stdout, local.stderr, offset, max_chars)

        let msg = `${notice}终端 ${terminal_id}: ${statusLabel} (exit ${local.exitCode ?? '?'})`
        if (local.timeout) msg += ` [timeout: ${local.timeout}s]`
        const stdoutLen = local.stdout.length
        const stderrLen = local.stderr.length
        if (stdoutOut) msg += `\nstdout (${stdoutLen} chars):\n${stdoutOut}`
        if (stderrOut) msg += `\nstderr (${stderrLen} chars):\n${stderrOut}`
        if (!stdoutOut && !stderrOut) msg += '\n(暂无输出)'
        return msg
      }

      // 3) 查询 Rust Sidecar（本地无记录）
      if (api) {
        const r = await api.check(terminal_id)
        if (r.found) {
          const statusLabel = r.done ? '[OK] 已完成' : '[...] 执行中'
          const { stdoutOut, stderrOut, notice } = paginateOutput(r.stdout || '', r.stderr || '', offset, max_chars)
          let msg = `${notice}终端 ${terminal_id}: ${statusLabel} (exit ${r.exitCode ?? '?'})${r.pid ? ` [PID: ${r.pid}]` : ''}`
          if (stdoutOut) msg += `\nstdout:\n${stdoutOut}`
          if (stderrOut) msg += `\nstderr:\n${stderrOut}`
          if (!stdoutOut && !stderrOut) msg += '\n(暂无输出)'
          return msg
        }
      }

      return `未找到终端 ${terminal_id}。可能已过期或 ID 不正确。`
    },
  }

  // ==================== run_terminal_input ====================
  tools['run_terminal_input'] = {
    description:
      'Send input to a running interactive terminal.\n' +
      'IMPORTANT: This only works with PTY-based terminals. For regular stream=true processes, stdin is not connected — use separate run_terminal calls instead.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        terminal_id: { type: 'string', description: 'Terminal ID of the running interactive process' },
        input: { type: 'string', description: 'Input text to send (include \\n to submit)' },
      },
      required: ['terminal_id', 'input'],
    }),
    execute: async ({ terminal_id, input }: { terminal_id: string; input: string }) => {
      const api = (window as any).electronAPI?.terminal
      if (!api?.ptyWrite) {
        return '交互式终端输入不可用（非桌面环境）。'
      }
      // 先检查进程是否存在
      if (api?.check) {
        const r = await api.check(terminal_id)
        if (!r.found) {
          return `终端 ${terminal_id} 不存在或已结束。请用 check_terminal 确认进程状态。`
        }
      }
      try {
        const result = await api.ptyWrite(terminal_id, input)
        if (result.success) {
          return `已发送输入到终端 ${terminal_id}。`
        }
        return `发送输入失败: ${result.error || '未知错误'}`
      } catch (e: any) {
        return `发送输入异常: ${e.message}`
      }
    },
  }

  // ==================== get_command_history ====================
  tools['get_command_history'] = {
    description: 'View recently executed terminal commands in this session. Useful for recalling previous command patterns, paths, or arguments.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return. Default: 20.' },
      },
    }),
    execute: async ({ limit }: { limit?: number }) => {
      const entries = getCommandHistory(limit || 20)
      if (entries.length === 0) return '暂无命令历史。'
      return entries.map((e, i) =>
        `[${i + 1}] ${new Date(e.timestamp).toLocaleTimeString()} ${e.cwd}$ ${e.command}`
      ).join('\n')
    },
  }
}

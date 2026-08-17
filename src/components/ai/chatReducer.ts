/**
 * 消息状态 reducer — 集中管理所有消息更新，对齐 Bubble Tea 理念
 *
 * 核心原则：
 * - 每条消息有稳定 id，不依赖数组索引定位
 * - 所有更新返回新数组，不修改原对象
 * - 通过 id 查找消息，不是 index
 */
import type { UIMessage, ToolCallStatus, MainTimelineItem, TerminalStatus } from '@/types/chat'

let _nextId = 1
export function nextMsgId() { return 'm' + (_nextId++) }

// 确保已加载的消息有 id（旧数据可能没有）
function ensureIds(msgs: UIMessage[]): UIMessage[] {
  return msgs.map(m => m.id ? m : { ...m, id: nextMsgId() })
}

export type MessageAction =
  | { type: 'RESET' }
  | { type: 'LOAD'; messages: UIMessage[] }
  // 基本消息
  | { type: 'ADD_USER'; content: string; attachments?: UIMessage['attachments'] }
  | { type: 'ADD_ASSISTANT'; modelName?: string }
  // 文本 delta（包含 thinking + timeline）
  | { type: 'TEXT_DELTA'; content: string; modelName?: string; thinking?: string; thinkingLoading?: boolean; mainTimeline?: MainTimelineItem[] }
  // reasoning delta（仅更新 thinking，不更新 content）
  | { type: 'REASONING_DELTA'; thinking: string; modelName?: string; mainTimeline?: MainTimelineItem[] }
  // 工具批
  | { type: 'TOOL_BATCH_CREATE'; textBeforeTool: string; tools: ToolCallStatus[]; thinkingDuration?: number }
  | { type: 'TOOL_BATCH_APPEND'; tools: ToolCallStatus[] }
  | { type: 'TOOL_BATCH_RESULT'; toolName: string; output: string; ok: boolean }
  | { type: 'TOOL_STREAM'; toolName: string; delta: string; done?: boolean; subtaskIndex?: number }
  | { type: 'DELEGATE_SUBTASK_START'; toolName: string; subtaskIndex: number; tier: string; agentType: string }
  | { type: 'DELEGATE_SUBTASK_END'; toolName: string; subtaskIndex: number; text: string; toolCalls: string[]; modelName: string }
  // 任务清单 - 归属到最后一条 assistant 消息
  | { type: 'UPDATE_TASK_LIST'; tasks: Array<{ id: string; title: string; status: string }> }
  | { type: 'COMPLETE_RUNNING_TASKS' }
  // 流结束
  | { type: 'STREAM_END'; streamed: string; thinkingDuration?: number }
  // 终端 / 文件操作
  | { type: 'ADD_TERMINAL'; terminal: TerminalStatus }
  | { type: 'UPDATE_TERMINAL'; terminal: TerminalStatus }
  | { type: 'ADD_FILEOP'; fileOp: any }
  | { type: 'UPDATE_FILEOP'; fileOp: any }
  | { type: 'ADD_WORKSPACEOP'; workspaceOp: import('@/types/chat').WorkspaceOpStatus }
  | { type: 'UPDATE_WORKSPACEOP'; workspaceOp: import('@/types/chat').WorkspaceOpStatus }
  // 清理旧工具内容
  | { type: 'CLEAR_OLD_TOOLS' }
  // ask_user 回复
  | { type: 'ADD_USER_REPLY'; content: string }
  // 中断/失败
  | { type: 'ABORT'; isAbort: boolean }
  | { type: 'RETRY_CLEAR' }

// 从后往前查找匹配的消息（用于更新不在末尾的消息）
function replaceLast(pred: (m: UIMessage) => boolean, update: (m: UIMessage) => UIMessage, msgs: UIMessage[]): UIMessage[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (pred(msgs[i])) {
      return [...msgs.slice(0, i), update(msgs[i]), ...msgs.slice(i + 1)]
    }
  }
  return msgs
}

export function messageReducer(state: UIMessage[], action: MessageAction): UIMessage[] {
  switch (action.type) {
    case 'RESET':
      return []

    case 'LOAD':
      return ensureIds(action.messages)

    case 'ADD_USER':
      return [...state, { id: nextMsgId(), role: 'user', content: action.content, attachments: action.attachments }]

    case 'ADD_ASSISTANT':
      return [...state, { id: nextMsgId(), role: 'assistant', content: '', streaming: true, modelName: action.modelName }]

    case 'TEXT_DELTA': {
      const last = state[state.length - 1]
      // 最后一条是 streaming assistant → 更新
      if (last?.role === 'assistant' && last.streaming) {
        return [...state.slice(0, -1), {
          ...last, content: action.content,
          thinking: action.thinking ?? last.thinking,
          thinkingLoading: action.thinkingLoading ?? last.thinkingLoading,
          mainTimeline: action.mainTimeline ?? (last as any).mainTimeline,
        }]
      }
      // 最后一条是已经停止的 assistant → 关闭它，开新的
      if (last?.role === 'assistant') {
        return [...state.slice(0, -1), { ...last, streaming: false },
          { id: nextMsgId(), role: 'assistant', content: action.content, streaming: true, modelName: action.modelName,
            thinking: action.thinking, thinkingLoading: action.thinkingLoading, mainTimeline: action.mainTimeline }]
      }
      // 其他情况（tool batch 之后）→ 直接加新的 streaming assistant
      return [...state,
        { id: nextMsgId(), role: 'assistant', content: action.content, streaming: true, modelName: action.modelName,
          thinking: action.thinking, thinkingLoading: action.thinkingLoading, mainTimeline: action.mainTimeline }]
    }

    case 'REASONING_DELTA': {
      const last = state[state.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        return [...state.slice(0, -1), { ...last, thinking: action.thinking, thinkingLoading: true, mainTimeline: action.mainTimeline ?? (last as any).mainTimeline }]
      }
      // 开新的 assistant 容器装 thinking
      const secondLast = state[state.length - 1]
      const base = secondLast?.role === 'assistant' ? [...state.slice(0, -1), { ...secondLast, streaming: false }] : state
      return [...base, { id: nextMsgId(), role: 'assistant', content: '', streaming: true, modelName: action.modelName,
        thinking: action.thinking, thinkingLoading: true, mainTimeline: action.mainTimeline }]
    }

    case 'TOOL_BATCH_CREATE': {
      // 工具调用来了 → 清空 content/timeline（echo），保留 thinking（上下文），
      // 消息保留以维持 API 历史链。thinkingLoading=false 防止残留转圈。
      const lastId = state.length - 1
      const last = state[lastId]
      const base = (last?.role === 'assistant' && last.streaming)
        ? [...state.slice(0, lastId), {
            ...last,
            content: '',
            thinkingLoading: false,
            thinkingDuration: action.thinkingDuration ?? (last as any).thinkingDuration,
            mainTimeline: undefined,
            streaming: false,
          }]
        : state
      return [...base, { id: nextMsgId(), role: 'tool', content: '', toolBatch: action.tools }] as UIMessage[]
    }

    case 'TOOL_BATCH_APPEND':
      return replaceLast(
        m => m.role === 'tool' && !!(m as any).toolBatch,
        m => ({ ...m, toolBatch: action.tools }),
        state,
      )

    case 'TOOL_BATCH_RESULT':
      return replaceLast(
        m => m.role === 'tool' && !!(m as any).toolBatch,
        m => {
          const batch = ((m as any).toolBatch || []) as ToolCallStatus[]
          const MAX = 30000
          return {
            ...m,
            toolBatch: batch.map(t => {
              if (t.name === action.toolName) {
                const raw = action.output
                let delegateMeta: any = undefined
                let result = raw
                try {
                  const parsed = JSON.parse(raw)
                  if (parsed.__delegate) {
                    delegateMeta = {
                      tier: parsed.tier,
                      agentType: parsed.agentType,
                      modelName: parsed.modelName,
                      toolCalls: parsed.toolCalls || [],
                    }
                    result = parsed.text
                  } else if (parsed.__delegate_batch) {
                    delegateMeta = {
                      tier: 'balanced',
                      agentType: 'general',
                      modelName: '',
                      toolCalls: [],
                      subTasks: parsed.subTasks,
                    }
                    result = parsed.subTasks?.map((s: any) => `### 子任务 ${s.index + 1}\n${s.text}`).join('\n\n') || raw
                  }
                } catch {}
                const truncated = result.length > MAX ? result.slice(0, MAX) + `\n... (${result.length} chars)` : result
                return { ...t, status: action.ok ? 'done' as const : 'error' as const, result: result.length > 50000 ? result.slice(0, 50000) + `\n... (${result.length} chars)` : result, _output: truncated, delegateMeta }
              }
              return t
            }),
          }
        },
        state,
      )

    case 'TOOL_STREAM':
      return replaceLast(
        m => m.role === 'tool' && !!(m as any).toolBatch,
        m => ({
          ...m,
          toolBatch: ((m as any).toolBatch || []).map((t: any) => {
            if (t.name === action.toolName) {
              // 子任务流式输入：路由到对应的 subTask
              if (action.subtaskIndex != null && t.delegateMeta?.subTasks) {
                const subs = t.delegateMeta.subTasks.map((s: any) =>
                  s.index === action.subtaskIndex ? { ...s, text: (s.text || '') + action.delta } : s
                )
                return {
                  ...t,
                  result: (t.result || '') + action.delta,
                  status: action.done ? 'done' as const : 'running' as const,
                  delegateMeta: { ...t.delegateMeta, subTasks: subs },
                }
              }
              return {
                ...t,
                result: (t.result || '') + action.delta,
                status: action.done ? 'done' as const : 'running' as const,
              }
            }
            return t
          }),
        }),
        state,
      )

    case 'DELEGATE_SUBTASK_START':
      return replaceLast(
        m => m.role === 'tool' && !!(m as any).toolBatch,
        m => ({
          ...m,
          toolBatch: ((m as any).toolBatch || []).map((t: any) => {
            if (t.name === action.toolName) {
              const existing = t.delegateMeta?.subTasks || []
              const subs = [...existing.filter((s: any) => s.index !== action.subtaskIndex), {
                index: action.subtaskIndex,
                tier: action.tier,
                agentType: action.agentType,
                modelName: '',
                text: '',
                toolCalls: [],
              }]
              return {
                ...t,
                status: 'running' as const,
                delegateMeta: { tier: 'balanced', agentType: 'general', modelName: '', toolCalls: [], subTasks: subs },
              }
            }
            return t
          }),
        }),
        state,
      )

    case 'DELEGATE_SUBTASK_END':
      return replaceLast(
        m => m.role === 'tool' && !!(m as any).toolBatch,
        m => ({
          ...m,
          toolBatch: ((m as any).toolBatch || []).map((t: any) => {
            if (t.name === action.toolName) {
              const subs = (t.delegateMeta?.subTasks || []).map((s: any) =>
                s.index === action.subtaskIndex
                  ? { ...s, text: action.text, toolCalls: action.toolCalls, modelName: action.modelName }
                  : s
              )
              const allDone = subs.every((s: any) => s.text)
              return {
                ...t,
                status: allDone ? 'done' as const : 'running' as const,
                delegateMeta: { ...(t.delegateMeta || {}), subTasks: subs },
              }
            }
            return t
          }),
        }),
        state,
      )

    case 'UPDATE_TASK_LIST':
      // 先清掉所有历史消息的 taskList，再写到当前最后一条 assistant
      return replaceLast(
        (m) => m.role === 'assistant',
        (m) => ({ ...m, taskList: action.tasks }),
        state.map(m => m.taskList ? { ...m, taskList: undefined } : m),
      )

    case 'COMPLETE_RUNNING_TASKS':
      return replaceLast(
        (m) => m.role === 'assistant' && (m.taskList?.some(t => t.status === 'running') ?? false),
        (m) => ({ ...m, taskList: m.taskList?.map(t => t.status === 'running' ? { ...t, status: 'done' as const } : t) }),
        state,
      )

    case 'STREAM_END': {
      const lastId = state.length - 1
      const last = state[lastId]
      if (last?.role === 'assistant' && last.streaming) {
        if (action.streamed) {
          return [...state.slice(0, lastId), { ...last, content: action.streamed, streaming: false, thinkingDuration: action.thinkingDuration ?? (last as any).thinkingDuration }]
        }
        return state.slice(0, lastId)  // 空内容：移除
      }
      return state
    }

    case 'ADD_TERMINAL':
      return [...state, { id: nextMsgId(), role: 'assistant', content: '', terminal: action.terminal, streaming: false } as UIMessage]

    case 'UPDATE_TERMINAL':
      return replaceLast(
        m => !!(m as any).terminal && (m as any).terminal.id === action.terminal.id,
        m => ({ ...m, terminal: { ...action.terminal } }),
        state,
      )

    case 'ADD_FILEOP':
      return [...state, { id: nextMsgId(), role: 'assistant', content: '', fileOp: action.fileOp, streaming: false } as UIMessage]

    case 'UPDATE_FILEOP':
      return replaceLast(
        m => !!(m as any).fileOp && (m as any).fileOp.id === action.fileOp.id,
        m => ({ ...m, fileOp: { ...action.fileOp } }),
        state,
      )

    case 'CLEAR_OLD_TOOLS':
      if (state.length <= 20) return state
      const keepFrom = Math.max(0, state.length - 15)
      return state.filter((m, i) => {
        if (m.role !== 'tool') return true
        return i >= keepFrom
      })

    case 'ADD_WORKSPACEOP':
      return [...state.filter(m => !((m as any).workspaceOp?.id === action.workspaceOp.id)), { id: nextMsgId(), role: 'assistant', content: '', workspaceOp: action.workspaceOp, streaming: false } as UIMessage]

    case 'UPDATE_WORKSPACEOP': {
      const updated = replaceLast(
        m => !!(m as any).workspaceOp && (m as any).workspaceOp.id === action.workspaceOp.id,
        m => ({ ...m, workspaceOp: { ...action.workspaceOp } }),
        state,
      )
      if (updated === state) {
        return [...state, { id: nextMsgId(), role: 'assistant', content: '', workspaceOp: action.workspaceOp, streaming: false } as UIMessage]
      }
      return updated
    }

    case 'ABORT':
      return state.map(m => {
        if (m.role === 'assistant' && m.streaming) return { ...m, content: (m.content || '') + '\n\n*[' + (action.isAbort ? '用户已中断' : '连接失败') + ']*', streaming: false }
        if (m.role === 'tool' && (m as any).toolCall?.status === 'running') return { ...m, toolCall: { ...(m as any).toolCall, status: 'error', result: action.isAbort ? '[已中断]' : '[连接失败]' } }
        return m
      })

    default:
      return state
  }
}

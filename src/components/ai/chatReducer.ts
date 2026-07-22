/**
 * 消息状态 reducer — 集中管理所有消息更新，对齐 Bubble Tea 理念
 *
 * 核心原则：
 * - 每条消息有稳定 id，不依赖数组索引定位
 * - 所有更新返回新数组，不修改原对象
 * - 通过 id 查找消息，不是 index
 */
import type { UIMessage, ToolCallStatus, AgentTimelineItem, MainTimelineItem, TerminalStatus } from '@/types/chat'

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
  | { type: 'TOOL_STREAM'; toolName: string; delta: string; done?: boolean }
  // Agent 容器
  | { type: 'AGENT_THINKING'; label: string; thinking: string; thinkingLoading: boolean; agentTimeline: AgentTimelineItem[] }
  | { type: 'AGENT_TEXT'; label: string; content: string; agentTimeline: AgentTimelineItem[]; thinking: string }
  | { type: 'AGENT_DONE'; label: string; content: string; agentTimeline: AgentTimelineItem[]; thinking: string }
  // 流结束
  | { type: 'STREAM_END'; streamed: string; thinkingDuration?: number }
  // 终端 / 文件操作 / Git 操作
  | { type: 'ADD_TERMINAL'; terminal: TerminalStatus }
  | { type: 'UPDATE_TERMINAL'; terminal: TerminalStatus }
  | { type: 'ADD_FILEOP'; fileOp: any }
  | { type: 'UPDATE_FILEOP'; fileOp: any }
  | { type: 'ADD_GITOP'; gitOp: import('@/types/chat').GitOpStatus }
  | { type: 'UPDATE_GITOP'; gitOp: import('@/types/chat').GitOpStatus }
  | { type: 'ADD_WORKSPACEOP'; workspaceOp: import('@/types/chat').WorkspaceOpStatus }
  | { type: 'UPDATE_WORKSPACEOP'; workspaceOp: import('@/types/chat').WorkspaceOpStatus }
  | { type: 'ADD_GITHUBOP'; githubOp: import('@/types/chat').GitHubOpStatus }
  | { type: 'UPDATE_GITHUBOP'; githubOp: import('@/types/chat').GitHubOpStatus }
  | { type: 'UPSERT_TASK_SNAPSHOT'; taskSnapshot: import('@/types/chat').TaskSnapshot }
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
            agentTimeline: undefined,
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
                const truncated = raw.length > MAX ? raw.slice(0, MAX) + `\n... (${raw.length} chars)` : raw
                return { ...t, status: action.ok ? 'done' as const : 'error' as const, result: raw.length > 50000 ? raw.slice(0, 50000) + `\n... (${raw.length} chars)` : raw, _output: truncated }
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

    case 'AGENT_THINKING': {
      const lastId = state.length - 1
      const last = state[lastId]
      const hasContainer = last?.role === 'assistant' && last.modelName === action.label
      if (hasContainer) {
        return [...state.slice(0, lastId), { ...last, thinking: action.thinking, thinkingLoading: true, agentTimeline: action.agentTimeline as any }]
      }
      const base = (last?.role === 'assistant' && last.streaming)
        ? [...state.slice(0, lastId), { ...last, streaming: false }]
        : state
      return [...base, { id: nextMsgId(), role: 'assistant', content: '', streaming: true, modelName: action.label, agentTimeline: action.agentTimeline as any, thinking: action.thinking, thinkingLoading: true }]
    }
    case 'AGENT_TEXT':
    case 'AGENT_DONE': {
      const lastId = state.length - 1
      const last = state[lastId]
      const streaming = action.type !== 'AGENT_DONE'
      const hasContainer = last?.role === 'assistant' && last.modelName === action.label
      if (hasContainer) {
        return [...state.slice(0, lastId), {
          ...last, content: action.content, streaming,
          agentTimeline: action.agentTimeline as any, thinking: (action as any).thinking,
          thinkingLoading: false,
        }]
      }
      const base = (last?.role === 'assistant' && last.streaming)
        ? [...state.slice(0, lastId), { ...last, streaming: false }]
        : state
      return [...base, {
        id: nextMsgId(), role: 'assistant', content: action.content, streaming,
        modelName: action.label, agentTimeline: action.agentTimeline as any,
        thinking: (action as any).thinking, thinkingLoading: false,
      }]
    }

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

    case 'ADD_GITOP':
      // 先清理同 id 的旧消息（防重复），再追加
      return [...state.filter(m => !((m as any).gitOp?.id === action.gitOp.id)), { id: nextMsgId(), role: 'assistant', content: '', gitOp: action.gitOp, streaming: false } as UIMessage]

    case 'UPDATE_GITOP': {
      const updated = replaceLast(
        m => !!(m as any).gitOp && (m as any).gitOp.id === action.gitOp.id,
        m => ({ ...m, gitOp: { ...action.gitOp } }),
        state,
      )
      // 找不到匹配消息时（极端边界情况），直接追加 done/error 消息
      if (updated === state) {
        return [...state, { id: nextMsgId(), role: 'assistant', content: '', gitOp: action.gitOp, streaming: false } as UIMessage]
      }
      return updated
    }

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

    case 'ADD_GITHUBOP':
      return [...state.filter(m => !((m as any).githubOp?.id === action.githubOp.id)), { id: nextMsgId(), role: 'assistant', content: '', githubOp: action.githubOp, streaming: false } as UIMessage]

    case 'UPDATE_GITHUBOP': {
      const updated = replaceLast(
        m => !!(m as any).githubOp && (m as any).githubOp.id === action.githubOp.id,
        m => ({ ...m, githubOp: { ...action.githubOp } }),
        state,
      )
      if (updated === state) {
        return [...state, { id: nextMsgId(), role: 'assistant', content: '', githubOp: action.githubOp, streaming: false } as UIMessage]
      }
      return updated
    }

    case 'UPSERT_TASK_SNAPSHOT':
      // 同一轮对话中，替换最后一个 taskSnapshot 消息（避免重复积压）
      return replaceLast(
        m => !!(m as any).taskSnapshot,
        m => ({ ...m, taskSnapshot: action.taskSnapshot }),
        [...state, { id: nextMsgId(), role: 'assistant', content: '', taskSnapshot: action.taskSnapshot, streaming: false } as UIMessage],
      )

    case 'ADD_USER_REPLY':
      return [...state, { id: nextMsgId(), role: 'user', content: action.content }]

    case 'RETRY_CLEAR': {
      // 截断重试：移除最后一条流式消息（含残缺文本），后续重试从新消息开始
      const lastRetry = state[state.length - 1]
      if (lastRetry?.role === 'assistant' && lastRetry.streaming) {
        return state.slice(0, -1)
      }
      return state
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

import { useState, useRef, useEffect, useCallback, useReducer } from 'react'
import {
  ArrowRight, Loader2, Bot, X, ListTodo, Circle, CheckCircle2, File,
  FileText, Image, FolderOpen, ExternalLink, ArrowLeft, ArrowDown, Plus, Upload,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { chat, setAgentUIHandler, setTerminalUIHandler, type ChatStreamEvent, type AskUserEvent } from '@/lib/chatService'
import type { ChatMessage as ChatMessageType } from '../lib/api'
import { formatDuration, estimateTokens } from '@/lib/observability'
import { ContextWindowManager } from '@/lib/contextWindowManager'
import { useKonamiCode } from '@/hooks/useKonamiCode'
import { useModelLoader } from '@/hooks/useModelLoader'
import { ChatMessage } from './ChatMessage'
import { AskUserBar } from './AskUserBar'
import { ChatConsole } from './ChatConsole'
import { ModelPicker } from './ModelPicker'
import { ConversationBar, type ConvInfo } from './ConversationBar'
import { MCPToolPicker } from './MCPToolPicker'
import type { DisclosureResult } from '@/lib/toolDisclosure'
import { getCtxWindow, getModelTier, getThinkingLevel, saveThinkingLevel, thinkingBudget, type ThinkingLevel } from '@/lib/config'
import { initMemoryStore, getInjectionText } from '@/lib/memory/service'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/hooks/useWorkspace'
import { projectStore } from '@/lib/projectStore'
import { pluginSystem } from '@/lib/pluginSystem'
import { setSandboxOutputDir } from '@/lib/tools/sandbox'
import { setWorkspaceRoots } from '@/lib/tools/workspace'
import { setGitWorkspaceRoot } from '@/lib/tools/git'
import { setTermWorkspaceRoot } from '@/lib/tools/terminal'
import { killAll as killAllTerminals } from '@/lib/terminalManager'
import { messageReducer, nextMsgId, type MessageAction } from './chatReducer'
import {
  type ToolCallStatus, type UIMessage, type ConsoleLine,
  type CompressionEventData,
  detectToolType,
} from '@/types/chat'
import { TokenUsageBar } from './TokenUsageBar'
import WelcomeHero from './WelcomeHero'
import Strands from './Strands'
import { addTrace } from '@/lib/traceStore'

/** 从 tool input 提取简要描述，用于区分同名调用 */
function briefArgs(input: any): string {
  if (!input || typeof input !== 'object') return ''
  // 取第一个有意义的字段作为摘要
  const keys = Object.keys(input).filter(k => !['code', 'input', 'description'].includes(k))
  const firstKey = keys[0]
  if (!firstKey) return ''
  const val = input[firstKey]
  if (typeof val === 'string') return val.length > 30 ? val.slice(0, 30) + '…' : val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return firstKey
}

const PROJECT_ID_KEY = 'stardust_currentProjectId'

function loadProjectId(): string | null {
  try { return localStorage.getItem(PROJECT_ID_KEY) } catch { return null }
}
function saveProjectId(pid: string | null) {
  try { if (pid) localStorage.setItem(PROJECT_ID_KEY, pid); else localStorage.removeItem(PROJECT_ID_KEY) } catch {}
}

/**
 * 将 UI 消息列表转换为 API 格式（ChatMessage 数组）。
 *
 * UIMessage 的工具调用存储为 toolBatch（数组），而 ChatMessage 需要
 * 展开为独立的 assistant（含 toolCalls）和 tool（含 toolCallId）消息。
 * 不转换会导致 API 收不到工具调用历史，模型丢失上下文。
 */
function buildHistory(
  messages: UIMessage[],
  userMsg: UIMessage,
  finalContent: string | any[],
): ChatMessageType[] {
  const allMsgs = [...messages, userMsg]
  const result: ChatMessageType[] = []

  for (let i = 0; i < allMsgs.length; i++) {
    const m = allMsgs[i]
    // 跳过流式/终端/文件操作消息
    if (m.streaming || (m as any).terminal || (m as any).fileOp) continue
    if (m.modelName?.startsWith('Agent:')) continue  // Agent 子对话不纳入历史

    const isLast = i === allMsgs.length - 1

    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: isLast ? finalContent : m.content,
      })
      continue
    }

    if (m.role === 'assistant') {
      // 检查下一条消息是否为工具批
      const next = allMsgs[i + 1]
      const toolBatch: ToolCallStatus[] | undefined =
        next?.role === 'tool' ? (next as any).toolBatch : undefined
      const toolCall: ToolCallStatus | undefined = (m as any).toolCall

      if (toolBatch && toolBatch.length > 0) {
        // assistant → 写入 toolCalls
        result.push({
          role: 'assistant',
          content: m.content || '',
          toolCalls: toolBatch.map(tc => ({
            id: tc.id,
            name: tc.name,
            input: tc.input,
          })),
        })
        i++ // 跳过工具批 UIMessage
        // 展开为独立的 tool 结果消息（API 要求每个 tool_call_id 都有对应 tool 消息）
        for (const tc of toolBatch) {
          result.push({
            role: 'tool',
            content: tc.result || '(无输出)',
            toolCallId: tc.id,
          })
        }
      } else if (toolCall) {
        // 旧格式：单个工具调用
        result.push({
          role: 'assistant',
          content: m.content || '',
          toolCalls: [{ id: toolCall.id, name: toolCall.name, input: toolCall.input }],
        })
      } else {
        // 纯文本 assistant
        result.push({ role: 'assistant', content: m.content || '' })
      }
      continue
    }

    if (m.role === 'tool') {
      const batch: ToolCallStatus[] | undefined = (m as any).toolBatch
      if (batch && batch.length > 0) {
        // 展开为独立的 tool 消息
        for (const tc of batch) {
          result.push({
            role: 'tool',
            content: tc.result || '',
            toolCallId: tc.id,
          })
        }
      }
      continue
    }
  }

  return result
}

export function ChatPage() {
  const { user } = useAuth()
  const [messages, dispatch] = useReducer(messageReducer, [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentProjectId, setCurrentProjectIdRaw] = useState<string | null>(loadProjectId)
  const setCurrentProjectId = useCallback((pid: string | null) => {
    saveProjectId(pid)
    setCurrentProjectIdRaw(pid)
  }, [])
  const { configuredModels, activeModel, setActiveModel, refreshModels } = useModelLoader()
  const workspace = useWorkspace(currentProjectId)
  const projectSettings = currentProjectId ? projectStore.getById(currentProjectId)?.settings : null
  // 插件工具列表
  const pluginToolEntries = (() => {
    const tools = pluginSystem.getPluginTools()
    return Object.entries(tools).map(([name, t]: [string, any]) => ({
      name,
      description: t.description || '',
    }))
  })()
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [autoMode, setAutoMode] = useState(true)
  const [routeScore, setRouteScore] = useState(0)
  const [routeModel, setRouteModel] = useState('')
  const [outputFiles, setOutputFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [statusText, setStatusText] = useState('')
  const [consoleLog, setConsoleLog] = useState<ConsoleLine[]>([])
  const [showConsole, setShowConsole] = useState(false)
  const [askUser, setAskUser] = useState<AskUserEvent | null>(null)
  const [askUserAnswer, setAskUserAnswer] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  const [taskList, setTaskList] = useState<Array<{ id: string; title: string; status: string }>>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const workspaceBtnRef = useRef<HTMLButtonElement>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [workspaceEntries, setWorkspaceEntries] = useState<Array<{ name: string; path: string; isDir: boolean }>>([])
  const [disclosureResult, setDisclosureResult] = useState<DisclosureResult | null>(null)
  const [lastRealInputTokens, setLastRealInputTokens] = useState(0)  // 上一轮 API 返回的真实 inputTokens
  // 本轮实际激活的工具名（用于披露面板展示）
  const [activatedToolNames, setActivatedToolNames] = useState<Set<string>>(new Set())
  // 思考等级
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(getThinkingLevel)
  // + 子菜单
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  // @ 文件选择
  const [atFiles, setAtFiles] = useState<Array<{ name: string; path: string; isDir: boolean }>>([])
  const [showAtPicker, setShowAtPicker] = useState(false)
  const atQueryRef = useRef('')
  // 对话管理
  const [convId, setConvId] = useState<string | null>(null)
  const [convTitle, setConvTitle] = useState('新对话')
  const [convList, setConvList] = useState<ConvInfo[]>([])
  const [compressionInfo, setCompressionInfo] = useState<CompressionEventData | null>(null)
  const [compressing, setCompressing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const convIdRef = useRef<string | null>(null)  // 始终指向当前 convId，避免闭包捕获旧值
  const forceCompressRef = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<UIMessage[]>([])
  // enable_tool 代理映射：AI SDK 工具名 → 实际显示名
  const toolNameProxyRef = useRef<Map<string, string>>(new Map())
  // 思考过程累积
  const thinkingRef = useRef('')
  const thinkingStartRef = useRef(0)  // 思考开始时间戳
  const mainTimelineRef = useRef<Array<{ type: 'thinking'; content: string } | { type: 'text'; content: string }>>([])
  // Agent 流式输出跟踪 + 累计消耗
  const toolBatchRef = useRef<ToolCallStatus[]>([])  // 并行工具 batch
  // 初始化记忆存储（项目切换时自动更新）
  useEffect(() => {
    initMemoryStore(() => workspace.root || null)
  }, [workspace.root])
  const logId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingUpdateRef = useRef<(() => void) | null>(null)
  const rafRef = useRef(0)
  const streamTickRef = useRef(0)

  // 节流消息更新：流式期间 ~33ms（30fps），够平滑但减少渲染压力
  const tickMessages = useCallback((fn: () => void) => {
    const now = Date.now()
    const interval = 33  // 30fps — 流式文字不需要 60fps
    if (now - streamTickRef.current < interval) {
      pendingUpdateRef.current = fn
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          streamTickRef.current = Date.now()
          pendingUpdateRef.current?.()
          pendingUpdateRef.current = null
        })
      }
      return
    }
    streamTickRef.current = now
    fn()
  }, [])
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  useEffect(() => { messagesRef.current = messages }, [messages])

  // 渲染同步，确保事件回调里读到最新 streaming 状态
  const streamingRef = useRef(false)
  streamingRef.current = messages.some(m => m.streaming)

  // 判断用户当前是否在底部（用实际 scroll 位置，不用 ref 记意图）
  // 纯 DOM 层跟底——不依赖 React useEffect，避免与渲染循环竞争
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let atBottom = true

    // scroll 事件：用户手动滚动时更新状态
    const onScroll = () => {
      atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    // ResizeObserver：内容高度变化 → 用户在底部才跟底
    let scrollRaf = 0
    const ro = new ResizeObserver(() => {
      if (!atBottom) return
      // RAF 延迟，避免在 layout 阶段写 scrollTop 导致 thrashing
      cancelAnimationFrame(scrollRaf)
      scrollRaf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    })
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])

  // 显示"回到底部"按钮
  useEffect(() => {
    if (!streamingRef.current) return
    const el = scrollRef.current
    if (!el) return
    const check = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight >= 80)
    const id = requestAnimationFrame(check)
    return () => cancelAnimationFrame(id)
  }, [messages])

  // 流式结束时重置 + 旧工具结果清理（仅清理一次，防无限循环）
  const cleanedVersionRef = useRef(0)
  useEffect(() => {
    const streaming = messages.some(m => m.streaming)
    if (!streaming && messages.length > 0) {
      setShowScrollBtn(false)
      if (messages.length > 20 && cleanedVersionRef.current !== messages.length) {
        const needsClean = messages.some((m, i) =>
          m.role === 'tool' && i < messages.length - 15 && m.content && m.content.length > 100
        )
        if (needsClean) {
          cleanedVersionRef.current = messages.length
          dispatch({ type: 'CLEAR_OLD_TOOLS' })
        }
      }
    }
  }, [messages])

  // 点击按钮：滚到底部（下一帧自动跟底会自然接上）
  const scrollToBottom = useCallback(() => {
    setShowScrollBtn(false)
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' })
  }, [])

  const pushLog = (icon: string, msg: string, status: ConsoleLine['status'] = 'info') => {
    const id = ++logId.current
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setConsoleLog(prev => [...prev.slice(-200), { id, time, icon, msg, status }])
  }

  useEffect(() => { messagesRef.current = messages }, [messages])
  // 加载对话列表
  const loadConvList = useCallback(async () => {
    if (!window.electronAPI?.conv) return
    const list = await window.electronAPI.conv.list(currentProjectId)
    setConvList(list)
  }, [currentProjectId])
  useEffect(() => { projectStore.init() }, [])
  // 切换对话时重置
  useEffect(() => {
    setDisclosureResult(null)
  }, [convId, currentProjectId])
  useEffect(() => { loadConvList() }, [loadConvList])

  // 保存当前对话（消息变化时，含压缩快照）
  useEffect(() => {
    if (!convId || !window.electronAPI?.conv || messages.length === 0) return
    const modelName = activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : undefined
    const compression = compressionInfo ? {
      originalTokens: compressionInfo.originalTokens,
      compressedTokens: compressionInfo.compressedTokens,
      limit: compressionInfo.limit,
      summary: compressionInfo.summary,
      messageCount: messages.length,
    } : undefined
    window.electronAPI.conv.save({
      id: convId, title: convTitle, messages, modelName,
      projectId: currentProjectId, createdAt: '', updatedAt: new Date().toISOString(),
      compression,
    } as any)
    // 更新列表
    setConvList(prev => prev.map(c => c.id === convId ? { ...c, title: convTitle, messageCount: messages.length, updatedAt: new Date().toISOString() } : c))
  }, [messages, convId, convTitle, activeModel, compressionInfo])

  const refreshOutputs = useCallback(async () => {
    if (!workspace.output) return
    try {
      const api = window.electronAPI?.fs
      if (!api) return
      const result = await api.listDir(workspace.output)
      if (result.success && result.files) {
        const files: Array<{ name: string; path: string; size: number }> = []
        for (const name of result.files) {
          const p = `${workspace.output}/${name}`
          try {
            const stat = await api.stat(p)
            files.push({ name, path: p, size: stat.success ? stat.stat?.size ?? 0 : 0 })
          } catch { files.push({ name, path: p, size: 0 }) }
        }
        setOutputFiles(files.sort((a, b) => b.name.localeCompare(a.name)))
      }
    } catch {}
  }, [])
  useEffect(() => { refreshOutputs() }, [messages, refreshOutputs])

  // 同步当前工作区到沙箱
  useEffect(() => { setSandboxOutputDir(workspace.output || undefined) }, [workspace.output])
  useEffect(() => { setWorkspaceRoots(workspace.root, workspace.output); setGitWorkspaceRoot(workspace.root); setTermWorkspaceRoot(workspace.root) }, [workspace.root, workspace.output])

  // 展开选择器时刷新 + 外部点击关闭
  useEffect(() => {
    if (showModelPicker) refreshModels()
    if (!showModelPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowModelPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelPicker, refreshModels])

  useKonamiCode(useCallback(() => setShowConsole(v => !v), []))

  // Agent UI 事件
  useEffect(() => {
    setAgentUIHandler((event) => {
      if (event.type === 'ask_user') { setAskUser(event); setAskUserAnswer('') }
      else if (event.type === 'show_progress') {
        const pct = event.current != null && event.total != null ? ` (${event.current}/${event.total})` : ''
        setProgressMsg(event.message + pct)
      } else if (event.type === 'notify_complete') {
        setProgressMsg('')
        setTaskList(prev => prev.map(t => t.status === 'running' ? { ...t, status: 'done' } : t))
        pushLog('OK', event.message + (event.result ? ` -- ${event.result}` : ''), 'ok')
      } else if (event.type === 'update_task_list') {
        setTaskList((prev) => {
          const map = new Map(prev.map(t => [t.id, t]))
          for (const t of event.tasks) {
            const existing = map.get(t.id)
            map.set(t.id, { ...existing, ...t, title: t.title || existing?.title || '' })
          }
          return Array.from(map.values())
        })
      }
    })
    return () => setAgentUIHandler(null)
  }, [])

  // 终端 UI 事件
  useEffect(() => {
    setTerminalUIHandler((event: any) => {
      if (event.type === 'terminal_created') {
        dispatch({ type: 'ADD_TERMINAL', terminal: event.terminal })
      } else if (event.type === 'terminal_updated') {
        dispatch({ type: 'UPDATE_TERMINAL', terminal: event.terminal })
      }
    })
    return () => { setTerminalUIHandler(() => {}) }
  }, [])

  // 文件操作 UI 事件（用 DOM 事件，避免模块级变量 HMR 后丢失）
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const event = e.detail
      if (event.type === 'fileop_created') {
        dispatch({ type: 'ADD_FILEOP', fileOp: event.fileOp })
      } else if (event.type === 'fileop_updated') {
        dispatch({ type: 'UPDATE_FILEOP', fileOp: event.fileOp })
      }
    }
    window.addEventListener('stardust:fileop', handler as EventListener)
    return () => window.removeEventListener('stardust:fileop', handler as EventListener)
  }, [])

  // 新对话
  const handleNewConv = useCallback(async () => {
    abortRef.current?.abort()  // 中止当前输出
    abortRef.current = null
    setLoading(false)
    const api = window.electronAPI?.conv
    if (!api) return
    const project = currentProjectId ? projectStore.getById(currentProjectId) : null
    const c = await api.create('新对话', undefined, currentProjectId, project?.name)
    setConvId(c.id); setConvTitle('新对话'); dispatch({ type: 'RESET' }); setCompressionInfo(null); convIdRef.current = c.id
    setDisclosureResult(null); setActivatedToolNames(new Set())
    setConvList(prev => [{ id: c.id, title: '新对话', messageCount: 0, updatedAt: c.updatedAt, projectId: currentProjectId }, ...prev])
  }, [currentProjectId])

  // 切换对话
  const handleSwitchConv = useCallback(async (id: string) => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    const api = window.electronAPI?.conv
    if (!api) return
    const c = await api.get(id)
    if (c) {
      setConvId(c.id); setConvTitle(c.title); dispatch({ type: 'LOAD', messages: c.messages || [] }); convIdRef.current = c.id
      setDisclosureResult(null); setActivatedToolNames(new Set())
      // 恢复压缩状态（若消息数未变化则有效，否则视为过期）
      const snap = (c as any).compression
      if (snap && snap.messageCount === (c.messages || []).length) {
        setCompressionInfo({
          wasCompressed: true,
          originalTokens: snap.originalTokens,
          compressedTokens: snap.compressedTokens,
          limit: snap.limit,
          summary: snap.summary,
        })
      } else {
        setCompressionInfo(null)
      }
    }
  }, [])

  // 删除对话
  const handleDeleteConv = useCallback(async (id: string) => {
    await window.electronAPI?.conv?.delete(id)
    setConvList(prev => prev.filter(c => c.id !== id))
    if (convId === id) {
      const remaining = convList.filter(c => c.id !== id)
      if (remaining.length > 0) { handleSwitchConv(remaining[0].id) }
      else { handleNewConv() }
    }
  }, [convId, convList, handleSwitchConv, handleNewConv])

  // 重命名对话
  const handleRenameConv = useCallback(async (id: string, title: string) => {
    setConvTitle(title)
    setConvList(prev => prev.map(c => c.id === id ? { ...c, title } : c))
    const c = await window.electronAPI?.conv?.get(id)
    if (c) window.electronAPI?.conv?.save({ ...c, title })
  }, [])

  // 自动标题（首条消息后异步生成，使用云端 fast 模型）
  const generateTitle = useCallback(async (cid: string, userText: string, aiText: string) => {
    try {
      const prompt = `根据以下对话生成一个简短的标题（3-8个字，直接输出标题不要解释）：\n用户: ${userText.slice(0, 100)}\nAI: ${aiText.slice(0, 200)}`

      const { delegateToModel } = await import('@/lib/chatService')
      const res = await delegateToModel('fast', prompt)
      const t = res.result.trim().slice(0, 40) || '新对话'
      setConvTitle(t); setConvList(prev => prev.map(c => c.id === cid ? { ...c, title: t } : c))
    } catch {}
  }, [])

  // 共用：处理文件路径列表，创建附件并转换文档
  const processFiles = useCallback(async (filePaths: string[]) => {
    if (!window.electronAPI?.file) return
    const newAttachments: Attachment[] = filePaths.map((fp) => {
      const name = fp.split('/').pop() || fp
      const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(name.split('.').pop()?.toLowerCase() || '')
      return { id: 'att_' + Math.random().toString(36).slice(2, 8), name, path: fp, type: (isImg ? 'image' : 'document') as 'image' | 'document', status: (isImg ? 'done' : 'pending') as 'done' | 'pending' }
    })
    setAttachments(prev => [...prev, ...newAttachments])

    for (const att of newAttachments) {
      if (att.type === 'image') continue
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'converting' as const } : a))
      try {
        const r = await window.electronAPI!.file.convert(att.path)
        setAttachments(prev => prev.map(a =>
          a.id === att.id ? { ...a, status: r.success && r.result ? 'done' as const : 'error' as const, content: r.result, error: r.error } : a
        ))
      } catch (e: any) {
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' as const, error: e.message } : a))
      }
    }
  }, [])

  // 点击按钮上传
  const handleUpload = useCallback(async () => {
    if (!window.electronAPI?.dialog) return
    const result = await window.electronAPI.dialog.openFile()
    if (!result.success || !result.files) return
    processFiles(result.files)
  }, [processFiles])

  // 拖拽文件上传
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    const paths: string[] = []
    for (const f of files) {
      // Electron 32+ 用 webUtils，旧版回退 f.path
      const p = window.electronAPI?.file?.getPathForFile?.(f as any) ?? (f as any).path
      if (p) { paths.push(p) }
      else { console.warn('[handleDrop] 文件无路径，跳过:', f.name, 'size:', f.size, 'type:', f.type) }
    }
    if (paths.length > 0) processFiles(paths)
  }, [processFiles])

  const removeAttachment = useCallback((id: string) => setAttachments(prev => prev.filter(a => a.id !== id)), [])

  // 粘贴图片/文件
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    const files = e.clipboardData?.files

    // 收集剪贴板图片（截图等，items 有但 files 可能为空）
    const clipboardImages: { blob: File; name: string }[] = []
    // 收集文件路径
    const filePaths: string[] = []

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]

        // 图片类型：截图、复制图片
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) clipboardImages.push({ blob, name: `剪贴板图片_${i + 1}.png` })
          continue
        }

        // macOS Finder 复制：kind === 'file' 或 type === 'Files'
        if (item.kind === 'file') {
          const f = item.getAsFile() as any
          if (f) {
            const p = window.electronAPI?.file?.getPathForFile?.(f) ?? f.path
            if (p) { filePaths.push(p); continue }
          }
        }
      }
    }

    // Fallback: files 列表（Windows/Linux 或部分 Electron 版本）
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as any
        const p = window.electronAPI?.file?.getPathForFile?.(f) ?? f.path
        if (p && !filePaths.includes(p)) filePaths.push(p)
      }
    }

    // Fallback: macOS text/uri-list（Finder 复制文件的经典格式）
    if (filePaths.length === 0) {
      try {
        const uriList = e.clipboardData?.getData('text/uri-list')
        if (uriList) {
          const uris = uriList.split('\n').filter(s => s.trim() && !s.startsWith('#'))
          for (const uri of uris) {
            try {
              const url = new URL(uri.trim())
              if (url.protocol === 'file:') filePaths.push(decodeURIComponent(url.pathname))
            } catch {}
          }
        }
      } catch {}
    }

    // 既没有图片也没有文件路径 → 走默认粘贴文本
    if (clipboardImages.length === 0 && filePaths.length === 0) return

    e.preventDefault()

    // 文件路径走 processFiles 管道（自动判断图片/文档、转换）
    if (filePaths.length > 0) {
      processFiles(filePaths)
    }

    // 排除已通过 processFiles 处理的（有 path 的图片文件）
    const unhandledImages = clipboardImages.filter(img => {
      const imgFile = img.blob as any
      return !imgFile.path || !filePaths.includes(imgFile.path)
    })

    // 剪贴板图片转 data URL
    if (unhandledImages.length > 0) {
      const atts: Attachment[] = []
      let done = 0
      unhandledImages.forEach(({ blob, name }) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const mime = blob.type || 'image/png'
          const ext = mime.split('/')[1] || 'png'
          atts.push({
            id: 'att_' + Math.random().toString(36).slice(2, 8),
            name,
            path: dataUrl,
            type: 'image' as const,
            status: 'done' as const,
          })
          done++
          if (done === unhandledImages.length) setAttachments(prev => [...prev, ...atts])
        }
        reader.readAsDataURL(blob)
      })
    }
  }, [processFiles])

  // 工作区目录浏览
  const loadWorkspaceDir = useCallback(async (dirPath: string) => {
    if (!window.electronAPI?.fs) return
    setWorkspacePath(dirPath)
    const result = await window.electronAPI.fs.listDir(dirPath)
    if (!result.success || !result.files) { setWorkspaceEntries([]); return }
    const entries: Array<{ name: string; path: string; isDir: boolean }> = []
    for (const name of result.files) {
      if (name.startsWith('.')) continue
      const childPath = `${dirPath.replace(/\/+$/, '')}/${name}`
      try {
        const statResult = await window.electronAPI.fs.stat(childPath)
        const isDir = statResult.success && statResult.stat?.isDirectory === true
        entries.push({ name, path: childPath, isDir })
      } catch {
        entries.push({ name, path: childPath, isDir: false })
      }
    }
    entries.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name))
    setWorkspaceEntries(entries)
  }, [])

  const openWorkspace = useCallback(async () => {
    await loadWorkspaceDir(workspace.root)
    setShowWorkspace(true)
  }, [loadWorkspaceDir, workspace.root])

  const sendingRef = useRef(false)

  // 发送消息
  const handleSend = useCallback(async () => {
    if (sendingRef.current || loading || !input.trim() || !activeModel) return
    sendingRef.current = true

    // 动态路由：基于任务复杂度评分选 tier
    let usedModel = activeModel
    if (autoMode && configuredModels.length > 0) {
      let score = 0
      // 消息长度
      if (input.length > 200) score += 2
      else if (input.length > 80) score += 1
      // 工具调用历史
      const recentTools = messages.filter(m => m.role === 'tool').length
      if (recentTools > 5) score += 3
      else if (recentTools > 2) score += 2
      else if (recentTools > 0) score += 1
      // 编码项目
      if (currentProjectId) score += 1
      // 最近有文件编辑
      const hasEdit = messages.slice(-5).some(m =>
        (m as any).toolCall?.name?.includes('write') ||
        m.content?.includes('已写入') || m.content?.includes('已编辑'))
      if (hasEdit) score += 2

      const tier: 'fast' | 'balanced' | 'powerful' =
        score >= 5 ? 'powerful' : score >= 3 ? 'balanced' : 'fast'
      setRouteScore(score)
      setRouteModel(tier)
      try {
        const { getModelTier } = await import('@/lib/config')
        for (const provider of configuredModels) {
          for (const sm of provider.availableModels || []) {
            if (getModelTier(sm.id) === tier) {
              usedModel = { ...provider, selectedModel: sm.id }
              break
            }
          }
        }
      } catch {}
    }

    // 确保有对话
    let cid = convId
    if (!cid && window.electronAPI?.conv) {
      const c = await window.electronAPI.conv.create('新对话', undefined, currentProjectId)
      cid = c.id; setConvId(c.id); convIdRef.current = c.id  // 立即同步 ref，不等 useEffect
      setConvList(prev => [{ id: c.id, title: '新对话', messageCount: 0, updatedAt: c.updatedAt, projectId: currentProjectId }, ...prev])
    }
    const isFirstMsg = messages.length === 0

    const docs = attachments.filter(a => a.type === 'document' && a.status === 'done' && a.content)
    const failedDocs = attachments.filter(a => a.type === 'document' && a.status !== 'done')
    const docTexts = docs.map(a => `--- 文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`).join('\n\n')
    let fullText = input.trim()
    if (docs.length > 0) {
      fullText = fullText
        ? `${fullText}\n\n以下是用户上传的文件内容：\n\n${docTexts}`
        : `请分析以下文件内容：\n\n${docTexts}`
    }
    const images = attachments.filter(a => a.type === 'image' && a.status === 'done')

    type ContentPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
    const userContent: string | ContentPart[] = images.length > 0
      ? [{ type: 'text' as const, text: fullText }, ...images.map(img => {
          const ext = img.name.split('.').pop()?.toLowerCase() || 'png'
          const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' } as any)[ext] || 'image/png'
          return { type: 'image' as const, image: img.path, mimeType: mime }
        })]
      : fullText

    const displaySummary = [input.trim(), images.length > 0 ? `[${images.length}张图片]` : '', docs.length > 0 ? `[${docs.length}个文档]` : '', failedDocs.length > 0 ? `[${failedDocs.length}个转换失败]` : ''].filter(Boolean).join(' ')

    const modelName = usedModel ? `${usedModel.displayName} / ${usedModel.selectedModel}` : undefined

    const userMsg: UIMessage = { role: 'user', content: displaySummary, attachments: attachments.length > 0 ? attachments.map(a => ({ name: a.name, type: a.type, status: a.status === 'error' ? 'error' as const : 'done' as const, error: a.error })) : undefined }
    dispatch({ type: 'ADD_USER', content: userMsg.content, attachments: userMsg.attachments })
    dispatch({ type: 'ADD_ASSISTANT', modelName })
    setInput('')
    setAttachments([])
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    // 新一轮对话，重置旧的压缩数据
    setCompressionInfo(null)

    try {
      let resolvedContent = userContent
      if (Array.isArray(userContent)) {
        resolvedContent = await Promise.all(userContent.map(async (part) => {
          if (part.type === 'image' && part.image && !part.image.startsWith('data:')) {
            const result = await window.electronAPI?.fs?.readFileBase64(part.image)
            if (result?.success && result.content) return { ...part, image: `data:${part.mimeType};base64,${result.content}` }
          }
          return part
        }))
      }

      const history: ChatMessageType[] = buildHistory(
        messages, userMsg, resolvedContent,
      )

      let streamed = ''
      setConsoleLog([]); setTaskList([]); setActivatedToolNames(new Set())
      thinkingRef.current = ''
      thinkingStartRef.current = 0
      mainTimelineRef.current = []
      toolBatchRef.current = []
      pushLog('--', '开始处理', 'info')

      // 注册子 Agent 流式回调（delegate_task 实时输出）
      const { setToolStreamHandler } = await import('@/lib/tools/agent')
      setToolStreamHandler((e) => {
        if (e.type === 'delta') {
          dispatch({ type: 'TOOL_STREAM', toolName: e.toolName, delta: e.text })
        } else if (e.type === 'done') {
          dispatch({ type: 'TOOL_STREAM', toolName: e.toolName, delta: '', done: true })
        }
      })

      // 记录发起时的 convId，防止旧 chat() 残留事件污染新会话 UI
      const originConvId = convIdRef.current || '@new'
      await chat(history, (event: ChatStreamEvent) => {
        // 用 ref 读当前 convId，避免闭包捕获旧值
        if ((convIdRef.current || '@new') !== originConvId) return
        if (event.type === 'tool-call' && event.toolName === 'delegate_task') {
          console.log(`[chat] 🤖 主AI → delegate_task`)
          pushLog('🤖', `委托 tier: ${(event.toolInput as any)?.tier || 'balanced'}`, 'info')
        }
        if (event.type === 'reasoning-delta') {
          if (!thinkingRef.current) thinkingStartRef.current = performance.now()
          thinkingRef.current += event.text || ''
          // 推入时间线：合并连续 thinking
          const tLast = mainTimelineRef.current[mainTimelineRef.current.length - 1]
          if (tLast?.type === 'thinking') {
            tLast.content += event.text || ''
          } else {
            mainTimelineRef.current.push({ type: 'thinking', content: event.text || '' })
          }
          const tl = mainTimelineRef.current.map(t => ({ ...t }))
tickMessages(() => dispatch({ type: 'REASONING_DELTA', thinking: thinkingRef.current, modelName, mainTimeline: tl }))
        } else if (event.type === 'text-delta') {
          streamed += event.text || ''
          // 推入时间线：合并连续 text
          const tLast = mainTimelineRef.current[mainTimelineRef.current.length - 1]
          if (tLast?.type === 'text') {
            tLast.content += event.text || ''
          } else {
            mainTimelineRef.current.push({ type: 'text', content: event.text || '' })
          }
          const tl = mainTimelineRef.current.map(t => ({ ...t }))
          // 如果上一个消息是 tool batch，关闭它并开始新 assistant
          const hadBatch = toolBatchRef.current.length > 0
          toolBatchRef.current = []
tickMessages(() => dispatch({ type: 'TEXT_DELTA', content: streamed, modelName, thinkingLoading: false, mainTimeline: tl }))
        } else if (event.type === 'tool-call') {
          let toolName = event.toolName || 'unknown'
          let toolType = detectToolType(toolName)
          // enable_tool 代理工具时，显示被代理的工具名和真实类型
          if (toolName === 'enable_tool' && event.toolInput && typeof event.toolInput === 'object') {
            const proxied = (event.toolInput as any).name
            if (proxied) {
              toolNameProxyRef.current.set('enable_tool', proxied)
              toolName = proxied
              toolType = detectToolType(proxied)  // 根据实际工具名判定类型
            }
          }
          const tc: ToolCallStatus = { id: Math.random().toString(36).slice(2, 8), name: toolName, type: toolType, status: 'running', input: event.toolInput }
          setActivatedToolNames(prev => { const next = new Set(prev); next.add(toolName); return next })
          pushLog('>', `[${tc.type}] ${tc.name}`, 'running')

          const isFirstInBatch = toolBatchRef.current.length === 0
          toolBatchRef.current.push(tc)

          const textBeforeTool = streamed; streamed = ''

          if (isFirstInBatch) {
            // flush 等待中的 TEXT_DELTA，防止它跑到 TOOL_BATCH_CREATE 之后创建第二个 assistant
            if (pendingUpdateRef.current) {
              pendingUpdateRef.current()
              pendingUpdateRef.current = null
              if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
            }
            mainTimelineRef.current = []
            const thinkingDuration = thinkingStartRef.current
              ? Math.round((performance.now() - thinkingStartRef.current) / 1000)
              : undefined
dispatch({ type: 'TOOL_BATCH_CREATE', textBeforeTool: '', tools: toolBatchRef.current as any, thinkingDuration })
          } else {
            dispatch({ type: 'TOOL_BATCH_APPEND', tools: toolBatchRef.current as any })
          }
        } else if (event.type === 'tool-result') {
          const ok = !String(event.toolOutput ?? '').startsWith('Error')
          const sdkName = event.toolName || 'unknown'
          const proxyName = toolNameProxyRef.current.get(sdkName)
          const matchName = proxyName || sdkName
          if (sdkName === 'delegate_task' || matchName === 'delegate_task') {
            const tokMatch = String(event.toolOutput ?? '').match(/(\d+)\s*tok/)
          }
          // 更新 batch 中对应工具的状态（原地修改，保持引用稳定）
          const MAX_RESULT = 30000
          const batch = toolBatchRef.current
          for (const t of batch) {
            if (t.name === matchName || t.name === sdkName) {
              t.status = ok ? 'done' : 'error'
              const raw = String(event.toolOutput ?? '')
              if (raw.length > MAX_RESULT) {
                t.result = raw.slice(0, MAX_RESULT) + `\n\n... (result truncated, ${raw.length} chars total)`
                ;(t as any).fullResult = raw
              } else {
                t.result = raw
              }
            }
          }
          tickMessages(() => dispatch({ type: 'TOOL_BATCH_RESULT', toolName: matchName, output: String(event.toolOutput ?? ''), ok }))
          pushLog(ok ? 'OK' : 'ERR', `${matchName} ${ok ? 'done' : 'fail'}`, ok ? 'ok' : 'error')
          // cleanup proxy mapping
          if (proxyName) toolNameProxyRef.current.delete(sdkName)
          if (detectToolType(event.toolName || '') === 'agent') pushLog('OUT', String(event.toolOutput ?? ''), 'info')
          setStatusText('')
        } else if (event.type === 'system-log') {
          pushLog('SYS', event.text || '', 'info')
        } else if (event.type === 'retry-clear') {
          // 截断重试：清空 RAF 队列、已展示文本、旧消息，下一段从头来
          streamed = ''
          pendingUpdateRef.current = null
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
          dispatch({ type: 'RETRY_CLEAR' })
        } else if (event.type === 'task-status') {
          const s = event.taskStatus || '?'
          pushLog(s === 'running' ? '🔄' : s === 'completed' ? '✅' : '❌',
            `Task ${(event.taskId || '').slice(0, 12)}: ${event.taskAgentName || ''} ${s}${event.text ? ` (${event.text.length}字)` : ''}`,
            s === 'completed' ? 'ok' : s === 'failed' ? 'error' : 'info')
        } else if (event.type === 'disclosure') {
          if (event.disclosureResult) setDisclosureResult(event.disclosureResult)
        } else if (event.type === 'compression') {
          setCompressionInfo({
            wasCompressed: true,
            originalTokens: event.originalTokens || 0,
            compressedTokens: event.compressedTokens || 0,
            limit: event.limit || 0,
            summary: event.summary,
          })
        } else if (event.type === 'done') {
          // flush 等待中的 TEXT_DELTA，防止它在 STREAM_END 之后执行
          // 创建第二个 assistant（参考 DOM 中两个"思考"块的根因）
          if (pendingUpdateRef.current) {
            pendingUpdateRef.current()
            pendingUpdateRef.current = null
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
          }
          pushLog('DONE', `回复 (${streamed.length}字)`, streamed ? 'ok' : 'info')
          mainTimelineRef.current = []
          toolBatchRef.current = []
          // AI 回复结束，未完成的任务自动标记为完成
          setTaskList(prev => prev.map(t => t.status === 'running' ? { ...t, status: 'done' } : t))
          if (event.trace) {
            const t = event.trace
            const totalTok = t.inputTokens + t.outputTokens
            const parts = [
              `${totalTok} tok`,
              formatDuration(t.totalDuration),
              t.toolCalls.length > 0 ? `${t.toolCalls.length} tools` : '',
            ].filter(Boolean)
            const info = parts.join(' · ')
            // trace 信息通过 addTrace 保存，不存入消息状态
          }
          const thinkingDuration = thinkingStartRef.current
            ? Math.round((performance.now() - thinkingStartRef.current) / 1000)
            : undefined
          dispatch({ type: 'STREAM_END', streamed, thinkingDuration })
          // 保存本次用量追踪 + 更新真实 token 显示
          if (event.trace) {
            const t = event.trace
            if (t.inputTokens > 0) setLastRealInputTokens(t.inputTokens)
            addTrace({
              id: 'tr_' + Date.now(),
              timestamp: Date.now(),
              modelName,
              inputTokens: t.inputTokens,
              outputTokens: t.outputTokens,
              cachedTokens: t.cachedInputTokens,
              agentTokens: 0,
              toolCalls: t.toolCalls.length,
              duration: t.totalDuration,
            })
          }
        }
      }, {
        abortSignal: controller.signal,
        autoMode,
        modelOverride: usedModel !== activeModel ? { provider: usedModel.name, modelId: usedModel.selectedModel } : undefined,
        forceCompression: forceCompressRef.current ? true : undefined,
        memoryInjection: await getInjectionText() ?? undefined,
        thinkingBudgetTokens: thinkingBudget(thinkingLevel),
        userId: user?.id,
      })
      forceCompressRef.current = false
    } catch (e: any) {
      // 兼容不同 AI SDK 版本的 abort 信号
      const isAbort = e.name === 'AbortError'
        || e.message?.includes('abort')
        || controller.signal.aborted
      dispatch({ type: 'ABORT', isAbort })
      if (isAbort) {
        pushLog('STOP', '用户中断', 'info')
        setProgressMsg('')
        setTaskList(prev => prev.map(t => t.status === 'running' ? { ...t, status: 'cancelled' } : t))
      } else {
        const msg = e.message || '网络连接失败'
        pushLog('ERR', msg, 'error')
        setStatusText(`连接失败：${msg.slice(0, 40)}`)
      }
    } finally { sendingRef.current = false; abortRef.current = null; setLoading(false); setTimeout(() => setStatusText(''), 8000) }

    // 首条消息后自动生成标题（用 ref 避免闭包过期）
    if (isFirstMsg && cid) {
      const userText = input.trim()
      const latestMsgs = messagesRef.current
      const aiReply = latestMsgs.filter(m => m.role === 'assistant').pop()
      const aiText = aiReply?.content?.slice(0, 200) || ''
      if (aiText) setTimeout(() => generateTitle(cid, userText, aiText), 1000)
    }
  }, [input, loading, activeModel, messages, attachments, autoMode, convId, generateTitle])

  // @ 文件选择器
  const handleInputChange = useCallback(async (val: string) => {
    setInput(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === ' ')) {
      const query = val.slice(atIdx + 1).toLowerCase()
      atQueryRef.current = query
      if (window.electronAPI?.workspace && window.electronAPI?.fs) {
        const ws = await window.electronAPI.workspace.getPaths()
        // 搜索整个工作区（递归列出所有文件）
        const allFiles = await collectFiles(ws.root, query || undefined)
        setAtFiles(allFiles.slice(0, 10))
        setShowAtPicker(allFiles.length > 0)
      }
    } else { setShowAtPicker(false) }
  }, [])

  const selectAtFile = useCallback(async (file: { name: string; path: string }) => {
    const atIdx = input.lastIndexOf('@')
    const afterAt = input.slice(atIdx + 1)
    const spaceIdx = afterAt.indexOf(' ')
    const replaceLen = spaceIdx >= 0 ? spaceIdx + 1 : afterAt.length + 1
    setInput(input.slice(0, atIdx) + input.slice(atIdx + replaceLen))
    const att: Attachment = { id: 'att_' + Math.random().toString(36).slice(2, 8), name: file.name, path: file.path, type: ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(file.name.split('.').pop()?.toLowerCase()||'') ? 'image' : 'document', status: 'pending' }
    setAttachments(prev => [...prev, att]); setShowAtPicker(false)
    if (att.type === 'document' && window.electronAPI?.file) {
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'converting' } : a))
      try {
        const r = await window.electronAPI.file.convert(file.path)
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: r.success && r.result ? 'done' : 'error', content: r.result, error: r.error } : a))
      } catch (e: any) { setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error', error: e.message } : a)) }
    }
  }, [input])

  const handleAskAnswer = useCallback((answer: string) => {
    if (!askUser) return
    dispatch({ type: 'ADD_USER_REPLY', content: answer })
    const askLabel = askUser.title || askUser.question || '用户回答'
    pushLog('USR', `${askLabel} => ${answer.slice(0, 80)}`, 'ok')
    askUser.resolve(answer)
    setAskUser(null)
  }, [askUser])

  // Token 用量 = 可见消息 + 后台开销（系统提示词 + 上下文注入 + 工具定义）
  const visibleTokens = messages
    .filter(m => m.role !== 'tool')
    .reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0)
  // 后台开销估算：系统提示词 ~4200 tok + 上下文注入 ~1500 tok + 工具定义 ~2000 tok
  const promptOverhead = 4200 + 1500 + 2000
  const estimatedTokens = lastRealInputTokens > 0 ? lastRealInputTokens : (visibleTokens + promptOverhead)
  const contextWindowLimit =
    compressionInfo?.limit
    || activeModel?.availableModels?.find(m => m.id === activeModel.selectedModel)?.contextWindow
    || getCtxWindow()

  const compressingRef = useRef(false)

  /** 主动压缩当前消息（不等下一条发送） */
  const compressNow = useCallback(async () => {
    if (compressingRef.current || messages.length === 0) return
    compressingRef.current = true
    setCompressing(true)
    try {
      const cwm = new ContextWindowManager()
      const modelMessages = messages
        .filter(m => !m.streaming && m.role !== 'tool')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      const result = await cwm.compress(modelMessages, contextWindowLimit, { force: true })
      if (result.wasCompressed) {
        setCompressionInfo({
          wasCompressed: true,
          originalTokens: result.originalTokens,
          compressedTokens: result.compressedTokens,
          limit: result.limit,
          summary: result.summary,
        })
      }
    } finally {
      compressingRef.current = false
      setCompressing(false)
    }
  }, [messages, contextWindowLimit])

  // 切换模型时重置压缩状态（上下文窗口大小不同了）
  useEffect(() => {
    setCompressionInfo(null)
  }, [activeModel?.selectedModel])

  const inputArea = (
    <div className="px-3 py-2">
      {attachments.length > 0 && <AttachmentChips attachments={attachments} onRemove={removeAttachment} />}

      {/* @ 文件选择器 */}
      {showAtPicker && atFiles.length > 0 && (
        <div className="mb-1.5 rounded-md border border-border bg-card shadow-lg max-h-36 overflow-auto">
          {atFiles.map(f => (
            <button
              key={f.path}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
              onClick={() => selectAtFile(f)}
            >
              <File className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 输入行 */}
      <div
        className={`rounded-2xl border bg-background shadow-md transition-all ${dragOver ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : 'border-input focus-within:ring-1 focus-within:ring-ring'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
        onDrop={handleDrop}
      >
        <textarea
          className="w-full resize-none bg-transparent px-3 pt-2 pb-0 text-sm leading-relaxed placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50 custom-scrollbar"
          rows={3}
          placeholder={askUser ? '请在上方回答 AI 的问题...' : activeModel ? `向 ${activeModel.selectedModel} 提问...` : '请先配置模型'}
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            if (e.key === 'Enter' && e.shiftKey) return
          }}
          onPaste={handlePaste}
          disabled={!activeModel || !!askUser}
        />
        <div className="flex items-center gap-1 px-2 pb-1.5">
          {/* + 子菜单 */}
          <div className="relative shrink-0">
            <button
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${showPlusMenu ? 'bg-muted text-foreground' : 'text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground'}`}
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              title="添加"
            >
              <Plus className="h-3 w-3" />
              {attachments.length > 0 && <span>{attachments.length}</span>}
            </button>
            {showPlusMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPlusMenu(false)} />
                <div className="absolute left-0 bottom-full z-50 mb-1 w-36 rounded-lg border border-border bg-card shadow-lg py-1">
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                    onClick={() => { handleUpload(); setShowPlusMenu(false) }}
                  >
                    <Upload className="h-3 w-3 text-muted-foreground" />
                    <span>上传文件</span>
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative shrink-0">
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
              onClick={() => setShowModelPicker(!showModelPicker)}
              title={autoMode ? 'Auto 自动调配' : activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : '选择模型'}
            >
              <Bot className="h-3 w-3" />
              <span className={`max-w-[60px] truncate ${autoMode ? 'text-primary/60' : ''}`}>{autoMode ? 'Auto' : activeModel?.displayName || '模型'}</span>
            </button>
            <ModelPicker
              show={showModelPicker} autoMode={autoMode}
              activeModel={activeModel}
              configuredModels={configuredModels}
              thinkingLevel={thinkingLevel}
              onThinkingChange={(level) => { setThinkingLevel(level); saveThinkingLevel(level) }}
              onToggleAuto={() => setAutoMode(!autoMode)}
              onSelectCloud={(m) => { setActiveModel(m); setShowModelPicker(false) }}
              onClose={() => setShowModelPicker(false)} pickerRef={pickerRef}
              routeLabel={(() => {
                if (!autoMode) return undefined
                let s = 0
                if (input.length > 200) s += 2; else if (input.length > 80) s += 1
                const rt = messages.filter(m => m.role === 'tool').length
                if (rt > 5) s += 3; else if (rt > 2) s += 2; else if (rt > 0) s += 1
                if (currentProjectId) s += 1
                const tier = s >= 5 ? 'powerful' : s >= 3 ? 'balanced' : 'fast'
                const label = s >= 5 ? 'Pro' : s >= 3 ? 'Std' : 'Fast'
                let modelName = ''
                for (const p of configuredModels) {
                  for (const sm of p.availableModels || []) {
                    if (getModelTier(sm.id) === tier) { modelName = sm.id; break }
                  }
                  if (modelName) break
                }
                return modelName ? `${label} ${s} → ${modelName}` : `${label} ${s}`
              })()}
              autoModelId={(() => {
                if (!autoMode) return undefined
                let s = 0
                if (input.length > 200) s += 2; else if (input.length > 80) s += 1
                const rt = messages.filter(m => m.role === 'tool').length
                if (rt > 5) s += 3; else if (rt > 2) s += 2; else if (rt > 0) s += 1
                if (currentProjectId) s += 1
                const tier = s >= 5 ? 'powerful' : s >= 3 ? 'balanced' : 'fast'
                for (const p of configuredModels) {
                  for (const sm of p.availableModels || []) {
                    if (getModelTier(sm.id) === tier) return sm.id
                  }
                }
                return undefined
              })()}
            />
          </div>
          <MCPToolPicker
            disclosureResult={disclosureResult}
            onThresholdChange={(n) => { setDisclosureThreshold(n); saveDisclosureThreshold(n) }}
            activatedToolNames={activatedToolNames}
            projectMCPServerIds={projectSettings?.mcpServers}
            projectMCPTools={projectSettings?.mcpTools}
            projectPluginTools={projectSettings?.pluginTools}
            pluginTools={pluginToolEntries}
          />
          <div className="relative shrink-0">
            <button
              ref={workspaceBtnRef}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
              onClick={() => showWorkspace ? setShowWorkspace(false) : openWorkspace()}
              title="工作区"
            >
              <FolderOpen className="h-3 w-3" />
              <span>工作区</span>
            </button>
            {showWorkspace && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowWorkspace(false)} />
                <div className="absolute left-0 bottom-full z-50 mb-1 w-80 rounded-lg border border-border bg-card shadow-lg">
                  {/* 工作区根目录 + 操作 */}
                  <div className="px-3 py-2 border-b border-border space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground/60 truncate flex-1" title={workspace.root}>{workspace.root}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        onClick={async () => { await workspace.pickAndSetRoot(); setShowWorkspace(false) }}
                      >
                        选择目录
                      </button>
                      {workspace.isCustom && (
                        <button
                          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                          onClick={async () => { await workspace.resetRoot(); setShowWorkspace(false) }}
                        >
                          恢复默认
                        </button>
                      )}
                      <div className="flex-1" />
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                        onClick={() => window.electronAPI?.workspace?.openFile(workspace.root)}
                        title="在文件管理器中打开"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {/* 浏览导航栏 */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/50">
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      onClick={async () => {
                        const parent = workspacePath.split('/').slice(0, -1).join('/') || '/'
                        if (parent && parent.length >= workspace.root.length) loadWorkspaceDir(parent)
                      }}
                      title="返回上级"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] text-muted-foreground/50 truncate">{workspacePath.replace(/\/+$/, '')}/</span>
                  </div>
                  <div className="max-h-64 overflow-auto p-1">
                    {workspaceEntries.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/50 text-center py-6">空目录</p>
                    ) : (
                      workspaceEntries.map((entry) => (
                        <button
                          key={entry.path}
                          className="flex items-center gap-2 w-full rounded-md hover:bg-accent transition-colors px-2 py-1.5 text-left"
                          onClick={() => {
                            if (entry.isDir) {
                              loadWorkspaceDir(entry.path)
                            } else {
                              window.electronAPI?.workspace?.openFile(entry.path)
                            }
                          }}
                          title={entry.isDir ? `进入 ${entry.name}/` : `打开 ${entry.name}`}
                        >
                          {entry.isDir ? (
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-xs truncate">{entry.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <TokenUsageBar
            estimatedTokens={estimatedTokens}
            limit={contextWindowLimit}
            wasCompressed={compressionInfo?.wasCompressed || false}
            originalTokens={compressionInfo?.originalTokens}
            compressedTokens={compressionInfo?.compressedTokens}
            compressing={compressing}
            onForceCompress={compressNow}
          />
          <div className="flex-1" />
          {loading ? (
            <button className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors" onClick={() => { abortRef.current?.abort(); killAllTerminals(); sendingRef.current = false; setLoading(false) }} title="停止生成">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors" onClick={handleSend} disabled={!input.trim() || !activeModel || !!askUser} title={askUser ? '请先在上方回答 AI 的问题' : '发送 (Enter)'}>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <ConversationBar
        convId={convId}
        convTitle={convTitle}
        conversations={convList}
        currentProjectId={currentProjectId}
        onNew={handleNewConv}
        onProjectChange={(pid) => {
          setCurrentProjectId(pid)
          dispatch({ type: 'RESET' }); setConvId(null); setConvTitle('新对话'); setCompressionInfo(null); convIdRef.current = null
          setConvList([])
        }}
        onSwitch={handleSwitchConv}
        onDelete={handleDeleteConv}
        onRename={handleRenameConv}
      />

      {messages.length === 0 ? (
        /* 空状态：文字压丝带 → 丝带 → 输入框压丝带 */
        <div className="flex-1 flex flex-col items-center px-3 pb-12">
          {/* 顶部留白 */}
          <div className="h-44" />
          {/* 问候文字 — 压住丝带上边缘 */}
          <div className="relative z-10 mb-[-280px]">
            <WelcomeHero
              modelName={activeModel?.selectedModel}
              hasModels={configuredModels.length > 0}
            />
          </div>
          {/* 丝带装饰带 */}
          <div className="h-[600px] w-full shrink-0 relative pointer-events-none">
            <Strands
              colors={['#9CA3AF', '#6B7280', '#374151', '#1F2937']}
              count={3}
              speed={0.2}
              amplitude={0.7}
              waviness={0.8}
              thickness={0.5}
              glow={1.8}
              taper={2}
              spread={2.5}
              intensity={0.6}
              saturation={1.2}
              opacity={0.9}
              scale={1.5}
            />
          </div>
          {/* 输入框 — 压住丝带下边缘 */}
          <div className="relative z-10 w-full max-w-2xl shrink-0 -mt-[310px]">
            {inputArea}
          </div>
          {/* 底部留白 */}
          <div className="flex-[3]" />
        </div>
      ) : (
        /* 有消息：消息区 + 底部输入框 */
        <>
          <div className="flex-1 relative">
            <div ref={scrollRef} className="absolute inset-0 overflow-y-auto custom-scrollbar">
              <div className="chat-messages w-full px-4 py-4 space-y-4">
                {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
                {taskList.length > 0 && <TaskListCard tasks={taskList} />}
                <div ref={endRef} />
              </div>
            </div>
            {/* 回到底部按钮 — 在滚动容器外，始终固定在视口底部 */}
            {showScrollBtn && (
              <button
                className="absolute bottom-4 right-4 z-10 rounded-full bg-primary text-primary-foreground shadow-lg p-2 hover:bg-primary/90 transition-all"
                onClick={scrollToBottom}
                title="回到底部"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {askUser && <AskUserBar askUser={askUser} answer={askUserAnswer} onAnswerChange={setAskUserAnswer} onAnswer={handleAskAnswer} />}
          {showConsole && <ChatConsole lines={consoleLog} onClose={() => setShowConsole(false)} />}

          {(statusText || progressMsg) && (
            <div className="border-t border-border bg-muted/30 px-4 py-1 text-center text-[10px] text-muted-foreground/50">
              {progressMsg && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              {progressMsg || statusText}
            </div>
          )}

          {inputArea}
        </>
      )}
    </div>
  )
}

// ====== 工具函数 ======

async function collectFiles(basePath: string, query?: string, maxDepth = 3): Promise<Array<{ name: string; path: string; isDir: boolean }>> {
  const api = window.electronAPI?.fs
  if (!api || maxDepth <= 0) return []
  const result: Array<{ name: string; path: string; isDir: boolean }> = []
  const listResult = await api.listDir(basePath)
  if (!listResult.success || !listResult.files) return result
  for (const name of listResult.files) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const childPath = `${basePath.replace(/[\\/]+$/, '')}/${name}`
    const statResult = await api.stat(childPath)
    const isDir = statResult.success && statResult.stat?.isDirectory === true
    if (!query || name.toLowerCase().includes(query)) {
      result.push({ name, path: childPath, isDir })
    }
    if (isDir && result.length < 30) {
      const sub = await collectFiles(childPath, query, maxDepth - 1)
      result.push(...sub)
    }
  }
  return result
}

// ====== 内部组件 ======

interface Attachment {
  id: string; name: string; path: string; type: 'image' | 'document'
  status: 'pending' | 'converting' | 'done' | 'error'
  content?: string; error?: string
}

function AttachmentChips({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map(att => (
        <div key={att.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${att.status === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : att.status === 'converting' ? 'border-border bg-muted/50 text-muted-foreground' : 'border-border bg-card text-foreground'}`}>
          {att.status === 'error' ? <X className="h-3 w-3 text-destructive" /> : att.status === 'converting' ? <Loader2 className="h-3 w-3 animate-spin" /> : att.type === 'image' ? <Image className="h-3 w-3 text-muted-foreground" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
          <span className="max-w-[120px] truncate" title={att.error}>{att.name}</span>
          {att.status === 'converting' && <span className="text-[10px]">转换中</span>}
          {att.status === 'error' && <span className="text-[10px] text-destructive truncate max-w-[200px]" title={att.error}>失败: {att.error}</span>}
          <button className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors" onClick={() => onRemove(att.id)}><X className="h-3 w-3" /></button>
        </div>
      ))}
    </div>
  )
}

function TaskListCard({ tasks }: { tasks: Array<{ id: string; title: string; status: string }> }) {
  const [localTasks, setLocalTasks] = useState(tasks)
  useEffect(() => { setLocalTasks(tasks) }, [tasks])

  const toggleTask = (id: string) => {
    setLocalTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t
    ))
  }

  const doneCount = localTasks.filter(t => t.status === 'done').length

  return (
    <div className="flex gap-3">
      <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">任务进度 ({doneCount}/{localTasks.length})</span>
        </div>
        <div className="space-y-1">
          {localTasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-xs cursor-pointer select-none"
              onClick={() => toggleTask(t.id)} title="点击切换完成状态">
              {t.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              : t.status === 'running' ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />
              : t.status === 'cancelled' ? <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 hover:text-muted-foreground" />}
              <span className={`truncate ${t.status === 'done' ? 'text-muted-foreground line-through' : t.status === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{t.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

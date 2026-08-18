import { streamChatWithTools, generateText, jsonSchema, type ChatMessage, type ProviderConfig } from './api'
import { getAIModels, getAgentMaxSteps, type AIModelConfig } from './config'
import { getInstalledSkills } from './skillService'
import type { DisclosureResult } from './toolDisclosure'
import { createTrace, estimateTokens, type TurnTrace } from './observability'
import { ContextWindowManager, buildPostCompactInjection } from './contextWindowManager'
import { getRecentFiles, trackFileOp } from './fileTracker'

// ====== Agent 自带工具的事件类型 ======

/** 多问多答：单个问题定义 */
export interface AskQuestion {
  id: string          // 唯一标识
  label: string       // 问题文本
  inputType: 'input' | 'select' | 'confirm'
  options?: string[]  // select 模式下的候选项
  placeholder?: string
  required?: boolean
}

export interface AskUserEvent {
  type: 'ask_user'
  // 旧格式（单问题，向后兼容）
  question?: string
  options?: string[]
  inputType?: 'select' | 'input' | 'confirm'
  // 新格式（多问多答）
  title?: string
  questions?: AskQuestion[]
  resolve: (answer: string) => void
}

export interface ProgressEvent {
  type: 'show_progress'
  message: string
  current?: number
  total?: number
}

export interface NotifyCompleteEvent {
  type: 'notify_complete'
  message: string
  result?: string
}

export interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'cancelled'
}

export interface TaskListEvent {
  type: 'update_task_list'
  tasks: TaskItem[]
}

export type AgentUIEvent = AskUserEvent | ProgressEvent | NotifyCompleteEvent | TaskListEvent

import { setAgentToolHandler } from './tools/agent'

let onAgentUIEvent: ((event: AgentUIEvent) => void) | null = null

export function setAgentUIHandler(handler: ((event: AgentUIEvent) => void) | null) {
  onAgentUIEvent = handler
  setAgentToolHandler(handler)
}

export function getChatModel(): ProviderConfig | null {
  const models = getAIModels()
  const enabled = models.find((m) => m.enabled && m.apiKey)
  if (!enabled) return null

  const providerName = (enabled.name || enabled.id).toLowerCase()
  const selectedModelInfo = enabled.availableModels?.find(m => m.id === enabled.selectedModel)
  console.log('[getChatModel] 选中模型:', enabled.name, '| provider:', providerName, '| baseUrl:', enabled.baseUrl)
  return {
    provider: providerName,
    modelId: enabled.selectedModel || 'gpt-4o',
    apiKey: enabled.apiKey || 'dummy',
    baseUrl: enabled.baseUrl || undefined,
    capabilities: selectedModelInfo?.capabilities,
  }
}

// ====== 模型委托 ======

async function pickModelByTier(
  provider: AIModelConfig,
  tier: 'fast' | 'balanced' | 'powerful',
): Promise<string> {
  const models = provider.availableModels || []
  if (models.length === 0) return provider.selectedModel || ''
  if (tier === 'balanced') return provider.selectedModel || models[0]?.id || ''

  const { getModelTier } = await import('@/lib/config')
  const matched = models.filter(m => getModelTier(m.id) === tier)
  if (matched.length > 0) {
    return tier === 'fast' ? matched[0].id : matched[matched.length - 1].id
  }
  return tier === 'fast' ? models[0]?.id || '' : models[models.length - 1]?.id || ''
}

export async function delegateToModel(
  tier: 'fast' | 'balanced' | 'powerful',
  task: string,
  systemContext?: string,
): Promise<{ modelName: string; result: string }> {
  const models = getAIModels()
  const enabled = models.find((m) => m.enabled && m.apiKey)
  if (!enabled) throw new Error('没有可用的模型')

  const modelId = await pickModelByTier(enabled, tier)
  const providerName = (enabled.name || enabled.id).toLowerCase()

  try {
    const result = await generateText({
      config: {
        provider: providerName,
        modelId,
        apiKey: enabled.apiKey || 'dummy',
        baseUrl: enabled.baseUrl || undefined,
      },
      prompt: task,
      systemPrompt: systemContext || 'You are a coding agent. Use tools directly. Report in one sentence.',
    })
    return { modelName: `${enabled.displayName} / ${modelId}`, result: result.text }
  } catch (e: any) {
    throw new Error(`委托 ${tier} 模型失败: ${e.message}`)
  }
}

/** 从 MCP 服务器获取工具（各来源通过独立模块注册） */
export async function getMCPSdkTools(autoMode?: boolean, userId?: string): Promise<Record<string, any>> {
  const tools: Record<string, any> = {}
  try {
    const { registerMCPBusinessTools } = await import('./tools/mcpBusiness')
    const { registerSkillTools } = await import('./tools/skill')
    const { registerAgentTools } = await import('./tools/agent')
    const { registerMCPGatewayTools } = await import('./tools/mcpGateway')
    const { registerSandboxTools } = await import('./tools/sandbox')
    const { registerWorkspaceTools } = await import('./tools/workspace')
    const { registerTerminalTool } = await import('./tools/terminal')
    const { registerWebFetchTool } = await import('./tools/webFetch')
    const { registerWebSearchTool } = await import('./tools/webSearch')
    const { registerVerifyTools } = await import('./tools/verify')
    await registerMCPBusinessTools(tools)
    registerSkillTools(tools)
    registerAgentTools(tools, autoMode)
    registerMCPGatewayTools(tools)
    registerVerifyTools(tools)
    await registerSandboxTools(tools)
    await registerWorkspaceTools(tools)
    registerTerminalTool(tools)
    registerWebFetchTool(tools)
    registerWebSearchTool(tools)
    // 注入插件 AI 工具
    const { pluginSystem } = await import('./pluginSystem')
    Object.assign(tools, pluginSystem.getPluginTools())

    // 注入 Cordis（新范式）主进程工具：渲染进程通过 IPC 代理执行
    try {
      const ea = (window as any).electronAPI
      if (ea?.cordis?.listTools && ea.cordis?.callTool) {
        const res = await ea.cordis.listTools()
        const cordisTools: Array<{ name: string; description: string; parameters: any }> = res?.tools || []
        for (const t of cordisTools) {
          if (!t?.name || !t.description) continue
          const key = t.name.startsWith('plugin__') ? t.name : `plugin__${t.name}`
          if (tools[key]) continue
          tools[key] = {
            description: t.description,
            inputSchema: jsonSchema(t.parameters || { type: 'object', properties: {} }),
            execute: async (args: any = {}) => {
              const { _toolName, ...rest } = args || {}
              const r = await ea.cordis.callTool(t.name, rest)
              if (!r?.success) throw new Error(r?.error || `工具 ${t.name} 调用失败`)
              return r.result
            },
          }
        }
      }
    } catch (e: any) {
      console.warn('[getMCPSdkTools] Cordis 工具注入失败:', e?.message || e)
    }
  } catch (e: any) {
    console.error('[getMCPSdkTools] 工具注册失败:', e.message, e.stack?.slice(0, 200))
    return {}
  }
  return tools
}

import type { TerminalStatus } from '@/types/chat'

export interface TerminalUIEvent {
  type: 'terminal_created' | 'terminal_confirm' | 'terminal_updated'
  terminal: TerminalStatus
}

let terminalUIHandler: ((event: TerminalUIEvent) => void) | null = null
export function setTerminalUIHandler(handler: ((event: TerminalUIEvent) => void) | null) {
  terminalUIHandler = handler
  // 同步到 terminalManager，让 killTerminal/killAll 也能通知 UI
  import('./terminalManager').then(m => m.setTerminalUIHandler(handler as any))
}
export function getTerminalUIHandler() { return terminalUIHandler }

import type { FileOpRequest } from './fileOpManager'

export interface FileOpUIEvent {
  type: 'fileop_created' | 'fileop_updated'
  fileOp: FileOpRequest
}

let fileOpUIHandler: ((event: FileOpUIEvent) => void) | null = null
export function setFileOpUIHandler(handler: ((event: FileOpUIEvent) => void) | null) {
  fileOpUIHandler = handler
}
export function getFileOpUIHandler() { return fileOpUIHandler }

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'compression' | 'disclosure' | 'system-log' | 'retry-clear' | 'task-status' | 'reasoning-delta'
  text?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  trace?: TurnTrace
  // compression 事件字段
  originalTokens?: number
  compressedTokens?: number
  limit?: number
  summary?: string
  // task 事件字段
  taskStatus?: string; taskId?: string; taskAgentName?: string
  // disclosure 事件字段
  disclosureResult?: DisclosureResult
  // reasoning 事件字段
  reasoningId?: string
}

let _lastCompressionSummary = ''
let _lastRulesSummary: string | undefined  // 压缩时保存的规则摘要

/** 格式化压缩摘要：去掉 <analysis> 草稿，只保留 <summary> 内容（对齐 CC formatCompactSummary） */
function formatCompactSummary(raw: string): string {
  let s = raw.replace(/<analysis>[\s\S]*?<\/analysis>/g, '')
  const m = s.match(/<summary>([\s\S]*?)<\/summary>/)
  if (m) s = m[1].trim()
  return s.replace(/\n\n+/g, '\n\n').trim()
}

/** 暴露文件追踪（供工具调用，实际实现在 fileTracker.ts 避免循环依赖） */
export { trackFileOp } from './fileTracker'

export async function chat(
  messages: ChatMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  opts?: { abortSignal?: AbortSignal; autoMode?: boolean; localModelId?: string; forceCompression?: boolean; memoryInjection?: string; userId?: string; modelOverride?: { provider: string; modelId: string; apiKey?: string; baseUrl?: string }; thinkingBudgetTokens?: number },
) {
  // 本地模型路径
  if (opts?.localModelId) {
    return chatLocalViaIpc(messages, onEvent, opts.localModelId, opts?.abortSignal)
  }

  const primaryConfig = getChatModel()
  if (!primaryConfig) throw new Error('请先在设置中启用一个 AI 模型')
  let currentConfig: ProviderConfig = primaryConfig
  // 动态路由：覆盖模型选择（同时更新 provider/apiKey/baseUrl）
  if (opts?.modelOverride) {
    currentConfig = {
      ...currentConfig,
      modelId: opts.modelOverride.modelId,
      provider: opts.modelOverride.provider,
      ...(opts.modelOverride.apiKey ? { apiKey: opts.modelOverride.apiKey } : {}),
      ...(opts.modelOverride.baseUrl ? { baseUrl: opts.modelOverride.baseUrl } : {}),
    }
  }

  // Agent 行为规则：提前声明（pre-check 和后续流程共用）
  const { getPromptCode } = await import('@/lib/config')
  const agentRules = getPromptCode()

  // 两阶段调用：所有请求先 fast 无工具判断意图
  // 安全机制：已有工具调用的活跃编码会话直接走主模型（防止预检错误绕过工具）
  // 同时兼容 ChatMessage 格式（toolCallId/content）和 UIMessage 格式（toolBatch 数组）
  const hasPriorToolCalls = messages.some(m => {
    const role = (m as any).role
    if (role === 'tool') {
      if ((m as any).content || (m as any).toolCallId) return true
      const batch = (m as any).toolBatch
      if (Array.isArray(batch) && batch.some((t: any) => t.result)) return true
    }
    if (role === 'assistant' && Array.isArray((m as any).toolCalls) && (m as any).toolCalls.length > 0) return true
    return false
  })
  if (opts?.autoMode && !hasPriorToolCalls) {
    const lastMsg = messages[messages.length - 1]?.content
    // 提取用户文本：字符串直接取，ContentPart 数组提取 text 块
    const userText = typeof lastMsg === 'string' ? lastMsg
      : Array.isArray(lastMsg) ? lastMsg.filter((p: any) => p?.type === 'text').map((p: any) => p.text || '').join(' ') : ''
    // 含图片的消息跳过 fast 模型预检，直接走主模型（fast 模型不支持 vision）
    const hasImages = Array.isArray(lastMsg) && lastMsg.some((p: any) => p?.type === 'image')
    // 明显的编码操作 → 直接走工具，不预检
    const codeHints = [
      // 英文
      'fix', 'edit', 'change', 'write', 'create', 'implement', 'refactor', 'debug',
      'error', 'test', 'build', 'install', 'deploy', 'review', 'search', 'find',
      'check', 'look', 'examine', 'analyze', 'add', 'remove', 'delete', 'update',
      'modify', 'rename', 'move', 'run', 'commit', 'push', 'pull', 'merge', 'diff',
      // 中文
      '改', '修', '写', '实现', '创建', '重构', 'bug',
      '分析', '看', '查', '找', '搜索', '加', '删', '改', '帮',
      '运行', '测试', '提交', '部署', '安装', '编译', '调试',
    ]
    const needsTools = codeHints.some(w => userText.toLowerCase().includes(w))

    // 非明显编码且不含图片 → fast 模型预检（含图片时跳过，fast 模型不支持 vision）
    if (!needsTools && !hasImages) {
      try {
        const { delegateToModel } = await import('./chatService')
        const fastReply = await delegateToModel('fast', userText, agentRules)
        if (fastReply?.result) {
          // 如果 fast 模型没有建议调工具 → 直接返回
          const toolKeywords = ['workspace_', 'run_terminal', 'web_search', 'web_fetch', 'read_skill', 'delegate_task']
          const suggestsTools = toolKeywords.some(w => fastReply.result.includes(w))
          if (!suggestsTools) {
            onEvent?.({ type: 'text-delta', text: fastReply.result })
            onEvent?.({ type: 'done' })
            return fastReply.result
          }
        }
      } catch { /* 失败继续正常流程 */ }
    }
  }

  const mcpTools = await getMCPSdkTools(opts?.autoMode, opts?.userId)

  const toolsForDisclosure = mcpTools

  // Skills 渐进式披露（参考 Claude Code / OpenClaw 三层架构）
  // Level 1: 元数据（name + description），~100 tokens/skill，注入系统提示
  // Level 2: 完整 SKILL.md，通过 read_skill 按需加载
  // Level 3: 附属文件（references/scripts），通过 read_skill(name, file) 按需读取
  // 安装即生效，无需项目级开关
  const enabledSkills = getInstalledSkills()
  let skillInjection: string | undefined
  if (enabledSkills.length > 0) {
    if (enabledSkills.length <= 10) {
      skillInjection = '已安装技能（使用 read_skill 工具按需读取详细内容）:\n' +
        enabledSkills.map(s => `- ${s.name}: ${s.description}`).join('\n')
    } else if (enabledSkills.length <= 30) {
      skillInjection = `已安装 ${enabledSkills.length} 个技能（紧凑模式，使用 read_skill 查看详情）:\n` +
        enabledSkills.map(s => `- ${s.name}`).join('\n')
    } else {
      skillInjection = `已安装 ${enabledSkills.length} 个技能。使用 read_skill("技能名") 查看具体技能详情。`
    }
  }

  // 多层规则发现：从项目根向上遍历，读取 stardustRules.md + .stardust/rules/
  let projectInstructions: string | undefined
  let conditionalRules: Array<{ glob: string; content: string; path: string }> = []
  try {
    const wsApi = (window as any).electronAPI?.workspace
    if (wsApi) {
      let wsRoot = ''
      try { const info = await wsApi.getPaths(); wsRoot = info.root } catch {}
      if (wsRoot) {
        const { discoverRules, matchConditionalRules } = await import('./projectRules')
        const discovered = await discoverRules(wsRoot)
        if (discovered.unconditional) {
          projectInstructions = discovered.unconditional
        }
        conditionalRules = discovered.conditional
        if (discovered.files.length > 0) {
          console.log(`[projectRules] 发现 ${discovered.files.length} 个规则文件: ${discovered.files.join(', ')}`)
        }
      }
    }
  } catch {}

  // 条件规则匹配：基于最近操作的文件，注入匹配的 .stardust/rules/*.md
  if (conditionalRules.length > 0) {
    const { getRecentFiles } = await import('./fileTracker')
    const recentFiles = getRecentFiles()
    if (recentFiles.length > 0) {
      const { matchConditionalRules } = await import('./projectRules')
      const conditionalInjection = matchConditionalRules(conditionalRules, recentFiles)
      if (conditionalInjection) {
        projectInstructions = projectInstructions
          ? projectInstructions + '\n\n' + conditionalInjection
          : conditionalInjection
      }
    }
  }

  // ====== 渐进式披露 v2：对齐 CC SearchExtraTools + ExecuteExtraTool 拉取模式 ======

  // 保存完整工具集（供 search_tools / use_tool 使用）
  const fullToolSet = toolsForDisclosure

  // Phase 1: 内置工具显式白名单——不靠命名猜测，声明即内置
  const CORE_TOOL_PREFIXES = [
    'workspace_', 'sandbox_',                           // 文件/沙箱
    'run_terminal', 'check_terminal', 'run_terminal_input', 'get_command_history', // 终端
    'web_fetch', 'web_search', 'search_bing', 'search_duckduckgo', // 网络
    'mcp_list', 'mcp_read', 'mcp_get',                          // MCP 网关
    'ask_user', 'show_progress', 'notify_complete', 'update_task_list', // Agent UI
    'delegate_task', 'delegate_batch', 'delegate_chain',       // Agent 路由
    'plugin__',                                                 // 插件
    'read_skill', 'search_tools', 'use_tool',                  // 技能 + 按需激活
    'memory_',                                                   // 记忆
  ]
  const isCoreTool = (name: string) => CORE_TOOL_PREFIXES.some(p => name.startsWith(p))

  const allNames = Object.keys(toolsForDisclosure)
  const builtinNames = allNames.filter(isCoreTool)
  const mcpNames = allNames.filter(n => !isCoreTool(n))

  // 内置工具始终全量加载，MCP 工具全部推迟（按需拉取）
  let filteredTools = Object.fromEntries(builtinNames.map(n => [n, toolsForDisclosure[n]]))
  const disclosureResult: DisclosureResult = {
    tools: builtinNames,
    excluded: mcpNames,
    scores: Object.fromEntries([
      ...builtinNames.map(n => [n, { score: 100, matched: true }] as const),
      ...mcpNames.map(n => [n, { score: 0, matched: false, reason: 'MCP工具按需拉取，使用 search_tools 查找' }] as const),
    ]),
  }
  onEvent?.({ type: 'disclosure', disclosureResult })

  // Phase 2: search_tools + use_tool —— 对齐 CC 拉取模式
  filteredTools = {
    ...filteredTools,
    search_tools: {
      description:
        '搜索可用的 MCP 工具。当你需要的能力不在当前工具列表中时，描述你的需求，系统会返回匹配的工具名和功能描述。找到后用 use_tool 调用。' +
        '不要在请求里尝试猜工具名——描述你需要做什么即可。' +
        `当前可用 MCP 工具 ${mcpNames.length} 个。`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: '描述你需要什么能力，例如"查询PostgreSQL数据库"、"调用Slack发送消息"、"操作Kubernetes集群"' },
        },
        required: ['query'],
      }),
      execute: async ({ query }: { query: string }) => {
        if (mcpNames.length === 0) return '当前没有可用的 MCP 工具。'
        // 关键词打分：对每个 MCP 工具做匹配
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
        const scored = mcpNames.map(name => {
          const tool = fullToolSet[name] as any
          const text = `${name} ${tool?.description || ''}`.toLowerCase()
          let score = 0
          for (const t of tokens) {
            if (text.includes(t)) score += name.toLowerCase().includes(t) ? 2 : 1
          }
          return { name, description: tool?.description || '', score }
        })
        scored.sort((a, b) => b.score - a.score)
        const top = scored.filter(s => s.score > 0).slice(0, 8)
        if (top.length === 0) return `未找到匹配 "${query}" 的 MCP 工具。试试更通用的关键词，或描述具体的操作目标。`
        return '匹配的 MCP 工具:\n' + top.map((t, i) =>
          `${i + 1}. ${t.name}: ${t.description.slice(0, 120)}`
        ).join('\n')
      },
    },
    use_tool: {
      description:
        '调用通过 search_tools 发现的 MCP 工具。传入工具名和参数即可执行。如果工具需要参数但你没传，系统会返回参数提示。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: '工具名称（search_tools 返回结果中列出的名称）' },
          params: { type: 'object', description: '传递给该工具的参数' },
        },
        required: ['tool_name'],
      }),
      execute: async ({ tool_name, params }: { tool_name: string; params?: Record<string, unknown> }) => {
        const tool = fullToolSet[tool_name] as any
        if (!tool) return `工具 "${tool_name}" 不存在。请先调用 search_tools 查找可用工具。`

        // 检查必填参数
        const raw = tool._rawSchema as Record<string, any> | undefined
        const required = (raw?.required || []) as string[]
        const hasArgs = params && typeof params === 'object' && Object.keys(params).length > 0

        if (required.length > 0 && !hasArgs) {
          const props = raw?.properties as Record<string, any> | undefined
          const schemaHint = props
            ? '参数说明:\n' + Object.entries(props).map(([k, v]: [string, any]) =>
                `  ${k} (${v.type || 'any'})${required.includes(k) ? ' *必填*' : ''}${v.description ? ': ' + v.description : ''}`
              ).join('\n')
            : '参数结构未知'
          return `工具 "${tool_name}" 需要参数。\n${schemaHint}\n\n请重新调用 use_tool 并提供 params。`
        }

        try {
          return await tool.execute(params || {})
        } catch (e: any) {
          if (!hasArgs && required.length > 0) {
            const props = raw?.properties as Record<string, any> | undefined
            const hint = props ? '。参数: ' + Object.keys(props).join(', ') : ''
            return `调用 ${tool_name} 失败: ${e.message}${hint}`
          }
          return `调用 ${tool_name} 失败: ${e.message}`
        }
      },
    },
  }

  // Phase 4: 不再注入工具目录——search_tools 替代了它的作用
  const systemPrompt = [agentRules, skillInjection].filter(Boolean).join('\n\n') || undefined

  // 上下文窗口压缩（摘要堆叠：传递上轮摘要）
  const cwm = new ContextWindowManager()
  const contextWindow = cwm.getContextWindowForModel()

  let overheadTokens = estimateTokens(systemPrompt || '')
  for (const [name, tool] of Object.entries(filteredTools)) {
    overheadTokens += estimateTokens(name + (tool as any).description || '')
  }
  const compressOpt = {
    ...(opts?.forceCompression ? { force: true } : {}),
    extraTokens: overheadTokens,
    previousSummary: _lastCompressionSummary || undefined,
  }

  const {
    messages: compressedMessages,
    wasCompressed,
    originalTokens,
    compressedTokens,
    summary,
  } = await cwm.compress(messages, contextWindow, compressOpt)

  if (wasCompressed) {
    _lastCompressionSummary = summary || ''
    // 压缩后保存当前上下文供下次恢复
    _lastRulesSummary = projectInstructions || undefined
    onEvent?.({
      type: 'compression',
      originalTokens,
      compressedTokens,
      limit: contextWindow,
      summary,
    })
  }

  // 压缩后恢复注入：重新注入最近操作的文件和项目规则
  const postCompactInjection = wasCompressed
    ? await buildPostCompactInjection(getRecentFiles(), _lastRulesSummary)
    : null

  // 动静分离 system prompt（静态部分可缓存）
  const staticPart = (systemPrompt || '') + (summary ? `\n\n[Conversation summary]\n${formatCompactSummary(summary)}` : '')
  const dynamicPart = opts?.memoryInjection || ''

  if (opts?.memoryInjection) {
    onEvent?.({ type: 'system-log', text: `记忆注入:\n${opts.memoryInjection}` })
  } else {
    onEvent?.({ type: 'system-log', text: '无记忆（对话中提取后将在此显示）' })
  }

  // 动静分离：静态在前，动态追加。缓存通过beta header处理
  let finalSystem = staticPart.trim()
  if (dynamicPart.trim()) finalSystem += '\n\n' + dynamicPart.trim()
  if (postCompactInjection) finalSystem += '\n\n' + postCompactInjection

  onEvent?.({ type: 'system-log', text: `系统提示词 (${finalSystem.length}字):\n${finalSystem.slice(0, 500)}${finalSystem.length > 500 ? '...(截断)' : ''}` })

  // user message 注入：对齐 CC prependUserContext —— 每轮强制注入上下文提醒
  const contextMessages: Array<{ role: 'user'; content: string }> = []

  if (projectInstructions) {
    contextMessages.push({
      role: 'user',
      content: `<project-instructions>\n${projectInstructions}\n</project-instructions>`,
    })
  }

  // 动态工具纪律：对话越长提醒越强（防止后期"偷懒"不调工具）
  const turnCount = messages.filter(m => (m as any).role === 'user').length
  const toolDisciplineLevel = turnCount <= 1 ? 'basic'
    : turnCount <= 5 ? 'moderate'
    : turnCount <= 12 ? 'strong'
    : 'critical'

  const filesRestoredNote = wasCompressed
    ? ` File contents from before compaction have been restored — check the "压缩后文件恢复" section above before re-reading.`
    : ''
  const toolDisciplineMessages: Record<string, string> = {
    basic: `You have access to tools — use them for reading files, editing code, running commands.`,
    moderate: `TOOL DISCIPLINE: As the conversation continues, you MUST keep using tools. Every code change, file read, test run, or verification claim MUST come from a tool call in this turn. Do not drift into text-only mode.${filesRestoredNote}`,
    strong: `STRONG TOOL DISCIPLINE (turn ${turnCount}): You have been working on this task for a while. This is when models tend to skip tools and hallucinate. RESIST THIS. You MUST call tools for EVERY action. No tool call = no knowledge. Verify every change.${filesRestoredNote}`,
    critical: ` CRITICAL TOOL DISCIPLINE (turn ${turnCount}): Long conversation — highest risk of tool abandonment. Every statement about code, tests, or results WITHOUT a tool call in this turn is a HALLUCINATION. Call tools for EVERYTHING.${filesRestoredNote}`,
  }

  const toolSummary = [
    `Core tools always available: workspace_* (files), git_* (version control), run_terminal (shell), sandbox_* (code exec), web_search, web_fetch, delegate_task, update_task_list, search_tools/use_tool (MCP).`,
    `Prefer workspace_read_file/workspace_edit_file over run_terminal for file operations.`,
    `Use update_task_list for complex tasks: create steps → mark running → mark done immediately.`,
    `Read code before changing it. Verify before reporting complete.`,
    `MCP tools (if any) are discoverable via search_tools.`,
    `Memory: files in .stardust/memory/ directory. Use workspace_read_file/workspace_write_file to manage them directly.`,
    enabledSkills.length > 0 ? `Installed skills: ${enabledSkills.map(s => s.name).join(', ')}` : '',
  ].filter(Boolean).join(' ')

  contextMessages.push({
    role: 'user',
    content: [
      '<system-reminder>',
      `As you answer the user's questions, you can use the following context:`,
      `# currentDate`,
      `Today's date is ${new Date().toLocaleDateString('en-CA')}.`,
      wasCompressed ? `# contextStatus\nThe conversation history was recently compressed. The summary above captures key decisions and facts. Re-read files before making claims about their current state.` : '',
      `# toolDiscipline`,
      toolDisciplineMessages[toolDisciplineLevel],
      `# tools`,
      toolSummary,
      '</system-reminder>',
    ].filter(Boolean).join('\n'),
  })

  onEvent?.({ type: 'system-log', text: `发送 ${Object.keys(filteredTools).length} 个工具` })
  let currentMessages = [...contextMessages, ...compressedMessages]

  // ====== 恢复循环：max_output_tokens 升级 + 模型回退 + 工具放弃检测 ======
  const MAX_ESCALATIONS = 2
  const MAX_TOOL_ABANDONMENT_RETRIES = 1
  // 对齐 CC proxy: DeepSeek/OpenAI 兼容模型不传 max_tokens 或小步升级
  const providerName = (currentConfig.provider).toLowerCase()
  const isOpenAICompat = ['deepseek', '深度求索', 'openai', 'qwen', '通义千问', 'openrouter', 'groq', 'together', 'mistral', 'ollama', 'lmstudio', 'perplexity', 'fireworks'].some(
    p => providerName.includes(p)
  )
  const MAX_OUTPUT_FIRST = isOpenAICompat ? 4096 : 32000
  const MAX_OUTPUT_CAP = isOpenAICompat ? 8192 : 128000
  let maxOutputTokens: number | undefined = undefined  // 首次不设限制
  let escalationCount = 0
  let hasAttemptedFallback = false
  let toolAbandonmentRetries = 0
  let finalUsage: any = null
  let capturedFinishReason = ''
  let capturedUsage: any = null

  let fullText = ''

  while (true) {
    const trace = createTrace()
    // 只追踪当前轮次的用户消息（不追踪工具结果等）
    currentMessages.forEach(m => {
      if (m.role === 'user' || m.role === 'system') {
        trace.addInput(typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      }
    })

    let streamError: Error | null = null
    const assistantMsgs: Array<{ role: 'assistant'; content: string }> = []
    let toolsCalledThisRound = false
    capturedFinishReason = ''
    capturedUsage = null

    try {
      const stream = streamChatWithTools({
        config: currentConfig,
        messages: currentMessages as any,
        tools: Object.keys(filteredTools).length > 0 ? filteredTools : {},
        systemPrompt: finalSystem || undefined,
        abortSignal: opts?.abortSignal,
        maxOutputTokens,
        thinkingBudgetTokens: opts?.thinkingBudgetTokens,
        maxSteps: getAgentMaxSteps(),
      })

      for await (const event of stream) {
        if (opts?.abortSignal?.aborted) break
        if (event.type === 'reasoning-delta') {
          onEvent?.({ type: 'reasoning-delta', text: event.text, reasoningId: event.reasoningId })
        } else if (event.type === 'text-delta') {
          fullText += event.text
          trace.addOutput(event.text)
          onEvent?.({ type: 'text-delta', text: event.text })
        } else if (event.type === 'tool-call') {
          toolsCalledThisRound = true
          const name = event.toolName
          trace.toolStart(name)
          onEvent?.({ type: 'tool-call', toolName: name, toolInput: event.toolInput })
        } else if (event.type === 'tool-result') {
          const name = event.toolName
          const output = String(event.toolOutput ?? '')
          const ok = !output.startsWith('Error')
          trace.toolEnd(name, ok)
          onEvent?.({ type: 'tool-result', toolName: name, toolOutput: output })
        } else if (event.type === 'done') {
          capturedFinishReason = event.finishReason
          capturedUsage = event.usage
        }
      }
    } catch (e: any) {
      streamError = e
      const errMsg = String(e.message || e)

      // === 上下文长度错误 → 响应式压缩重试 ===
      if (
        errMsg.includes('prompt') && (errMsg.includes('too long') || errMsg.includes('length') || errMsg.includes('exceeded')) ||
        errMsg.includes('context_length_exceeded') ||
        errMsg.includes('400') && errMsg.includes('token')
      ) {
        const recovered = await tryReactiveCompact(currentMessages.slice(contextMessages.length), cwm, contextWindow)
        if (recovered) {
          onEvent?.({ type: 'system-log', text: '上下文过长，已自动压缩后重试...' })
          currentMessages = [...contextMessages, ...recovered]
          continue
        }
        onEvent?.({ type: 'system-log', text: '上下文过长且无法自动压缩。请减少上下文后重试。' })
        break
      }

      // === 模型错误 → 回退到备选模型 ===
      if (!hasAttemptedFallback) {
        const fallbackConfig = await pickFallbackModel(currentConfig)
        if (fallbackConfig) {
          hasAttemptedFallback = true
          const fbName = fallbackConfig.provider
          currentConfig = fallbackConfig
          onEvent?.({ type: 'system-log', text: `模型调用失败，回退到 ${fbName}/${fallbackConfig.modelId}...` })
          continue
        }
      }

      break
    }

    // ====== 流式完成，检查输出是否被截断 ======
    if (!streamError) {
      const finishReason = capturedFinishReason
      // 用户主动中断：跳过截断升级和工具放弃检测，保留已有文本
      if (finishReason === 'abort') break

      const isTruncated =
        finishReason === 'length' ||
        finishReason === 'max_tokens'

      if (isTruncated && escalationCount < MAX_ESCALATIONS && !opts?.abortSignal?.aborted) {
        escalationCount++
        maxOutputTokens = maxOutputTokens == null
          ? MAX_OUTPUT_FIRST
          : Math.min(maxOutputTokens * 2, MAX_OUTPUT_CAP)
        onEvent?.({ type: 'system-log', text: `输出被截断 (finishReason=${finishReason})，升级至 ${maxOutputTokens} tokens 重试 (#${escalationCount})...` })
        // 清空已展示的截断文本，重试后只展示完整版
        onEvent?.({ type: 'retry-clear' })
        assistantMsgs.push({ role: 'assistant', content: fullText.slice(-500) })
        currentMessages = [
          ...currentMessages,
          ...assistantMsgs,
          { role: 'user' as const, content: 'Output truncated. Resume directly — no recap, no apology. Pick up mid-thought where cut off. Break remaining work into smaller pieces.' },
        ]
        continue
      }

      // ====== 工具放弃检测：声称完成但本轮未调用任何工具 ======
      if (!toolsCalledThisRound && toolAbandonmentRetries < MAX_TOOL_ABANDONMENT_RETRIES && !opts?.abortSignal?.aborted) {
        const completionPatterns = [
          // 中文
          /已(完成|修复|修改|改好|写好|实现|创建|添加|删除|更新|重构|解决|搞定|处理|调整|优化|整合|合并|拆分|迁移|升级|降级|回滚)/,
          /(问题|bug|错误|功能|任务|需求|改动|修改|优化)已(完成|修复|解决|实现|处理|结束|搞定)/,
          /(代码|文件|配置|测试|文档)已(写|改|修改|更新|创建|添加|完成|生成)/,
          /任务已(完成|结束|搞定)/,
          /(改动|修改|变更)已(完成|实施|应用|生效)/,
          /可以(了|的)|没问题|已经(好|行|完成)了/,
          /(测试|编译|构建)(通过|成功|完成)/,
          // 英文
          /(done|fixed|completed|finished|resolved|implemented|created|added|removed|updated|refactored|solved|handled)/i,
          /(task|issue|bug|feature) (is |has been )?(done|fixed|completed|finished|resolved)/i,
          /(I('ve| have)|I'?m) (done|finished|completed|fixed)/i,
          /(all|everything) (is |looks? )(good|fine|working|done|ready)/i,
          /(tests?|build) (pass|succeed|complete)/i,
        ]
        const claimsCompletion = completionPatterns.some(p => p.test(fullText))

        if (claimsCompletion) {
          toolAbandonmentRetries++
          onEvent?.({ type: 'system-log', text: ` 检测到无工具调用的完成声明 (#${toolAbandonmentRetries})——模型在YY。强制重试并要求使用工具验证...` })

          // 保留最后一段文本作为上下文，注入强制工具提醒
          const tailText = fullText.slice(-300)
          currentMessages = [
            ...currentMessages,
            { role: 'assistant' as const, content: tailText },
            { role: 'user' as const, content: `<system-reminder>
 工具放弃强制恢复 (第${toolAbandonmentRetries}次)

你刚才输出了声称完成任务的文本，但没有调用任何工具。这是工具放弃（Tool Abandonment）——不可接受。

你必须立即调用工具来完成当前任务：
1. workspace_read_file — 重新读取你声称已修改的文件，确认实际状态
2. run_terminal — 运行相关测试或命令来验证你的改动
3. 如果确实没有任务要做（用户只是闲聊），直接回复简短答案，不要声称完成

不要输出解释、不要道歉、不要重述你"本来打算做什么"——直接调工具。
</system-reminder>` },
          ]
          fullText = ''  // 重置文本，下一轮重新累积
          continue  // 回到循环顶部重试
        }
      }

      // 捕获 usage（来自 streamChatWithTools 的 done 事件）
      if (capturedUsage) finalUsage = capturedUsage
    }

    break  // 正常完成或无法恢复 → 退出循环
  }

  // ====== 后处理：usage 回传 ======
  if (finalUsage) {
    cwm.updateRealTokens(
      finalUsage.inputTokens || 0,
      finalUsage.outputTokens || 0,
    )
  }
  const traceBuilder = createTrace()
  const turnTrace = traceBuilder.finish()
  if (finalUsage) {
    turnTrace.inputTokens = finalUsage.inputTokens || 0
    turnTrace.outputTokens = finalUsage.outputTokens || 0
    if (finalUsage.cachedInputTokens) turnTrace.cachedInputTokens = finalUsage.cachedInputTokens
  }
  onEvent?.({ type: 'done', trace: turnTrace })
  return fullText
}

/** 选择一个备选模型用于回退 */
async function pickFallbackModel(current: ProviderConfig): Promise<ProviderConfig | null> {
  try {
    const { getAIModels } = await import('./config')
    const all = getAIModels()
    const enabled = all.filter(m => m.enabled && m.apiKey)
    if (enabled.length <= 1) return null
    // 找和当前模型不同的第一个可用模型
    const cfg = enabled.find(m => m.selectedModel !== current.modelId)
    if (!cfg) return null
    return {
      provider: (cfg.name || cfg.id).toLowerCase(),
      modelId: cfg.selectedModel,
      apiKey: cfg.apiKey || 'dummy',
      baseUrl: cfg.baseUrl || undefined,
    }
  } catch {
    return null
  }
}

/**
 * 响应式压缩：在 API 返回 context length 错误时调用
 * 返回重试用的消息数组，或 null 表示无法恢复
 */
async function tryReactiveCompact(
  messages: ChatMessage[],
  cwm: ContextWindowManager,
  contextWindow: number,
): Promise<ChatMessage[] | null> {
  try {
    const result = await cwm.reactiveCompact(messages, contextWindow, _lastCompressionSummary || undefined)
    if (result.wasCompressed) {
      _lastCompressionSummary = result.summary || ''
      return result.messages
    }
  } catch {}
  return null
}


// ====== 本地模型推理（通过 IPC） ======

async function chatLocalViaIpc(
  messages: ChatMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  modelId?: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  console.warn('[localInference] 开始，modelId:', modelId, 'messages:', messages.length)
  if (!modelId) throw new Error('未指定本地模型')
  const api = window.electronAPI?.model
  if (!api) throw new Error('本地模型 API 不可用')

  // 转成简单消息格式
  const msgs = messages.map(m => ({ role: m.role as string, content: typeof m.content === 'string' ? m.content : '' }))

  // 发起流式聊天
  api.chat(modelId, msgs)

  let fullText = ''

  return new Promise((resolve, reject) => {
    const unsubChunk = api.onChatChunk(({ text }) => {
      console.warn('[localInference] chunk:', text.slice(0, 50))
      fullText += text
      onEvent?.({ type: 'text-delta', text })
    })
    const unsubDone = api.onChatDone(() => {
      console.warn('[localInference] done, fullText:', fullText.length)
      unsubChunk()
      unsubDone()
      unsubErr()
      onEvent?.({ type: 'done' })
      resolve(fullText)
    })
    const unsubErr = api.onChatError(({ error }) => {
      console.warn('[localInference] error:', error)
      unsubChunk()
      unsubDone()
      unsubErr()
      reject(new Error(error))
    })

    // 支持打断
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        console.warn('[localInference] aborted')
        unsubChunk(); unsubDone(); unsubErr()
        reject(new DOMException('用户中断', 'AbortError'))
      }, { once: true })
    }
  })
}

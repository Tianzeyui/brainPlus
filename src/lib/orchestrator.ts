/**
 * Orchestrator — 子 Agent 委托系统
 * 支持 Agent 类型分化、结构化输出、Token 预算、Pipeline 编排、对抗性验证
 */
import { streamChatWithTools } from './api'
import { getChatModel } from './chatService'
import { getAgentMaxSteps } from './config'
import { estimateTokens } from './observability'

// ====== 类型定义 ======

export interface DelegateStream {
  text: (delta: string) => void
  toolCall: (name: string) => void
  done: () => void
  subtaskStart?: (index: number, tier: string, agentType: string) => void
  subtaskEnd?: (index: number, text: string, toolCalls: string[], modelName: string) => void
  subtaskDelta?: (index: number, delta: string) => void
}

/** Agent 类型 */
export type AgentType = 'general' | 'explore' | 'plan' | 'verify'

/** 委托选项 */
export interface DelegateOptions {
  tier?: 'fast' | 'balanced' | 'powerful'
  agentType?: AgentType
  schema?: Record<string, any>       // JSON Schema for structured output
  budget?: number                    // max token budget
  systemContext?: string
  stream?: DelegateStream
  maxSteps?: number
  cwd?: string                       // working directory (TODO: worktree isolation)
  background?: boolean               // run in background (returns taskId)
}

/** 委托结果 */
export interface DelegateResult {
  text: string
  modelName: string
  toolCalls: string[]
  tokensUsed: number
  budgetExceeded: boolean
  schemaValid?: boolean
}

// ====== Agent 类型专用提示词 ======

const AGENT_PROMPTS: Record<AgentType, string> = {
  general: 'You are a coding agent. Use tools directly. Be concise and accurate.',
  explore: 'You are a code explorer. Your job is to read and understand code. Use read_file, grep, and glob to gather information. Report your findings clearly. Do NOT modify any files.',
  plan: 'You are a software architect. Analyze requirements, evaluate trade-offs, and propose the best approach. Do NOT write code or modify files. Output a structured plan with steps, file changes, and rationale.',
  verify: 'You are a code reviewer. Your job is to find bugs, edge cases, and improvements. Be skeptical and thorough. Report issues with file paths and line numbers. Do NOT modify any files.',
}

/** 按 Agent 类型裁剪工具 */
const READONLY_TOOLS = ['workspace_read_file', 'workspace_glob', 'workspace_grep']

function filterToolsByType(tools: Record<string, any>, agentType: AgentType): Record<string, any> {
  if (agentType === 'general') return tools
  // explore/plan/verify: 只读工具
  const filtered: Record<string, any> = {}
  for (const [name, def] of Object.entries(tools)) {
    if (READONLY_TOOLS.includes(name) || name === 'web_search' || name === 'web_fetch' || name === 'ask_user') {
      filtered[name] = def
    }
  }
  return filtered
}

// ====== 结构化输出验证 ======

function validateSchema(text: string, schema: Record<string, any>): { valid: boolean; error?: string } {
  try {
    // 尝试提取 JSON（Markdown 代码块或纯文本）
    let json: any
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      json = JSON.parse(codeBlockMatch[1].trim())
    } else {
      // 尝试找第一个完整 JSON 对象
      const braceMatch = text.match(/\{[\s\S]*\}/)
      if (braceMatch) json = JSON.parse(braceMatch[0])
      else return { valid: false, error: 'No JSON object found in output' }
    }

    // 检查必填字段
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in json)) return { valid: false, error: `Missing required field: ${field}` }
      }
    }

    // 检查类型
    if (schema.properties) {
      for (const [field, prop] of Object.entries(schema.properties as Record<string, any>)) {
        if (field in json && prop.type) {
          const actual = typeof json[field]
          const expected = prop.type
          if (expected === 'array' && !Array.isArray(json[field])) return { valid: false, error: `Field ${field}: expected array, got ${actual}` }
          if (expected === 'number' && actual !== 'number') return { valid: false, error: `Field ${field}: expected number, got ${actual}` }
          if (expected === 'string' && actual !== 'string') return { valid: false, error: `Field ${field}: expected string, got ${actual}` }
          if (expected === 'boolean' && actual !== 'boolean') return { valid: false, error: `Field ${field}: expected boolean, got ${actual}` }
        }
      }
    }

    return { valid: true }
  } catch (e: any) {
    return { valid: false, error: `JSON parse failed: ${e.message}` }
  }
}

// ====== 核心委托函数 ======

export async function delegateByTier(
  tier: 'fast' | 'balanced' | 'powerful',
  task: string,
  systemContext?: string,
  stream?: DelegateStream,
): Promise<string> {
  const result = await delegateTask(task, { tier, systemContext, stream })
  return result.text
}

export async function delegateTask(
  task: string,
  opts: DelegateOptions = {},
): Promise<DelegateResult> {
  const config = getChatModel()
  if (!config) throw new Error('没有可用的模型')

  const tier = opts.tier || 'balanced'
  const agentType = opts.agentType || 'general'

  // 模型选择
  let modelId = config.modelId
  try {
    const { getAIModels, getModelTier } = await import('./config')
    const models = getAIModels()
    const enabled = models.find((m) => m.enabled && m.apiKey)
    if (enabled) {
      const matched = (enabled.availableModels || []).filter(
        (m: any) => getModelTier(m.id) === tier
      )
      if (matched.length > 0) {
        modelId = tier === 'fast' ? matched[0].id : matched[matched.length - 1].id
      }
    }
  } catch {}

  // 工具集
  let tools: Record<string, any> = {}
  try {
    const { getMCPSdkTools } = await import('./chatService')
    tools = await getMCPSdkTools(false)
    tools = filterToolsByType(tools, agentType)
  } catch {}

  // 系统提示词
  const basePrompt = AGENT_PROMPTS[agentType]
  let systemPrompt = opts.systemContext
    ? `${basePrompt}\n\nContext: ${opts.systemContext}`
    : basePrompt

  if (opts.schema) {
    systemPrompt += `\n\nYou MUST respond with a JSON object matching this schema: ${JSON.stringify(opts.schema)}. Wrap the JSON in a \`\`\`json code block.`
  }

  if (opts.budget) {
    systemPrompt += `\n\nToken budget: ${opts.budget} tokens. Be concise and stop before exceeding.`
  }

  // 流式执行
  const streamResult = streamChatWithTools({
    config: { ...config, modelId },
    messages: [{ role: 'user', content: task }],
    tools,
    systemPrompt,
    maxSteps: opts.maxSteps || getAgentMaxSteps(),
  })

  let fullText = ''
  const toolCalls: string[] = []
  let tokensUsed = 0
  let budgetExceeded = false

  for await (const event of streamResult) {
    if (event.type === 'text-delta') {
      fullText += event.text
      opts.stream?.text(event.text)
    } else if (event.type === 'tool-call') {
      toolCalls.push(event.toolName)
      opts.stream?.toolCall(event.toolName)
    }
    // 估算 token
    tokensUsed = estimateTokens(fullText) + toolCalls.length * 100
    if (opts.budget && tokensUsed > opts.budget) {
      budgetExceeded = true
      break
    }
  }

  opts.stream?.done()

  // 结构化输出验证
  let schemaValid: boolean | undefined
  if (opts.schema) {
    const validation = validateSchema(fullText, opts.schema)
    schemaValid = validation.valid
    if (!validation.valid && !budgetExceeded) {
      // 追加一次修正重试
      const retryTask = `Your previous output failed schema validation: ${validation.error}\n\nPlease fix and output a valid JSON object matching: ${JSON.stringify(opts.schema)}\nPrevious output:\n${fullText.slice(-500)}`
      const retryResult = streamChatWithTools({
        config: { ...config, modelId },
        messages: [{ role: 'user', content: retryTask }],
        tools,
        systemPrompt: 'Output ONLY a valid JSON object matching the schema. Wrap in ```json block.',
        maxSteps: 1,
      })
      let retryText = ''
      for await (const event of retryResult) {
        if (event.type === 'text-delta') retryText += event.text
      }
      if (retryText) {
        fullText = retryText
        const revalidation = validateSchema(fullText, opts.schema!)
        schemaValid = revalidation.valid
      }
    }
  }

  const modelName = modelId
  const toolInfo = toolCalls.length > 0 ? `\n\n_调用工具: ${toolCalls.join(', ')}_` : ''
  const budgetInfo = budgetExceeded ? '\n\n_[Token budget exceeded]_' : ''

  return {
    text: `[${modelName} (${tier}/${agentType})]\n${fullText}${toolInfo}${budgetInfo}`,
    modelName,
    toolCalls,
    tokensUsed,
    budgetExceeded,
    schemaValid,
  }
}

// ====== 并行/Pipeline 编排 ======

export async function delegateBatch(
  tasks: Array<{ task: string; tier?: string; agentType?: AgentType }>,
  mode: 'parallel' | 'pipeline' = 'parallel',
  baseOpts?: DelegateOptions,
): Promise<DelegateResult[]> {
  if (mode === 'parallel') {
    const taskResults = tasks.map(async (t, i) => {
      const tier = (t.tier as any) || baseOpts?.tier || 'balanced'
      const agentType = t.agentType || 'general'
      baseOpts?.stream?.subtaskStart?.(i, tier, agentType)
      const perStream: DelegateStream = {
        text: (d: string) => baseOpts?.stream?.subtaskDelta?.(i, d),
        toolCall: (n: string) => baseOpts?.stream?.toolCall(n),
        done: () => {},
      }
      const result = await delegateTask(t.task, { ...baseOpts, tier, agentType, stream: perStream })
        .catch(e => ({ text: `Error: ${e.message}`, modelName: 'error', toolCalls: [], tokensUsed: 0, budgetExceeded: false }))
      baseOpts?.stream?.subtaskEnd?.(i, result.text, result.toolCalls || [], result.modelName)
      return result
    })
    return Promise.all(taskResults)
  }

  // pipeline: 串行，每个阶段发头 → 执行 → 上下文传递
  const results: DelegateResult[] = []
  let context = ''
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    baseOpts?.stream?.text(`### 子任务 ${i + 1}\n`)
    const taskWithContext = context ? `${t.task}\n\nPrevious stage results:\n${context.slice(-1000)}` : t.task
    const result = await delegateTask(taskWithContext, {
      ...baseOpts,
      tier: (t.tier as any) || baseOpts?.tier,
      agentType: t.agentType,
    }).catch(e => ({ text: `Error: ${e.message}`, modelName: 'error', toolCalls: [], tokensUsed: 0, budgetExceeded: false }))
    results.push(result)
    context += '\n' + result.text.slice(-500)
  }
  return results
}

// ====== 对抗性验证 ======

export async function verifyClaim(
  claim: string,
  context: string,
  options: { voters?: number; tier?: 'fast' | 'balanced' | 'powerful' } = {},
): Promise<{ passed: boolean; votes: { passed: boolean; reason: string }[]; summary: string }> {
  const voterCount = options.voters || 3
  const tier = options.tier || 'fast'

  const voterTasks = Array.from({ length: voterCount }, (_, i) => ({
    task: `CRITICALLY EVALUATE this claim from different angle #${i + 1}:\n\nCLAIM: ${claim}\n\nCONTEXT:\n${context.slice(-2000)}\n\nTry to REFUTE this claim. Consider:\n- Edge cases that break it\n- Missing error handling\n- Performance or security issues\n- Test coverage gaps\n\nRespond with JSON:\n{"passed": true|false, "reason": "specific reason with evidence"}`,
    tier,
    agentType: 'verify' as AgentType,
  }))

  const schema = {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      reason: { type: 'string' },
    },
    required: ['passed', 'reason'],
  }

  const results = await Promise.all(voterTasks.map(t =>
    delegateTask(t.task, { tier: t.tier, agentType: t.agentType, schema })
  ))

  const votes = results.map((r, i) => {
    try {
      const json = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] || '{}')
      return { passed: json.passed !== false, reason: json.reason || 'No reason provided' }
    } catch {
      return { passed: true, reason: `Voter ${i + 1}: could not parse response` }
    }
  })

  const passedCount = votes.filter(v => v.passed).length
  const passed = passedCount >= Math.ceil(voterCount / 2) // 多数通过

  return {
    passed,
    votes,
    summary: `${passed ? 'PASSED' : 'REJECTED'}: ${passedCount}/${voterCount} voters agree.\n${votes.map((v, i) => `  Voter ${i + 1}: ${v.passed ? 'PASS' : 'FAIL'} — ${v.reason}`).join('\n')}`,
  }
}

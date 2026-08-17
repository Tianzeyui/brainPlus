/**
 * API 层统一入口 — 替代 Vercel AI SDK
 *
 * streamChat()  → 替代 streamText()
 * generateText() → 替代 generateText()
 *
 * 内部路由：
 *   Anthropic → @anthropic-ai/sdk 直调
 *   DeepSeek/OpenAI/Qwen/... → fetch() + CC 同款转换
 */
import type { ToolDef, StreamEvent, ChatMessage, ProviderConfig, Usage } from './types'
import { streamAnthropic } from './anthropic'
import { streamOpenAICompat } from './openai-compat'

// ====== Provider 检测 ======

const ANTHROPIC_PROVIDERS = ['anthropic', 'claude', 'bedrock', 'vertex']
const OPENAI_COMPAT_PROVIDERS = [
  'deepseek', '深度求索',
  'openai',
  'qwen', '通义千问',
  'openrouter',
  'groq',
  'together',
  'mistral',
  'ollama',
  'lmstudio',
  'perplexity',
  'fireworks',
  'gemini', 'google',
  'azure',
]

function isAnthropicProvider(provider: string): boolean {
  const p = provider.toLowerCase()
  return ANTHROPIC_PROVIDERS.some(k => p.includes(k))
}

function isOpenAICompatProvider(provider: string): boolean {
  const p = provider.toLowerCase()
  return OPENAI_COMPAT_PROVIDERS.some(k => p.includes(k))
}

function detectProvider(config: ProviderConfig): 'anthropic' | 'openai-compat' {
  const name = config.provider.toLowerCase()
  if (isAnthropicProvider(name)) return 'anthropic'
  if (isOpenAICompatProvider(name)) return 'openai-compat'
  // 默认走 OpenAI 兼容（大多数替代 API 都是这个格式）
  return 'openai-compat'
}

// ====== 公开 API ======

export interface StreamChatOptions {
  config: ProviderConfig
  messages: ChatMessage[]
  tools: Record<string, ToolDef>
  systemPrompt?: string
  abortSignal?: AbortSignal
  maxOutputTokens?: number
  thinkingBudgetTokens?: number
}

/**
 * 流式聊天 — 替代 AI SDK 的 streamText()
 */
export async function* streamChat(
  options: StreamChatOptions,
): AsyncGenerator<StreamEvent> {
  const { config, messages, tools, systemPrompt, abortSignal, maxOutputTokens, thinkingBudgetTokens } = options
  const provider = detectProvider(config)

  if (provider === 'anthropic') {
    yield* streamAnthropic(config, messages, tools, systemPrompt, abortSignal, maxOutputTokens, thinkingBudgetTokens)
  } else {
    yield* streamOpenAICompat(config, messages, tools, systemPrompt, abortSignal, maxOutputTokens, thinkingBudgetTokens)
  }
}

export interface GenerateTextOptions {
  config: ProviderConfig
  prompt: string
  systemPrompt?: string
  maxOutputTokens?: number
  thinkingBudgetTokens?: number
}

/**
 * 非流式文本生成 — 替代 AI SDK 的 generateText()
 * 用于 delegateToModel、标题生成等场景
 */
export async function generateText(options: GenerateTextOptions): Promise<{
  text: string
  usage: Usage
}> {
  const { config, prompt, systemPrompt, maxOutputTokens, thinkingBudgetTokens } = options
  const provider = detectProvider(config)

  if (provider === 'anthropic') {
    // 使用 stream 收集完整文本
    let text = ''
    let usage: Usage = { inputTokens: 0, outputTokens: 0 }
    for await (const event of streamAnthropic(
      config,
      [{ role: 'user', content: prompt }],
      {},
      systemPrompt,
      undefined,
      maxOutputTokens,
    )) {
      if (event.type === 'text-delta') text += event.text
      else if (event.type === 'done') usage = event.usage
    }
    return { text, usage }
  }

  // OpenAI 兼容：非流式 fetch
  const baseUrl = (config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const url = baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`

  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId,
      messages,
      max_tokens: maxOutputTokens,
    }),
  })

  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = data.choices?.[0]?.message?.content || ''
  const usage: Usage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  }

  return { text, usage }
}

// Re-export types and jsonSchema
export type { ToolDef, StreamEvent, ChatMessage, ProviderConfig, Usage }
export { jsonSchema, type JSONSchema } from './jsonSchema'

// ====== 工具执行循环 — 替代 AI SDK 的内部 loop ======

/**
 * 带工具执行的流式对话 — AI SDK streamText() 的替代
 *
 * 内部循环：
 *   1. 调 API（streamChat）
 *   2. 收集文本 + 工具调用
 *   3. 如果有工具调用：执行工具，添加到消息历史，回到 1
 *   4. 如果无工具调用（finishReason=stop）：退出
 *   5. 达到 maxSteps 上限：退出
 */
export async function* streamChatWithTools(
  options: StreamChatOptions & { maxSteps?: number },
): AsyncGenerator<StreamEvent> {
  const {
    config, tools, systemPrompt, abortSignal, maxOutputTokens,
  } = options
  // 直接引用原数组，确保重试时 chat() 的 currentMessages 包含工具历史
  const messages: ChatMessage[] = options.messages
  const maxSteps = options.maxSteps ?? 25
  let stepCount = 0

  // 收集当前轮次的文本（单次 API 调用的文本输出）
  let roundText = ''
  // 收集当前轮次的 reasoning（用于写入 assistant 消息 history，DeepSeek R1 等需要）
  let roundReasoning = ''
  // 收集当前轮次的工具调用
  const pendingToolCalls: Array<{
    id: string; name: string; input: unknown; output?: unknown; ok?: boolean
  }> = []
  // 收集当前轮次所有事件中的 assistant content（用于后续消息历史）
  let assistantContent = ''

  while (stepCount < maxSteps) {
    if (abortSignal?.aborted) break

    roundText = ''
    roundReasoning = ''
    pendingToolCalls.length = 0
    assistantContent = ''
    let hadToolCalls = false
    let finishReason = 'stop'
    let usage: Usage = { inputTokens: 0, outputTokens: 0 }

    const apiStream = streamChat({
      config, messages, tools, systemPrompt, abortSignal, maxOutputTokens,
    })

    for await (const event of apiStream) {
      if (abortSignal?.aborted) break

      switch (event.type) {
        case 'text-delta':
          roundText += event.text
          assistantContent += event.text
          yield { type: 'text-delta', text: event.text }
          break

        case 'reasoning-delta':
          roundReasoning += event.text
          yield event
          break

        case 'tool-call-start': {
          hadToolCalls = true
          let input: unknown = event.input
          // Try to parse JSON input
          try { input = JSON.parse(event.input) } catch {}

          pendingToolCalls.push({
            id: event.id,
            name: event.name,
            input,
          })

          yield {
            type: 'tool-call',
            toolName: event.name,
            toolInput: input,
          }
          break
        }

        case 'done':
          finishReason = event.finishReason
          usage = event.usage
          break
      }
    }

    // 如果本轮没有工具调用，结束循环
    if (!hadToolCalls) {
      yield { type: 'done', finishReason, usage }
      return
    }

    // 执行工具调用
    for (const tc of pendingToolCalls) {
      const tool = tools[tc.name]
      if (!tool) {
        const output = `Error: 工具 "${tc.name}" 未找到`
        tc.output = output
        tc.ok = false
        yield { type: 'tool-result', toolName: tc.name, toolOutput: output }
        continue
      }

      try {
        const result = await tool.execute({ ...tc.input as any, _toolName: tc.name })
        tc.output = result
        tc.ok = !String(result).startsWith('Error')
        yield { type: 'tool-result', toolName: tc.name, toolOutput: result }
      } catch (e: any) {
        const output = `Error: ${e.message}`
        tc.output = output
        tc.ok = false
        yield { type: 'tool-result', toolName: tc.name, toolOutput: output }
      }
    }

    // 构建 assistant 消息（含 tool_calls 信息） + tool result 消息
    messages.push({
      role: 'assistant',
      content: assistantContent || '',
      toolCalls: pendingToolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        input: tc.input,
      })),
      reasoning_content: roundReasoning || undefined,
    })

    for (const tc of pendingToolCalls) {
      messages.push({
        role: 'tool',
        content: String(tc.output ?? ''),
        toolCallId: tc.id,
      })
    }

    stepCount++
    if (stepCount >= maxSteps) {
      yield { type: 'done', finishReason: 'max_steps', usage }
      return
    }
  }
}


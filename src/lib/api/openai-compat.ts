/**
 * OpenAI 兼容 API provider — 原生 fetch() + SSE 流解析
 * 对齐 CC proxy: anthropicToOpenaiChat + openaiChatStreamToAnthropic
 * 支持: DeepSeek, OpenAI, Qwen, OpenRouter, Groq, Together, Mistral, Ollama 等
 */
import type { ToolDef, StreamEvent, ChatMessage, ProviderConfig, Usage } from './types'

// ====== 消息转换：stardust → OpenAI Chat Completions ======

interface OpenAIMessage {
  role: string
  content: string | null | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  reasoning_content?: string
}

/** 将我们的图片格式转为 OpenAI Vision 兼容格式 */
function normalizeContent(content: string | any[]): string | any[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content)

  return content.map((block) => {
    if (block?.type === 'image' && block.image) {
      // 我们的格式 { type:'image', image:'data:...;base64,...', mimeType:'...' }
      // OpenAI 格式 { type:'image_url', image_url:{ url:'data:...' } }
      return { type: 'image_url', image_url: { url: block.image } }
    }
    return block
  })
}

function convertMessages(messages: ChatMessage[], system?: string): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  // System prompt
  if (system) {
    result.push({ role: 'system', content: system })
  }

  for (const m of messages) {
    if (m.role === 'system') {
      result.push({ role: 'system', content: m.content })
    } else if (m.role === 'user') {
      const content = normalizeContent(m.content)
      result.push({ role: 'user', content: content as any })
    } else if (m.role === 'assistant') {
      const hasTools = m.toolCalls && m.toolCalls.length > 0
      // DeepSeek 要求纯 tool 消息 content 为 null，不能是空字符串
      const msg: OpenAIMessage = { role: 'assistant', content: hasTools && !m.content ? null : (m.content || '') }
      if (hasTools) {
        msg.tool_calls = m.toolCalls.map(tc => ({
          id: (tc.id || '').startsWith('call_') ? tc.id : 'call_' + (tc.id || ''),
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }))
      }
      if (m.reasoning_content) msg.reasoning_content = m.reasoning_content
      result.push(msg)
    } else if (m.role === 'tool') {
      // 避免 Double prefix: DeepSeek 返回的 ID 已自带 call_ 前缀
      const rawId = m.toolCallId || ''
      const tid = rawId.startsWith('call_') ? rawId : 'call_' + rawId
      result.push({
        role: 'tool',
        content: m.content,
        tool_call_id: tid,
      })
    }
  }

  return result
}

// ====== 工具转换：stardust → OpenAI function ======

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function convertTools(tools: Record<string, ToolDef>): OpenAITool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name,
      description: tool.description,
      parameters: (tool.inputSchema || { type: 'object', properties: {} }),
    },
  }))
}

// ====== SSE 流解析 ======

interface SSEChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_cache_hit_tokens?: number
  }
}

class SSELineDecoder {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''
    return lines.filter(l => l.trim()).map(l => l.trim())
  }

  flush(): string[] {
    const lines = this.buffer.split('\n').filter(l => l.trim())
    this.buffer = ''
    return lines
  }
}

function parseSSEChunk(line: string): SSEChunk | null {
  if (!line.startsWith('data: ')) return null
  const json = line.slice(6)
  if (json === '[DONE]') return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

// ====== finish_reason 映射 (CC 对齐) ======

function mapFinishReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'stop': return 'stop'
    case 'tool_calls': return 'tool_calls'
    case 'length': return 'length'
    case 'content_filter': return 'stop'
    default: return 'stop'
  }
}

// ====== 流式主函数 ======

export async function* streamOpenAICompat(
  config: ProviderConfig,
  messages: ChatMessage[],
  tools: Record<string, ToolDef>,
  systemPrompt?: string,
  signal?: AbortSignal,
  maxOutputTokens?: number,
  thinkingBudgetTokens?: number,
): AsyncGenerator<StreamEvent> {
  const baseUrl = (config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const url = `${baseUrl}/v1/chat/completions`

  const openaiMessages = convertMessages(messages, systemPrompt)
  const openaiTools = convertTools(tools)
  const hasTools = openaiTools.length > 0

  // 模型不支持 vision 时剥离图片块，避免 API 400 错误
  const supportsVision = config.capabilities?.includes('vision')
  if (!supportsVision) {
    for (const msg of openaiMessages) {
      if (Array.isArray(msg.content)) {
        const before = msg.content.length
        msg.content = msg.content.filter((b: any) => b?.type !== 'image_url')
        if (msg.content.length < before) {
          console.warn('[openai-compat] 模型不支持 vision，已剥离', before - msg.content.length, '个图片块')
        }
        // 如果过滤后只剩一个 text 块，降级为纯字符串
        if (msg.content.length === 1 && msg.content[0]?.type === 'text') {
          msg.content = msg.content[0].text
        }
      }
    }
  }

  const body: Record<string, unknown> = {
    model: config.modelId,
    messages: openaiMessages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.3,
  }

  // 对齐 CC: max_tokens 剥离策略 — 不传时让模型用自身默认值
  if (maxOutputTokens != null) {
    body.max_tokens = maxOutputTokens
  }
  if (hasTools) {
    body.tools = openaiTools
  }

  // OpenAI o 系列模型支持 reasoning_effort
  if (thinkingBudgetTokens && thinkingBudgetTokens > 0) {
    const isOpenAI = config.provider === 'OpenAI' || config.baseUrl?.includes('openai.com')
    if (isOpenAI) {
      const budget = thinkingBudgetTokens
      body.reasoning_effort = budget <= 1024 ? 'low' : budget <= 4096 ? 'medium' : 'high'
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('[openai-compat] DeepSeek error body:', text.slice(0, 500))
    console.error('[openai-compat] Request body:', JSON.stringify(body).slice(0, 1000))
    throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const lineDecoder = new SSELineDecoder()

  // 工具调用状态机（对齐 CC openaiChatStreamToAnthropic）
  const toolCalls: Map<number, {
    id: string
    name: string
    argsBuffer: string
  }> = new Map()

  let inputTokens = 0
  let outputTokens = 0
  let finishReason = 'stop'
  let textStarted = false
  let aborted = false
  let reasoningAccum = ''   // 累积 reasoning，用于去重
  let echoStripped = false
  let contentAccum = ''    // 累积 content（在剥离回显前不单独 yield）
  let absorbedLen = 0      // contentAccum 中已被判定为 echo 前缀的字符数
  let contentYielded = false // 是否已有 content 通过 text-delta 正常 yield
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal?.aborted) { aborted = true; break }

      const text = decoder.decode(value, { stream: true })
      const lines = lineDecoder.push(text)

      for (const line of lines) {
        const chunk = parseSSEChunk(line)
        if (!chunk) continue

        // Usage
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }

        const choice = chunk.choices?.[0]
        if (!choice) continue

        // Finish reason
        if (choice.finish_reason) {
          finishReason = mapFinishReason(choice.finish_reason)
        }

        const delta = choice.delta
        if (!delta) continue

        // Reasoning：累积并透传
        if (delta.reasoning_content) {
          reasoningAccum += delta.reasoning_content
          yield { type: 'reasoning-delta', text: delta.reasoning_content, reasoningId: 'reasoning-0' }
        }

        // Text：先累积，再与 reasoning 比对剥离回显
        // 两种 echo 模式都要处理：
        //   A) content 是 reasoning 的前缀（content 比 reasoning 短，还在收 reasoning）
        //   B) reasoning 是 content 的前缀（content 已超出 reasoning，只取超出部分）
        //   C) 部分重叠：之前有 absorbedLen，只取超出部分
        if (delta.content) {
          if (!textStarted) textStarted = true
          contentAccum += delta.content

          if (!echoStripped && reasoningAccum) {
            // 模式 A：content 短于 reasoning，是 reasoning 的前缀 → 吸收
            if (reasoningAccum.startsWith(contentAccum)) {
              absorbedLen = contentAccum.length
              console.log('[echo] A absorb:', absorbedLen, 'rLen:', reasoningAccum.length, 'cLen:', contentAccum.length)
              continue
            }
            // 模式 B：reasoning 短于 content，reasoning 是 content 的前缀 → 只取超出部分
            if (contentAccum.startsWith(reasoningAccum)) {
              echoStripped = true
              const newContent = contentAccum.slice(reasoningAccum.length)
              console.log('[echo] B content-outran rLen:', reasoningAccum.length, 'cLen:', contentAccum.length, 'yield:', newContent.length)
              if (newContent) {
                contentYielded = true; yield { type: 'text-delta', text: newContent }
              }
              continue
            }
            // 模式 C：部分重叠 → 取超出吸收长度的部分
            if (absorbedLen > 0) {
              echoStripped = true
              const newContent = contentAccum.slice(absorbedLen)
              console.log('[echo] C partial absorbed:', absorbedLen, 'cLen:', contentAccum.length, 'yield:', newContent.length)
              if (newContent) {
                contentYielded = true; yield { type: 'text-delta', text: newContent }
              }
              continue
            }
            // 模式 D：前缀不匹配，但可能同语言 echo——检查词级重叠
            // content 累积到一定长度后再判断，避免短片段误判
            if (contentAccum.length >= 20) {
              const words = (s: string) => s.toLowerCase()
                .split(/[\p{P}\p{Z}\n]+/u)
                .filter((w: string) => w.length > 1)
              const cWords = words(contentAccum)
              const rWords = new Set(words(reasoningAccum))
              if (cWords.length >= 3) {
                const overlap = cWords.filter((w: string) => rWords.has(w)).length
                const ratio = overlap / cWords.length
                if (ratio > 0.6) {
                  // 60%+ 词在 reasoning 中出现 → echo，吸收
                  echoStripped = true
                  console.log('[echo] D word-overlap rLen:', reasoningAccum.length,
                    'cLen:', contentAccum.length, 'overlapRatio:', ratio.toFixed(2), '→ absorbed')
                  continue
                }
              }
            }
            // 词级也不匹配 → 真正不是 echo
            if (contentAccum.length < 20) continue  // 内容还不够长，再等等
            echoStripped = true
            console.log('[echo] E yield-all rLen:', reasoningAccum.length, 'cLen:', contentAccum.length,
              'r[:30]:', JSON.stringify(reasoningAccum.slice(0, 30)),
              'c[:30]:', JSON.stringify(contentAccum.slice(0, 30)))
            contentYielded = true; yield { type: 'text-delta', text: contentAccum }
          } else {
            // 已剥离或无 reasoning：正常 yield delta
            contentYielded = true; yield { type: 'text-delta', text: delta.content }
          }
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index

            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: '', name: '', argsBuffer: '' })
            }

            const block = toolCalls.get(idx)!
            if (tc.id) block.id = tc.id
            if (tc.function?.name) block.name += tc.function.name
            if (tc.function?.arguments) block.argsBuffer += tc.function.arguments
          }
        }
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError' || signal?.aborted) {
      aborted = true
    } else {
      throw e
    }
  } finally {
    reader.releaseLock()
  }

  if (aborted) {
    yield { type: 'done', finishReason: 'abort', usage: { inputTokens, outputTokens } }
    return
  }

  // 流结束但还有未 yield 的 content（短回复/ModeD1误判）
  // 用 contentYielded 而非 echoStripped 判断——ModeD1 会设 echoStripped 但不 yield
  if (!contentYielded && contentAccum.length > absorbedLen) {
    const remaining = contentAccum.slice(absorbedLen)
    if (remaining) {
      yield { type: 'text-delta', text: remaining }
    }
  }

  // Flush any pending tool calls
  for (const [, block] of toolCalls) {
    if (block.id && block.name) {
      yield {
        type: 'tool-call-start',
        id: block.id,
        name: block.name,
        input: block.argsBuffer,
      }
    }
  }

  const usage: Usage = {
    inputTokens,
    outputTokens,
  }
  yield { type: 'done', finishReason, usage }
}

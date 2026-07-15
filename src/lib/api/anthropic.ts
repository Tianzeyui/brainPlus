/**
 * Anthropic API provider — 使用 @anthropic-ai/sdk 直调
 * 对齐 CC 的 query.ts → claude.ts 路径
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ToolDef, StreamEvent, ChatMessage, ProviderConfig, Usage } from './types'

// Anthropic SDK 事件类型
type RawEvent = {
  type: string
  index?: number
  content_block?: { type: string; id?: string; name?: string; text?: string; thinking?: string }
  delta?: { type: string; text?: string; partial_json?: string; thinking?: string }
  message?: { id: string; model: string; usage: { input_tokens: number } }
  usage?: { output_tokens: number }
}

function createClient(config: ProviderConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
    // CC 同款 beta headers
    defaultHeaders: {
      'anthropic-beta':
        'interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,mid-conversation-system-2026-04-07',
    },
  })
}

/**
 * 把 stardust 工具定义转成 Anthropic API 工具格式
 */
function convertTools(tools: Record<string, ToolDef>): Anthropic.Tool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: (tool.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
  })) as unknown as Anthropic.Tool[]
}

/**
 * 把 stardust 消息转成 Anthropic API 消息格式
 */
function normalizeContent(content: string | any[]): string | Anthropic.ContentBlockParam[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content)

  return content.map((block) => {
    if (block?.type === 'image' && block.image) {
      // 将我们的格式 { type:'image', image:'data:...;base64,...', mimeType:'...' }
      // 转为 Anthropic { type:'image', source:{ type:'base64', media_type:'...', data:'...' } }
      const image: string = block.image
      const mediaType = block.mimeType || 'image/png'
      let data = image
      const m = image.match(/^data:[^;]*;base64,(.+)$/)
      if (m) data = m[1]
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mediaType, data },
      }
    }
    return block
  })
}

function convertMessages(
  messages: ChatMessage[],
  system?: string,
): { system?: string | Array<{ type: 'text'; text: string }>; messages: Anthropic.MessageParam[] } {
  const msgs: Anthropic.MessageParam[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      system = system ? system + '\n\n' + m.content : m.content
      continue
    }
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: normalizeContent(m.content) })
    } else if (m.role === 'assistant') {
      // 构建 assistant 内容：文本 + 工具调用
      const content: Anthropic.ContentBlockParam[] = []
      if (m.content) {
        content.push({ type: 'text', text: m.content })
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input as Record<string, unknown>,
          })
        }
      }
      msgs.push({
        role: 'assistant',
        content: content.length > 0 ? content : m.content || '',
      })
    } else if (m.role === 'tool') {
      // 工具结果转换为 Anthropic 格式：user 消息含 tool_result block
      msgs.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.toolCallId || '',
          content: m.content,
        }],
      })
    }
  }

  return { system: system || undefined, messages: msgs }
}

/**
 * 流式调用 Anthropic API，yield 统一的 StreamEvent
 */
export async function* streamAnthropic(
  config: ProviderConfig,
  messages: ChatMessage[],
  tools: Record<string, ToolDef>,
  systemPrompt?: string,
  signal?: AbortSignal,
  maxOutputTokens?: number,
  thinkingBudgetTokens?: number,
): AsyncGenerator<StreamEvent> {
  const client = createClient(config)
  const { system, messages: apiMessages } = convertMessages(messages, systemPrompt)
  const apiTools = convertTools(tools)

  const maxTokens = maxOutputTokens ?? 8192
  const streamOptions: Record<string, unknown> = {
    model: config.modelId,
    max_tokens: maxTokens,
    temperature: 0.3,
    system: system || undefined,
    messages: apiMessages,
    tools: apiTools.length > 0 ? apiTools : undefined,
  }

  // 思考预算：需要 max_tokens > budget_tokens
  if (thinkingBudgetTokens && thinkingBudgetTokens > 0) {
    streamOptions.thinking = {
      type: 'enabled',
      budget_tokens: Math.min(thinkingBudgetTokens, maxTokens - 1024),
    }
  }

  const stream = client.beta.messages.stream(streamOptions as any)

  let toolUseId = ''
  let toolUseName = ''
  let toolInputAccum = ''
  let currentBlockType = ''
  let inputTokens = 0
  let outputTokens = 0

  try {
    for await (const event of stream) {
      if (signal?.aborted) break

      const evt = event as unknown as RawEvent

      switch (evt.type) {
        case 'message_start':
          inputTokens = evt.message?.usage?.input_tokens ?? 0
          break

        case 'content_block_start': {
          const block = evt.content_block
          if (!block) break
          currentBlockType = block.type
          if (block.type === 'tool_use') {
            toolUseId = block.id || ''
            toolUseName = block.name || ''
            toolInputAccum = ''
          } else if (block.type === 'thinking' && block.thinking) {
            yield {
              type: 'reasoning-delta',
              text: block.thinking,
              reasoningId: `reasoning-${evt.index ?? 0}`,
            }
          }
          break
        }

        case 'content_block_delta': {
          const delta = evt.delta
          if (!delta) break
          if (delta.type === 'text_delta' && delta.text) {
            yield { type: 'text-delta', text: delta.text }
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            toolInputAccum += delta.partial_json
          } else if (delta.type === 'thinking_delta' && delta.thinking) {
            yield {
              type: 'reasoning-delta',
              text: delta.thinking,
              reasoningId: `reasoning-${evt.index ?? 0}`,
            }
          }
          break
        }

        case 'content_block_stop':
          if (currentBlockType === 'tool_use' && toolUseId && toolUseName) {
            yield {
              type: 'tool-call-start',
              id: toolUseId,
              name: toolUseName,
              input: toolInputAccum,
            }
            toolUseId = ''
            toolUseName = ''
            toolInputAccum = ''
          }
          currentBlockType = ''
          break
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError' || signal?.aborted) {
      yield { type: 'done', finishReason: 'abort', usage: { inputTokens, outputTokens } }
      return
    }
    throw e
  }

  // 获取最终 usage
  try {
    const final = await stream.finalMessage()
    outputTokens = final.usage.output_tokens
  } catch {}

  const usage: Usage = { inputTokens, outputTokens }
  yield { type: 'done', finishReason: 'stop', usage }
}

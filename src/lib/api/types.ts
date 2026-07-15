/**
 * API 层通用类型 — 替代 AI SDK 的 ModelMessage 等类型
 */

// ====== 消息 ======

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | any[]
  /** 工具调用 ID（role='tool' 时必需） */
  toolCallId?: string
  /** 工具调用列表（role='assistant' 且有工具调用时） */
  toolCalls?: Array<{ id: string; name: string; input: unknown }>
  /** 推理/思考内容（DeepSeek R1 等推理模型） */
  reasoning_content?: string
}

export interface ToolMessage {
  role: 'tool'
  content: string
  toolCallId: string
}

export type Message = ChatMessage | ToolMessage

// ====== 工具 ======

export interface ToolDef {
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
  execute: (args: Record<string, unknown>) => Promise<string> | string
  /** 原始 JSON Schema（用于传给 API 的 input_schema/parameters） */
  _rawSchema?: Record<string, unknown>
}

// ====== 流事件（统一格式，含工具执行层扩展） ======

/** 原始 API 流事件 */
export type RawStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string; reasoningId?: string }
  | { type: 'tool-call-start'; id: string; name: string; input: string }
  | { type: 'tool-call-delta'; id: string; delta: string }
  | { type: 'tool-call-end'; id: string }
  | { type: 'done'; finishReason: string; usage: Usage }

/** 工具执行层扩展 — streamChatWithTools() 产出的事件 */
export type StreamEvent =
  | RawStreamEvent
  | { type: 'tool-call'; toolName: string; toolInput: unknown }
  | { type: 'tool-result'; toolName: string; toolOutput: unknown }

// ====== Usage ======

export interface Usage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

// ====== Provider 配置 ======

export interface ProviderConfig {
  /** Anthropic / DeepSeek / OpenAI / ... */
  provider: string
  /** 模型 ID, e.g. claude-sonnet-4-6, deepseek-chat */
  modelId: string
  /** API Key */
  apiKey: string
  /** API Base URL (DeepSeek/OpenAI 兼容时必需) */
  baseUrl?: string
  /** 模型能力标签，如 ['reasoning', 'vision'] */
  capabilities?: string[]
}
